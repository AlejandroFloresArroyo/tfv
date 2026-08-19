/**
 * Rutas de producciones.
 *
 * Rebanada 20, y las primeras del servicio de producciones.
 *
 * ## Tres familias de permisos para tres cosas distintas
 *
 * `productions.productions.*` gobierna la producción como entidad; `productions.categories.*`, su
 * taxonomía; `productions.workflows.*`, los planes de trabajo. Están separadas en el catálogo
 * cerrado de 255 claves porque en un rodaje son papeles distintos: quien programa la orden del día
 * no es quien da de alta el proyecto, y quien organiza los departamentos no es quien lo publica.
 *
 * ## El panel no tiene clave propia, y no se inventa ninguna
 *
 * El catálogo está **cerrado en las 255 claves migradas** y no trae ninguna de «panel». El panel
 * tampoco es un recurso: es un resumen de cuatro que sí lo son. Se exige `productions.budgets.view`
 * porque es la única de las cuatro que no está cubierta por ver la producción —los capítulos, las
 * jornadas y los planes se cuentan, el presupuesto se **suma**, y sumar dinero es exactamente lo
 * que esa clave separa del resto (`HALLAZGOS.md` H-112).
 *
 * ## El listado de la taxonomía no pagina
 *
 * Es un árbol, y su listado por defecto son **las raíces**, igual que el de categorías del almacén.
 * En la gramática de colecciones «ausente» no es «nulo», así que un `parentId` opcional no se puede
 * expresar como filtro sin cambiar lo que significa no pasarlo.
 */

import { z } from "@hono/zod-openapi"
import { ForbiddenError, toInstant, toNullableInstant } from "@tfv/contracts"
import { requireSession } from "../auth/middleware.ts"
import type { Actor } from "../companies/companies.ts"
import {
  categoryPath,
  categoryScope,
  createProductionCategory,
  deleteProductionCategory,
  getProductionCategory,
  listProductionCategories,
  updateProductionCategory,
} from "../productions/categories.ts"
import { productionPanel, RECORDING_STATUSES } from "../productions/panel.ts"
import {
  createProduction,
  deleteProduction,
  getProduction,
  listProductions,
  productionQuery,
  productionScope,
  updateProduction,
} from "../productions/productions.ts"
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listWorkflows,
  TASK_STATUSES,
  updateWorkflow,
  WORKFLOW_STATUSES,
  workflowQuery,
  workflowScope,
} from "../productions/workflows.ts"
import { defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

/**
 * La imagen única de una entidad, tal y como viaja.
 *
 * Tres campos y no uno: el identificador es lo que se envía al guardar, y las dos direcciones son
 * lo que la pantalla pinta sin tener que ir a buscarlas.
 */
const imageFields = {
  imageUploadId: z.string().nullable(),
  imageUrl: z.string().nullable(),
  imageThumbnailUrl: z.string().nullable(),
}

/** `null` la retira; omitirla la deja como está. */
const imageInput = z.string().nullable().optional()

const instant = z.string().datetime()

const productionSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  description: z.string(),
  slug: z.string().nullable(),
  isPublished: z.boolean(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  ...imageFields,
  createdAt: z.string(),
  updatedAt: z.string(),
})

