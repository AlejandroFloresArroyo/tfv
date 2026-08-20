/**
 * Rutas de documentos generados.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`.
 *
 * Son dos, y la diferencia entre ellas es todo lo que hay que entender de esta superficie:
 *
 * - La del **panel** exige el permiso de ver la cotización y devuelve, además del documento, la
 *   referencia con la que se comparte. Quien mira el documento es quien lo va a mandar.
 * - La **pública** no exige nada, porque el cliente no tiene cuenta. Lo que la protege es la firma
 *   de la referencia, verificada antes de tocar la base — igual que en los eventos de cobro, donde
 *   lo que autoriza es la firma del remitente y no una sesión.
 *
 * La pública es de **lectura y de un documento**: no hay verbo de escritura declarado aquí, y el
 * camino no lleva empresa, así que no hay nada que sustituir para asomarse a otra. Es lo que la
 * prueba de la superficie pública comprueba desde fuera.
 */

import { z } from "@hono/zod-openapi"
import { DOCUMENT_KINDS, RENT_FREQUENCIES, TRADE_TYPES } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { publicDocument } from "../documents/documents.ts"
import { quoteDocument } from "../documents/quotes.ts"
import { deliveryNoteDocumentSchema } from "../routes/production-deliveries.ts"
import { defineRoute, PUBLIC, REQUIRES } from "../runtime/route.ts"
import { QUOTE_STATUSES } from "../warehouses/quotes.ts"
import { breakdownSchema, contactSchema, paymentTermsSchema, taxesSchema } from "./quotes.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

/** Una de las partes del documento, con los contactos que la cotización declaró para ella. */
const partySchema = z.object({
  name: z.string(),
  taxId: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  contacts: z.array(contactSchema).readonly(),
})

const identitySchema = z.object({
  folio: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(QUOTE_STATUSES),
  issuedOn: z.string(),
  /** Cuándo se compuso **este** documento. Con la de emisión, es la trazabilidad de la hoja. */
  generatedAt: z.string(),
})

const rowSchema = z.object({
  lineId: z.string(),
  productName: z.string(),
  productCode: z.string(),
  measurementName: z.string(),
  quantity: z.number().int(),
  frequency: z.enum(RENT_FREQUENCIES),
  appliedDays: z.string().optional(),
  /** Ausentes cuando la línea no lleva importe que informar. Ver `quotation-pricing`. */
  unitCost: z.string().optional(),
  total: z.string().optional(),
  discount: z.string().optional(),
  unpriced: z.boolean(),
})

const groupSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  productCode: z.string(),
  lines: z.array(rowSchema).readonly(),
  subtotal: z.string().optional(),
})

const quoteDocumentSchema = z.object({
  kind: z.literal(DOCUMENT_KINDS[0]),
  identity: identitySchema,
  issuer: partySchema,
  client: partySchema.nullable(),
  type: z.enum(TRADE_TYPES),
  /** Nulo en una venta: no hay ventana que mostrar. */
  period: z
    .object({
      startsOn: z.string(),
      endsOn: z.string(),
      days: z.number().int(),
      frequencies: z.array(z.enum(RENT_FREQUENCIES)).readonly(),
    })
    .nullable(),
  groups: z.array(groupSchema).readonly(),
  showsLineAmounts: z.boolean(),
  linesTotal: z.string(),
  /** Si lo que suman las líneas visibles cuadra con el total de líneas del desglose. */
  reconciles: z.boolean(),
  breakdown: breakdownSchema,
  payment: paymentTermsSchema.nullable(),
  taxes: taxesSchema.nullable(),
  terms: z.string().nullable(),
  observations: z.string().nullable(),
  message: z.string().nullable(),
})

const quoteParams = z.object({
  companyId: z.string(),
  warehouseId: z.string(),
  quoteId: z.string(),
})

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

// ─── Rutas ───────────────────────────────────────────────────────────────────

/**
 * El documento de una cotización, con su enlace.
 *
 * Va con `warehouses.quotes.view` y no con una clave propia: **el catálogo no tiene ninguna para
 * compartir un documento**, y las 255 claves son las que la implementación anterior reconoce, así
 * que añadir una es decisión de producto y no de implementación. El documento no enseña nada que la
 * ficha no enseñe ya; lo que sí concede de más es **poder repartirlo fuera**, y eso queda anotado
 * en `HALLAZGOS.md` H-61.
 */
export const quoteDocumentRoute = defineRoute({
  access: REQUIRES("warehouses.quotes.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/document",
    summary: "Componer el documento de una cotización",
    tags: ["Documentos"],
    request: { params: quoteParams },
    responses: {
      200: {
        description: "El documento y la referencia con la que se comparte",
        content: {
          "application/json": {
            schema: z.object({ document: quoteDocumentSchema, reference: z.string() }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const { companyId, warehouseId, quoteId } = c.req.valid("param")
    const result = await quoteDocument(actorOf(c), companyId, warehouseId, quoteId)
    return c.json(result, 200)
  },
})

/**
 * El documento por su enlace público.
 *
 * Devuelve **sólo el documento**: ni la empresa, ni el almacén, ni la entidad en crudo. Quien abre
 * el enlace ve la hoja y nada más, que es lo que la spec pide con «no ve navegación ni datos de la
 * empresa ajenos al documento».
 *
 * Lo que sale es la **unión** de las familias servidas, discriminada por `kind`. Con dos miembros
 * ya obliga a mirar la etiqueta antes de leer nada, que es lo que impide que el navegador dé por
 * hecho la cotización el día que entre la tercera.
 */
export const publicDocumentRoute = defineRoute({
  access: PUBLIC(
    "El cliente que recibe el enlace no tiene cuenta. Lo protege la firma de la referencia, y sólo " +
      "abre el documento al que apunta: alterarla responde 404.",
  ),
  config: {
    method: "get",
    path: "/public/documents/{reference}",
    summary: "Consultar un documento por su enlace público",
    tags: ["Documentos"],
    request: { params: z.object({ reference: z.string() }) },
    responses: {
      200: {
        description: "El documento",
        content: {
          "application/json": {
            schema: z.object({
              document: z.union([quoteDocumentSchema, deliveryNoteDocumentSchema]),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const { reference } = c.req.valid("param")
    return c.json({ document: await publicDocument(reference) }, 200)
  },
})
