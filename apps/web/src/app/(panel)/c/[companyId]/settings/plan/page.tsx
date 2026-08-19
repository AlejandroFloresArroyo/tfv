import { Badge, Callout, Panel } from "@tfv/ui"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getFormatter, getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { can } from "~/lib/can.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { Entitlements, Plan } from "./plan.ts"
import { priceFor, statusTone } from "./plan.ts"
import { CancelPlan, ChoosePlan, ReactivatePlan } from "./plan-actions.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("billing.plan.title") }
}

/**
 * El plan de la empresa: cuál es, qué incluye y cómo se cambia.
 *
 * Los precios **no salen de aquí ni de la base**: vienen del procesador de pagos en cada consulta,
 * porque una copia local se desincroniza en cuanto alguien cambia una tarifa y la pantalla enseñaría
 * un importe distinto del que se va a cobrar.
 *
 * La lista de prestaciones de cada plan se pinta con su aviso al lado: **es material descriptivo**.
 * La spec le dedica un requisito entero a decir que nada la hace cumplir, y una pantalla que la
 * enseñe sin decirlo invita a leerla como un límite.
 */
export default async function PlanPage({ params }: { params: Promise<{ companyId: string }> }) {
  const t = await getTranslations()
  const format = await getFormatter()
  const { companyId } = await params

  const path = (await headers()).get("x-pathname") ?? `/c/${companyId}/settings/plan`
  const profile = await requireProfile(path)
  const company = requireCompany(profile, companyId)

  const [plansResult, entitlementsResult, freeResult] = await Promise.all([
    apiGet<{ items: Plan[] }>("/plans"),
    apiGet<Entitlements>(`/companies/${companyId}/entitlements`),
    apiGet<{ available: boolean }>("/plans/free-availability"),
  ])

  // El catálogo es lo único sin lo que esta pantalla no existe: sin procesador configurado, pedir
  // los precios falla, y decirlo es más útil que enseñar una lista vacía que parece un catálogo sin
  // planes.
  if (!plansResult.ok) {
    return (
      <PageShell title={t("billing.plan.title")}>
        <ApiFailure result={plansResult} />
      </PageShell>
    )
  }

  const plans = plansResult.data.items
  const subscription = entitlementsResult.ok ? entitlementsResult.data.subscription : null
  const freeAvailable = freeResult.ok ? freeResult.data.available : false

  const canSubscribe = can(company, "companies.billings.create")
  const canChange = can(company, "companies.billings.edit")
  const canCancel = can(company, "companies.billings.delete")

  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "long" })

  return (
    <PageShell
      title={t("billing.plan.title")}
      subtitle={t("billing.plan.subtitle", { company: company.name })}
    >
      {subscription ? (
        <Panel className="mb-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-body3 font-semibold tracking-wide text-content-faint uppercase">
                {t("billing.plan.current")}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-h4 font-bold text-content">
                {subscription.planTitle}
                <Badge tone={statusTone(subscription.status)}>
                  {t(`billing.plan.status.${subscription.status}`)}
                </Badge>
                {/*
                  El estado sigue siendo «Activa» cuando está marcada para terminar —y es cierto:
                  la empresa opera hasta el vencimiento—, así que la marca va aparte. Sin ella, quien
                  acaba de cancelar ve un verde tranquilizador y cree que no se guardó.
                */}
                {subscription.cancelAtPeriodEnd ? (
                  <Badge tone="warning">{t("billing.plan.status.canceled")}</Badge>
                ) : null}
              </p>

              <p className="mt-2 text-body2 text-content-muted">
                {t("billing.plan.seatsValue", { count: subscription.seats })}
                {subscription.periodEnd ? (
                  <>
                    {" · "}
                    {subscription.cancelAtPeriodEnd
                      ? t("billing.plan.endsOn", { date: day(subscription.periodEnd) })
                      : t("billing.plan.renewsOn", { date: day(subscription.periodEnd) })}
                  </>
                ) : null}
              </p>

              {subscription.discountPercent ? (
                <p className="mt-1 text-body2 text-content-muted">
                  {t("billing.plan.discount", {
                    percent: Number(subscription.discountPercent).toString(),
                  })}
                  {subscription.promotionCode
                    ? ` · ${t("billing.plan.promotionCode", { code: subscription.promotionCode })}`
                    : null}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {subscription.cancelAtPeriodEnd
                ? canChange && <ReactivatePlan companyId={companyId} />
                : canCancel && <CancelPlan companyId={companyId} />}
            </div>
          </div>

          {/*
            Los dos avisos que la spec pide con esas palabras: al cancelar «se le informa de la fecha
            en que terminará», y ante un fallo de cobro la empresa «sigue operando durante el periodo
            de gracia». Sin decirlo, un estado de pago pendiente parece una avería.
          */}
          {subscription.cancelAtPeriodEnd && subscription.periodEnd ? (
            <Callout tone="warning" className="mt-4">
              {t("billing.plan.cancelled", { date: day(subscription.periodEnd) })}
            </Callout>
          ) : null}

          {subscription.status === "past_due" && subscription.gracePeriodEndsAt ? (
            <Callout tone="warning" className="mt-4">
              {t("billing.plan.graceUntil", { date: day(subscription.gracePeriodEndsAt) })}
            </Callout>
          ) : null}
        </Panel>
      ) : (
        <Callout tone="info" className="mb-6">
          <p className="font-semibold">{t("billing.plan.none")}</p>
          <p className="mt-1">{t("billing.plan.noneBody")}</p>
        </Callout>
      )}

      <ul className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = subscription?.planId === plan.id
          const monthly = priceFor(plan, "month")
          const yearly = priceFor(plan, "year")
          const freeBlocked = plan.tier === 0 && !freeAvailable && !isCurrent

          return (
            <li key={plan.id}>
              <Panel
                className={`flex h-full flex-col p-5 ${isCurrent ? "ring-2 ring-accent" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-h5 font-bold text-content">{plan.title}</h2>
                  {plan.isRecommended ? (
                    <Badge tone="accent">{t("billing.plan.recommended")}</Badge>
                  ) : null}
                </div>

                {plan.description ? (
                  <p className="mt-1 text-body2 text-content-muted">{plan.description}</p>
                ) : null}

                <p className="mt-3 text-h4 font-bold text-content">
                  {plan.tier === 0 ? (
                    t("billing.plan.free")
                  ) : monthly ? (
                    <>
                      {format.number(Number(monthly.unitAmount), {
                        style: "currency",
                        currency: monthly.currency,
                      })}
                      <span className="text-body2 font-normal text-content-muted">
                        {` ${t("billing.plan.perSeat")} · ${t("billing.plan.perMonth")}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-body2 font-normal text-content-muted">
                      {t("billing.plan.noPrice")}
                    </span>
                  )}
                </p>

                {yearly ? (
                  <p className="text-body3 text-content-faint">
                    {format.number(Number(yearly.unitAmount), {
                      style: "currency",
                      currency: yearly.currency,
                    })}{" "}
                    {t("billing.plan.perSeat")} · {t("billing.plan.perYear")}
                  </p>
                ) : null}

                {plan.features.length > 0 ? (
                  <>
                    <p className="mt-4 text-body3 font-semibold tracking-wide text-content-faint uppercase">
                      {t("billing.plan.features")}
                    </p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {plan.features.map((feature) => (
                        <li key={feature.key} className="text-body2 text-content-muted">
                          {feature.name}
                          {/*
                            Una prestación de sí o no ya lo dice con su nombre: «Producciones: true»
                            enseña el tipo de dato en lugar de la prestación. Sólo se acompaña el
                            valor cuando aporta algo — un número, un texto.
                          */}
                          {typeof feature.value === "boolean" || feature.value === undefined
                            ? null
                            : `: ${String(feature.value)}`}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-body3 text-content-faint">
                      {t("billing.plan.featuresNote")}
                    </p>
                  </>
                ) : null}

                <div className="mt-auto pt-4">
                  {isCurrent ? (
                    <Badge>{t("billing.plan.current")}</Badge>
                  ) : freeBlocked ? (
                    <p className="text-body3 text-content-faint">{t("billing.plan.freeUsed")}</p>
                  ) : subscription ? (
                    canChange && (
                      <ChoosePlan
                        companyId={companyId}
                        plan={plan}
                        mode="change"
                        seats={subscription.seats}
                      />
                    )
                  ) : (
                    canSubscribe && (
                      <ChoosePlan companyId={companyId} plan={plan} mode="subscribe" seats={1} />
                    )
                  )}
                </div>
              </Panel>
            </li>
          )
        })}
      </ul>
    </PageShell>
  )
}
