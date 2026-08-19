"use client"

import { Badge, Button, Callout, Panel, Select, Separator } from "@tfv/ui"
import { PackageCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"
import type { StockStatus } from "../../../warehouse.ts"

/**
 * El retorno del equipo rentado.
 *
 * Ver `openspec/specs/stock-reservation/spec.md`, «Retorno explícito del equipo rentado».
 *
 * Es el acto que cierra una renta, y **no ocurre solo**: completar una cotización de renta deja el
 * equipo fuera a propósito, porque terminar el documento y recibir el equipo son cosas distintas y
 * pasan en momentos distintos. Sin esta pantalla, el inventario de una renta terminada se queda
 * `rented` para siempre.
 *
 * Cada unidad vuelve con **su** estado: lo que llega roto no puede volver a la existencia útil, o
 * la siguiente cotización lo apartaría y alguien se lo llevaría a un rodaje.
 */

/** Estados con los que una unidad puede volver. `available` es lo normal; el resto, la excepción. */
const RETURN_STATES: readonly StockStatus[] = [
  "available",
  "damaged",
  "incomplete",
  "modified",
  "lost",
  "robbed",
]

export interface OutUnit {
  id: string
  code: string
  status: StockStatus
  productName: string
  measurementName: string
}

export function QuoteReturns({
  companyId,
  warehouseId,
  quoteId,
  units,
}: {
  companyId: string
  warehouseId: string
  quoteId: string
  units: readonly OutUnit[]
}) {
  const t = useTranslations("warehouses.quotes")
  // Los estados de existencia ya tienen sus nombres; no se vuelven a escribir aquí.
  const stock = useTranslations("warehouses.status")
  const router = useRouter()
  const [chosen, setChosen] = useState<Record<string, StockStatus>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const selected = Object.keys(chosen)

  function register() {
    setError(null)
    startTransition(async () => {
      try {
        await api(`/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/returns`, {
          method: "POST",
          body: {
            units: selected.map((unitId) => ({ unitId, status: chosen[unitId] })),
          },
        })
        setChosen({})
        router.refresh()
      } catch (failure) {
        if (failure instanceof SessionExpiredError) {
          router.replace("/login")
          return
        }
        setError(failure instanceof ApiError ? failure.message : t("returnFailed"))
      }
    })
  }

  if (units.length === 0) return null

  return (
    <section aria-labelledby="returns-heading">
      <div className="mb-3 flex items-center gap-2">
        <PackageCheck className="size-5 text-content-faint" aria-hidden="true" />
        <h2 id="returns-heading" className="text-title2 font-bold text-content">
          {t("returns")}
        </h2>
      </div>

      <Panel className="p-4">
        <p className="text-body3 text-content-muted">{t("returnsHint")}</p>

        {error ? (
          <Callout tone="danger" live className="mt-3">
            {error}
          </Callout>
        ) : null}

        <Separator className="my-4" />

        <ul className="grid gap-2">
          {units.map((unit) => (
            <li key={unit.id} className="flex flex-wrap items-center gap-3">
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  checked={unit.id in chosen}
                  onChange={(event) =>
                    setChosen((current) => {
                      if (!event.target.checked) {
                        const { [unit.id]: _removed, ...rest } = current
                        return rest
                      }
                      return { ...current, [unit.id]: "available" as StockStatus }
                    })
                  }
                  className="size-4 shrink-0 rounded-xs border-edge-control"
                />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-body3 font-semibold text-content">
                    {unit.code}
                  </span>
                  <span className="block truncate text-body3 text-content-faint">
                    {unit.productName} · {unit.measurementName}
                  </span>
                </span>
              </label>

              {unit.id in chosen ? (
                <Select
                  value={chosen[unit.id]}
                  onChange={(event) =>
                    setChosen((current) => ({
                      ...current,
                      [unit.id]: event.target.value as StockStatus,
                    }))
                  }
                  aria-label={t("returnedAs", { code: unit.code })}
                  className="w-44"
                >
                  {RETURN_STATES.map((state) => (
                    <option key={state} value={state}>
                      {stock(state)}
                    </option>
                  ))}
                </Select>
              ) : (
                <Badge tone="warning">{stock(unit.status)}</Badge>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-end">
          <Button onClick={register} loading={pending} disabled={selected.length === 0}>
            {t("registerReturn", { count: selected.length })}
          </Button>
        </div>
      </Panel>
    </section>
  )
}
