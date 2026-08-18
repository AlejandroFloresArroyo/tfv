import { Badge, Callout, Panel, Separator } from "@tfv/ui"
import { CalendarRange, FileText, Package, Users } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { formatAmount } from "~/lib/amount.ts"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type {
  ItemsEnvelope,
  QuoteBreakdown,
  QuoteContact,
  QuoteLineRow,
  QuoteRow,
} from "../../../warehouse.ts"
import { WarehouseNav } from "../../warehouse-nav.tsx"
import { QuoteStatusBadge, QuoteTypeBadge } from "../quote-badges.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.quotes.detail") }
}

/** Cerrada: el desglose que se muestra es el congelado, y conviene que se note. */
const CLOSED = new Set(["completed", "sold", "canceled"])

export default async function QuotePage({
  params,
}: {
  params: Promise<{ companyId: string; warehouseId: string; quoteId: string }>
}) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId, warehouseId, quoteId } = await params
  const path =
    (await headers()).get("x-pathname") ??
    `/c/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const nav = (
    <WarehouseNav
      companyId={companyId}
      warehouseId={warehouseId}
      canViewWarehouses={can(company, "warehouses.warehouses.view")}
      canViewProducts={can(company, "warehouses.products.view")}
      canViewStorages={can(company, "warehouses.storages.view")}
      canViewQuotes={can(company, "warehouses.quotes.view")}
    />
  )

  const base = `/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}`
  const [quoteResult, linesResult, breakdownResult] = await Promise.all([
    apiGet<QuoteRow>(base),
    apiGet<ItemsEnvelope<QuoteLineRow>>(`${base}/lines`),
    apiGet<QuoteBreakdown>(`${base}/breakdown`),
  ])

  if (!quoteResult.ok) {
    return (
      <PageShell title={t("warehouses.quotes.detail")}>
        {nav}
        <ApiFailure result={quoteResult} />
      </PageShell>
    )
  }

  const quote = quoteResult.data
  const lines = linesResult.ok ? linesResult.data.items : []
  const breakdown = breakdownResult.ok ? breakdownResult.data : null
  const amountOf = (lineId: string) =>
    breakdown?.lines.find((line) => line.lineId === lineId) ?? null

  return (
    <PageShell title={quote.name || quote.folio} subtitle={quote.description || quote.code}>
      {nav}

      {quote.alert ? (
        <Callout tone="warning" className="mb-4">
          {quote.alert}
        </Callout>
      ) : null}

      <div className="grid gap-4 laptop:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <FileText className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-body2 font-semibold text-content">{quote.folio}</p>
                  <p className="truncate text-body3 text-content-faint">{quote.code}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <QuoteTypeBadge type={quote.type} />
                <QuoteStatusBadge status={quote.status} />
              </div>
            </div>

            <Separator className="my-4" />

            <dl className="grid gap-3 tablet:grid-cols-2">
              <Row
                label={t("warehouses.quotes.window")}
                value={
                  quote.startsOn && quote.endsOn ? (
                    <span className="inline-flex items-center gap-2">
                      <CalendarRange className="size-4 text-content-faint" aria-hidden="true" />
                      {format.dateTime(new Date(quote.startsOn), "short")} –{" "}
                      {format.dateTime(new Date(quote.endsOn), "short")}
                      {breakdown ? (
                        <span className="text-content-faint">
                          · {t("warehouses.quotes.days", { count: breakdown.days })}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    t("warehouses.quotes.noWindow")
                  )
                }
              />
              <Row
                label={t("warehouses.quotes.rounding")}
                value={
                  quote.roundDays
                    ? quote.roundDirection === "up"
                      ? t("warehouses.quotes.roundUp")
                      : t("warehouses.quotes.roundDown")
                    : t("warehouses.quotes.noRounding")
                }
              />
            </dl>
          </Panel>

          <section aria-labelledby="lines-heading">
            <div className="mb-3 flex items-center gap-2">
              <Package className="size-5 text-content-faint" aria-hidden="true" />
              <h2 id="lines-heading" className="text-title2 font-bold text-content">
                {t("warehouses.quotes.lines")}
              </h2>
            </div>

            {lines.length > 0 ? (
              <div className="grid gap-3">
                {lines.map((line) => {
                  const amounts = amountOf(line.id)
                  return (
                    <Panel key={line.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-body1 font-bold text-content">
                            <Link
                              href={`/c/${companyId}/warehouses/${warehouseId}/products/${line.productId}`}
                              className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
                            >
                              {line.productName}
                            </Link>
                          </h3>
                          <p className="truncate text-body3 text-content-faint">
                            {line.measurementName} · {line.productCode}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={line.quantity > 0 ? "accent" : "neutral"}>
                            {t("warehouses.quotes.reserved", { count: line.quantity })}
                          </Badge>
                          {quote.type === "rent" ? (
                            <Badge>{t(`warehouses.quotes.frequencyOf.${line.frequency}`)}</Badge>
                          ) : null}
                        </div>
                      </div>

                      {amounts ? (
                        <>
                          <Separator className="my-3" />
                          <dl className="grid gap-3 tablet:grid-cols-3">
                            <Row
                              label={t("warehouses.quotes.unitCost")}
                              value={formatAmount(amounts.unitCost, format)}
                            />
                            {quote.type === "rent" ? (
                              <Row
                                label={t("warehouses.quotes.appliedDays")}
                                value={amounts.appliedDays}
                              />
                            ) : null}
                            <Row
                              label={t("warehouses.quotes.lineTotal")}
                              value={formatAmount(amounts.total, format)}
                            />
                          </dl>
                        </>
                      ) : null}
                    </Panel>
                  )
                })}
              </div>
            ) : (
              <Panel className="p-5 text-body1 text-content-muted">
                {t("warehouses.quotes.noLines")}
              </Panel>
            )}
          </section>

          <Contacts client={quote.clientContacts} seller={quote.sellerContacts} />
        </div>

        <aside className="space-y-4">
          {breakdown ? (
            <Amounts breakdown={breakdown} closed={CLOSED.has(quote.status)} />
          ) : breakdownResult.ok ? null : (
            <ApiFailure result={breakdownResult} />
          )}
        </aside>
      </div>
    </PageShell>
  )
}

async function Amounts({ breakdown, closed }: { breakdown: QuoteBreakdown; closed: boolean }) {
  const t = await getTranslations("warehouses.quotes")
  const format = await getFormatter()
  const amount = (value: string) => formatAmount(value, format)

  return (
    <Panel className="p-5">
      <h2 className="text-title2 font-bold text-content">{t("amounts")}</h2>
      <p className="mt-1 text-body3 text-content-faint">
        {closed ? t("amountsFrozen") : t("amountsLive")}
      </p>

      <dl className="mt-4 grid gap-3">
        <Row label={t("subtotal")} value={amount(breakdown.subtotal)} />
        {breakdown.discount !== "0.00" ? (
          <Row label={t("discount")} value={`−${amount(breakdown.discount)}`} />
        ) : null}
        <Row label={t("base")} value={amount(breakdown.base)} />

        {breakdown.taxes.map((tax) => (
          <Row
            key={tax.key}
            label={tax.concept}
            value={`${tax.effect === "decrease" ? "−" : ""}${amount(tax.amount)}`}
          />
        ))}

        <Row label={t("net")} value={amount(breakdown.net)} />
        {breakdown.fees !== "0.00" ? (
          <Row label={t("fees")} value={amount(breakdown.fees)} />
        ) : null}
        {breakdown.advance !== "0.00" ? (
          <Row label={t("advance")} value={`−${amount(breakdown.advance)}`} />
        ) : null}
      </dl>

      <Separator className="my-4" />

      <dl className="grid gap-1">
        <dt className="text-body3 font-semibold text-content-faint">{t("total")}</dt>
        <dd className="text-title1 font-bold text-content">{amount(breakdown.total)}</dd>
      </dl>

      {breakdown.penalty !== "0.00" ? (
        <>
          <Separator className="my-4" />
          <dl className="grid gap-1">
            <dt className="text-body3 font-semibold text-content-faint">{t("penalty")}</dt>
            <dd className="text-body1 font-semibold text-content-muted">
              {amount(breakdown.penalty)}
            </dd>
            <dd className="text-body3 text-content-faint">{t("penaltyHint")}</dd>
          </dl>
        </>
      ) : null}
    </Panel>
  )
}

async function Contacts({ client, seller }: { client: QuoteContact[]; seller: QuoteContact[] }) {
  const t = await getTranslations("warehouses.quotes")
  if (client.length === 0 && seller.length === 0) return null

  return (
    <section aria-labelledby="contacts-heading">
      <div className="mb-3 flex items-center gap-2">
        <Users className="size-5 text-content-faint" aria-hidden="true" />
        <h2 id="contacts-heading" className="text-title2 font-bold text-content">
          {t("contacts")}
        </h2>
      </div>

      <div className="grid gap-3 tablet:grid-cols-2">
        <ContactList title={t("clientSide")} contacts={client} />
        <ContactList title={t("sellerSide")} contacts={seller} />
      </div>
    </section>
  )
}

async function ContactList({ title, contacts }: { title: string; contacts: QuoteContact[] }) {
  const t = await getTranslations("warehouses.quotes")

  return (
    <Panel className="p-4">
      <h3 className="text-body2 font-bold text-content">{title}</h3>
      {contacts.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {contacts.map((contact) => (
            <li key={`${contact.name}-${contact.phone ?? ""}`} className="min-w-0">
              <p className="truncate text-body2 font-semibold text-content">{contact.name}</p>
              {contact.position || contact.phone ? (
                <p className="truncate text-body3 text-content-faint">
                  {[contact.position, contact.phone].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-body3 text-content-muted">{t("noContacts")}</p>
      )}
    </Panel>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-body3 font-semibold text-content-faint">{label}</dt>
      <dd className="text-body2 text-content-muted">{value}</dd>
    </div>
  )
}