const categorySchema = z.object({
  id: z.string(),
  productionId: z.string(),
  parentId: z.string().nullable(),
  roleId: z.string().nullable(),
  roleName: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  slug: z.string().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  childCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const breakdownSchema = z.object(
  Object.fromEntries(TASK_STATUSES.map((status) => [status, z.number().int()])) as Record<
    (typeof TASK_STATUSES)[number],
    z.ZodNumber
  >,
)

const workflowSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  sceneId: z.string().nullable(),
  code: z.string(),
  observations: z.string(),
  status: z.enum(WORKFLOW_STATUSES),
  scheduledFor: z.string(),
  endsAt: z.string().nullable(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  taskCount: z.number().int(),
  tasksByStatus: breakdownSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const companyParams = z.object({ companyId: z.string() })
const productionParams = companyParams.extend({ productionId: z.string() })
const categoryParams = productionParams.extend({ categoryId: z.string() })
const workflowParams = productionParams.extend({ workflowId: z.string() })

const nameField = z.string().trim().min(1, "El nombre es obligatorio").max(250)

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return { userId: session.userId, sessionId: session.sessionId }
}

function serializeProduction(row: Awaited<ReturnType<typeof getProduction>>) {
  return {
    ...row,
    startsOn: toNullableInstant(row.startsOn),
    endsOn: toNullableInstant(row.endsOn),
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  }
}

function serializeCategory(row: Awaited<ReturnType<typeof getProductionCategory>>) {
  return { ...row, createdAt: toInstant(row.createdAt), updatedAt: toInstant(row.updatedAt) }
}

function serializeWorkflow(row: Awaited<ReturnType<typeof getWorkflow>>) {
  return {
    ...row,
    scheduledFor: toInstant(row.scheduledFor),
    endsAt: toNullableInstant(row.endsAt),
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  }
}

/** «Trae los agregados», que por omisión no se traen. Ver `computed-fields`. */
function wantsAggregates(c: { req: { query: (key: string) => string | undefined } }): boolean {
  return c.req.query("aggregates") === "true"
}

// ─── Producciones ────────────────────────────────────────────────────────────

export const listProductionsRoute = defineRoute({
  access: REQUIRES("productions.productions.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions",
    summary: "Listar las producciones de una empresa",
    tags: ["Producciones"],
    request: { params: companyParams, query: collectionQuery(productionQuery) },
    responses: {
      200: {
        description: "Producciones, por fecha de alta",
        content: { "application/json": { schema: pageSchema(productionSchema) } },
      },
    },
  },
  handler: async (c) => {
    const page = await listProductions(
      actorOf(c),
      c.req.valid("param").companyId,
      queryOf(c, productionQuery),
    )
    return c.json(serializePage(page, serializeProduction), 200)
  },
})

export const createProductionRoute = defineRoute({
  access: REQUIRES("productions.productions.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions",
    summary: "Crear una producción",
    tags: ["Producciones"],
    request: {
      params: companyParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField,
              description: z.string().max(4000).optional(),
              startsOn: instant.nullable().optional(),
              endsOn: instant.nullable().optional(),
              isPublished: z.boolean().optional(),
              imageUploadId: imageInput,
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Producción creada, con su identificador legible derivado del nombre",
        content: { "application/json": { schema: productionSchema } },
      },
      422: {
        description:
          "La empresa no tiene contratado el servicio, o la fecha de fin precede al inicio",
      },
    },
  },
  handler: async (c) => {
    const production = await createProduction(
      actorOf(c),
      c.req.valid("param").companyId,
      c.req.valid("json"),
    )
    return c.json(serializeProduction(production), 201)
  },
})

export const getProductionRoute = defineRoute({
  access: REQUIRES("productions.productions.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}",
    summary: "Ver una producción",
    tags: ["Producciones"],
    request: { params: productionParams },
    responses: {
      200: {
        description: "La producción",
        content: { "application/json": { schema: productionSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const production = await getProduction(actorOf(c), params.companyId, params.productionId)
    return c.json(serializeProduction(production), 200)
  },
})

export const updateProductionRoute = defineRoute({
  access: REQUIRES("productions.productions.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}",
    summary: "Editar una producción",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: nameField.optional(),
              description: z.string().max(4000).optional(),
              startsOn: instant.nullable().optional(),
              endsOn: instant.nullable().optional(),
              isPublished: z.boolean().optional(),
              slug: z.string().trim().min(1).max(220).optional(),
              imageUploadId: imageInput,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Producción actualizada",
        content: { "application/json": { schema: productionSchema } },
      },
      409: { description: "El identificador legible ya está ocupado" },
      422: { description: "La fecha de fin precede al inicio" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const production = await updateProduction(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serializeProduction(production), 200)
  },
})

export const productionScopeRoute = defineRoute({
  access: REQUIRES("productions.productions.delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/scope",
    summary: "Qué se lleva por delante dar de baja la producción",
    tags: ["Producciones"],
    request: { params: productionParams },
    responses: {
      200: {
        description: "Recuento real, para enumerarlo en la confirmación",
        content: {
          "application/json": {
            schema: z.object({
              scripts: z.number().int(),
              chapters: z.number().int(),
              scenes: z.number().int(),
              characters: z.number().int(),
              sets: z.number().int(),
              videos: z.number().int(),
              items: z.number().int(),
              recordings: z.number().int(),
              workflows: z.number().int(),
              purchaseOrders: z.number().int(),
              /** Las que además impiden la baja, para decirlo antes de que nadie confirme. */
              openPurchaseOrders: z.number().int(),
              unreturnedOrders: z.number().int(),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await productionScope(actorOf(c), params.companyId, params.productionId)
    return c.json(scope, 200)
  },
})

export const deleteProductionRoute = defineRoute({
  access: REQUIRES("productions.productions.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}",
    summary: "Dar de baja una producción",
    tags: ["Producciones"],
    request: { params: productionParams },
    responses: {
      204: { description: "Dada de baja. El borrado es lógico y conserva el historial" },
      409: { description: "Tiene órdenes de compra en curso o equipo rentado sin devolver" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteProduction(actorOf(c), params.companyId, params.productionId)
    return c.body(null, 204)
  },
})

export const productionPanelRoute = defineRoute({
  access: REQUIRES("productions.budgets.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/panel",
    summary: "Resumen de la producción: desglose y presupuesto",
    tags: ["Producciones"],
    request: { params: productionParams },
    responses: {
      200: {
        description:
          "Capítulos, escenas, jornadas y planes por estado, y lo previsto contra lo gastado",
        content: {
          "application/json": {
            schema: z.object({
              chapters: z.number().int(),
              scenes: z.number().int(),
              recordings: z.object(
                Object.fromEntries(
                  RECORDING_STATUSES.map((status) => [status, z.number().int()]),
                ) as Record<(typeof RECORDING_STATUSES)[number], z.ZodNumber>,
              ),
              workflows: z.object(
                Object.fromEntries(
                  WORKFLOW_STATUSES.map((status) => [status, z.number().int()]),
                ) as Record<(typeof WORKFLOW_STATUSES)[number], z.ZodNumber>,
              ),
              budget: z.object({
                anchored: z.string(),
                spent: z.string(),
                difference: z.string(),
              }),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const panel = await productionPanel(actorOf(c), params.companyId, params.productionId)
    return c.json(panel, 200)
  },
})

// ─── Taxonomía de la producción ──────────────────────────────────────────────

export const listProductionCategoriesRoute = defineRoute({
  access: REQUIRES("productions.categories.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/categories",
    summary: "Listar categorías; sin «parentId», las raíces",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      query: z.object({ parentId: z.string().optional() }),
    },
    responses: {
      200: {
        description: "Las categorías de ese nivel, con su recuento de hijas y su equipo",
        content: { "application/json": { schema: z.object({ items: z.array(categorySchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const { parentId } = c.req.valid("query")

    const items = await listProductionCategories(
      actorOf(c),
      params.companyId,
      params.productionId,
      {
        ...(parentId === undefined ? {} : { parentId }),
      },
    )
    return c.json({ items: items.map(serializeCategory) }, 200)
  },
})

export const getProductionCategoryRoute = defineRoute({
  access: REQUIRES("productions.categories.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/categories/{categoryId}",
    summary: "Ver una categoría de la producción",
    tags: ["Producciones"],
    request: { params: categoryParams },
    responses: {
      200: {
        description: "La categoría",
        content: { "application/json": { schema: categorySchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const category = await getProductionCategory(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.categoryId,
    )
    return c.json(serializeCategory(category), 200)
  },
})

export const productionCategoryPathRoute = defineRoute({
  access: REQUIRES("productions.categories.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/categories/{categoryId}/path",
    summary: "El camino desde la raíz hasta una categoría",
    tags: ["Producciones"],
    request: { params: categoryParams },
    responses: {
      200: {
        description: "De la raíz a la categoría, ambas incluidas",
        content: { "application/json": { schema: z.object({ items: z.array(categorySchema) }) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const items = await categoryPath(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.categoryId,
    )
    return c.json({ items: items.map(serializeCategory) }, 200)
  },
})

export const createProductionCategoryRoute = defineRoute({
  access: REQUIRES("productions.categories.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/categories",
    summary: "Crear una categoría de la producción",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(160),
              description: z.string().max(4000).optional(),
              parentId: z.string().nullable().optional(),
              roleId: z.string().nullable().optional(),
              color: z.string().max(16).optional(),
              icon: z.string().max(64).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Creada, con su identificador legible único dentro de la producción",
        content: { "application/json": { schema: categorySchema } },
      },
      404: { description: "El padre o el rol no existen dentro del alcance" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const category = await createProductionCategory(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serializeCategory(category), 201)
  },
})

export const updateProductionCategoryRoute = defineRoute({
  access: REQUIRES("productions.categories.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/categories/{categoryId}",
    summary: "Editar una categoría; «roleId» nulo la desvincula de su equipo",
    tags: ["Producciones"],
    request: {
      params: categoryParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().trim().min(1).max(160).optional(),
              description: z.string().max(4000).optional(),
              parentId: z.string().nullable().optional(),
              roleId: z.string().nullable().optional(),
              color: z.string().max(16).nullable().optional(),
              icon: z.string().max(64).nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Actualizada",
        content: { "application/json": { schema: categorySchema } },
      },
      422: { description: "El padre nuevo es ella misma o una de sus descendientes" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const category = await updateProductionCategory(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.categoryId,
      c.req.valid("json"),
    )
    return c.json(serializeCategory(category), 200)
  },
})

export const productionCategoryScopeRoute = defineRoute({
  access: REQUIRES("productions.categories.delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/categories/{categoryId}/scope",
    summary: "Qué se lleva por delante eliminar la categoría",
    tags: ["Producciones"],
    request: { params: categoryParams },
    responses: {
      200: {
        description: "Categorías del subárbol, y lo clasificado que quedará sin categoría",
        content: {
          "application/json": {
            schema: z.object({
              categories: z.number().int(),
              items: z.number().int(),
              videos: z.number().int(),
              tasks: z.number().int(),
            }),
          },
        },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await categoryScope(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.categoryId,
    )
    return c.json(scope, 200)
  },
})

export const deleteProductionCategoryRoute = defineRoute({
  access: REQUIRES("productions.categories.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/categories/{categoryId}",
    summary: "Eliminar una categoría y su subárbol",
    tags: ["Producciones"],
    request: { params: categoryParams },
    responses: {
      204: { description: "Eliminada. Lo clasificado queda sin categoría, no se elimina" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteProductionCategory(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.categoryId,
    )
    return c.body(null, 204)
  },
})

// ─── Planes de trabajo ───────────────────────────────────────────────────────

export const listWorkflowsRoute = defineRoute({
  access: REQUIRES("productions.workflows.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/workflows",
    summary: "Listar los planes de trabajo de una producción",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      query: collectionQuery(workflowQuery).extend({
        aggregates: z
          .string()
          .optional()
          .openapi({ description: "«true» añade el desglose de tareas por estado" }),
      }),
    },
    responses: {
      200: {
        description: "Planes, del más reciente al más antiguo",
        content: { "application/json": { schema: pageSchema(workflowSchema) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const page = await listWorkflows(
      actorOf(c),
      params.companyId,
      params.productionId,
      // `aggregates` no filtra ni ordena, así que se saca del análisis: la gramática rechaza lo que
      // no reconoce, y esa severidad es la que hace que un filtro mal escrito devuelva `400`.
      queryOf(c, workflowQuery, ["aggregates"]),
      { aggregates: wantsAggregates(c) },
    )
    return c.json(serializePage(page, serializeWorkflow), 200)
  },
})

export const createWorkflowRoute = defineRoute({
  access: REQUIRES("productions.workflows.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/productions/{productionId}/workflows",
    summary: "Crear un plan de trabajo; nace pendiente",
    tags: ["Producciones"],
    request: {
      params: productionParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              scheduledFor: instant,
              endsAt: instant.nullable().optional(),
              observations: z.string().max(4000).optional(),
              responsibleId: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Plan creado, en estado pendiente y con su código",
        content: { "application/json": { schema: workflowSchema } },
      },
      422: { description: "El plan termina antes de empezar" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const workflow = await createWorkflow(
      actorOf(c),
      params.companyId,
      params.productionId,
      c.req.valid("json"),
    )
    return c.json(serializeWorkflow(workflow), 201)
  },
})

export const getWorkflowRoute = defineRoute({
  access: REQUIRES("productions.workflows.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}",
    summary: "Ver un plan de trabajo",
    tags: ["Producciones"],
    request: {
      params: workflowParams,
      query: z.object({ aggregates: z.string().optional() }),
    },
    responses: {
      200: {
        description: "El plan",
        content: { "application/json": { schema: workflowSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const workflow = await getWorkflow(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      { aggregates: wantsAggregates(c) },
    )
    return c.json(serializeWorkflow(workflow), 200)
  },
})

/**
 * Editar un plan, **incluido su estado**.
 *
 * Una sola ruta y no dos, al revés que la cotización y el pedido de almacén. Ahí el cambio de
 * estado mueve inventario y tiene su clave propia; aquí `productions.workflows.status` existe en el
 * catálogo, así que el manejador la exige aparte cuando el cuerpo trae `status`. La ruta declara la
 * general y la específica se comprueba encima: quien sólo pueda editar observaciones no puede dar
 * una jornada por completada.
 */
export const updateWorkflowRoute = defineRoute({
  access: REQUIRES("productions.workflows.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}",
    summary: "Editar un plan; cambiar fecha y estado a la vez es reprogramarlo",
    tags: ["Producciones"],
    request: {
      params: workflowParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              scheduledFor: instant.optional(),
              endsAt: instant.nullable().optional(),
              observations: z.string().max(4000).optional(),
              responsibleId: z.string().nullable().optional(),
              status: z.enum(WORKFLOW_STATUSES).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Actualizado. Conserva sus tareas",
        content: { "application/json": { schema: workflowSchema } },
      },
      403: { description: "Cambiar el estado exige «productions.workflows.status»" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const body = c.req.valid("json")
    const authorization = c.get("authorization")

    if (
      body.status !== undefined &&
      !authorization.isPlatformAdmin &&
      !authorization.isOwner &&
      !authorization.granted.has("productions.workflows.status")
    ) {
      throw new ForbiddenError("Falta el permiso «productions.workflows.status»")
    }

    const workflow = await updateWorkflow(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
      body,
    )
    return c.json(serializeWorkflow(workflow), 200)
  },
})

export const workflowScopeRoute = defineRoute({
  access: REQUIRES("productions.workflows.delete"),
  config: {
    method: "get",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}/scope",
    summary: "Qué se lleva por delante eliminar el plan",
    tags: ["Producciones"],
    request: { params: workflowParams },
    responses: {
      200: {
        description: "Las tareas que desaparecen con él, y con ellas sus actividades",
        content: { "application/json": { schema: z.object({ tasks: z.number().int() }) } },
      },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    const scope = await workflowScope(
      actorOf(c),
      params.companyId,
      params.productionId,
      params.workflowId,
    )
    return c.json(scope, 200)
  },
})

export const deleteWorkflowRoute = defineRoute({
  access: REQUIRES("productions.workflows.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/productions/{productionId}/workflows/{workflowId}",
    summary: "Eliminar un plan de trabajo y sus tareas",
    tags: ["Producciones"],
    request: { params: workflowParams },
    responses: {
      204: { description: "Eliminado" },
    },
  },
  handler: async (c) => {
    const params = c.req.valid("param")
    await deleteWorkflow(actorOf(c), params.companyId, params.productionId, params.workflowId)
    return c.body(null, 204)
  },
})
