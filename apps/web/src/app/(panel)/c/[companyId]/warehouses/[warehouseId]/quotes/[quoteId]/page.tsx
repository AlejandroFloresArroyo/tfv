import { isClosed, linesFrozen } from "@tfv/contracts/quote-status"
import { Badge, Button, Callout, Panel, Separator } from "@tfv/ui"
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
import { QuoteAmounts } from "./quote-amounts.tsx"
import { QuoteEditor } from "./quote-editor.tsx"
import { QuoteExtension } from "./quote-extension.tsx"
import { QuotePaymentTermsPanel } from "./quote-payment.tsx"
import { type PaymentRow, QuotePayments } from "./quote-payments.tsx"
import { QuotePreview } from "./quote-preview.tsx"
import { type OutUnit, QuoteReturns } from "./quote-returns.tsx"
import { QuoteStatusControl } from "./quote-status.tsx"
import { QuoteTaxesPanel } from "./quote-taxes.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.quotes.detail") }
}

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
      canViewOrders={can(company, "warehouses.orders.view")}
    />
  )

  const canEditStatus = can(company, "warehouses.quotes.edit_status")
  const canFinish = can(company, "warehouses.quotes.finished")

  const warehouse = `/companies/${companyId}/warehouses/${warehouseId}`
  const base = `${warehouse}/quotes/${quoteId}`
  const [quoteResult, linesResult, breakdownResult, unitsResult, paymentsResult] =
    await Promise.all([
      apiGet<QuoteRow>(base),
      apiGet<ItemsEnvelope<QuoteLineRow>>(`${base}/lines`),
      apiGet<QuoteBreakdown>(`${base}/breakdown`),
      apiGet<ItemsEnvelope<OutUnit>>(`${base}/units`),
      apiGet<ItemsEnvelope<PaymentRow>>(`${base}/payments`),
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

  // Ni cerrada ni con el equipo fuera. Lo primero porque los importes están congelados; lo segundo
  // porque bajar una cantidad soltaría el vínculo de una unidad que sigue en la calle, y el
  // inventario pasaría a decir que está libre. Ofrecer el editor sería ofrecer un botón cuyo
  // guardado responde `409` siempre.
  // Cerrada: nada se toca, ni siquiera el precio — los importes están congelados. Con el equipo
  // fuera pero abierta: se congela **la composición**, no el precio. Cambiar lo que cuesta una
  // línea no saca ni mete equipo de la nave, y una extensión de renta nace ya con el equipo fuera.
  const closed = isClosed(quote.status)
  const frozen = linesFrozen(quote.status, quote.type)
  const canEditLines = can(company, "warehouses.quotes.edit_products") && !closed

  // Las listas de precios sólo hacen falta para el buscador del editor, y sólo se saben necesarias
  // después de conocer el estado de la cotización.
  const priceListsResult =
    canEditLines && can(company, "warehouses.prices.view")
      ? await apiGet<ItemsEnvelope<{ id: string; name: string }>>(`${warehouse}/price-lists`)
      : null

  const breakdown = breakdownResult.ok ? breakdownResult.data : null
  // Con precio por paquete, los importes de línea no rigen y no se enseñan. Ver `quotation-pricing`.
  const amountOf = (lineId: string) =>
    breakdown?.packagePrice !== undefined
      ? null
      : (breakdown?.lines.find((line) => line.lineId === lineId) ?? null)

  return (
    <PageShell
      title={quote.name || quote.folio}
      subtitle={quote.description || quote.code}
      actions={
        // El documento es una pantalla aparte y no un botón que descarga: se previsualiza antes de
        // mandarlo, que es lo que evita enterarse de un descuadre por el cliente.
        <Button asChild variant="secondary" size="sm">
          <Link href={`/c/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/document`}>
            <FileText className="size-4" aria-hidden="true" />
            {t("documents.quoteDocument")}
          </Link>
        </Button>
      }
    >
      {nav}

      {quote.alert ? (
        <Callout tone="warning" className="mb-4">
          {quote.alert}
        </Callout>
      ) : null}

      <QuotePreview quote={quote} lines={lines}>
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

                <div className="flex flex-wrap items-center gap-1.5">
                  {quote.extendsQuoteId ? (
                    <Link
                      href={`/c/${companyId}/warehouses/${warehouseId}/quotes/${quote.extendsQuoteId}`}
                      className="rounded-xs text-body3 text-content-muted hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
                    >
                      ↗ {t("warehouses.quotes.extends")}
                    </Link>
                  ) : null}
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
                        {format.dateTime(new Date(quote.startsOn), { dateStyle: "medium" })} –{" "}
                        {format.dateTime(new Date(quote.endsOn), { dateStyle: "medium" })}
                        {can(company, "warehouses.quotes.create") &&
                        can(company, "warehouses.quotes.rented") &&
                        unitsResult.ok ? (
                          <QuoteExtension
                            companyId={companyId}
                            warehouseId={warehouseId}
                            quoteId={quoteId}
                            quoteName={quote.name || quote.folio}
                            units={unitsResult.data.items.filter(
                              (unit) => unit.status === "rented",
                            )}
                          />
                        ) : null}
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

            {canEditLines ? (
              <QuoteEditor
                companyId={companyId}
                warehouseId={warehouseId}
                quote={quote}
                lines={lines}
                priceLists={priceListsResult?.ok ? priceListsResult.data.items : []}
                canMint={can(company, "warehouses.products.stock_create")}
                canCreate={can(company, "warehouses.products.create")}
                frozen={frozen}
              />
            ) : (
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
                                <Badge>
                                  {t(`warehouses.quotes.frequencyOf.${line.frequency}`)}
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          {amounts ? (
                            <>
                              <Separator className="my-3" />
                              <dl className="grid gap-3 tablet:grid-cols-3">
                                <Row
                                  label={t("warehouses.quotes.unitCost")}
                                  value={
                                    // Ausente en una línea con precio negociado: su total no se
                                    // reparte exacto entre las unidades. Un guion dice la verdad.
                                    // Y sin precio fijado tampoco hay unitario que enseñar.
                                    amounts.unpriced || amounts.unitCost === undefined
                                      ? "—"
                                      : formatAmount(amounts.unitCost, format)
                                  }
                                />
                                {quote.type === "rent" ? (
                                  <Row
                                    label={t("warehouses.quotes.appliedDays")}
                                    value={amounts.appliedDays}
                                  />
                                ) : null}
                                <Row
                                  label={t("warehouses.quotes.lineTotal")}
                                  value={
                                    // `0.00` diría que es gratis. Nadie le puso precio, que es otra
                                    // cosa — la misma distinción que hace el editor.
                                    amounts.unpriced ? "—" : formatAmount(amounts.total, format)
                                  }
                                />
                              </dl>

                              {amounts.unpriced ? (
                                <p className="mt-3 text-body3 text-warning">
                                  {t("warehouses.quotes.unpricedLine")}
                                </p>
                              ) : null}
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
            )}

            <QuotePaymentTermsPanel
              companyId={companyId}
              warehouseId={warehouseId}
              quoteId={quoteId}
              terms={quote.paymentTerms}
              editable={can(company, "warehouses.quotes.edit_payment") && !closed}
            />

            <QuoteTaxesPanel
              companyId={companyId}
              warehouseId={warehouseId}
              quoteId={quoteId}
              taxes={quote.taxes}
              editable={can(company, "warehouses.quotes.edit_tax") && !closed}
            />

            <QuotePayments
              companyId={companyId}
              warehouseId={warehouseId}
              quoteId={quoteId}
              payments={paymentsResult.ok ? paymentsResult.data.items : []}
              // Una cotización cerrada **sí** admite cobro: una renta que terminó se sigue pagando.
              editable={can(company, "warehouses.quotes.edit_payment")}
            />

            {canFinish && unitsResult.ok ? (
              <QuoteReturns
                companyId={companyId}
                warehouseId={warehouseId}
                quoteId={quoteId}
                units={unitsResult.data.items.filter((unit) => unit.status === "rented")}
              />
            ) : null}

            <Contacts client={quote.clientContacts} seller={quote.sellerContacts} />
          </div>

          <aside className="space-y-4">
            {canEditStatus ? (
              <QuoteStatusControl
                companyId={companyId}
                warehouseId={warehouseId}
                quoteId={quoteId}
                status={quote.status}
                type={quote.type}
                canRent={can(company, "warehouses.quotes.rented")}
                canFinish={canFinish}
              />
            ) : null}

            {breakdown ? (
              <QuoteAmounts saved={breakdown} closed={closed} />
            ) : breakdownResult.ok ? null : (
              <ApiFailure result={breakdownResult} />
            )}
          </aside>
        </div>
      </QuotePreview>
    </PageShell>
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
