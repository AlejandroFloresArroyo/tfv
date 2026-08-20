import { Callout, Panel, Separator } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { DeliveryRow, ItemRow } from "../../../production.ts"
import { ProductionNav } from "../../production-nav.tsx"
import { DeliveryDirectionBadge, DeliveryStatusBadge } from "../delivery-badges.tsx"
import {
  CancelDelivery,
  CompleteDelivery,
  ComposeDelivery,
  DeleteDelivery,
  SignDelivery,
} from "./delivery-actions.tsx"
import { DeliveryLines } from "./delivery-lines.tsx"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; deliveryId: string }>
}): Promise<Metadata> {
  const t = await getTranslations()
  const { companyId, productionId, deliveryId } = await params

  const result = await apiGet<DeliveryRow>(
    `/companies/${companyId}/productions/${productionId}/deliveries/${deliveryId}`,
  )

  return { title: result.ok ? result.data.name : t("productions.deliveries.title") }
}

/**
 * Una nota de entrega.
 *
 * Tres bloques, en el orden en que se usan: **qué es** —dirección, estado, responsable—, **qué
 * lleva** —las piezas, que es donde se pasa el tiempo— y **cómo terminó** —las firmas—.
 *
 * ## Las firmas se enseñan aunque no las haya
 *
 * Una nota cerrada sin firma no es un error: se cierra con las piezas verificadas, y la firma es
 * evidencia que puede llegar después o no llegar nunca. Pero **eso hay que poder leerlo**, así que
 * el bloque dice «sin firma» en lugar de desaparecer. Un bloque que se esconde cuando está vacío
 * deja a quien mira sin saber si no hay firma o si no se la están enseñando.
 *
 * ## Lo que se puede hacer depende del estado, y lo que no se puede no se pinta
 *
 * Componer y verificar mientras está abierta; cerrar cuando no falta ninguna pieza; firmar sólo
 * cuando ya se cerró. Los botones que no aplican **no salen** en lugar de salir apagados: un
 * control desactivado sin explicación deja a la gente intentándolo y preguntando por qué.
 *
 * ## Falta el enlace al documento, y falta a propósito
 *
 * El servidor ya compone la hoja de la nota y firma su enlace público —está probado de extremo a
 * extremo—, pero **la pantalla que la dibuja no existe todavía**. No se pone aquí un enlace a una
 * ruta que responde 404: un enlace roto enseña a desconfiar de los demás. Ver `HALLAZGOS.md` H-201.
 */
