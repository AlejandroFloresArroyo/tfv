"use client"

import { Button, Callout, Dialog, DialogContent, DialogTrigger, Field, Input, Panel } from "@tfv/ui"
import { CalendarPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"
import type { OutUnit } from "./quote-returns.tsx"

/**
 * Extender la renta.
 *
 * Una renta no se alarga editándola: su equipo está fuera y su composición está congelada. Se crea
 * una cotización nueva, enlazada, que **recibe los vínculos** de las unidades que continúan — sin
 * que pasen un instante por «disponible», que es donde otra cotización podría llevárselas mientras
 * siguen en un rodaje.
 *
 * Puede ser **parcial**: lo que no se marque se queda con la renta original, esperando su retorno.
 * Por eso las unidades se eligen una a una y no por cantidad: en la nave se reclama equipo por su
 * código, no por su número.
 *
 * Nace **sin precio**. La ventana es otra, así que el importe negociado de la original no vale, y
 * copiarlo parecería que alguien lo decidió. Se ajusta en la propia extensión, que admite cambios
 * de precio aunque su equipo ya esté fuera.
 */
export function QuoteExtension({
  companyId,
  warehouseId,
  quoteId,
  quoteName,
  units,
}: {
  companyId: string
  warehouseId: string
  quoteId: string
  quoteName: string
  /** Lo que está fuera. Sin esto no hay nada que extender. */
  units: readonly OutUnit[]
}) {
  const t = useTranslations("warehouses.quotes")
  const common = useTranslations("common")
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [startsOn, setStartsOn] = useState("")
  const [endsOn, setEndsOn] = useState("")
  const [chosen, setChosen] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()

  function change(next: boolean) {
    if (busy) return
    setOpen(next)
    if (next) {
      // Todo continúa salvo que se diga lo contrario: extender por partes es la excepción.
      setChosen(units.map((unit) => unit.id))
      setStartsOn("")
      setEndsOn("")
      setError(null)
    }
  }

  const valid = startsOn !== "" && endsOn !== "" && endsOn > startsOn && chosen.length > 0

  function create() {
    setError(null)
    startBusy(async () => {
      try {
        const extension = await api<{ id: string }>(
          `/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/extensions`,
          {
            method: "POST",
            body: {
              startsOn: new Date(`${startsOn}T00:00:00`).toISOString(),
              endsOn: new Date(`${endsOn}T00:00:00`).toISOString(),
              name: t("extensionName", { name: quoteName }),
              unitIds: chosen,
            },
          },
        )

        setOpen(false)
        router.push(`/c/${companyId}/warehouses/${warehouseId}/quotes/${extension.id}`)
      } catch (failure) {
        if (failure instanceof SessionExpiredError) {
          router.replace("/login")
          return
        }
        setError(failure instanceof ApiError ? failure.message : t("extensionFailed"))
      }
    })
  }

  if (units.length === 0) return null

  return (
    <Panel className="p-4">
      <h2 className="text-body2 font-bold text-content">{t("extension")}</h2>
      <p className="mt-1 text-body3 text-content-faint">{t("extensionHint")}</p>

      <Dialog open={open} onOpenChange={change}>
        <DialogTrigger asChild>
          <Button variant="secondary" className="mt-3 w-full">
            <CalendarPlus className="size-4" aria-hidden="true" />
            {t("extend")}
          </Button>
        </DialogTrigger>

        <DialogContent
          title={t("extensionTitle")}
          description={t("extensionDescription")}
          locked={busy}
          closeLabel={common("close")}
          size="lg"
        >
          <div className="flex flex-col gap-4">
            {error ? (
              <Callout tone="danger" live>
                {error}
              </Callout>
            ) : null}

            <div className="grid gap-4 tablet:grid-cols-2">
              <Field label={t("extensionStart")}>
                {(ids) => (
                  <Input
                    {...ids}
                    type="date"
                    value={startsOn}
                    disabled={busy}
                    onChange={(event) => setStartsOn(event.target.value)}
                  />
                )}
              </Field>

              <Field label={t("extensionEnd")}>
                {(ids) => (
                  <Input
                    {...ids}
                    type="date"
                    value={endsOn}
                    disabled={busy}
                    aria-invalid={(endsOn !== "" && endsOn <= startsOn) || undefined}
                    onChange={(event) => setEndsOn(event.target.value)}
                  />
                )}
              </Field>
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-body2 font-bold text-content">
                {t("extensionUnits", { count: chosen.length })}
              </legend>
              <p className="text-body3 text-content-faint">{t("extensionUnitsHint")}</p>

              <ul className="grid max-h-64 gap-1 overflow-y-auto">
                {units.map((unit) => (
                  <li key={unit.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 hover:bg-panel-hover">
                      <input
                        type="checkbox"
                        className="size-4 rounded-xs border-field"
                        checked={chosen.includes(unit.id)}
                        disabled={busy}
                        onChange={(event) =>
                          setChosen((current) =>
                            event.target.checked
                              ? [...current, unit.id]
                              : current.filter((id) => id !== unit.id),
                          )
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-body3 text-content">
                          {unit.code}
                        </span>
                        <span className="block truncate text-body3 text-content-faint">
                          {unit.productName} · {unit.measurementName}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <p className="text-body3 text-content-faint">{t("extensionNote")}</p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => change(false)}>
                {common("cancel")}
              </Button>
              <Button loading={busy} disabled={!valid} onClick={create}>
                {t("extensionSubmit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
