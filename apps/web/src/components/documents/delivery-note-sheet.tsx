import type { DeliveryNoteDocument, DocumentStamp } from "@tfv/contracts/document"
import { getFormatter, getTranslations } from "next-intl/server"
import { PrintRules } from "./print-rules.tsx"

/**
 * La hoja de una nota de entrega.
 *
 * Ver `openspec/specs/production-inventory/spec.md`, requisito «Documento y enlace de la nota».
 * Cierra `HALLAZGOS.md` **H-201**: el servidor componía la nota entera y firmaba su enlace público
 * —probado de extremo a extremo— y no había nada que la dibujara, así que la ficha de la nota no
 * enseñaba el enlace para no mandar a un `404`.
 *
 * Es el papel que alguien firma con una caja abierta delante, y de ahí sale su forma:
 *
 * - **Los artículos agrupados por verificación**, con lo comprobado primero. Es lo que la spec pide
 *   y es el orden de la conversación: esto es lo que te entrego, esto es lo que falta por revisar.
 * - **El recuento arriba**, porque lo primero que se discute es cuántas piezas son.
 * - **Las firmas siempre**, aunque no las haya. Una nota cerrada sin firma no es un error —se cierra
 *   con las líneas verificadas—, pero quien recibe la hoja tiene derecho a leer que no está firmada
 *   en vez de quedarse sin saber si no hay firma o no se la enseñan.
 *
 * ## Papel, no interfaz
 *
 * Colores fijos, como la cotización y el plan. Y **el estado de cada pieza va escrito**: el color de
 * un estado no sobrevive a una fotocopiadora, que es por donde esta hoja pasa siempre.
 *
 * El trazo de la firma sí se imprime: es una imagen, no un color, y es lo único que ata la hoja a
 * quien la recibió.
 */
export async function DeliveryNoteSheet({
  document,
  stamp,
}: {
  document: DeliveryNoteDocument
  stamp: DocumentStamp
}) {
  const t = await getTranslations("documents")
  const d = await getTranslations("productions.deliveries")
  const i = await getTranslations("productions.items.state")
  const format = await getFormatter()

  const instant = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" })

  return (
    <>
      <PrintRules />

      <article className="documento-hoja mx-auto w-full max-w-[210mm] bg-white p-8 text-gray-9 shadow-[0_1px_3px_rgb(0_0_0/0.12)] tablet:p-10">
        <header className="documento-bloque flex flex-wrap items-start justify-between gap-6 border-gray-3 border-b pb-6">
          <div className="min-w-0">
            <p className="text-h4 font-bold">{document.issuer.name}</p>
            <p className="mt-0.5 text-body1 text-gray-7">{document.productionName}</p>
          </div>

          <div className="text-right">
            <p className="text-body3 uppercase tracking-wider text-gray-6">{t("deliveryNote")}</p>
            <p className="text-body1">{document.identity.name}</p>
            <p className="mt-1 text-body2 text-gray-7">
              {d(`way.${document.identity.direction}`)} · {d(`state.${document.identity.status}`)}
            </p>
          </div>
        </header>

        <section className="documento-bloque documento-columnas mt-6 grid gap-6 tablet:grid-cols-2">
          <Fact
            label={t("pieces")}
            value={t("verifiedOfTotal", {
              verified: document.counts.verified,
              total: document.counts.total,
            })}
            {...(document.counts.pending > 0
              ? { note: t("stillPending", { count: document.counts.pending }) }
              : {})}
          />
          {document.responsibleName === null ? null : (
            <Fact label={d("responsible")} value={document.responsibleName} />
          )}
        </section>

        {document.identity.description.trim() === "" ? null : (
          <section className="documento-bloque mt-6 border-gray-3 border-y py-3">
            <p className="whitespace-pre-wrap text-body1">{document.identity.description}</p>
          </section>
        )}

        {/* ─── Las piezas, agrupadas por verificación ──────────────────────── */}
        {document.groups.length === 0 ? (
          <p className="mt-8 text-body1 text-gray-7">{t("noPieces")}</p>
        ) : (
          document.groups.map((group) => (
            <section key={String(group.isVerified)} className="mt-8">
              <h2 className="documento-bloque text-body3 uppercase tracking-wider text-gray-6">
                {group.isVerified ? t("verifiedGroup") : t("pendingGroup")}
              </h2>

              <table className="mt-1 w-full border-collapse">
                <thead>
                  <tr className="border-gray-2 border-b text-left">
                    <th className="py-1.5 text-body3 uppercase tracking-wider text-gray-6">
                      {t("piece")}
                    </th>
                    <th className="py-1.5 text-body3 uppercase tracking-wider text-gray-6">
                      {t("code")}
                    </th>
                    <th className="py-1.5 text-body3 uppercase tracking-wider text-gray-6">
                      {t("condition")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.lines.map((line) => (
                    <tr key={line.lineId} className="border-gray-2 border-b align-top">
                      <td className="py-2 pr-3">
                        <p className="text-body1">{line.itemName}</p>
                        {line.categoryName === null ? null : (
                          <p className="mt-0.5 text-body3 text-gray-6">{line.categoryName}</p>
                        )}
                        {line.verifiedByName === null ? null : (
                          <p className="mt-0.5 text-body3 text-gray-6">
                            {t("verifiedBy", { name: line.verifiedByName })}
                            {line.verifiedAt === null ? "" : ` · ${instant(line.verifiedAt)}`}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-body2 text-gray-7">
                        {line.itemCode}
                      </td>
                      {/* El estado va escrito y sin color: el papel no tiene tema. */}
                      <td className="py-2 text-body2 text-gray-7">
                        {i(line.returnCondition ?? line.itemStatus)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}

        {/* ─── Las firmas, existan o no ────────────────────────────────────── */}
        <section className="documento-bloque documento-columnas mt-10 grid gap-8 tablet:grid-cols-2">
          <Signature
            label={t("deliveredSignature")}
            name={document.signatures.deliveredByName}
            url={document.signatures.deliveredSignatureUrl}
            unsigned={t("unsigned")}
          />
          <Signature
            label={t("receiverSignature")}
            name={document.signatures.receiverName}
            url={document.signatures.receiverSignatureUrl}
            unsigned={t("unsigned")}
          />
        </section>

        {document.signatures.signedAt === null ? null : (
          <p className="documento-bloque mt-3 text-body2 text-gray-7">
            {t("signedAt", { at: instant(document.signatures.signedAt) })}
          </p>
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

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-body3 uppercase tracking-wider text-gray-6">{label}</p>
      <p className="mt-0.5 text-body1">{value}</p>
      {note ? <p className="text-body2 text-gray-7">{note}</p> : null}
    </div>
  )
}

/**
 * Un espacio de firma.
 *
 * Con trazo, se pinta. Sin trazo, **queda la línea igual**: una nota se firma también en papel, y
 * quitar el renglón obligaría a firmar en el margen.
 */
function Signature({
  label,
  name,
  url,
  unsigned,
}: {
  label: string
  name: string | null
  url: string | null
  unsigned: string
}) {
  return (
    <div className="documento-bloque">
      <div className="flex h-20 items-end border-gray-4 border-b">
        {url === null ? null : (
          // biome-ignore lint/performance/noImgElement: la hoja se imprime y `next/image` no aporta nada al papel.
          <img src={url} alt={label} className="max-h-20 w-auto object-contain" />
        )}
      </div>
      <p className="mt-1 text-body3 uppercase tracking-wider text-gray-6">{label}</p>
      <p className="text-body1">{name ?? unsigned}</p>
    </div>
  )
}
