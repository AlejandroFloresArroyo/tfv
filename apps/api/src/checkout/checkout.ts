/**
 * Crear, consultar y cancelar la compra de una tienda pública.
 *
 * Ver `openspec/specs/storefront-checkout/spec.md`. Rebanada 18, y corrige `DEFECTS.md` M-10.
 *
 * ## Todo lo que importa pasa en una sola transacción
 *
 * Comprobar existencia, **apartarla**, calcular el envío, congelar la instantánea y abrir la sesión
 * de pago. Si algo falla —incluida la llamada al procesador— no queda ni compra ni una unidad
 * apartada. La alternativa —apartar, confirmar, y llamar al procesador después— deja una ventana en
 * la que un fallo de red retira inventario del catálogo sin que nadie pueda pagarlo ni soltarlo
 * hasta que caduque.
 *
 * El costo es que la transacción sostiene los bloqueos mientras dura una llamada de red. Es un
 * costo real y se paga a sabiendas: son unos cientos de milisegundos sobre las filas de un puñado de
 * unidades, y lo que compra es que «apartado» y «cobrable» empiecen a existir en el mismo instante.
 *
 * ## El orden de las escrituras no es casual
 *
 * La compra se inserta **antes** de calcular el envío, y no después de tener los importes. La
 * lectura de `user_addresses` la concede su dueño **o una compra que apunte a ella**, y aquí no hay
 * dueño: la transacción corre con el alcance de la empresa vendedora, no con la sesión del
 * comprador. Sin la fila de compra ya escrita, el domicilio no se ve, el cálculo lo tomaría por «sin
 * coordenadas» y el envío perdería su recargo por distancia **en silencio** — que es exactamente el
 * defecto H-98 que la rebanada 17 encontró y cerró.
 *
 * ## Dos capas, otra vez
 *
 * La aplicación comprueba que el domicilio es de quien compra y que la compra que se cancela es
 * suya; el motor comprueba que todo lo que se escribe cae dentro de la empresa declarada. Ninguna de
 * las dos sobra: la primera sabe quién pide, la segunda sabe qué puede tocarse.
 */

import { createHash } from "node:crypto"
import type { CartItemInput, CheckoutStatus, CheckoutTradeType } from "@tfv/contracts"
import {
  ConflictError,
  computeCheckoutTotals,
  formatMoney,
  money,
  NotFoundError,
  newId,
  type ShippingMode,
  sum,
  UnprocessableError,
} from "@tfv/contracts"
import type { Transaction } from "@tfv/db"
import { withRequester, withSystem } from "@tfv/db"
import {
  type CheckoutLine,
  checkouts,
  companies,
  companyAddresses,
  merchantProfiles,
  userAddresses,
  websites,
} from "@tfv/db/schema"
import { and, desc, eq, isNull } from "drizzle-orm"
import { assertCanCharge } from "../billing/merchants.ts"
import type { Actor } from "../companies/companies.ts"
import { env } from "../env.ts"
import { estimateShipping } from "../shipping/estimate.ts"
import { CANNOT_CHARGE, type CartLine, priceCart, shippingItemsOf } from "./cart.ts"
import { storefrontProvider } from "./provider.ts"
import { releaseCheckout, reserveForCheckout } from "./reservations.ts"

const OPERATION = "tienda_publica.compra"

export interface CreateCheckoutInput {
  readonly type: CheckoutTradeType
  readonly mode: ShippingMode
  readonly items: readonly CartItemInput[]
  /** Obligatorio salvo en recolección en tienda. */
  readonly toAddressId?: string | undefined
  /** `Idempotency-Key`. Ver `api-conventions` y la migración `0021`. */
  readonly idempotencyKey?: string | undefined
}

export interface CheckoutRecord {
  readonly id: string
  readonly status: CheckoutStatus
  readonly type: string
  readonly storeSlug: string
  readonly storeName: string
  readonly lines: readonly CheckoutLine[]
  readonly subtotal: string
  readonly shippingCost: string
  readonly total: string
  readonly currency: string
  readonly shippingMode: string
  readonly checkoutUrl: string | null
  readonly expiresAt: string | null
  readonly createdAt: string
}

