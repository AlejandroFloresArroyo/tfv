"use client"

import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
  Panel,
  Separator,
} from "@tfv/ui"
import { Check, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"
import type { OrderLineRow } from "../../../warehouse.ts"

/**
 * Aceptar o rechazar un pedido.
 *
 * Son las dos decisiones que se toman **de cara a otra empresa**, y por eso tienen clave propia en
 * la matriz de permisos y un sitio propio en la ficha.
 *
 * ## Lo que no cabe se dice antes, no después
 *
 * Cada línea llega con la existencia libre de su medida, así que la pantalla puede decir qué va a
 * quedar fuera **antes** de aceptar. Enterarse al fallar la reserva es enterarse tarde: el operador
 * ya le dijo que sí al cliente.
 */
export function OrderActions({
  companyId,
  warehouseId,
  orderId,
  lines,
  canAccept,
  canReject,
}: {
  companyId: string
  warehouseId: string
  orderId: string
  lines: readonly OrderLineRow[]
  canAccept: boolean
  canReject: boolean
}) {
  const t = useTranslations("warehouses.orders")
  const common = useTranslations("common")
  const router = useRouter()

  const [includeAll, setIncludeAll] = useState(false)
  const [allowMinting, setAllowMinting] = useState(false)
  const [reason, setReason] = useState("")
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()

  const base = `/companies/${companyId}/warehouses/${warehouseId}/orders/${orderId}`
  const short = lines.filter((line) => line.available < line.quantity)

  function run(work: () => Promise<unknown>) {
    setError(null)
    startBusy(async () => {
      try {
        await work()
      } catch (failure) {
        if (failure instanceof SessionExpiredError) {
          router.replace("/login")
          return
        }
        setError(failure instanceof ApiError ? failure.message : t("actionFailed"))
      }
    })
  }

  return (
    <Panel className="p-4">
      <h2 className="text-body2 font-bold text-content">{t("decision")}</h2>
      <p className="mt-1 text-body3 text-content-faint">{t("decisionHint")}</p>

      {error ? (
        <Callout tone="danger" live className="mt-3">
          {error}
        </Callout>
      ) : null}

      {short.length > 0 ? (
        <Callout tone="warning" className="mt-3">
          {t("shortLines", { count: short.length })}
        </Callout>
      ) : null}

      {canAccept ? (
        <div className="mt-3 grid gap-3">
          {short.length > 0 ? (
            <>
              <Checkbox
                label={t("includeAll")}
                checked={includeAll}
                onCheckedChange={(checked) => {
                  setIncludeAll(checked === true)
                  if (checked !== true) setAllowMinting(false)
                }}
              />
              {includeAll ? (
                <Checkbox
                  label={t("allowMinting")}
                  checked={allowMinting}
                  onCheckedChange={(checked) => setAllowMinting(checked === true)}
                />
              ) : null}
            </>
          ) : null}

          <Button
            loading={busy}
            onClick={() =>
              run(async () => {
                const result = await api<{ quoteId: string }>(`${base}/acceptance`, {
                  method: "POST",
                  body: { includeAll, allowMinting },
                })
                router.push(`/c/${companyId}/warehouses/${warehouseId}/quotes/${result.quoteId}`)
              })
            }
          >
            <Check className="size-4" aria-hidden="true" />
            {t("accept")}
          </Button>
        </div>
      ) : null}

      {canReject ? (
        <>
          <Separator className="my-3" />

          <Dialog open={rejecting} onOpenChange={(next) => (busy ? undefined : setRejecting(next))}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="w-full">
                <X className="size-4" aria-hidden="true" />
                {t("reject")}
              </Button>
            </DialogTrigger>

            <DialogContent
              title={t("rejectTitle")}
              description={t("rejectDescription")}
              locked={busy}
              closeLabel={common("close")}
            >
              <div className="flex flex-col gap-4">
                <Field label={t("reason")} hint={t("reasonHint")}>
                  {(ids) => (
                    <Input
                      {...ids}
                      type="text"
                      value={reason}
                      disabled={busy}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  )}
                </Field>

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
                    {common("cancel")}
                  </Button>
                  <Button
                    variant="danger"
                    loading={busy}
                    disabled={reason.trim() === ""}
                    onClick={() =>
                      run(async () => {
                        await api(`${base}/rejection`, {
                          method: "POST",
                          body: { reason: reason.trim() },
                        })
                        setRejecting(false)
                        router.refresh()
                      })
                    }
                  >
                    {t("rejectSubmit")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      {!canAccept && !canReject ? (
        <Badge className="mt-3">{t("noDecisionPermission")}</Badge>
      ) : null}
    </Panel>
  )
}
