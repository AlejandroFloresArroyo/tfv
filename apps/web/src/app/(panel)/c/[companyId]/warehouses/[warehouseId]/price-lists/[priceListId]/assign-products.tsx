"use client"

import { Badge, Button, Callout, Checkbox, DialogTrigger, Field, Input } from "@tfv/ui"
import { Search } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { FormDialog } from "~/components/form-dialog.tsx"
import { api } from "~/lib/api.client.ts"
import { fold, type ProductOption } from "../products.ts"

/**
 * Cuántos productos se pintan a la vez.
 *
 * Marcar de uno en uno entre dos mil casillas no es asignación masiva, es tortura. El atajo es
 * buscar y marcar **todo lo que coincide**, así que lo que se pinta es una muestra del filtro y no
 * el catálogo entero: mil casillas en un diálogo lo dejan a tirones en un teléfono.
 */
const SHOWN = 100

/**
 * Qué productos lleva una lista de precios.
 *
 * Ver `openspec/specs/warehouse-catalog/spec.md`, «Asignación masiva de productos a una lista».
 *
 * ## Se establece el conjunto, no se añade
 *
 * El servicio recibe **la lista completa** de productos que deben pertenecer, y hace las dos cosas:
 * da de alta lo que falta y **retira lo que sobra**. La segunda mitad es la corrección del defecto
 * L-04 —antes las bajas se calculaban con el mismo criterio que las altas y no se ejecutaban
 * nunca—, así que aquí desmarcar tiene que significar algo, y significa **borrar la tarifa**.
 *
 * Por eso el diálogo cuenta las bajas antes de guardar y avisa de lo que se llevan. Es la misma
 * regla que la confirmación de borrar una lista: los productos no se tocan, sus tarifas aquí sí.
 *
 * ## El conjunto de partida son las tarifas, no lo que se ve
 *
 * Si el catálogo no cupo entero, hay productos con tarifa que esta pantalla no puede pintar. Sus
 * identificadores siguen en el conjunto —vienen de las tarifas, que sí llegan enteras—, así que
 * guardar **no los retira**. Enterarse de eso después sería descubrirlo al facturar.
 */
export function AssignProducts({
  base,
  listName,
  catalog,
  priced,
  truncated,
}: {
  /** La ruta de la lista: `…/price-lists/{id}`. */
  base: string
  listName: string
  catalog: readonly ProductOption[]
  /** Los productos que hoy tienen tarifa. Salen de las tarifas, no del catálogo. */
  priced: readonly string[]
  /** Cierto si el catálogo cargado es un prefijo del almacén. */
  truncated: boolean
}) {
  const t = useTranslations("warehouses.priceLists")
  // La apertura se gobierna aquí porque hay que reiniciar el conjunto al abrir, y el diálogo sólo
  // atiende a `onOpenChange` cuando también recibe `open`.
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(priced))
  const [term, setTerm] = useState("")
  const [onlyChosen, setOnlyChosen] = useState(false)

  const current = useMemo(() => new Set(priced), [priced])

  // Las dos direcciones, contadas antes de guardar. Sin esto, «guardar» es un salto al vacío.
  const added = [...chosen].filter((id) => !current.has(id)).length
  const removed = [...current].filter((id) => !chosen.has(id)).length

  const folded = fold(term.trim())
  const matching = useMemo(
    () =>
      catalog.filter((product) => {
        if (onlyChosen && !chosen.has(product.id)) return false
        if (folded === "") return true
        return fold(`${product.name} ${product.code}`).includes(folded)
      }),
    [catalog, chosen, folded, onlyChosen],
  )

  // Tarifas de productos que no caben en el catálogo cargado. Se conservan, y se dice cuántas.
  const unseen = [...chosen].filter((id) => !catalog.some((product) => product.id === id)).length

  function toggle(id: string, checked: boolean) {
    setChosen((selection) => {
      const next = new Set(selection)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function apply(checked: boolean) {
    setChosen((selection) => {
      const next = new Set(selection)
      for (const product of matching) {
        if (checked) next.add(product.id)
        else next.delete(product.id)
      }
      return next
    })
  }

  return (
    <FormDialog
      title={t("assignTitle", { name: listName })}
      description={t("assignBody")}
      submitLabel={t("assignSave")}
      size="lg"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm" variant="secondary">
            {t("assign")}
          </Button>
        </DialogTrigger>
      }
      open={open}
      // Al abrirlo se parte de lo que hay guardado ahora, no de lo que se dejó a medias la vez
      // anterior: un conjunto viejo aplicado sobre una lista que cambió retira lo que otro añadió.
      onOpenChange={(next) => {
        if (next) {
          setChosen(new Set(priced))
          setTerm("")
          setOnlyChosen(false)
        }
        setOpen(next)
      }}
      action={() => api(`${base}/products`, { method: "PUT", body: { productIds: [...chosen] } })}
    >
      {() => (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={chosen.size > 0 ? "accent" : "neutral"}>
              {t("assignInList", { count: chosen.size })}
            </Badge>
            {added > 0 ? <Badge tone="success">{t("assignAdding", { count: added })}</Badge> : null}
            {removed > 0 ? (
              <Badge tone="danger">{t("assignRemoving", { count: removed })}</Badge>
            ) : null}
          </div>

          {removed > 0 ? (
            <Callout tone="warning" live>
              {t("assignRemovingWarning", { count: removed })}
            </Callout>
          ) : null}

          {added > 0 ? (
            <p className="text-body3 text-content-muted">{t("assignAddedWithoutPrice")}</p>
          ) : null}

          {truncated && unseen > 0 ? (
            <Callout tone="info">{t("assignKeptOutside", { count: unseen })}</Callout>
          ) : null}

          <Field label={t("assignSearch")}>
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
                  placeholder={t("assignSearchPlaceholder")}
                  className="pl-9"
                  onChange={(event) => setTerm(event.target.value)}
                  // `Enter` en un campo de búsqueda dentro de un formulario lo envía. Aquí eso
                  // sería guardar el conjunto sin haber terminado de componerlo.
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault()
                  }}
                />
              </span>
            )}
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Checkbox
              label={t("assignOnlyChosen")}
              checked={onlyChosen}
              onCheckedChange={(checked) => setOnlyChosen(checked === true)}
            />
            <span className="flex-1" />
            <Button type="button" variant="ghost" size="sm" onClick={() => apply(true)}>
              {t("assignSelectMatches", { count: matching.length })}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => apply(false)}>
              {t("assignClearMatches", { count: matching.length })}
            </Button>
          </div>

          {matching.length === 0 ? (
            <p className="text-body2 text-content-muted">
              {catalog.length === 0 ? t("assignEmptyCatalog") : t("assignNoMatches")}
            </p>
          ) : (
            <>
              <ul className="max-h-80 space-y-1 overflow-y-auto rounded-sm border border-edge p-2">
                {matching.slice(0, SHOWN).map((product) => (
                  <li key={product.id} className="rounded-xs px-1 py-1.5 hover:bg-panel-hover">
                    <Checkbox
                      label={product.name}
                      hint={product.code}
                      checked={chosen.has(product.id)}
                      onCheckedChange={(checked) => toggle(product.id, checked === true)}
                    />
                  </li>
                ))}
              </ul>

              {matching.length > SHOWN ? (
                <p className="text-body3 text-content-faint">
                  {t("assignMore", { count: matching.length - SHOWN })}
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </FormDialog>
  )
}
