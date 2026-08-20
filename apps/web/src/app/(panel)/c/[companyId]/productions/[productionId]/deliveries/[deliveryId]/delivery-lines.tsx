"use client"

import { Badge, Button, Callout, Checkbox, Panel, Select, Spinner } from "@tfv/ui"
import { ScanLine } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useId, useRef, useState } from "react"
import { ApiError, api } from "~/lib/api.client.ts"
import {
  type DeliveryLineRow,
  type DeliveryRow,
  RETURN_CONDITIONS,
  type ReturnCondition,
} from "../../../production.ts"
import { itemStatusTone } from "../../items/item-badges.tsx"

/**
 * La verificación pieza por pieza.
 *
 * Es la pantalla que de verdad se usa: alguien de pie, con una tableta en una mano y una caja
 * abierta delante. El orden de dispositivos de `PRODUCT.md` —iPad primero— no es una nota al pie
 * aquí, es la premisa.
 *
 * ## El escáner va arriba y es lo primero que recibe el foco
 *
 * Verificar de verdad no es ir tachando una lista con la vista: es coger un objeto, leer su
 * etiqueta y ver si estaba en la nota. Por eso el campo de código encabeza el bloque y el listado
 * queda debajo como registro de lo que va ocurriendo, no como el mecanismo.
 *
 * Un lector de códigos escribe el contenido y manda `Enter`, así que un formulario con un campo de
 * texto **es** el conector del lector: no hace falta ninguna integración. Y quien no tenga lector
 * teclea el código, que para eso está en el alfabeto de Crockford.
 *
 * ## Cada pieza dice quién la verificó, y sin abrir nada
 *
 * La atribución va en la propia línea. Escondida tras un menú, la pregunta que la nota existe para
 * contestar —«¿quién dijo que esto estaba?»— costaría un clic por fila.
 *
 * ## En una devolución hay que decir en qué estado vuelve, **antes** de marcarla
 *
 * El selector de condición está al lado de la casilla y no hay valor implícito que se aplique
 * solo: quien marca la pieza acaba de tenerla en la mano y es el único momento en que esa pregunta
 * se puede contestar. Dejarla para el cierre acaba con las doce marcadas igual, que es exactamente
 * lo que la columna existe para impedir.
 *
 * En el escáner sí hay un selector con valor de partida, y no es lo mismo: ahí la condición **se
 * elige antes de leer la etiqueta**, así que sigue siendo una declaración de quien está mirando el
 * objeto, no un supuesto del sistema.
 */

/** Estados de nota en los que la lista todavía se toca. */
function isOpen(status: DeliveryRow["status"]): boolean {
  return status === "pending" || status === "in_progress"
}

