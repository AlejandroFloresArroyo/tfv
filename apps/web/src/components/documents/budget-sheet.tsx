import type { BudgetDocument } from "@tfv/contracts/budget"
import type { DocumentStamp } from "@tfv/contracts/document"
import { getFormatter, getTranslations } from "next-intl/server"
import { formatAmount } from "~/lib/amount.ts"
import { PrintRules } from "./print-rules.tsx"

/**
 * La hoja del presupuesto de una producción.
 *
 * Ver `openspec/specs/production-budget/spec.md`, requisito «Documento del presupuesto»: anclas y
 * compras «con sus totales y su diferencia».
 *
 * Es la misma hoja con sesión y sin ella: la pantalla del panel y la del enlace público pintan este
 * componente con el mismo modelo. Dos dibujos distintos serían dos documentos distintos con el
 * mismo nombre.
 *
 * ## Papel, no interfaz
 *
 * Colores fijos —blanco y grises— y no los papeles del tema, igual que la cotización y el plan. Un
 * presupuesto impreso en modo oscuro saldría con el fondo del panel, y este papel se manda a
 * contabilidad.
 *
 * **Sin gráficas.** El desglose por categoría va como tabla y no como barras: una barra sin color
 * es un rectángulo gris, y la fotocopiadora de la oficina de producción no imprime en color. Lo que
 * la gráfica hace en pantalla —dejar comparar de un vistazo— lo hace en el papel la columna de
 * cifras alineada a la derecha.
 *
 * ## La diferencia se dice con la palabra
 *
 * `−11.000,00` con la palabra «desfavorable» al lado. En papel el signo menos es lo único que queda
 * de un color, y un signo menos se pierde al fotocopiar: el sobrecoste va escrito.
 */
