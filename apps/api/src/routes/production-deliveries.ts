/**
 * Rutas de las notas de entrega de una producción.
 *
 * Rebanada 22, bloque de entregas. Ver `openspec/specs/production-inventory/spec.md`.
 *
 * ## Dos familias de permisos, las dos ya en el catálogo cerrado
 *
 * `productions.deliveries.*` gobierna **la nota**: verla, abrirla, editar su encabezado, componer
 * su lista, ponerle responsable, cerrarla y darla de baja. `productions.delivery_products.*`
 * gobierna **las líneas**: verlas, verificarlas, localizarlas por etiqueta y quitarlas. **No se
 * añade ninguna clave**; las doce vienen de las 255 migradas.
 *
 * La separación no es decorativa: en un set, quien abre la nota y decide qué lleva es de
 * producción, y quien va tachando piezas contra la caja es de arte. Con una sola familia, dar la
 * segunda capacidad obligaría a dar también la primera.
 *
 * ## Cada paso del estado es su propia ruta, y no un `PATCH` del estado
 *
 * Componer, cerrar y cancelar tienen **reglas distintas y permisos distintos**, así que un campo
 * `status` en el parche del encabezado los haría a los tres con la misma llave y sin las
 * comprobaciones de ninguno. El cierre, además, mueve el inventario: no es un cambio de campo.
 *
 * ## `delivery_products.searching` se queda sin ruta
 *
 * Como las tres de H-173, y por el mismo motivo: en la pila anterior gobernaba **el buscador de un
 * selector** —qué artículos se pueden ir a buscar para añadirlos a la nota—, y aquí añadir artículos
 * es `deliveries.products`, con la lista completa en el cuerpo. No hay una operación que consista
 * sólo en buscar candidatos. Colgarla de la consulta del inventario le inventaría a una clave ya
 * concedida un significado más ancho del que tenía. Queda anotada en `HALLAZGOS.md` H-200.
 */

