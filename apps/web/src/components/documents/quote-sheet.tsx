import type { DocumentParty, DocumentStamp, QuoteDocument } from "@tfv/contracts/document"
import type {
  QuotationTaxBreakdown,
  QuoteContact,
  QuotePaymentTerms,
} from "@tfv/contracts/quotation"
import { getFormatter, getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { formatAmount } from "~/lib/amount.ts"
import { PrintRules } from "./print-rules.tsx"

/**
 * La hoja de la cotización.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`, requisito «Contenido de la cotización».
 *
 * **Es la misma hoja en las tres acciones**: lo que se ve en pantalla es lo que sale por la
 * impresora y lo que se guarda como PDF. Sólo desaparecen al imprimir las cosas que no son el
 * documento —los botones—, marcadas con `documento-fuera-de-la-hoja`.
 *
 * Y es la misma hoja **con sesión y sin ella**: la pantalla del panel y la del enlace público
 * pintan este componente con el mismo modelo, que compone el servidor. Dos dibujos distintos serían
 * dos documentos distintos con el mismo folio.
 *
 * ## Papel, no interfaz
 *
 * Los colores son fijos —blanco y grises— y no los papeles del tema. Un documento impreso en modo
 * oscuro sale con el fondo del panel, y una hoja no cambia de color según quién la mire.
 */
export async function QuoteSheet({
  document,
  stamp,
}: {
  document: QuoteDocument
  stamp: DocumentStamp
}) {
  const t = await getTranslations("documents")
  const q = await getTranslations("warehouses.quotes")
  const format = await getFormatter()

  const amount = (value: string) => formatAmount(value, format)
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium" })
  const instant = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" })

  const breakdown = document.breakdown

  return (
    <>
      <PrintRules />

      <article className="documento-hoja mx-auto w-full max-w-[210mm] bg-white p-8 text-gray-9 shadow-[0_1px_3px_rgb(0_0_0/0.12)] tablet:p-10">
        {/* ─── Encabezado ─────────────────────────────────────────────────── */}
        <header className="documento-bloque flex flex-wrap items-start justify-between gap-6 border-gray-3 border-b pb-6">
          <div className="min-w-0">
            <p className="text-h4 font-bold">{document.issuer.name}</p>
            <PartyDetails party={document.issuer} />
          </div>

          <div className="text-right">
            <p className="text-title2 font-bold uppercase tracking-widest text-gray-7">
              {t("quote")}
            </p>
            <p className="mt-1 font-mono text-h5 font-bold">{document.identity.folio}</p>
            <p className="text-body3 text-gray-6">{document.identity.code}</p>
            <p className="mt-2 text-body3 text-gray-7">
              {t("issuedOn")}: {date(document.identity.issuedOn)}
            </p>
          </div>
        </header>

        {document.identity.name || document.identity.description ? (
          <section className="documento-bloque mt-6">
            {document.identity.name ? (
              <h1 className="text-h5 font-bold">{document.identity.name}</h1>
            ) : null}
            {document.identity.description ? (
              <p className="mt-1 text-body1 text-gray-7">{document.identity.description}</p>
            ) : null}
          </section>
        ) : null}

        {/* ─── Las dos partes ─────────────────────────────────────────────── */}
        <section className="documento-bloque documento-columnas mt-6 grid gap-6 tablet:grid-cols-2">
          <Block title={t("issuer")}>
            <p className="font-semibold">{document.issuer.name}</p>
            <PartyDetails party={document.issuer} />
            <Contacts contacts={document.issuer.contacts} empty={t("noContacts")} />
          </Block>

          <Block title={t("client")}>
            {document.client ? (
              <>
                <p className="font-semibold">{document.client.name}</p>
                <PartyDetails party={document.client} />
                <Contacts contacts={document.client.contacts} empty={t("noContacts")} />
              </>
            ) : (
              <p className="text-gray-6">{q("noClient")}</p>
            )}
          </Block>
        </section>

        {/* ─── Ventana de renta ───────────────────────────────────────────── */}
        {document.period ? (
          <section className="documento-bloque mt-6 border-gray-3 border-y py-3 text-body1">
            <span className="font-semibold">{q("window")}: </span>
            {date(document.period.startsOn)} – {date(document.period.endsOn)}
            <span className="text-gray-7">
              {" · "}
              {q("days", { count: document.period.days })}
              {document.period.frequencies.length > 0
                ? ` · ${document.period.frequencies.map((each) => q(`frequencyOf.${each}`)).join(" · ")}`
                : ""}
            </span>
          </section>
        ) : null}

        {/* ─── Líneas ─────────────────────────────────────────────────────── */}
        <section className="mt-6">
          <h2 className="text-title1 font-bold uppercase tracking-wide text-gray-7">
            {q("lines")}
          </h2>

          {document.groups.length === 0 ? (
            <p className="mt-3 text-body1 text-gray-6">{q("noLines")}</p>
          ) : (
            <div className="mt-3 grid gap-5">
              {document.groups.map((group) => (
                <div key={group.productId} className="documento-bloque">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-body1 font-bold">{group.productName}</h3>
                    <span className="font-mono text-body3 text-gray-6">{group.productCode}</span>
                  </div>

                  <table className="mt-2 w-full border-collapse text-body1">
                    <thead>
                      <tr className="border-gray-3 border-b text-left text-body3 uppercase tracking-wide text-gray-6">
                        <th className="py-1 font-semibold">{t("measurement")}</th>
                        <th className="py-1 text-right font-semibold">{q("quantity")}</th>
                        {document.period ? (
                          <>
                            <th className="py-1 text-right font-semibold">{q("frequency")}</th>
                            <th className="py-1 text-right font-semibold">{q("appliedDays")}</th>
                          </>
                        ) : null}
                        {document.showsLineAmounts ? (
                          <>
                            <th className="py-1 text-right font-semibold">{q("unitCost")}</th>
                            <th className="py-1 text-right font-semibold">{q("lineTotal")}</th>
                          </>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {group.lines.map((line) => (
                        <tr key={line.lineId} className="border-gray-2 border-b last:border-0">
                          <td className="py-1.5">{line.measurementName}</td>
                          <td className="py-1.5 text-right tabular-nums">{line.quantity}</td>
                          {document.period ? (
                            <>
                              <td className="py-1.5 text-right">
                                {q(`frequencyOf.${line.frequency}`)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {line.appliedDays ?? "—"}
                              </td>
                            </>
                          ) : null}
                          {document.showsLineAmounts ? (
                            <>
                              {/*
                                Un guion y no `0.00`: nadie le puso precio, que es otra cosa que
                                salir gratis. Es la misma distinción que hace la ficha.
                              */}
                              <td className="py-1.5 text-right tabular-nums">
                                {line.unpriced || line.unitCost === undefined
                                  ? "—"
                                  : amount(line.unitCost)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {line.unpriced || line.total === undefined
                                  ? "—"
                                  : amount(line.total)}
                              </td>
                            </>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                    {document.showsLineAmounts && group.subtotal !== undefined ? (
                      <tfoot>
                        <tr className="border-gray-3 border-t">
                          <td className="py-1.5 font-semibold" colSpan={document.period ? 5 : 3}>
                            {t("groupSubtotal")}
                          </td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">
                            {amount(group.subtotal)}
                          </td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              ))}
            </div>
          )}

          {document.showsLineAmounts ? null : (
            <p className="mt-3 text-body2 text-gray-7">{t("packageGoverns")}</p>
          )}
        </section>

        {/* ─── Importes ───────────────────────────────────────────────────── */}
        <section className="documento-bloque mt-6 flex justify-end">
          {/*
            Ancho explícito y no `max-w-sm`: el tema declara un espaciado llamado `sm` de 0.75rem,
            que gana al contenedor del mismo nombre y deja la columna de importes en doce píxeles.
            Se ve en pantalla como una cifra por línea y en el papel como una columna partida.
          */}
          <dl className="w-full max-w-[22rem] text-body1">
            <Amount
              label={breakdown.packagePrice === undefined ? q("linesTotal") : q("packagePrice")}
              value={amount(breakdown.packagePrice ?? breakdown.linesTotal)}
            />
            {breakdown.additionals !== "0.00" ? (
              <Amount label={q("additionals")} value={amount(breakdown.additionals)} />
            ) : null}
            <Amount label={q("subtotal")} value={amount(breakdown.subtotal)} />
            {breakdown.discount !== "0.00" ? (
              <Amount label={q("discount")} value={`−${amount(breakdown.discount)}`} />
            ) : null}
            <Amount label={q("base")} value={amount(breakdown.base)} />

            {breakdown.taxes.map((tax) => (
              <Amount
                key={tax.key}
                label={taxLabel(tax, q)}
                value={`${tax.effect === "decrease" ? "−" : ""}${amount(tax.amount)}`}
              />
            ))}

            {breakdown.taxTotal !== "0.00" ? (
              <Amount label={q("net")} value={amount(breakdown.net)} />
            ) : null}
            {breakdown.fees !== "0.00" ? (
              <Amount label={q("fees")} value={amount(breakdown.fees)} />
            ) : null}
            {breakdown.advance !== "0.00" ? (
              <Amount label={q("advance")} value={`−${amount(breakdown.advance)}`} />
            ) : null}

            <div className="mt-2 flex items-baseline justify-between gap-4 border-gray-9 border-t-2 pt-2">
              <dt className="text-title1 font-bold uppercase tracking-wide">{q("total")}</dt>
              <dd className="text-h5 font-bold tabular-nums">{amount(breakdown.total)}</dd>
            </div>

            {breakdown.collected !== "0.00" ? (
              <div className="mt-2 border-gray-3 border-t pt-2">
                <Amount label={q("collected")} value={`−${amount(breakdown.collected)}`} />
                <Amount label={q("balance")} value={amount(breakdown.balance)} />
              </div>
            ) : null}

            {breakdown.penalty !== "0.00" || breakdown.deposit !== "0.00" ? (
              <div className="mt-2 border-gray-3 border-t pt-2">
                <p className="text-body3 uppercase tracking-wide text-gray-6">{q("contingent")}</p>
                {breakdown.penalty !== "0.00" ? (
                  <Amount label={q("penalty")} value={amount(breakdown.penalty)} />
                ) : null}
                {breakdown.deposit !== "0.00" ? (
                  <Amount label={q("deposit")} value={amount(breakdown.deposit)} />
                ) : null}
                <p className="mt-1 text-body3 text-gray-6">{q("contingentHint")}</p>
              </div>
            ) : null}
          </dl>
        </section>

        {/* ─── Condiciones, términos y observaciones ──────────────────────── */}
        <PaymentTerms terms={document.payment} amount={amount} labels={{ q, t }} date={date} />

        {document.message ? <Prose title={t("message")} body={document.message} /> : null}
        {document.terms ? <Prose title={t("terms")} body={document.terms} /> : null}
        {document.observations ? (
          <Prose title={t("observations")} body={document.observations} />
        ) : null}

        {/*
          ─── Cierre del documento ────────────────────────────────────────────
          Las firmas y el pie van en el mismo bloque indivisible: si no caben en la hoja, pasan las
          dos cosas juntas a la siguiente. Sueltos, el pie se quedaba solo en una hoja en blanco.
        */}
        <div className="documento-bloque">
          {/*
          El espacio se imprime **vacío**, que es lo que la spec pide para un documento sin firmar.
          La captura de firma en pantalla es de otra rebanada —necesita el control de firma (28e) y
          almacenamiento de ficheros (08)—, así que hoy se firma a mano sobre el papel.
        */}
          <section className="documento-columnas mt-6 grid gap-8 tablet:grid-cols-2">
            <Signature label={t("clientSignature")} />
            <Signature label={t("sellerSignature")} />
          </section>

          {/* El pie de identificación: quién lo produjo y desde qué dirección se generó. */}
          <footer className="documento-pie mt-4 border-gray-3 border-t pt-2 text-body3 text-gray-6">
            <p>
              {t("generatedBy", { system: stamp.system })} · {stamp.address}
            </p>
            <p>
              {t("generatedAt")}: {instant(stamp.generatedAt)} · {document.identity.folio}
            </p>
          </footer>
        </div>
      </article>
    </>
  )
}

function PartyDetails({ party }: { party: DocumentParty }) {
  const lines = [party.taxId, party.address, party.email, party.phone].filter(Boolean)
  if (lines.length === 0) return null

  return (
    <div className="mt-1 text-body2 text-gray-7">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}

function Contacts({ contacts, empty }: { contacts: readonly QuoteContact[]; empty: string }) {
  if (contacts.length === 0) return <p className="mt-2 text-body2 text-gray-6">{empty}</p>

  return (
    <ul className="mt-2 text-body2 text-gray-7">
      {contacts.map((contact) => (
        <li key={`${contact.name}-${contact.phone ?? ""}`}>
          {contact.name}
          {contact.position ? ` · ${contact.position}` : ""}
          {contact.phone ? ` · ${contact.phone}` : ""}
        </li>
      ))}
    </ul>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-body3 uppercase tracking-wide text-gray-6">{title}</h2>
      <div className="mt-1 text-body1">{children}</div>
    </div>
  )
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <dt className="text-gray-7">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

function Prose({ title, body }: { title: string; body: string }) {
  return (
    <section className="documento-bloque mt-6">
      <h2 className="text-body3 uppercase tracking-wide text-gray-6">{title}</h2>
      <p className="mt-1 whitespace-pre-line text-body1">{body}</p>
    </section>
  )
}

function Signature({ label }: { label: string }) {
  return (
    <div>
      <div className="h-10 border-gray-4 border-b" />
      <p className="mt-1 text-body3 text-gray-6">{label}</p>
    </div>
  )
}

/**
 * Las condiciones de pago, tal y como se pactaron.
 *
 * Sólo aparece lo que alguien escribió: un bloque con seis filas vacías dice menos que ninguno.
 */
function PaymentTerms({
  terms,
  amount,
  labels,
  date,
}: {
  terms: QuotePaymentTerms | null
  amount: (value: string) => string
  labels: { q: (key: string) => string; t: (key: string) => string }
  date: (value: string) => string
}) {
  if (!terms) return null

  const rows: { label: string; value: string }[] = []

  if (terms.advance) {
    const method = terms.advance.method ? ` · ${labels.q(`methodOf.${terms.advance.method}`)}` : ""
    const when = terms.advance.date ? ` · ${date(terms.advance.date)}` : ""
    rows.push({
      label: labels.q("advance"),
      value: `${amount(terms.advance.amount)}${method}${when}`,
    })
  }

  if (terms.deposit) {
    rows.push({ label: labels.q("deposit"), value: amount(terms.deposit.amount) })
  }

  for (const additional of terms.additionals ?? []) {
    rows.push({ label: additional.name, value: amount(additional.amount) })
  }

  if (terms.penalty?.concept) {
    rows.push({ label: labels.q("penaltyConcept"), value: terms.penalty.concept })
  }

  if (rows.length === 0) return null

  return (
    <section className="documento-bloque mt-6">
      <h2 className="text-body3 uppercase tracking-wide text-gray-6">{labels.q("paymentTerms")}</h2>
      <dl className="mt-1 grid gap-0.5 text-body1">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`} className="flex justify-between gap-4">
            <dt className="text-gray-7">{row.label}</dt>
            <dd className="tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * El nombre de un impuesto.
 *
 * Manda lo que escribió quien lo registró. Lo que **no** se hace es enseñar la clave: `iva` es un
 * identificador interno, y este documento se le entrega al cliente.
 */
function taxLabel(tax: QuotationTaxBreakdown, q: (key: string) => string): string {
  if (tax.concept) return tax.concept
  return tax.key.startsWith("additional:")
    ? tax.key.slice("additional:".length)
    : q(`taxOf.${tax.key}`)
}
