import { Badge, ItemCard } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import type { FilterSpec } from "~/components/collection/params.ts"
import { toApiQuery, toSearchParams } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"

interface PaymentRow {
  id: string
  amount: string
  currency: string
  seats: number
  periodStart: string | null
  periodEnd: string | null
  succeeded: boolean
  externalInvoiceId: string | null
  createdAt: string
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("billing.payments.title") }
}

/**
 * Historial de cobros de la suscripción.
 *
 * **Los fallidos también aparecen**, y con el importe que se debía. Un historial que sólo enseñe lo
 * cobrado deja a quien lo mira sin la única información que necesita cuando su empresa está en pago
 * pendiente: qué pasó, cuánto y cuándo.
 *
 * El importe llega como **cadena decimal** y se formatea sin pasar por `Number` más que para
 * presentarlo: es dinero, y el redondeo de coma flotante no tiene por qué entrar aquí.
 */
export default async function SubscriptionPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId } = await params
  const query = toSearchParams(await searchParams)

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/payments`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const result = await apiGet<PageEnvelope<PaymentRow>>(
    `/companies/${companyId}/subscription/payments?${toApiQuery(query)}`,
  )

  const filters: FilterSpec[] = [
    {
      kind: "boolean",
      key: "succeeded",
      label: t("billing.payments.result"),
      trueLabel: t("billing.payments.succeeded"),
      falseLabel: t("billing.payments.failed"),
    },
    {
      kind: "dateRange",
      key: "createdAt",
      label: t("billing.payments.period"),
      fromLabel: t("collection.from"),
      toLabel: t("collection.to"),
    },
  ]

  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium" })

  return (
    <PageShell
      title={t("billing.payments.title")}
      subtitle={t("billing.payments.subtitle", { company: company.name })}
    >
      <Collection
        params={query}
        result={result}
        filters={filters}
        emptyTitle={t("billing.payments.empty")}
        emptyBody={t("billing.payments.emptyBody")}
      >
        {(items, view) =>
          items.map((payment) => (
            <ItemCard
              key={payment.id}
              view={view}
              title={format.number(Number(payment.amount), {
                style: "currency",
                currency: payment.currency,
              })}
              subtitle={
                payment.periodStart && payment.periodEnd
                  ? `${day(payment.periodStart)} – ${day(payment.periodEnd)}`
                  : t("billing.payments.noPeriod")
              }
              meta={
                <>
                  <Badge tone={payment.succeeded ? "success" : "danger"}>
                    {payment.succeeded
                      ? t("billing.payments.succeeded")
                      : t("billing.payments.failed")}
                  </Badge>
                  <Badge>{t("billing.plan.seatsValue", { count: payment.seats })}</Badge>
                  <span className="text-body3 text-content-faint">{day(payment.createdAt)}</span>
                </>
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
