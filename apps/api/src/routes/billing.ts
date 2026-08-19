/**
 * Rutas de planes, suscripción y facturación.
 *
 * Rebanada 11. Ver `openspec/specs/subscriptions-and-entitlements/spec.md` y
 * `merchant-onboarding/spec.md`.
 *
 * ## La clave de permiso que se usa, y por qué ésa
 *
 * El catálogo de permisos es **cerrado**: son las 255 claves que la implementación anterior
 * reconoce, y no tiene ninguna familia de suscripciones. La más cercana es `companies.billings.*`,
 * que en la pila anterior gobernaba los perfiles de facturación, y es la que se usa aquí también
 * para el plan y para el historial de cobros.
 *
 * No es un encaje perfecto y conviene decirlo: quien puede ver los perfiles de facturación puede
 * ver también en qué plan está la empresa, y quien puede crearlos puede contratar. Separarlo pide
 * claves nuevas, y añadirlas rompe la equivalencia con los roles que hoy existen en producción.
 * Anotado como `HALLAZGOS.md` H-84.
 *
 * ## Qué no lleva permiso
 *
 * El **catálogo de planes** y la **disponibilidad del plan gratuito** son de la persona, no de una
 * empresa: se consultan antes de tener empresa donde resolver un permiso, y es lo mismo que pasa
 * con crear una empresa. Van autenticadas y sin clave.
 */

import { z } from "@hono/zod-openapi"
import {
  changePlanInput,
  createMerchantProfileInput,
  subscribeInput,
  updateMerchantProfileInput,
} from "@tfv/contracts/billing"
import { requireSession } from "../auth/middleware.ts"
import { resolveEntitlements } from "../billing/entitlements.ts"
import {
  createProfile,
  deleteProfile,
  listMerchantPayments,
  listProfiles,
  merchantPaymentQuery,
  merchantProfileQuery,
  operatingProfile,
  requireProfile,
  setPrimaryProfile,
  updateProfile,
  verificationLink,
} from "../billing/merchants.ts"
import {
  type Actor,
  cancelSubscription,
  changePlan,
  freePlanAvailable,
  listPayments,
  listPlans,
  paymentQuery,
  reactivateSubscription,
  subscribe,
} from "../billing/subscriptions.ts"
import { AUTHENTICATED, defineRoute, REQUIRES } from "../runtime/route.ts"
import { collectionQuery, pageSchema, queryOf, serializePage } from "./pagination.ts"

// ─── Esquemas ────────────────────────────────────────────────────────────────

const companyParams = z.object({ companyId: z.string() })
const profileParams = z.object({ companyId: z.string(), profileId: z.string() })

const priceSchema = z.object({
  id: z.string(),
  interval: z.string(),
  intervalCount: z.number().int(),
  /** Cadena decimal, nunca número: `1234.56` no sobrevive a un viaje por JSON como coma flotante. */
  unitAmount: z.string(),
  currency: z.string(),
})

const planSchema = z.object({
  id: z.string(),
  tier: z.number().int(),
  title: z.string(),
  description: z.string(),
  isIndividual: z.boolean(),
  isRecommended: z.boolean(),
  features: z.array(z.unknown()),
  prices: z.array(priceSchema),
})