// ─── Alta ────────────────────────────────────────────────────────────────────

/**
 * Abre la sesión de pago de una compra, con su inventario ya apartado.
 *
 * Devuelve la compra entera y no sólo la dirección de pago: el comprador tiene que poder ver el
 * desglose —artículos, envío y total— **antes** de irse al procesador, y ése es exactamente el
 * desglose que se le va a cobrar porque sale de la instantánea que se acaba de escribir. Una
 * previsualización aparte habría sido un segundo cálculo, y dos cálculos divergen.
 */
export async function createCheckout(
  actor: Actor,
  slug: string,
  input: CreateCheckoutInput,
): Promise<CheckoutRecord> {
  const cart = await priceCart(slug, input.type, input.items)
  const { store } = cart

  // La compuerta de cobro: sin perfil de facturación operativo no se abre una sesión de pago. El
  // motivo que ve el comprador es el mismo para los tres motivos de configuración.
  try {
    await assertCanCharge(store.companyId)
  } catch {
    throw new UnprocessableError(CANNOT_CHARGE)
  }

  const shipToAddressId = await resolveDeliveryAddress(actor, input.mode, input.toAddressId)
  const fingerprint = hashOf(slug, input)

  // El alcance sale de la tienda que `priceCart` acaba de resolver, con sus tres compuertas
  // atravesadas. Volver a resolverla aquí serían cuatro consultas más para llegar al mismo
  // identificador, y una segunda oportunidad de que las dos resoluciones no coincidan.
  return withSystem(OPERATION, [store.companyId], async (tx) => {
    if (input.idempotencyKey) {
      const previous = await findByKey(tx, actor.userId, input.idempotencyKey)
      if (previous) {
        // «La segunda petición SHALL devolver el resultado de la primera, no un error» — y la misma
        // clave con otro cuerpo, un `409`. Sin el resumen del cuerpo no se pueden distinguir.
        if (previous.requestHash !== fingerprint) {
          throw new ConflictError(
            "Esa clave de idempotencia ya se usó para una compra distinta de ésta",
          )
        }
        return toRecord(previous, store.slug, store.name)
      }
    }

    const expiresAt = new Date(Date.now() + env.CHECKOUT_RESERVATION_MINUTES * 60_000)
    const checkoutId = newId()
    const lines: CheckoutLine[] = cart.lines.map(toSnapshotLine)

    const subtotal = sum(cart.lines.map((line) => money(line.total)))
    const shipFromAddressId = await primaryAddressOf(tx, store.companyId)
    const merchant = await merchantOf(tx, store.companyId)

    // Primero la fila, después el envío: el domicilio del comprador no se ve hasta que hay una
    // compra que lo apunta. Ver la cabecera de este archivo, y H-98.
    await tx.insert(checkouts).values({
      id: checkoutId,
      websiteId: store.websiteId,
      companyId: store.companyId,
      buyerId: actor.userId,
      merchantProfileId: merchant?.id ?? null,
      type: input.type,
      status: "pending",
      lines,
      subtotal: formatMoney(subtotal),
      total: formatMoney(subtotal),
      shippingMode: input.mode,
      shipFromAddressId,
      shipToAddressId,
      expiresAt,
      ...(input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey, requestHash: fingerprint }
        : {}),
    })

    // Apartar es lo que decide si la compra sale adelante. Va después de la instantánea y antes de
    // cualquier otra cosa que cueste: lo caro es el bloqueo, y cuanto menos dure, mejor.
    await reserveForCheckout(
      tx,
      checkoutId,
      actor.userId,
      expiresAt,
      cart.lines.map((line) => ({
        measurementId: line.refId,
        quantity: line.quantity,
        label: line.name,
      })),
    )

    const shipping = await estimateShipping(tx, {
      companyId: store.companyId,
      mode: input.mode,
      items: await shippingItemsOf(tx, cart.lines),
      ...(shipToAddressId ? { toAddressId: shipToAddressId } : {}),
    })

    const totals = computeCheckoutTotals({
      lines: cart.lines,
      shippingCost: shipping.total,
      commissionRate: await commissionOf(tx, store.companyId),
    })

    const [row] = await tx
      .update(checkouts)
      .set({
        subtotal: totals.subtotal,
        platformFee: totals.platformFee,
        platformFeeRate: totals.platformFeeRate,
        shippingCost: totals.shippingCost,
        shippingBreakdown: shipping,
        total: totals.total,
        currency: shipping.currency,
      })
      .where(eq(checkouts.id, checkoutId))
      .returning()

    if (!row) throw new Error("La compra no se escribió")

    // Y la sesión de pago, dentro de la misma transacción: si el procesador falla, no queda ni
    // compra ni unidad apartada, y el comprador puede volver a intentarlo sin que nadie limpie nada.
    if (!merchant?.externalAccountId) throw new UnprocessableError(CANNOT_CHARGE)

    const session = await storefrontProvider().createStorefrontSession({
      checkoutId,
      companyId: store.companyId,
      merchantAccountId: merchant.externalAccountId,
      currency: row.currency,
      lines: cart.lines.map((line) => ({
        name: line.name,
        unitAmount: line.unitPrice,
        quantity: line.quantity,
      })),
      shippingAmount: totals.shippingCost,
      applicationFee: totals.platformFee,
      successUrl: `${env.STOREFRONT_ORIGIN}/s/${store.slug}/compra/${checkoutId}`,
      cancelUrl: `${env.STOREFRONT_ORIGIN}/s/${store.slug}/carrito`,
      expiresAt,
      // Lo que el evento tiene que poder reconstruir: llega sin sesión de usuario y sin nada más que
      // esto. Ver `billing/events.ts`.
      metadata: {
        checkoutId,
        companyId: store.companyId,
        buyerId: actor.userId,
      },
    })

    const [saved] = await tx
      .update(checkouts)
      .set({
        externalSessionId: session.id,
        checkoutUrl: session.url,
      })
      .where(eq(checkouts.id, checkoutId))
      .returning()

    return toRecord(saved ?? row, store.slug, store.name)
  }).catch(rethrowDuplicateKey)
}

