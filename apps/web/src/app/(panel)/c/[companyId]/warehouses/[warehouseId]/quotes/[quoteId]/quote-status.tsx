"use client"

import { allowedTransitions, type QuoteStatus, type TradeType } from "@tfv/contracts/quote-status"
import { Button, Callout, Menu, MenuContent, MenuItem, MenuTrigger, Panel } from "@tfv/ui"
import { ChevronDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"

/**
 * El cambio de estado.
 *
 * Sólo ofrece las transiciones que la máquina admite, y las lee de `@tfv/contracts` —el mismo mapa
 * que aplica el servidor—. Ofrecer todas y dejar que el servidor rechace convertiría una regla del
 * dominio en un error de formulario.
 *
 * Lo que **no** se decide aquí es el permiso: tres destinos exigen su propia clave, y quien no la
 * tenga recibe `403`. La pantalla oculta lo que sabe que no puede hacer; el resto lo dice la API,
 * que es quien tiene la matriz.
 */
export function QuoteStatusControl({
  companyId,
  warehouseId,
  quoteId,
  status,
  type,
  canRent,
  canFinish,
}: {
  companyId: string
  warehouseId: string
  quoteId: string
  status: QuoteStatus
  type: TradeType
  canRent: boolean
  canFinish: boolean
}) {
  const t = useTranslations("warehouses.quotes")
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const destinations = allowedTransitions(status, type).filter((destination) => {
    if (destination === "in_rent") return canRent
    if (destination === "completed" || destination === "sold") return canFinish
    return true
  })

  function move(next: QuoteStatus) {
    setError(null)
    startTransition(async () => {
      try {
        await api(`/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/status`, {
          method: "PATCH",
          body: { status: next },
        })
        router.refresh()
      } catch (failure) {
        if (failure instanceof SessionExpiredError) {
          router.replace("/login")
          return
        }
        setError(failure instanceof ApiError ? failure.message : t("statusFailed"))
      }
    })
  }

  if (destinations.length === 0) {
    return (
      <Panel className="p-4">
        <h2 className="text-body2 font-bold text-content">{t("status")}</h2>
        <p className="mt-1 text-body3 text-content-muted">{t("closedForever")}</p>
      </Panel>
    )
  }

  return (
    <Panel className="p-4">
      <h2 className="text-body2 font-bold text-content">{t("status")}</h2>
      <p className="mt-1 text-body3 text-content-faint">{t("statusHint")}</p>

      {error ? (
        <Callout tone="danger" live className="mt-3">
          {error}
        </Callout>
      ) : null}

      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary" className="mt-3 w-full" loading={pending}>
            {t("moveTo")}
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </MenuTrigger>

        <MenuContent>
          {destinations.map((destination) => (
            <MenuItem key={destination} onSelect={() => move(destination)}>
              {t(`state.${destination}`)}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </Panel>
  )
}
