"use client"

import { formatMoney, isZero } from "@tfv/contracts/money"
import { type QuotationLineInput, type RateSchedule, rateFor } from "@tfv/contracts/quotation"
import { Badge, Button, Callout, Field, Input, Panel, Select, Separator, Spinner } from "@tfv/ui"
import { Check, Eye, EyeOff, Package, Plus, Search, Trash2, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { formatAmount } from "~/lib/amount.ts"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"
import type { QuoteLineRow, QuoteRow, RentFrequency } from "../../../warehouse.ts"
import { usePreviewedQuote, usePublishPreview } from "./quote-preview.tsx"
import { ProvisionalProduct } from "./quote-provisional.tsx"

/**
 * El constructor de cotizaciones: el editor de líneas.
 *
 * Rebanada 29b, y las dos tareas que le quedaban a la 14.
 *
 * ## Por qué los importes se calculan aquí y no se piden al servidor
 *
 * `computeQuotation` es la **misma función** que corre en la API. No es una reimplementación ni una
 * aproximación para enseñar algo mientras llega la buena: es la del paquete compartido, y por eso
 * el requisito de `quotation-pricing` —«la previsualización coincide con lo que el servidor
 * calculará»— se cumple por construcción y no por disciplina.
 *
 * Las tarifas ya vienen resueltas del servidor, que es quien tiene la lista de precios. Resolverlas
 * aquí sería la otra mitad del mismo problema.
 *
 * ## Por qué el conjunto se envía entero
 *
 * La API reconcilia: lo que no venga se elimina y **libera su equipo**. Mandar el conjunto completo
 * es lo que permite que crear, cambiar cantidad, eliminar y reservar ocurran en una transacción, y
 * lo que hace que el resultado no dependa del orden en que esta pantalla mande sus cambios.
 *
 * ## Por qué la disponibilidad se mira antes de guardar
 *
 * El servidor rechaza una reserva que no cabe, y no reserva nada a medias — eso está probado. Pero
 * enterarse al guardar es enterarse tarde: el equipo ya se le prometió a alguien. Aquí el tope de
 * cada línea es lo que hay libre **más lo que esa misma línea ya tiene apartado**, porque al
 * reconciliar sus propias unidades no compiten consigo mismas.
 */

export interface RateCandidate {
  measurementId: string
  measurementName: string
  productId: string
  productName: string
  productCode: string
  productPriceId: string | null
  basePrice: string
  rent?: RateSchedule
  penalty?: RateSchedule
  available: number
}

interface Draft {
  /** Ausente en una línea que todavía no existe en el servidor. */
  id?: string
  measurementId: string
  measurementName: string
  productId: string
  productName: string
  productCode: string
  productPriceId: string | null
  basePrice: string
  rent?: RateSchedule
  penalty?: RateSchedule
  frequency: RentFrequency
  quantity: number
  /**
   * Precio negociado: el total de esta línea para el periodo completo.
   *
   * Cadena vacía significa «sin precio negociado», que es distinto de cero. Se guarda como texto
   * porque es lo que hay en el campo mientras se escribe: convertirlo a número aquí perdería el
   * `1500.` de quien todavía no ha escrito los decimales.
   */
  price: string
  /** Unidades libres en el almacén, **sin contar** las que esta línea ya tiene apartadas. */
  free: number
  /** Cuántas tenía apartadas al abrir el editor. Es lo que puede recuperar sin competir. */
  reserved: number
}

const FREQUENCIES: readonly RentFrequency[] = ["daily", "weekly", "monthly"]

/** Un importe completo. Mientras se escribe «15» o «1500.» no lo es, y no se previsualiza con él. */
const PRICE = /^\d+(\.\d{1,2})?$/

export function QuoteEditor({
  companyId,
  warehouseId,
  quote,
  lines,
  priceLists,
  canMint,
  canCreate,
  frozen,
}: {
  companyId: string
  warehouseId: string
  quote: QuoteRow
  /** Cada línea llega con su tarifa ya resuelta por el servidor y con su existencia libre. */
  lines: readonly QuoteLineRow[]
  priceLists: readonly { id: string; name: string }[]
  canMint: boolean
  /** Dar de alta un producto provisional desde aquí. Exige la clave de alta de catálogo. */
  canCreate: boolean
  /**
   * El equipo ya salió: se congela **la composición, no el precio**.
   *
   * Ni se añade, ni se quita, ni cambia una cantidad —eso movería inventario que está en la calle—,
   * pero lo que cuesta cada línea sí se ajusta. Una extensión de renta nace así, con el equipo ya
   * fuera, y sin esto no podría tener precio nunca.
   */
  frozen: boolean
}) {
  const t = useTranslations("warehouses.quotes")
  const format = useFormatter()
  const router = useRouter()

  const [drafts, setDrafts] = useState<Draft[]>(() => initial(lines))
  const [priceListId, setPriceListId] = useState(priceLists[0]?.id ?? "")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [mint, setMint] = useState(false)
  const [saving, startSaving] = useTransition()

  const base = `/companies/${companyId}/warehouses/${warehouseId}`

  const dirty = useMemo(() => changed(lines, drafts), [lines, drafts])
  const inputs = useMemo(() => lineInputs(drafts), [drafts])

  // El editor publica sus líneas y lee de vuelta el desglose que se calculó con ellas y con las
  // condiciones de pago que se estén escribiendo al lado. Una sola cuenta para las dos columnas.
  const publish = usePublishPreview()
  useEffect(() => {
    publish.lines(inputs, dirty)
  }, [publish, inputs, dirty])

  const { breakdown } = usePreviewedQuote()

  // Con precio por paquete, los importes de línea no rigen y no se enseñan: ni aquí ni en el papel.
  const packagePrice = breakdown?.packagePrice ?? null
  const [showPrices, setShowPrices] = useState(false)
  const prices = packagePrice === null || showPrices

  const overbooked = drafts.filter((draft) => draft.quantity > draft.free + draft.reserved)
  // Sin tarifa para la frecuencia y sin precio escrito, la línea no vale cero: no tiene precio.
  // Con precio por paquete deja de importar, porque el precio ya está puesto en otro sitio.
  const unpriced =
    packagePrice === null ? (breakdown?.lines.filter((line) => line.unpriced).length ?? 0) : 0

  function add(candidate: RateCandidate) {
    setSaved(false)
    setDrafts((current) => {
      const existing = current.findIndex((draft) => draft.measurementId === candidate.measurementId)
      // Añadir dos veces la misma medida sería una línea duplicada y una cuenta partida en dos.
      if (existing >= 0) {
        return current.map((draft, index) =>
          index === existing
            ? { ...draft, quantity: Math.min(draft.quantity + 1, draft.free + draft.reserved) }
            : draft,
        )
      }

      return [
        ...current,
        {
          measurementId: candidate.measurementId,
          measurementName: candidate.measurementName,
          productId: candidate.productId,
          productName: candidate.productName,
          productCode: candidate.productCode,
          productPriceId: candidate.productPriceId,
          basePrice: candidate.basePrice,
          ...(candidate.rent ? { rent: candidate.rent } : {}),
          ...(candidate.penalty ? { penalty: candidate.penalty } : {}),
          frequency: "daily" as const,
          quantity: candidate.available > 0 ? 1 : 0,
          price: "",
          free: candidate.available,
          reserved: 0,
        },
      ]
    })
  }

  function update(measurementId: string, patch: Partial<Draft>) {
    setSaved(false)
    setDrafts((current) =>
      current.map((draft) =>
        draft.measurementId === measurementId ? { ...draft, ...patch } : draft,
      ),
    )
  }

  function remove(measurementId: string) {
    setSaved(false)
    setDrafts((current) => current.filter((draft) => draft.measurementId !== measurementId))
  }

  function save() {
    setError(null)
    startSaving(async () => {
      try {
        await api(`${base}/quotes/${quote.id}/lines`, {
          method: "PUT",
          body: {
            lines: drafts.map((draft, index) => ({
              ...(draft.id ? { id: draft.id } : {}),
              measurementId: draft.measurementId,
              quantity: draft.quantity,
              frequency: draft.frequency,
              price: draft.price.trim() === "" ? null : draft.price.trim(),
              productPriceId: draft.productPriceId,
              position: index,
              positionProduct: index,
            })),
            allowMinting: mint,
          },
        })

        setSaved(true)
        router.refresh()
      } catch (failure) {
        if (failure instanceof SessionExpiredError) {
          router.replace("/login")
          return
        }
        setError(failure instanceof ApiError ? failure.message : t("saveFailed"))
      }
    })
  }

  return (
    <section aria-labelledby="editor-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="editor-heading" className="text-title2 font-bold text-content">
          {t("editor")}
        </h2>

        <div className="flex items-center gap-2">
          {saved && !dirty ? (
            <span className="inline-flex items-center gap-1 text-body3 text-content-muted">
              <Check className="size-4 text-success" aria-hidden="true" />
              {t("saved")}
            </span>
          ) : null}
          <Button onClick={save} loading={saving} disabled={!dirty || overbooked.length > 0}>
            {t("saveLines")}
          </Button>
        </div>
      </div>

      {error ? (
        <Callout tone="danger" live>
          {error}
        </Callout>
      ) : null}

      {overbooked.length > 0 ? (
        <Callout tone="warning" live>
          {t("overbooked", { count: overbooked.length })}
        </Callout>
      ) : null}

      {unpriced > 0 ? (
        <Callout tone="warning" live>
          {t("unpricedLines", { count: unpriced })}
        </Callout>
      ) : null}

      {packagePrice === null ? null : (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="inline-flex min-w-0 items-center gap-2 text-body2 text-content-muted">
            <Package className="size-4 shrink-0 text-content-faint" aria-hidden="true" />
            <span>
              {t.rich("packageGoverns", {
                amount: formatAmount(packagePrice, format),
                strong: (chunks) => (
                  <strong className="font-semibold text-content tabular-nums">{chunks}</strong>
                ),
              })}
            </span>
          </p>

          <Button variant="ghost" size="sm" onClick={() => setShowPrices((current) => !current)}>
            {showPrices ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
            {showPrices ? t("hideLinePrices") : t("showLinePrices")}
          </Button>
        </Panel>
      )}

      {frozen ? (
        <Callout tone="info">{t("linesPriceOnly")}</Callout>
      ) : (
        <Panel className="p-4">
          <Picker
            base={base}
            type={quote.type}
            priceListId={priceListId}
            priceLists={priceLists}
            onPriceList={setPriceListId}
            onAdd={add}
            canCreate={canCreate}
            chosen={drafts.map((draft) => draft.measurementId)}
          />
        </Panel>
      )}

      {drafts.length > 0 ? (
        <ul className="grid gap-3">
          {drafts.map((draft) => {
            const amounts = breakdown?.lines.find(
              (line) => line.measurementId === draft.measurementId,
            )
            const ceiling = draft.free + draft.reserved
            const over = draft.quantity > ceiling

            return (
              <li key={draft.measurementId}>
                <Panel className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-body1 font-bold text-content">
                        {draft.productName}
                      </p>
                      <p className="truncate text-body3 text-content-faint">
                        {draft.measurementName} · {draft.productCode}
                      </p>
                    </div>

                    {frozen ? null : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(draft.measurementId)}
                        aria-label={t("removeLine", { name: draft.productName })}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>

                  <Separator className="my-3" />

                  <div className="flex flex-wrap items-end gap-4">
                    <Field label={t("quantity")} className="w-24">
                      {(ids) => (
                        <Input
                          {...ids}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={ceiling}
                          value={draft.quantity}
                          disabled={frozen}
                          aria-invalid={over || undefined}
                          onChange={(event) =>
                            update(draft.measurementId, {
                              quantity: Math.max(0, Number(event.target.value) || 0),
                            })
                          }
                        />
                      )}
                    </Field>

                    {quote.type === "rent" ? (
                      <Field label={t("frequency")} className="w-36">
                        {(ids) => (
                          <Select
                            {...ids}
                            value={draft.frequency}
                            onChange={(event) =>
                              update(draft.measurementId, {
                                frequency: event.target.value as RentFrequency,
                              })
                            }
                          >
                            {FREQUENCIES.map((frequency) => (
                              <option key={frequency} value={frequency}>
                                {t(`frequencyOf.${frequency}`)}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    ) : null}

                    {prices ? (
                      <Field label={t("linePrice")} className="w-36">
                        {(ids) => (
                          <Input
                            {...ids}
                            type="text"
                            inputMode="decimal"
                            value={draft.price}
                            placeholder={t("byTariff")}
                            onChange={(event) =>
                              update(draft.measurementId, { price: event.target.value })
                            }
                          />
                        )}
                      </Field>
                    ) : null}

                    <div className="grid gap-1">
                      <span className="text-body3 font-semibold text-content-faint">
                        {t("availability")}
                      </span>
                      <Badge tone={over ? "danger" : draft.free > 0 ? "success" : "warning"}>
                        {t("freeUnits", { count: ceiling })}
                      </Badge>
                    </div>

                    {amounts && packagePrice === null ? (
                      <div className="ml-auto grid gap-1 text-right">
                        <span className="text-body3 font-semibold text-content-faint">
                          {t("lineTotal")}
                        </span>
                        <span className="text-body1 font-bold text-content tabular-nums">
                          {formatAmount(amounts.total, format)}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {over ? (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-body3 text-danger">
                      <TriangleAlert className="size-4" aria-hidden="true" />
                      {t("notEnough", { count: ceiling })}
                    </p>
                  ) : amounts?.unpriced && packagePrice === null ? (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-body3 text-warning">
                      <TriangleAlert className="size-4" aria-hidden="true" />
                      {t("unpriced")}
                    </p>
                  ) : null}
                </Panel>
              </li>
            )
          })}
        </ul>
      ) : (
        <Panel className="p-5 text-body1 text-content-muted">{t("noLinesYet")}</Panel>
      )}

      {canMint && !frozen ? (
        <label className="flex items-start gap-2 text-body3 text-content-muted">
          <input
            type="checkbox"
            checked={mint}
            onChange={(event) => setMint(event.target.checked)}
            className="mt-0.5 size-4 rounded-xs border-field"
          />
          <span>{t("allowMinting")}</span>
        </label>
      ) : null}
    </section>
  )
}

/**
 * Las líneas del borrador, tal y como las quiere el motor.
 *
 * No resuelve tarifas: cada borrador ya trae la suya, la que el servidor usó para calcular. Ver
 * H-14 — el defecto no estaba en el cálculo sino en qué precio se le entregaba.
 */
function lineInputs(drafts: readonly Draft[]): QuotationLineInput[] {
  return drafts.map((draft, index) => ({
    id: draft.id ?? draft.measurementId,
    productId: draft.productId,
    measurementId: draft.measurementId,
    quantity: draft.quantity,
    frequency: draft.frequency,
    basePrice: draft.basePrice,
    ...(draft.rent ? { rent: draft.rent } : {}),
    ...(draft.penalty ? { penalty: draft.penalty } : {}),
    ...(PRICE.test(draft.price.trim()) ? { linePrice: draft.price.trim() } : {}),
    position: index,
    positionProduct: index,
  }))
}

/** El buscador del catálogo, con la existencia libre delante. */
function Picker({
  base,
  type,
  priceListId,
  priceLists,
  onPriceList,
  onAdd,
  canCreate,
  chosen,
}: {
  base: string
  type: "rent" | "sale"
  priceListId: string
  priceLists: readonly { id: string; name: string }[]
  onPriceList: (value: string) => void
  onAdd: (candidate: RateCandidate) => void
  canCreate: boolean
  chosen: readonly string[]
}) {
  const t = useTranslations("warehouses.quotes")
  const format = useFormatter()
  const [term, setTerm] = useState("")
  const [results, setResults] = useState<RateCandidate[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(
    async (value: string, signal: AbortSignal) => {
      const query = new URLSearchParams({ limit: "8" })
      if (value.trim()) query.set("search", value.trim())
      if (priceListId) query.set("priceListId", priceListId)

      const page = await api<{ items: RateCandidate[] }>(`${base}/rates?${query}`, { signal })
      setResults(page.items)
    },
    [base, priceListId],
  )

  useEffect(() => {
    const controller = new AbortController()
    // Se espera a que deje de escribir: una petición por tecla satura sin enseñar nada distinto.
    const timer = setTimeout(() => {
      setLoading(true)
      search(term, controller.signal)
        .catch(() => {
          if (!controller.signal.aborted) setResults([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [term, search])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("addEquipment")} className="min-w-60 flex-1">
          {(ids) => (
            <span className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-3 size-4 text-content-faint"
                aria-hidden="true"
              />
              <Input
                {...ids}
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={t("pickerPlaceholder")}
                className="pl-9"
              />
            </span>
          )}
        </Field>

        {priceLists.length > 0 ? (
          <Field label={t("priceList")} className="w-48">
            {(ids) => (
              <Select
                {...ids}
                value={priceListId}
                onChange={(event) => onPriceList(event.target.value)}
              >
                <option value="">{t("noPriceList")}</option>
                {priceLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>

      {loading ? (
        <Spinner label={t("searching")} />
      ) : results.length > 0 ? (
        <ul className="grid gap-1">
          {results.map((candidate) => {
            const rate = unitRate(candidate, type)
            return (
              <li key={candidate.measurementId}>
                <button
                  type="button"
                  onClick={() => onAdd(candidate)}
                  disabled={candidate.available === 0 && !chosen.includes(candidate.measurementId)}
                  className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors hover:bg-panel-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-focus/40"
                >
                  <Plus className="size-4 shrink-0 text-content-faint" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body2 font-semibold text-content">
                      {candidate.productName}
                    </span>
                    <span className="block truncate text-body3 text-content-faint">
                      {candidate.measurementName} · {candidate.productCode}
                    </span>
                  </span>
                  <Badge tone={candidate.available > 0 ? "success" : "neutral"}>
                    {t("freeUnits", { count: candidate.available })}
                  </Badge>
                  <span className="w-32 shrink-0 text-right">
                    <span className="block text-body2 text-content-muted tabular-nums">
                      {formatAmount(rate.amount, format)}
                    </span>
                    <span
                      className={`block text-body3 ${rate.fallback ? "text-warning" : "text-content-faint"}`}
                    >
                      {rate.fallback
                        ? t("noDailyRate")
                        : type === "rent"
                          ? t("perDay")
                          : t("perUnit")}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="grid gap-3">
          <p className="text-body3 text-content-muted">{t("noCandidates")}</p>
          {canCreate ? (
            <div>
              <ProvisionalProduct base={base} type={type} term={term} onCreated={onAdd} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * Lo que costará una unidad si se añade ahora, y si nadie lo ha fijado.
 *
 * Una línea nueva nace con periodicidad diaria, así que ésa es la cifra que corresponde enseñar en
 * una renta. Sale de `rateFor`, la misma función que el motor usa al calcular — que desde la
 * corrección de `quotation-pricing` devuelve **cero** cuando nadie fijó tarifa, en vez de recaer en
 * el precio de venta.
 *
 * `fallback` cierto significa «esto todavía no tiene precio», y es lo que el constructor enseña
 * para que se escriba uno. No es un aviso cosmético: es la situación normal en un almacén cuya
 * lista de precios está sin llenar.
 */
function unitRate(
  candidate: RateCandidate,
  type: "rent" | "sale",
): { amount: string; fallback: boolean } {
  if (type === "sale") return { amount: candidate.basePrice, fallback: false }

  const rate = rateFor(candidate.rent, "daily")
  return { amount: formatMoney(rate), fallback: isZero(rate) }
}

/**
 * De las líneas guardadas a los borradores del editor.
 *
 * La tarifa **viene con la línea**, resuelta por el servidor contra la entrada de lista que esa
 * línea usa. Volver a resolverla aquí contra otra lista daría otro número: es la clase de desajuste
 * que se ve como «el total de la línea no cuadra con el total de abajo».
 */
function initial(lines: readonly QuoteLineRow[]): Draft[] {
  return lines.map((line) => ({
    id: line.id,
    measurementId: line.measurementId,
    measurementName: line.measurementName,
    productId: line.productId,
    productName: line.productName,
    productCode: line.productCode,
    productPriceId: line.productPriceId,
    basePrice: line.basePrice,
    ...(line.rent ? { rent: line.rent } : {}),
    ...(line.penalty ? { penalty: line.penalty } : {}),
    frequency: line.frequency,
    quantity: line.quantity,
    price: line.price ?? "",
    free: line.available,
    reserved: line.quantity,
  }))
}

/** Si hay algo que guardar. Sin esto el botón invita a mandar una petición que no cambia nada. */
function changed(lines: readonly QuoteLineRow[], drafts: readonly Draft[]): boolean {
  if (lines.length !== drafts.length) return true

  return drafts.some((draft, index) => {
    const line = lines[index]
    return (
      line === undefined ||
      line.measurementId !== draft.measurementId ||
      line.quantity !== draft.quantity ||
      line.frequency !== draft.frequency ||
      (line.price ?? "") !== draft.price.trim()
    )
  })
}