/**
 * El único parcial `(buyer_id, idempotency_key)` es la última barrera.
 *
 * La comprobación previa resuelve el caso normal —el doble clic, separado por medio segundo—, pero
 * dos peticiones **simultáneas** la atraviesan las dos: entre mirar y escribir cabe la otra. Lo que
 * no cabe es que las dos inserten, y eso lo garantiza el índice y no la aplicación. El conflicto
 * significa «ya hay una compra con esa clave», que es un `409` y no un fallo del servidor.
 */
function rethrowDuplicateKey(error: unknown): never {
  const code = (error as { code?: string }).code
  if (code === "23505") {
    throw new ConflictError("Esa clave de idempotencia ya se usó para otra compra")
  }
  throw error
}

/**
 * El resumen del cuerpo con el que se pidió la compra.
 *
 * Sobre lo que **decide qué se cobra**: la tienda, la modalidad, el domicilio y los artículos con su
 * cantidad. No sobre el JSON crudo, que cambia si el navegador reordena dos claves y convertiría un
 * reintento legítimo en un `409`.
 */
function hashOf(slug: string, input: CreateCheckoutInput): string {
  const canonical = JSON.stringify({
    slug,
    type: input.type,
    mode: input.mode,
    toAddressId: input.toAddressId ?? null,
    items: [...input.items]
      .map((item) => `${item.kind}:${item.refId}:${item.quantity}`)
      .sort((a, b) => a.localeCompare(b)),
  })

  return createHash("sha256").update(canonical).digest("hex")
}