const subscriptionSchema = z.object({
  id: z.string(),
  status: z.string(),
  planId: z.string(),
  planTier: z.number().int(),
  planTitle: z.string(),
  seats: z.number().int(),
  cancelAtPeriodEnd: z.boolean(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  gracePeriodEndsAt: z.string().nullable(),
  discountPercent: z.string().nullable(),
  promotionCode: z.string().nullable(),
  interval: z.string(),
  isOperating: z.boolean(),
})

const entitlementsSchema = z.object({
  companyId: z.string(),
  services: z.array(z.string()),
  subscription: subscriptionSchema.nullable(),
})

const paymentSchema = z.object({
  id: z.string(),
  amount: z.string(),
  currency: z.string(),
  seats: z.number().int(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  succeeded: z.boolean(),
  externalInvoiceId: z.string().nullable(),
  createdAt: z.string(),
})

const merchantPaymentSchema = z.object({
  id: z.string(),
  grossAmount: z.string(),
  platformFee: z.string(),
  netAmount: z.string(),
  currency: z.string(),
  method: z.string().nullable(),
  status: z.string(),
  merchantProfileId: z.string().nullable(),
  buyerId: z.string().nullable(),
  createdAt: z.string(),
})

const profileSchema = z.object({
  id: z.string(),
  alias: z.string(),
  addressId: z.string().nullable(),
  business: z.unknown(),
  bank: z.unknown(),
  representative: z.unknown(),
  status: z.string(),
  verificationStatus: z.string(),
  canAcceptCharges: z.boolean(),
  canReceivePayouts: z.boolean(),
  isPrimary: z.boolean(),
  termsAcceptedAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
})

const operatingSchema = z.object({
  exists: z.boolean(),
  canCharge: z.boolean(),
  status: z.string().nullable(),
  verificationStatus: z.string().nullable(),
})

function actorOf(c: Parameters<Parameters<typeof defineRoute>[0]["handler"]>[0]): Actor {
  const session = requireSession(c)
  return {
    userId: session.userId,
    sessionId: session.sessionId,
    asPlatformAdmin: c.get("grantReason") === "platform_admin",
  }
}

const iso = (value: Date | null | undefined): string | null =>
  value === null || value === undefined ? null : value.toISOString()

function serializeSubscription(state: {
  id: string
  status: string
  planId: string
  planTier: number
  planTitle: string
  seats: number
  cancelAtPeriodEnd: boolean
  periodStart: Date | null
  periodEnd: Date | null
  gracePeriodEndsAt: Date | null
  discountPercent: string | null
  promotionCode: string | null
  interval: string
  isOperating: boolean
}) {
  return {
    id: state.id,
    status: state.status,
    planId: state.planId,
    planTier: state.planTier,
    planTitle: state.planTitle,
    seats: state.seats,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    periodStart: iso(state.periodStart),
    periodEnd: iso(state.periodEnd),
    gracePeriodEndsAt: iso(state.gracePeriodEndsAt),
    discountPercent: state.discountPercent,
    promotionCode: state.promotionCode,
    interval: state.interval,
    isOperating: state.isOperating,
  }
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const listPlansRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/plans",
    summary: "Catálogo de planes con sus precios vigentes",
    tags: ["Suscripción"],
    responses: {
      200: {
        description: "Los planes, con las periodicidades y los importes del procesador",
        content: { "application/json": { schema: z.object({ items: z.array(planSchema) }) } },
      },
      422: { description: "No hay procesador de pagos configurado" },
    },
  },
  handler: async (c) => {
    requireSession(c)
    return c.json({ items: [...(await listPlans())] }, 200)
  },
})

export const freePlanAvailabilityRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/plans/free-availability",
    summary: "¿Le queda al solicitante el plan gratuito?",
    tags: ["Suscripción"],
    responses: {
      200: {
        description: "Respuesta booleana, para ofrecerlo o no",
        content: { "application/json": { schema: z.object({ available: z.boolean() }) } },
      },
    },
  },
  handler: async (c) => {
    const session = requireSession(c)
    return c.json({ available: await freePlanAvailable(session.userId) }, 200)
  },
})

// ─── Compuertas ──────────────────────────────────────────────────────────────

