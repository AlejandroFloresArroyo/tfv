"use client"

import { Badge, Button, Callout, Dialog, DialogContent, DialogTrigger, Spinner } from "@tfv/ui"
import { History } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { api } from "~/lib/api.client.ts"
import type { ItemsEnvelope, StockEventRow, StockUnitRow } from "../../../../../warehouse.ts"

type Load =
  | { readonly step: "idle" }
  | { readonly step: "loading" }
  | { readonly step: "failed" }
  | { readonly step: "done"; readonly items: readonly StockEventRow[] }

/**
 * La vida de una unidad.
 *
 * `stock-units` lo pide entero: estado anterior, nuevo, quién lo provocó, cuándo y por qué motivo,
 * **incluida el alta**. Sin el momento inicial el historial empieza en el segundo estado y no se
 * puede reconstruir de dónde salió la unidad.
 *
 * ## Se pide al abrir, no al pintar la tabla
 *
 * Una página de veinticuatro unidades son veinticuatro historiales que casi nadie va a mirar.
 * Traerlos con la tabla costaría veinticuatro peticiones para enseñar cero de ellas.
 *
 * ## El responsable puede no tener nombre
 *
 * La API devuelve el identificador de quien lo provocó, no su nombre. Resolverlo exige
 * `companies.users.view`, que es un permiso distinto del que abre esta pantalla: quien no lo tenga
 * ve que el cambio **tiene** responsable registrado sin poder nombrarlo, que es más cierto que
 * enseñar un identificador o fingir que no hay nadie.
 */
export function UnitHistory({
  companyId,
  warehouseId,
  unit,
  actors,
}: {
  companyId: string
  warehouseId: string
  unit: StockUnitRow
  actors: Readonly<Record<string, string>>
}) {
  const t = useTranslations("warehouses")
  const common = useTranslations("common")
  const format = useFormatter()

  const [open, setOpen] = useState(false)
  const [load, setLoad] = useState<Load>({ step: "idle" })

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoad({ step: "loading" })

    api<ItemsEnvelope<StockEventRow>>(
      `/companies/${companyId}/warehouses/${warehouseId}/units/${unit.id}/history`,
    )
      .then((page) => {
        if (!cancelled) setLoad({ step: "done", items: page.items })
      })
      .catch(() => {
        if (!cancelled) setLoad({ step: "failed" })
      })

    return () => {
      cancelled = true
    }
  }, [open, companyId, warehouseId, unit.id])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <History className="size-4" aria-hidden="true" />
          {t("stock.history")}
        </Button>
      </DialogTrigger>

      <DialogContent
        title={t("stock.historyOf", { code: unit.code })}
        description={t("stock.historyDescription")}
        closeLabel={common("close")}
      >
        {load.step === "loading" || load.step === "idle" ? (
          <p className="flex items-center gap-2 text-body2 text-content-muted">
            <Spinner className="size-4" />
            {common("loading")}
          </p>
        ) : null}

        {load.step === "failed" ? (
          <Callout tone="danger" live>
            {t("stock.historyFailed")}
          </Callout>
        ) : null}

        {load.step === "done" ? (
          load.items.length === 0 ? (
            <p className="text-body2 text-content-muted">{t("stock.historyEmpty")}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {load.items.map((event) => (
                <li key={event.id} className="border-l-2 border-edge pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{t(`stock.reasons.${event.reason}`)}</Badge>
                    <span className="text-body2 font-semibold text-content">
                      {event.fromStatus === null
                        ? t("stock.historyBirth")
                        : t("stock.historyFrom", { status: t(`status.${event.fromStatus}`) })}
                      {" → "}
                      {t(`status.${event.toStatus}`)}
                    </span>
                  </div>

                  <p className="mt-1 text-body3 text-content-faint">
                    {format.dateTime(new Date(event.occurredAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {" · "}
                    {event.actorId === null
                      ? t("stock.actorUnknown")
                      : (actors[event.actorId] ?? t("stock.actorHidden"))}
                  </p>

                  <p className="mt-0.5 text-body3 text-content-muted">
                    {event.note ? event.note : t("stock.noNote")}
                  </p>
                </li>
              ))}
            </ol>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