/**
 * El domicilio de entrega, comprobando que es de quien compra.
 *
 * «Crear una sesión de pago SHALL exigir un comprador identificado y un domicilio de entrega, salvo
 * que la modalidad de envío sea recolección en tienda».
 *
 * Se lee con la sesión del comprador y no con el alcance de la tienda, que es la única forma de
 * saber que el domicilio es suyo: bajo el alcance de la empresa vendedora, un identificador ajeno
 * sencillamente no se ve, y no verlo no demuestra de quién es.
 */
async function resolveDeliveryAddress(
  actor: Actor,
  mode: ShippingMode,
  addressId: string | undefined,
): Promise<string | null> {
  if (mode === "pickup") return null

  if (!addressId) {
    throw new UnprocessableError("Indica a dónde enviamos el pedido")
  }

  const row = await withRequester(actor, async (tx) => {
    const [found] = await tx
      .select({ id: userAddresses.id })
      .from(userAddresses)
      .where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, actor.userId)))
      .limit(1)

    return found
  })

  if (!row) throw new NotFoundError("No se encontró ese domicilio")
  return row.id
}

/** El domicilio primario de la empresa: de ahí sale el paquete. Ver `addresses`. */
async function primaryAddressOf(tx: Transaction, companyId: string): Promise<string | null> {
  const [row] = await tx
    .select({ id: companyAddresses.id })
    .from(companyAddresses)
    .where(and(eq(companyAddresses.companyId, companyId), eq(companyAddresses.isPrimary, true)))
    .limit(1)

  return row?.id ?? null
}

/** El perfil con el que la empresa cobra, y la cuenta de comercio a la que se transfiere. */
async function merchantOf(
  tx: Transaction,
  companyId: string,
): Promise<{ id: string; externalAccountId: string | null } | null> {
  const [row] = await tx
    .select({ id: merchantProfiles.id, externalAccountId: merchantProfiles.externalAccountId })
    .from(merchantProfiles)
    .where(
      and(
        eq(merchantProfiles.companyId, companyId),
        eq(merchantProfiles.isPrimary, true),
        isNull(merchantProfiles.deletedAt),
      ),
    )
    .limit(1)

  return row ?? null
}

/**
 * El porcentaje de comisión de la empresa vendedora.
 *
 * «Cuando la empresa no tenga porcentaje propio, SHALL aplicarse el porcentaje por defecto de la
 * plataforma» — que es el valor por omisión de la columna, así que sin fila que leer el cálculo
 * recae en el que declara `@tfv/contracts`.
 */
async function commissionOf(tx: Transaction, companyId: string): Promise<string | undefined> {
  const [row] = await tx
    .select({ rate: companies.commissionRate })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  return row?.rate
}

function toSnapshotLine(line: CartLine): CheckoutLine {
  return {
    kind: "warehouse_measurement",
    refId: line.refId,
    name: line.name,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    total: line.total,
  }
}

// ─── Consulta y cancelación ──────────────────────────────────────────────────

/**
 * Una compra del propio comprador.
 *
 * La página de vuelta del pago la consulta para enseñar qué se compró, y por eso se lee con la
 * sesión de quien compró: `checkouts` lo concede a su comprador y a la empresa vendedora, y a nadie
 * más. Un identificador ajeno responde `404` sin decir si existe.
 */
export async function readCheckout(actor: Actor, checkoutId: string): Promise<CheckoutRecord> {
  const row = await withRequester(actor, async (tx) => loadOwn(tx, actor.userId, checkoutId))
  if (!row) throw new NotFoundError("No se encontró la compra")

  const store = await storeOf(row.companyId, row.websiteId)
  return toRecord(row, store.slug, store.name)
}

/** Las compras del comprador, de la más reciente a la más antigua. */
export async function listMyCheckouts(
  actor: Actor,
  limit = 20,
): Promise<readonly CheckoutRecord[]> {
  const rows = await withRequester(actor, async (tx) =>
    tx
      .select()
      .from(checkouts)
      .where(eq(checkouts.buyerId, actor.userId))
      .orderBy(desc(checkouts.createdAt))
      .limit(limit),
  )

  const stores = new Map<string, { slug: string; name: string }>()
  for (const row of rows) {
    if (!stores.has(row.websiteId)) {
      stores.set(row.websiteId, await storeOf(row.companyId, row.websiteId))
    }
  }

  return rows.map((row) => {
    const store = stores.get(row.websiteId)
    return toRecord(row, store?.slug ?? "", store?.name ?? "")
  })
}