export const entitlementsRoute = defineRoute({
  access: REQUIRES("companies.companies.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/entitlements",
    summary: "Qué tiene contratado esta empresa",
    tags: ["Suscripción"],
    request: { params: companyParams },
    responses: {
      200: {
        description: "Servicios habilitados y estado de la suscripción",
        content: { "application/json": { schema: entitlementsSchema } },
      },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const entitlements = await resolveEntitlements(companyId)

    return c.json(
      {
        companyId: entitlements.companyId,
        services: [...entitlements.services],
        subscription: entitlements.subscription
          ? serializeSubscription(entitlements.subscription)
          : null,
      },
      200,
    )
  },
})

// ─── Suscripción ─────────────────────────────────────────────────────────────

export const subscribeRoute = defineRoute({
  access: REQUIRES("companies.billings.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/subscription",
    summary: "Contratar un plan",
    tags: ["Suscripción"],
    request: {
      params: companyParams,
      body: { content: { "application/json": { schema: subscribeInput } } },
    },
    responses: {
      200: {
        description:
          "La dirección de pago a la que redirigir, o la suscripción ya activa si el plan es gratuito",
        content: {
          "application/json": {
            schema: z.object({
              kind: z.enum(["checkout", "activada"]),
              url: z.string().optional(),
              subscription: subscriptionSchema.optional(),
            }),
          },
        },
      },
      409: { description: "La empresa ya tiene suscripción, o ya usó el plan gratuito" },
      422: { description: "El plan gratuito admite un solo asiento, o no hay procesador" },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const result = await subscribe(actorOf(c), companyId, c.req.valid("json"))

    return c.json(
      result.kind === "checkout"
        ? { kind: "checkout" as const, url: result.url }
        : { kind: "activada" as const, subscription: serializeSubscription(result.subscription) },
      200,
    )
  },
})

export const changePlanRoute = defineRoute({
  access: REQUIRES("companies.billings.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/subscription",
    summary: "Cambiar de plan, conservando los asientos",
    tags: ["Suscripción"],
    request: {
      params: companyParams,
      body: { content: { "application/json": { schema: changePlanInput } } },
    },
    responses: {
      200: {
        description:
          "La suscripción nueva y lo que costó el cambio, prorrateado — o la dirección de pago " +
          "cuando subir de plan es en realidad contratar",
        content: {
          "application/json": {
            schema: z.object({
              kind: z.enum(["aplicado", "checkout"]),
              url: z.string().optional(),
              subscription: subscriptionSchema.optional(),
              due: z.string().optional(),
              credit: z.string().optional(),
              charge: z.string().optional(),
            }),
          },
        },
      },
      404: { description: "La empresa no tiene suscripción, o el plan no existe" },
      409: { description: "Ya está en ese plan" },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const result = await changePlan(actorOf(c), companyId, c.req.valid("json"))

    return c.json(
      result.kind === "checkout"
        ? { kind: "checkout" as const, url: result.url }
        : {
            kind: "aplicado" as const,
            subscription: serializeSubscription(result.subscription),
            due: result.due,
            credit: result.credit,
            charge: result.charge,
          },
      200,
    )
  },
})

export const cancelSubscriptionRoute = defineRoute({
  access: REQUIRES("companies.billings.delete"),
  config: {
    method: "post",
    path: "/companies/{companyId}/subscription/cancel",
    summary: "Cancelar al terminar el periodo pagado",
    tags: ["Suscripción"],
    request: { params: companyParams },
    responses: {
      200: {
        description: "Marcada para terminar. Sigue operando hasta la fecha que indica",
        content: { "application/json": { schema: subscriptionSchema } },
      },
      409: { description: "Ya estaba marcada para terminar" },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const state = await cancelSubscription(actorOf(c), companyId)
    return c.json(serializeSubscription(state), 200)
  },
})

export const reactivateSubscriptionRoute = defineRoute({
  access: REQUIRES("companies.billings.edit"),
  config: {
    method: "post",
    path: "/companies/{companyId}/subscription/reactivate",
    summary: "Revertir la cancelación mientras el periodo siga vigente",
    tags: ["Suscripción"],
    request: { params: companyParams },
    responses: {
      200: {
        description: "Vuelve a renovarse con normalidad",
        content: { "application/json": { schema: subscriptionSchema } },
      },
      409: { description: "No estaba marcada para terminar" },
      422: { description: "El periodo ya terminó: no hay cancelación que revertir" },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const state = await reactivateSubscription(actorOf(c), companyId)
    return c.json(serializeSubscription(state), 200)
  },
})

export const listSubscriptionPaymentsRoute = defineRoute({
  access: REQUIRES("companies.billings.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/subscription/payments",
    summary: "Historial de cobros de la suscripción",
    tags: ["Suscripción"],
    request: { params: companyParams, query: collectionQuery(paymentQuery) },
    responses: {
      200: {
        description: "Cobros con su importe, periodo, asientos y resultado",
        content: { "application/json": { schema: pageSchema(paymentSchema) } },
      },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const page = await listPayments(actorOf(c), companyId, queryOf(c, paymentQuery))

    return c.json(
      serializePage(page, (row) => ({
        id: row.id,
        amount: row.amount,
        currency: row.currency,
        seats: row.seats,
        periodStart: iso(row.periodStart),
        periodEnd: iso(row.periodEnd),
        succeeded: row.succeeded,
        externalInvoiceId: row.externalInvoiceId,
        createdAt: row.createdAt.toISOString(),
      })),
      200,
    )
  },
})

// ─── Perfiles de facturación ─────────────────────────────────────────────────

export const listMerchantProfilesRoute = defineRoute({
  access: REQUIRES("companies.billings.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/billing-profiles",
    summary: "Perfiles de facturación de la empresa",
    tags: ["Facturación"],
    request: { params: companyParams, query: collectionQuery(merchantProfileQuery) },
    responses: {
      200: {
        description: "Los perfiles, con su estado y cuál es el primario",
        content: { "application/json": { schema: pageSchema(profileSchema) } },
      },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const page = await listProfiles(actorOf(c), companyId, queryOf(c, merchantProfileQuery))
    return c.json(serializePage(page, serializeProfile), 200)
  },
})

export const createMerchantProfileRoute = defineRoute({
  access: REQUIRES("companies.billings.create"),
  config: {
    method: "post",
    path: "/companies/{companyId}/billing-profiles",
    summary: "Dar de alta un perfil y su cuenta de comercio",
    tags: ["Facturación"],
    request: {
      params: companyParams,
      body: { content: { "application/json": { schema: createMerchantProfileInput } } },
    },
    responses: {
      201: {
        description: "Perfil creado, en estado limitado hasta que el procesador lo confirme",
        content: { "application/json": { schema: profileSchema } },
      },
      400: { description: "La cuenta bancaria o la fecha de nacimiento no valen" },
      422: { description: "El procesador rechazó el alta, y no queda perfil a medias" },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const profile = await createProfile(actorOf(c), companyId, c.req.valid("json"), {
      // De dónde se aceptaron los términos. Se toma del encabezado del proxy cuando lo hay, que es
      // lo que ve el servicio detrás de él; sin proxy no hay dirección que registrar.
      ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
    })

    return c.json(serializeProfile(profile), 201)
  },
})

export const getMerchantProfileRoute = defineRoute({
  access: REQUIRES("companies.billings.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/billing-profiles/{profileId}",
    summary: "Ver un perfil de facturación",
    tags: ["Facturación"],
    request: { params: profileParams },
    responses: {
      200: {
        description: "El perfil",
        content: { "application/json": { schema: profileSchema } },
      },
      404: { description: "No existe, o está fuera del alcance del solicitante" },
    },
  },
  handler: async (c) => {
    const { companyId, profileId } = c.req.valid("param")
    return c.json(serializeProfile(await requireProfile(actorOf(c), companyId, profileId)), 200)
  },
})

export const updateMerchantProfileRoute = defineRoute({
  access: REQUIRES("companies.billings.edit"),
  config: {
    method: "patch",
    path: "/companies/{companyId}/billing-profiles/{profileId}",
    summary: "Modificar un perfil y propagar lo que afecte al procesador",
    tags: ["Facturación"],
    request: {
      params: profileParams,
      body: { content: { "application/json": { schema: updateMerchantProfileInput } } },
    },
    responses: {
      200: {
        description: "Perfil actualizado",
        content: { "application/json": { schema: profileSchema } },
      },
    },
  },
  handler: async (c) => {
    const { companyId, profileId } = c.req.valid("param")
    const profile = await updateProfile(actorOf(c), companyId, profileId, c.req.valid("json"))
    return c.json(serializeProfile(profile), 200)
  },
})

export const setPrimaryMerchantProfileRoute = defineRoute({
  access: REQUIRES("companies.billings.primary"),
  config: {
    method: "post",
    path: "/companies/{companyId}/billing-profiles/{profileId}/primary",
    summary: "Marcar como primario. Desmarca el anterior",
    tags: ["Facturación"],
    request: { params: profileParams },
    responses: {
      200: {
        description: "Es el primario, y el que antes lo era deja de serlo",
        content: { "application/json": { schema: profileSchema } },
      },
    },
  },
  handler: async (c) => {
    const { companyId, profileId } = c.req.valid("param")
    const profile = await setPrimaryProfile(actorOf(c), companyId, profileId)
    return c.json(serializeProfile(profile), 200)
  },
})

export const verifyMerchantProfileRoute = defineRoute({
  access: REQUIRES("companies.billings.edit"),
  config: {
    method: "post",
    path: "/companies/{companyId}/billing-profiles/{profileId}/verification-link",
    summary: "Enlace al formulario de documentación del procesador",
    tags: ["Facturación"],
    request: { params: profileParams },
    responses: {
      200: {
        description: "El enlace. Al terminar vuelve a la pantalla de facturación de la empresa",
        content: { "application/json": { schema: z.object({ url: z.string() }) } },
      },
      422: { description: "El perfil todavía no tiene cuenta de comercio" },
    },
  },
  handler: async (c) => {
    const { companyId, profileId } = c.req.valid("param")
    return c.json(await verificationLink(actorOf(c), companyId, profileId), 200)
  },
})

export const deleteMerchantProfileRoute = defineRoute({
  access: REQUIRES("companies.billings.delete"),
  config: {
    method: "delete",
    path: "/companies/{companyId}/billing-profiles/{profileId}",
    summary: "Dar de baja un perfil y su cuenta de comercio",
    tags: ["Facturación"],
    request: { params: profileParams },
    responses: {
      204: { description: "Dado de baja. Si era el primario, otro lo sustituye" },
      409: { description: "Tiene transferencias pendientes de liquidar" },
    },
  },
  handler: async (c) => {
    const { companyId, profileId } = c.req.valid("param")
    await deleteProfile(actorOf(c), companyId, profileId)
    return c.body(null, 204)
  },
})

export const operatingProfileRoute = defineRoute({
  access: REQUIRES("companies.billings.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/billing-profiles/operating",
    summary: "Cuál es el perfil operativo, sin datos fiscales ni bancarios",
    tags: ["Facturación"],
    request: { params: companyParams },
    responses: {
      200: {
        description: "Si existe y si puede cobrar. Nada más",
        content: { "application/json": { schema: operatingSchema } },
      },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    return c.json(await operatingProfile(companyId), 200)
  },
})

export const listMerchantPaymentsRoute = defineRoute({
  access: REQUIRES("companies.billings.view"),
  config: {
    method: "get",
    path: "/companies/{companyId}/merchant-payments",
    summary: "Libro de ingresos: lo que la empresa cobró de sus compradores",
    tags: ["Facturación"],
    request: { params: companyParams, query: collectionQuery(merchantPaymentQuery) },
    responses: {
      200: {
        description: "Cobros con el bruto, la comisión retenida y el neto por separado",
        content: { "application/json": { schema: pageSchema(merchantPaymentSchema) } },
      },
    },
  },
  handler: async (c) => {
    const { companyId } = c.req.valid("param")
    const page = await listMerchantPayments(actorOf(c), companyId, queryOf(c, merchantPaymentQuery))

    return c.json(
      serializePage(page, (row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      200,
    )
  },
})

/**
 * El perfil, tal como sale.
 *
 * `externalAccountId` **no viaja**: es la referencia de la cuenta en el procesador y no le sirve de
 * nada a la pantalla, que sólo necesita saber si hay cuenta —lo dice el estado— y si puede cobrar.
 */
function serializeProfile(profile: {
  id: string
  alias: string
  addressId: string | null
  business: unknown
  bank: unknown
  representative: unknown
  status: string
  verificationStatus: string
  canAcceptCharges: boolean
  canReceivePayouts: boolean
  isPrimary: boolean
  termsAcceptedAt: Date | null
  notes: string | null
  createdAt: Date
}) {
  return {
    id: profile.id,
    alias: profile.alias,
    addressId: profile.addressId,
    business: profile.business,
    bank: profile.bank,
    representative: profile.representative,
    status: profile.status,
    verificationStatus: profile.verificationStatus,
    canAcceptCharges: profile.canAcceptCharges,
    canReceivePayouts: profile.canReceivePayouts,
    isPrimary: profile.isPrimary,
    termsAcceptedAt: iso(profile.termsAcceptedAt),
    notes: profile.notes,
    createdAt: profile.createdAt.toISOString(),
  }
}