export function DeliveryLines({
  companyId,
  productionId,
  delivery,
  canVerify,
  canRemove,
}: {
  companyId: string
  productionId: string
  delivery: DeliveryRow
  canVerify: boolean
  canRemove: boolean
}) {
  const t = useTranslations("productions.deliveries")
  const format = useFormatter()
  const router = useRouter()
  const scanId = useId()
  const scanRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)
  const [condition, setCondition] = useState<ReturnCondition>(RETURN_CONDITIONS[0])

  const inbound = delivery.direction === "inbound"
  const open = isOpen(delivery.status)
  const base = `/companies/${companyId}/productions/${productionId}/deliveries/${delivery.id}`

  async function setVerified(line: DeliveryLineRow, next: boolean, chosen?: ReturnCondition) {
    setBusy(line.id)
    setError(null)

    try {
      await api(`${base}/lines/${line.id}/verification`, {
        method: "PUT",
        body: {
          isVerified: next,
          ...(next && inbound ? { returnCondition: chosen ?? condition } : {}),
        },
      })
      router.refresh()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : t("verifyFailed"))
    } finally {
      setBusy(null)
    }
  }

  async function remove(line: DeliveryLineRow) {
    setBusy(line.id)
    setError(null)

    try {
      await api(`${base}/lines/${line.id}`, { method: "DELETE" })
      router.refresh()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : t("removeFailed"))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Leer una etiqueta y marcar su pieza.
   *
   * Dos peticiones y no una: primero se localiza la línea por el código —que es lo que dice si el
   * objeto **estaba en la nota**— y sólo después se marca. Un único punto que hiciera las dos cosas
   * no podría distinguir «este código no es de esta nota» de «no se pudo marcar», y la primera es
   * la respuesta que hace falta con el objeto en la mano.
   */
  async function scan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const field = scanRef.current
    const code = field?.value.trim().toUpperCase() ?? ""
    if (code === "") return

    setBusy("scan")
    setError(null)
    setScanNote(null)

    try {
      const line = await api<DeliveryLineRow>(`${base}/lines/by-code/${encodeURIComponent(code)}`)

      if (line.isVerified) {
        // No se vuelve a marcar: ya estaba. Decirlo evita que alguien crea que el lector falló y
        // pase el mismo objeto tres veces.
        setScanNote(t("scanAlready", { name: line.itemName }))
      } else {
        await setVerified(line, true)
        setScanNote(t("scanDone", { name: line.itemName }))
      }

      if (field) field.value = ""
      field?.focus()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : t("scanNotHere", { code }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="piezas">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="piezas" className="text-h4 font-semibold text-content">
          {t("pieces")}
        </h2>

        <p className="text-body2 text-content-muted tabular-nums">
          {delivery.counts.total === 0
            ? t("noPieces")
            : t("verifiedOf", {
                verified: delivery.counts.verified,
                total: delivery.counts.total,
              })}
        </p>
      </div>

      {error ? (
        <Callout tone="danger" live>
          {error}
        </Callout>
      ) : null}

      {open && canVerify && delivery.counts.total > 0 ? (
        <Panel className="flex flex-col gap-3 p-4">
          <form onSubmit={scan} className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
              <label htmlFor={scanId} className="text-body2 font-semibold text-content">
                {t("scanLabel")}
              </label>

              <div className="flex items-center gap-2">
                <ScanLine className="size-4 shrink-0 text-content-faint" aria-hidden="true" />
                <input
                  ref={scanRef}
                  id={scanId}
                  name="code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={t("scanPlaceholder")}
                  className="h-(--control-h) min-w-0 flex-1 rounded-lg border border-edge-control bg-panel px-3 font-mono text-body2 text-content placeholder:text-content-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                />
              </div>
            </div>

            {inbound ? (
              <div className="flex min-w-[11rem] flex-col gap-1.5">
                <span className="text-body2 font-semibold text-content">{t("comesBackAs")}</span>
                <Select
                  aria-label={t("comesBackAs")}
                  value={condition}
                  onChange={(event) => setCondition(event.target.value as ReturnCondition)}
                >
                  {RETURN_CONDITIONS.map((one) => (
                    <option key={one} value={one}>
                      {t(`condition.${one}`)}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            <Button type="submit" loading={busy === "scan"}>
              {t("scanSubmit")}
            </Button>
          </form>

          <p aria-live="polite" className="min-h-5 text-body2 text-content-muted">
            {scanNote}
          </p>
        </Panel>
      ) : null}

      {delivery.lines.length === 0 ? (
        <Panel className="p-6 text-body1 text-content-muted">{t("emptyLines")}</Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul>
            {delivery.lines.map((line) => (
              <li
                key={line.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 not-last:border-edge not-last:border-b"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {open && canVerify ? (
                    <Checkbox
                      checked={line.isVerified}
                      disabled={busy === line.id}
                      onCheckedChange={(checked) => setVerified(line, checked === true)}
                      aria-label={t("verifyPiece", { name: line.itemName })}
                    />
                  ) : null}

                  <div className="min-w-0">
                    <p className="truncate text-body1 font-semibold text-content">
                      {line.itemName}
                    </p>
                    <p className="truncate font-mono text-body3 text-content-faint">
                      {line.itemCode}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {line.isVerified ? (
                    <>
                      <Badge tone="firme">{t("verified")}</Badge>
                      <span className="text-body3 text-content-muted">
                        {line.verifiedByName ?? t("someone")}
                        {line.verifiedAt
                          ? ` · ${format.dateTime(new Date(line.verifiedAt), { dateStyle: "short", timeStyle: "short" })}`
                          : null}
                      </span>
                    </>
                  ) : (
                    <Badge tone="reposo">{t("notVerified")}</Badge>
                  )}

                  {line.returnCondition ? (
                    <Badge tone={itemStatusTone(line.returnCondition)}>
                      {t(`condition.${line.returnCondition}`)}
                    </Badge>
                  ) : null}

                  {busy === line.id ? <Spinner className="size-4" /> : null}

                  {open && canRemove ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === line.id}
                      onClick={() => remove(line)}
                    >
                      {t("removePiece")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  )
}