/**
 * El comprador desiste: se suelta el inventario **sin esperar a la caducidad**.
 *
 * «Cancelar libera de inmediato». Lo escribe la vía de sistema con la empresa vendedora declarada
 * —la compra dejó de ser escribible por su comprador en la `0021`, y el inventario nunca lo fue—,
 * después de comprobar aquí que quien cancela es su dueño.
 *
 * Cancelar una compra ya pagada **no**: sus unidades salieron de la nave. La transición no está en
 * la tabla y la respuesta es un `409`.
 */
export async function cancelCheckout(actor: Actor, checkoutId: string): Promise<CheckoutRecord> {
  const own = await withRequester(actor, async (tx) => loadOwn(tx, actor.userId, checkoutId))
  if (!own) throw new NotFoundError("No se encontró la compra")

  if (own.status !== "pending") {
    throw new ConflictError(`Esta compra ya está ${describe(own.status)} y no se puede cancelar`)
  }

  const row = await withSystem(OPERATION, [own.companyId], async (tx) => {
    const [updated] = await tx
      .update(checkouts)
      .set({ status: "canceled" })
      .where(and(eq(checkouts.id, checkoutId), eq(checkouts.status, "pending")))
      .returning()

    // Otra vía —la caducidad, o el propio cobro— pudo llegar primero. Quien no consigue la fila no
    // suelta nada: soltar el inventario de una compra que acaba de cobrarse sería devolver a la
    // estantería lo que ya salió.
    if (!updated) throw new ConflictError("La compra cambió de estado mientras se cancelaba")

    await releaseCheckout(tx, checkoutId, actor.userId, "El comprador canceló la compra")
    return updated
  })

  const store = await storeOf(row.companyId, row.websiteId)
  return toRecord(row, store.slug, store.name)
}

function describe(status: CheckoutStatus): string {
  return status === "completed" ? "pagada" : status === "expired" ? "caducada" : "cancelada"
}

async function loadOwn(tx: Transaction, buyerId: string, checkoutId: string) {
  const [row] = await tx
    .select()
    .from(checkouts)
    .where(and(eq(checkouts.id, checkoutId), eq(checkouts.buyerId, buyerId)))
    .limit(1)

  return row
}

async function findByKey(tx: Transaction, buyerId: string, key: string) {
  const [row] = await tx
    .select()
    .from(checkouts)
    .where(and(eq(checkouts.buyerId, buyerId), eq(checkouts.idempotencyKey, key)))
    .limit(1)

  return row
}

/**
 * El nombre y el identificador legible de la tienda donde se compró.
 *
 * Van con la compra porque quien la mira compró en «Renta Norte», no en una empresa con un
 * identificador: la lista de compras de un comprador cruza tiendas, y sin el nombre no se distingue
 * una de otra.
 */
async function storeOf(
  companyId: string,
  websiteId: string,
): Promise<{ slug: string; name: string }> {
  return withSystem(`${OPERATION}.tienda`, [companyId], async (tx) => {
    const [row] = await tx
      .select({ slug: websites.slug, name: websites.name })
      .from(websites)
      .where(eq(websites.id, websiteId))
      .limit(1)

    return { slug: row?.slug ?? "", name: row?.name ?? "" }
  })
}

function toRecord(row: typeof checkouts.$inferSelect, slug: string, name: string): CheckoutRecord {
  return {
    id: row.id,
    status: row.status,
    type: row.type,
    storeSlug: slug,
    storeName: name,
    lines: row.lines,
    subtotal: row.subtotal,
    shippingCost: row.shippingCost,
    total: row.total,
    currency: row.currency,
    shippingMode: row.shippingMode,
    checkoutUrl: row.checkoutUrl,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