export async function BudgetSheet({
  document,
  stamp,
}: {
  document: BudgetDocument
  stamp: DocumentStamp
}) {
  const t = await getTranslations("documents")
  const b = await getTranslations("productions.budget")
  const format = await getFormatter()

  const amount = (value: string) => formatAmount(value, format)
  const instant = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" })
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium" })

  return (
    <>
      <PrintRules />

      <article className="documento-hoja mx-auto w-full max-w-[210mm] bg-white p-8 text-gray-9 shadow-[0_1px_3px_rgb(0_0_0/0.12)] tablet:p-10">
        <header className="documento-bloque flex flex-wrap items-start justify-between gap-6 border-gray-3 border-b pb-6">
          <div className="min-w-0">
            <p className="text-h4 font-bold">{document.issuer.name}</p>
            <p className="mt-0.5 text-body1 text-gray-7">{document.production.name}</p>
          </div>

          <div className="text-right">
            <p className="text-body3 uppercase tracking-wider text-gray-6">{t("budget")}</p>
            {document.identity.startsOn === null ? null : (
              <p className="mt-1 text-body2 text-gray-7">
                {document.identity.endsOn === null
                  ? day(document.identity.startsOn)
                  : `${day(document.identity.startsOn)} — ${day(document.identity.endsOn)}`}
              </p>
            )}
          </div>
        </header>

        {/* ─── La resta, arriba: es la respuesta ───────────────────────────── */}
        <section className="documento-bloque documento-columnas mt-6 grid gap-6 tablet:grid-cols-2">
          <div>
            <p className="text-body3 uppercase tracking-wider text-gray-6">{b("budgeted")}</p>
            <p className="mt-0.5 text-h4 tabular-nums">
              {amount(document.amounts.totalPresupuestado)}
            </p>
          </div>
          <div>
            <p className="text-body3 uppercase tracking-wider text-gray-6">{b("spent")}</p>
            <p className="mt-0.5 text-h4 tabular-nums">{amount(document.amounts.totalGastado)}</p>
          </div>
        </section>

        <section className="documento-bloque mt-4 border-gray-3 border-y py-3">
          <p className="text-body3 uppercase tracking-wider text-gray-6">{b("difference")}</p>
          <p className="mt-0.5 text-h3 tabular-nums">
            {amount(document.amounts.diferencia)}{" "}
            <span className="text-body1 font-normal">
              {document.amounts.isUnfavorable ? `· ${b("unfavorable")}` : `· ${b("favorable")}`}
            </span>
          </p>
        </section>

        {/* ─── Las anclas ──────────────────────────────────────────────────── */}
        <Section title={b("anchors")}>
          {document.anchors.length === 0 ? (
            <Empty label={b("noAnchors")} />
          ) : (
            <table className="mt-1 w-full border-collapse">
              <thead>
                <tr className="border-gray-2 border-b text-left">
                  <th className="py-1.5 text-body3 uppercase tracking-wider text-gray-6">
                    {b("name")}
                  </th>
                  <th className="py-1.5 text-body3 uppercase tracking-wider text-gray-6">
                    {b("category")}
                  </th>
                  <th className="py-1.5 text-right text-body3 uppercase tracking-wider text-gray-6">
                    {b("amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {document.anchors.map((anchor) => (
                  <tr key={anchor.id} className="border-gray-2 border-b align-top">
                    <td className="py-2 pr-3">
                      <p className="text-body1">{anchor.name}</p>
                      {anchor.description.trim() === "" ? null : (
                        <p className="mt-0.5 whitespace-pre-wrap text-body3 text-gray-7">
                          {anchor.description}
                        </p>
                      )}
                      {anchor.responsibleName === null ? null : (
                        <p className="mt-0.5 text-body3 text-gray-6">{anchor.responsibleName}</p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-body2 text-gray-7">
                      {anchor.categoryName ?? b("unclassified")}
                    </td>
                    <td className="py-2 text-right text-body1 tabular-nums">
                      {amount(anchor.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ─── Las compras ─────────────────────────────────────────────────── */}
        <Section title={b("shoppings")}>
          {document.shoppings.length === 0 ? (
            <Empty label={b("noShoppings")} />
          ) : (
            <table className="mt-1 w-full border-collapse">
              <thead>
                <tr className="border-gray-2 border-b text-left">
                  <th className="py-1.5 text-body3 uppercase tracking-wider text-gray-6">
                    {b("name")}
                  </th>
                  <th className="py-1.5 text-body3 uppercase tracking-wider text-gray-6">
                    {b("occurredOn")}
                  </th>
                  <th className="py-1.5 text-right text-body3 uppercase tracking-wider text-gray-6">
                    {b("amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {document.shoppings.map((shopping) => (
                  <tr key={shopping.id} className="border-gray-2 border-b align-top">
                    <td className="py-2 pr-3">
                      <p className="text-body1">{shopping.name}</p>
                      <p className="mt-0.5 text-body3 text-gray-6">
                        {[
                          b(`kinds.${shopping.kind}`),
                          shopping.method === "card" && shopping.cardLast4 !== null
                            ? b("cardEndingIn", { last4: shopping.cardLast4 })
                            : b(`methods.${shopping.method}`),
                          shopping.providerName,
                          shopping.categoryName,
                          shopping.isDeductible ? b("deductible") : null,
                          shopping.itemCount > 0
                            ? b("itemCount", { count: shopping.itemCount })
                            : null,
                        ]
                          .filter((piece): piece is string => piece !== null && piece !== "")
                          .join(" · ")}
                      </p>
                      {shopping.observations.trim() === "" ? null : (
                        <p className="mt-0.5 whitespace-pre-wrap text-body3 text-gray-7">
                          {shopping.observations}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-body2 text-gray-7">
                      {shopping.occurredOn === null ? b("noDate") : day(shopping.occurredOn)}
                    </td>
                    <td className="py-2 text-right text-body1 tabular-nums">
                      {amount(shopping.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ─── El desglose ─────────────────────────────────────────────────── */}
        {document.categories.length === 0 ? null : (
          <Section title={b("breakdownTitle")}>
            <table className="mt-1 w-full border-collapse">
              <thead>
                <tr className="border-gray-2 border-b text-left">
                  <th className="py-1.5 text-body3 uppercase tracking-wider text-gray-6">
                    {b("category")}
                  </th>
                  <th className="py-1.5 text-right text-body3 uppercase tracking-wider text-gray-6">
                    {b("budgeted")}
                  </th>
                  <th className="py-1.5 text-right text-body3 uppercase tracking-wider text-gray-6">
                    {b("spent")}
                  </th>
                  <th className="py-1.5 text-right text-body3 uppercase tracking-wider text-gray-6">
                    {b("difference")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {document.categories.map((row) => (
                  <tr key={row.categoryId ?? "sin-categoria"} className="border-gray-2 border-b">
                    <td className="py-2 pr-3 text-body1">
                      {row.categoryName ?? b("unclassified")}
                    </td>
                    <td className="py-2 text-right text-body2 tabular-nums">
                      {amount(row.budgeted)}
                    </td>
                    <td className="py-2 text-right text-body2 tabular-nums">{amount(row.spent)}</td>
                    <td className="py-2 text-right text-body2 tabular-nums">
                      {amount(row.difference)}
                      {row.isUnfavorable ? (
                        <span className="ml-1 text-body3 text-gray-7">{b("unfavorableShort")}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        <footer className="documento-pie documento-bloque mt-8 border-gray-3 border-t pt-3 text-body3 text-gray-6">
          <p>{t("generatedBy", { system: stamp.system })}</p>
          <p className="break-all">{stamp.address}</p>
          <p>{instant(stamp.generatedAt)}</p>
        </footer>
      </article>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="documento-bloque text-body3 uppercase tracking-wider text-gray-6">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ label }: { label: string }) {
  return <p className="mt-2 text-body1 text-gray-7">{label}</p>
}