import { z } from "@hono/zod-openapi"
import { toInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import { deliveryNoteDocument } from "../documents/delivery-notes.ts"
import {
  cancelDelivery,
  completeDelivery,
  createDelivery,
  DELIVERY_DIRECTIONS,
  DELIVERY_STATUSES,
  type DeliveryLineRecord,
  deleteDelivery,
  deliveryQuery,
  findDeliveryLineByCode,
  getDelivery,
  listDeliveries,
  RETURN_CONDITIONS,
  removeDeliveryLine,
  setDeliveryItems,
  signDelivery,
  updateDelivery,
  verifyDeliveryLine,
} from "../productions/deliveries.ts"
import { ITEM_STATUSES } from "../productions/items.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const nameField = z.string().trim().min(1, "El nombre es obligatorio").max(250)

const productionParams = z.object({ companyId: z.string(), productionId: z.string() })
const deliveryParams = productionParams.extend({ deliveryId: z.string() })
const lineParams = deliveryParams.extend({ lineId: z.string() })

const lineSchema = z.object({
  id: z.string(),
  deliveryId: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  itemCode: z.string(),
  itemStatus: z.enum(ITEM_STATUSES),
  isVerified: z.boolean(),
  verifiedById: z.string().nullable(),
  verifiedByName: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  returnCondition: z.enum(RETURN_CONDITIONS).nullable(),
})

const countsSchema = z.object({
  total: z.number().int(),
  verified: z.number().int(),
  pending: z.number().int(),
})

const deliverySchema = z.object({
  id: z.string(),
  productionId: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(DELIVERY_STATUSES),
  direction: z.enum(DELIVERY_DIRECTIONS),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  signedById: z.string().nullable(),
  signedByName: z.string().nullable(),
  signatureUploadId: z.string().nullable(),
  receiverName: z.string().nullable(),
  receiverSignatureUploadId: z.string().nullable(),
  signedAt: z.string().nullable(),
  isSigned: z.boolean(),
  counts: countsSchema,
  lines: z.array(lineSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const partySchema = z.object({
  name: z.string(),
  taxId: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  contacts: z.array(z.unknown()).readonly(),
})

const documentRowSchema = z.object({
  lineId: z.string(),
  itemName: z.string(),
  itemCode: z.string(),
  categoryName: z.string().nullable(),
  itemStatus: z.string(),
  isVerified: z.boolean(),
  verifiedByName: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  returnCondition: z.string().nullable(),
})

/**
 * El documento de la nota, declarado entero.
 *
 * Se exporta porque la ruta pública sirve la **unión** de las familias servidas, y sin el miembro
 * declarado el contrato publicado diría que por ahí sólo salen cotizaciones.
 */
export const deliveryNoteDocumentSchema = z.object({
  kind: z.literal("delivery-note"),
  identity: z.object({
    name: z.string(),
    description: z.string(),
    status: z.enum(DELIVERY_STATUSES),
    direction: z.enum(DELIVERY_DIRECTIONS),
    generatedAt: z.string(),
  }),
  issuer: partySchema,
  productionName: z.string(),
  responsibleName: z.string().nullable(),
  groups: z
    .array(z.object({ isVerified: z.boolean(), lines: z.array(documentRowSchema).readonly() }))
    .readonly(),
  counts: countsSchema,
  signatures: z.object({
    isSigned: z.boolean(),
    deliveredByName: z.string().nullable(),
    receiverName: z.string().nullable(),
    signedAt: z.string().nullable(),
    deliveredSignatureUrl: z.string().nullable(),
    receiverSignatureUrl: z.string().nullable(),
  }),
})

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serializeLine(line: DeliveryLineRecord) {
  return { ...line, verifiedAt: line.verifiedAt ? toInstant(line.verifiedAt) : null }
}

/**
 * Las colecciones de sólo lectura se copian al serializarlas.
 *
 * Los registros del dominio las declaran `readonly` para que nadie las mute por accidente, y el
 * contrato publicado las espera mutables. Es la misma traducción que hace el catálogo.
 */
function serializeDelivery(row: Awaited<ReturnType<typeof getDelivery>>) {
  const { lines, counts, signedAt, createdAt, updatedAt, ...rest } = row
  return {
    ...rest,
    signedAt: signedAt ? toInstant(signedAt) : null,
    counts: { ...counts },
    lines: lines.map(serializeLine),
    createdAt: toInstant(createdAt),
    updatedAt: toInstant(updatedAt),
  }
}

// ─── La nota ─────────────────────────────────────────────────────────────────

export const listDeliveriesRoute = defineRoute({
  access: REQUIRES("productions.deliveries.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/deliveries",
    summary: "Listar las notas de entrega de una producción",
    tags: ["Producciones"],
    request: { params: productionParams, query: collectionQuery(deliveryQuery) },
    responses: {
      200: {
        description:
          "Notas, de la más reciente a la más antigua. Cada una con su recuento de piezas " +
          "verificadas y pendientes",
        content: { "application/json": { schema: pageSchema(deliverySchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listDeliveries(
      actorOf(c),
      params.companyId,
      params.productionId,
      queryOf(c, deliveryQuery),
    )
    return c.json(serializePage(page, serializeDelivery), 200)
  },
})

export const createDeliveryRoute = defineRoute({
  access: REQUIRES("productions.deliveries.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/deliveries",
    summary: "Abrir una nota de entrega",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              description: z.string().max(4000).optional(),
              direction: z.enum(DELIVERY_DIRECTIONS).optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description:
          "Nota abierta, pendiente y sin líneas. Por omisión de salida; «inbound» abre una nota de " +
          "devolución, que al cerrarse deja cada artículo en el estado que su línea declare",
        content: { "application/json": { schema: deliverySchema } },
      },
      404: { description: "La producción no existe" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const delivery = await createDelivery(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serializeDelivery(delivery), 201)
  },
})

export const getDeliveryRoute = defineRoute({
  access: REQUIRES("productions.deliveries.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}",
    summary: "Ver una nota de entrega",
    tags: ["Producciones"],
    request: { params: deliveryParams },
    responses: {
      200: {
        description: "La nota con sus líneas y su recuento",
        content: { "application/json": { schema: deliverySchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const delivery = await getDelivery(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.deliveryId,
    )
    return c.json(serializeDelivery(delivery), 200)
  },
})

export const updateDeliveryRoute = defineRoute({
  access: REQUIRES("productions.deliveries.info"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}",
    summary: "Editar el encabezado de una nota",
    tags: ["Producciones"],
    request: {
      params: deliveryParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              description: z.string().max(4000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description:
          "Nota actualizada. Ni el estado ni la dirección se tocan por aquí: cada paso del estado " +
          "tiene su operación y su regla, y la dirección se fija al abrirla",
        content: { "application/json": { schema: deliverySchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const delivery = await updateDelivery(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.deliveryId,
      c.req.valid("json"),
    )
    return c.json(serializeDelivery(delivery), 200)
  },
})

export const setDeliveryResponsibleRoute = defineRoute({
  access: REQUIRES("productions.deliveries.responsible"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/responsible",
    summary: "Fijar el responsable de una nota",
    tags: ["Producciones"],
    request: {
      params: deliveryParams,
      body: {
        content: {
          "application/json": { schema: z.object({ responsibleId: z.string().nullable() }) },
        },
      },
    },
    responses: {
      200: {
        description: "La nota con su responsable. `null` lo retira",
        content: { "application/json": { schema: deliverySchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const delivery = await updateDelivery(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.deliveryId,
      c.req.valid("json"),
    )
    return c.json(serializeDelivery(delivery), 200)
  },
})

export const setDeliveryItemsRoute = defineRoute({
  access: REQUIRES("productions.deliveries.products"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/items",
    summary: "Componer la lista de artículos de una nota",
    tags: ["Producciones"],
    request: {
      params: deliveryParams,
      body: {
        content: {
          "application/json": { schema: z.object({ itemIds: z.array(z.string()).max(500) }) },
        },
      },
    },
    responses: {
      200: {
        description:
          "La nota, ya en curso. Se envía el conjunto completo y el servidor diferencia: crea las " +
          "líneas que faltan, elimina las que sobran y **no toca las que siguen**, para no borrar " +
          "una verificación que nadie deshizo",
        content: { "application/json": { schema: deliverySchema } },
      },
      404: { description: "La nota no existe, o algún artículo no es de esta producción" },
      422: { description: "Una nota completada o cancelada ya no se compone" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const delivery = await setDeliveryItems(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.deliveryId,
      c.req.valid("json").itemIds,
    )
    return c.json(serializeDelivery(delivery), 200)
  },
})

export const completeDeliveryRoute = defineRoute({
  access: REQUIRES("productions.deliveries.finished"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/completion",
    summary: "Cerrar una nota de entrega",
    tags: ["Producciones"],
    request: { params: deliveryParams },
    responses: {
      200: {
        description:
          "La nota completada, y sus artículos ya movidos. En una salida quedan entregados; en una " +
          "devolución, en el estado que cada línea declaró. Las dos cosas ocurren en la misma " +
          "transacción: un fallo a mitad no deja la nota cerrada ni ningún artículo movido",
        content: { "application/json": { schema: deliverySchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
      422: {
        description:
          "Quedan líneas sin verificar —el mensaje dice cuántas—, la nota no está en curso, o " +
          "algún artículo no puede pasar al estado que le tocaba",
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const delivery = await completeDelivery(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.deliveryId,
    )
    return c.json(serializeDelivery(delivery), 200)
  },
})

export const cancelDeliveryRoute = defineRoute({
  access: REQUIRES("productions.deliveries.info"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/cancellation",
    summary: "Cancelar una nota de entrega",
    tags: ["Producciones"],
    request: { params: deliveryParams },
    responses: {
      200: {
        description: "La nota cancelada. Los artículos no se mueven: nunca llegaron a salir",
        content: { "application/json": { schema: deliverySchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
      422: { description: "Una nota completada no se cancela: se elimina si hay que deshacerla" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const delivery = await cancelDelivery(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.deliveryId,
    )
    return c.json(serializeDelivery(delivery), 200)
  },
})

export const signDeliveryRoute = defineRoute({
  access: REQUIRES("productions.deliveries.finished"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/signatures",
    summary: "Registrar las firmas de una nota",
    tags: ["Producciones"],
    request: {
      params: deliveryParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              receiverName: z.string().trim().min(1).max(200),
              signatureUploadId: z.string().nullable().optional(),
              receiverSignatureUploadId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description:
          "La nota firmada. Quien entrega es quien firma —lo dice la sesión—; quien recibe es texto " +
          "libre, porque puede no tener cuenta. Los trazos son imágenes ya subidas y son opcionales: " +
          "en un set se firma en papel",
        content: { "application/json": { schema: deliverySchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
      409: { description: "Ya está firmada, y una firma no se modifica" },
      422: { description: "La nota todavía no está cerrada" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const delivery = await signDelivery(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.deliveryId,
      c.req.valid("json"),
    )
    return c.json(serializeDelivery(delivery), 200)
  },
})

export const deleteDeliveryRoute = defineRoute({
  access: REQUIRES("productions.deliveries.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}",
    summary: "Dar de baja una nota de entrega",
    tags: ["Producciones"],
    request: { params: deliveryParams },
    responses: {
      204: {
        description:
          "Dada de baja, con sus líneas y sus firmas. Los artículos que **esta** nota había dejado " +
          "entregados vuelven a disponible; los que se movieron después se quedan donde están",
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteDelivery(actorOf(c), params.companyId, params.productionId, params.deliveryId)
    return c.body(null, 204)
  },
})

// ─── Las líneas ──────────────────────────────────────────────────────────────

export const verifyDeliveryLineRoute = defineRoute({
  access: REQUIRES("productions.delivery_products.responsible"),
  config: {
    method: "put",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/lines/{lineId}/verification",
    summary: "Verificar una pieza, o deshacer su verificación",
    tags: ["Producciones"],
    request: {
      params: lineParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              isVerified: z.boolean(),
              returnCondition: z.enum(RETURN_CONDITIONS).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description:
          "La nota entera, con la línea marcada y el recuento al día. Deshacer la verificación " +
          "borra quién y cuándo: una línea pendiente que conserva verificador diría que alguien la " +
          "comprobó y sigue sin comprobar",
        content: { "application/json": { schema: deliverySchema } },
      },
      404: { description: "La nota o la línea no existen" },
      422: {
        description:
          "Una devolución exige decir en qué estado vuelve la pieza; una salida no lo admite, " +
          "porque todavía no ha vuelto. Una nota completada o cancelada ya no se verifica",
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const delivery = await verifyDeliveryLine(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.deliveryId,
      params.lineId,
      c.req.valid("json"),
    )
    return c.json(serializeDelivery(delivery), 200)
  },
})

export const findDeliveryLineRoute = defineRoute({
  access: REQUIRES("productions.delivery_products.find"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/lines/by-code/{code}",
    summary: "Localizar la línea de una nota por la etiqueta del artículo",
    tags: ["Producciones"],
    request: { params: deliveryParams.extend({ code: z.string() }) },
    responses: {
      200: {
        description:
          "La línea del artículo escaneado. Es el gesto de verificar de verdad: se lee lo que se " +
          "tiene en la mano y la pantalla dice si está en la lista",
        content: { "application/json": { schema: lineSchema } },
      },
      404: { description: "La nota no existe, o ese código no figura en ella" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const line = await findDeliveryLineByCode(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.deliveryId,
      params.code,
    )
    return c.json(serializeLine(line), 200)
  },
})

export const removeDeliveryLineRoute = defineRoute({
  access: REQUIRES("productions.delivery_products.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/lines/{lineId}",
    summary: "Quitar una pieza de una nota",
    tags: ["Producciones"],
    request: { params: lineParams },
    responses: {
      200: {
        description:
          "La nota sin esa línea. El artículo no se toca: sale de la lista, no del mundo",
        content: { "application/json": { schema: deliverySchema } },
      },
      404: { description: "La nota o la línea no existen" },
      422: { description: "Una nota completada o cancelada ya no se compone" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const delivery = await removeDeliveryLine(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.deliveryId,
      params.lineId,
    )
    return c.json(serializeDelivery(delivery), 200)
  },
})

// ─── El documento ────────────────────────────────────────────────────────────

/**
 * El documento de una nota, con su enlace.
 *
 * Va con `productions.deliveries.view` y no con una clave propia, por lo mismo que el de la
 * cotización: **el catálogo no tiene ninguna para compartir un documento**, y las 255 claves son las
 * que la implementación anterior reconoce. El documento no enseña nada que la ficha no enseñe ya; lo
 * que sí concede de más es poder repartirlo fuera, y eso ya quedó anotado en `HALLAZGOS.md` H-61.
 */
export const deliveryDocumentRoute = defineRoute({
  access: REQUIRES("productions.deliveries.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/document",
    summary: "Componer el documento de una nota de entrega",
    tags: ["Documentos"],
    request: { params: deliveryParams },
    responses: {
      200: {
        description: "El documento y la referencia con la que se comparte",
        content: {
          "application/json": {
            schema: z.object({ document: deliveryNoteDocumentSchema, reference: z.string() }),
          },
        },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const { companyId, productionId, deliveryId } = c.req.valid("param")
    const result = await deliveryNoteDocument(actorOf(c), companyId, productionId, deliveryId)
    return c.json(result, 200)
  },
})