export default async function DeliveryPage({
  params,
}: {
  params: Promise<{ companyId: string; productionId: string; deliveryId: string }>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, productionId, deliveryId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/productions/${productionId}/deliveries/${deliveryId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const canCompose = can(company, "productions.deliveries.products")
  const canFinish = can(company, "productions.deliveries.finished")
  const canEditInfo = can(company, "productions.deliveries.info")
  const canDelete = can(company, "productions.deliveries.delete")
  const canVerify = can(company, "productions.delivery_products.responsible")
  const canRemoveLine = can(company, "productions.delivery_products.delete")
  // Componer exige elegir de entre el inventario. Sin la clave de artículos no se pide: devolvería
  // `403`, y una lista vacía diría que la producción no tiene utilería.
  const canViewItems = can(company, "productions.products.view")

  const [deliveryResult, itemsResult] = await Promise.all([
    apiGet<DeliveryRow>(
      `/companies/${companyId}/productions/${productionId}/deliveries/${deliveryId}`,
    ),
    canCompose && canViewItems
      ? apiGet<PageEnvelope<ItemRow>>(
          `/companies/${companyId}/productions/${productionId}/items?limit=96`,
        )
      : Promise.resolve(null),
  ])

  const nav = (
    <ProductionNav
      companyId={companyId}
      productionId={productionId}
      canViewProductions={can(company, "productions.productions.view")}
      canViewCategories={can(company, "productions.categories.view")}
      canViewItems={canViewItems}
      canViewDeliveries={can(company, "productions.deliveries.view")}
      canViewWorkflows={can(company, "productions.workflows.view")}
    />
  )

  if (!deliveryResult.ok) {
    return (
      <PageShell title={t("productions.deliveries.title")}>
        {nav}
        <ApiFailure result={deliveryResult} />
      </PageShell>
    )
  }

  const delivery = deliveryResult.data
  const open = delivery.status === "pending" || delivery.status === "in_progress"

  return (
    <PageShell
      title={delivery.name}
      subtitle={t("productions.deliveries.detailSubtitle")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {open && canCompose ? (
            <ComposeDelivery
              companyId={companyId}
              productionId={productionId}
              delivery={delivery}
              items={itemsResult?.ok ? itemsResult.data.items : []}
            />
          ) : null}

          {open && canEditInfo ? (
            <CancelDelivery companyId={companyId} productionId={productionId} delivery={delivery} />
          ) : null}

          {delivery.status === "in_progress" && canFinish ? (
            <CompleteDelivery
              companyId={companyId}
              productionId={productionId}
              delivery={delivery}
            />
          ) : null}

          {delivery.status === "completed" && !delivery.isSigned && canFinish ? (
            <SignDelivery companyId={companyId} productionId={productionId} delivery={delivery} />
          ) : null}

          {canDelete ? (
            <DeleteDelivery companyId={companyId} productionId={productionId} delivery={delivery} />
          ) : null}
        </div>
      }
    >
      {nav}

      <div className="flex flex-col gap-6">
        <Panel className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <DeliveryDirectionBadge direction={delivery.direction} />
            <DeliveryStatusBadge status={delivery.status} />
          </div>

          {delivery.description ? (
            <p className="text-body1 text-content-muted">{delivery.description}</p>
          ) : null}

          <dl className="grid gap-x-6 gap-y-3 tablet:grid-cols-3">
            <div>
              <dt className="legend text-content-faint">
                {t("productions.deliveries.responsible")}
              </dt>
              <dd className="text-body2 text-content">
                {delivery.responsibleName ?? t("productions.deliveries.noResponsible")}
              </dd>
            </div>

            <div>
              <dt className="legend text-content-faint">{t("productions.deliveries.createdAt")}</dt>
              <dd className="text-body2 text-content tabular-nums">
                {format.dateTime(new Date(delivery.createdAt), { dateStyle: "medium" })}
              </dd>
            </div>

            <div>
              <dt className="legend text-content-faint">{t("productions.deliveries.pieces")}</dt>
              <dd className="text-body2 text-content tabular-nums">
                {delivery.counts.total === 0
                  ? t("productions.deliveries.noPieces")
                  : t("productions.deliveries.verifiedOf", {
                      verified: delivery.counts.verified,
                      total: delivery.counts.total,
                    })}
              </dd>
            </div>
          </dl>

          {delivery.status === "in_progress" && delivery.counts.pending > 0 ? (
            <Callout tone="warning">
              {t("productions.deliveries.pendingToClose", { count: delivery.counts.pending })}
            </Callout>
          ) : null}
        </Panel>

        <DeliveryLines
          companyId={companyId}
          productionId={productionId}
          delivery={delivery}
          canVerify={canVerify}
          canRemove={canRemoveLine}
        />

        <section className="flex flex-col gap-3" aria-labelledby="firmas">
          <h2 id="firmas" className="text-h4 font-semibold text-content">
            {t("productions.deliveries.signatures")}
          </h2>

          <Panel className="flex flex-col gap-4 p-5">
            {delivery.isSigned ? (
              <>
                <dl className="grid gap-x-6 gap-y-3 tablet:grid-cols-3">
                  <div>
                    <dt className="legend text-content-faint">
                      {t("productions.deliveries.deliveredBy")}
                    </dt>
                    <dd className="text-body2 text-content">
                      {delivery.signedByName ?? t("productions.deliveries.someone")}
                    </dd>
                  </div>

                  <div>
                    <dt className="legend text-content-faint">
                      {t("productions.deliveries.receivedBy")}
                    </dt>
                    <dd className="text-body2 text-content">{delivery.receiverName}</dd>
                  </div>

                  <div>
                    <dt className="legend text-content-faint">
                      {t("productions.deliveries.signedAt")}
                    </dt>
                    <dd className="text-body2 text-content tabular-nums">
                      {delivery.signedAt
                        ? format.dateTime(new Date(delivery.signedAt), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : null}
                    </dd>
                  </div>
                </dl>

                <Separator />
                <p className="text-body2 text-content-muted">
                  {t("productions.deliveries.signIsFinal")}
                </p>
              </>
            ) : (
              <p className="text-body1 text-content-muted">
                {delivery.status === "completed"
                  ? t("productions.deliveries.unsignedClosed")
                  : t("productions.deliveries.unsignedOpen")}
              </p>
            )}
          </Panel>
        </section>
      </div>
    </PageShell>
  )
}
