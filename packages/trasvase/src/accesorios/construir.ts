/**
 * Accesorios: documentos como los que deja `mongoexport` del árbol viejo.
 *
 * Cada constructor replica los **valores por defecto del esquema de Mongoose real** (citado en
 * `modelo/colecciones.ts`): el `dial` "+52", el color "#000000" y el icono "trash" de las
 * categorías, el `alias` "client" de los clientes. No se inventa un origen ideal: se reproduce el
 * que existe, con lo que trae.
 *
 * Los identificadores son secuenciales y deterministas para que las pruebas puedan nombrar filas
 * concretas. El prefijo distingue a simple vista un identificador de accesorio de uno real.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Documento } from "../volcado/ejson.ts"

let contador = 0

/** Un ObjectId determinista: 24 hexadecimales, secuencial. */
export function oid(): string {
  contador += 1
  return `acce50000000${contador.toString(16).padStart(12, "0")}`
}

export function reiniciarOids(): void {
  contador = 0
}

/** Marca un `Decimal128`: en la exportación sale como `$numberDecimal`. */
export class Decimal {
  constructor(readonly valor: string) {}
}

export const decimal = (valor: string): Decimal => new Decimal(valor)

/** La fecha base de los accesorios; los constructores la separan un poco entre sí. */
const ORIGEN = new Date("2024-01-15T10:00:00.000Z")

function marcas(sobre: Documento): Documento {
  contador += 1
  const creado = new Date(ORIGEN.getTime() + contador * 60_000)
  return {
    createdAt: creado,
    updatedAt: creado,
    ...sobre,
  }
}

const OID_HEX = /^[0-9a-f]{24}$/

/** Envuelve un valor de JavaScript en el JSON extendido que escribe `mongoexport`. */
function envolver(valor: unknown): unknown {
  if (valor instanceof Date) return { $date: valor.toISOString() }
  if (valor instanceof Decimal) return { $numberDecimal: valor.valor }
  if (typeof valor === "string" && OID_HEX.test(valor)) return { $oid: valor }
  if (Array.isArray(valor)) return valor.map(envolver)
  if (valor !== null && typeof valor === "object") {
    const resultado: Documento = {}
    for (const [clave, interno] of Object.entries(valor)) {
      if (interno === undefined) continue
      resultado[clave] = envolver(interno)
    }
    return resultado
  }
  return valor
}

/** Escribe el volcado: una colección por archivo, un documento por línea. */
export function escribirVolcado(directorio: string, colecciones: Record<string, Documento[]>): void {
  mkdirSync(directorio, { recursive: true })
  for (const [nombre, documentos] of Object.entries(colecciones)) {
    const lineas = documentos.map((documento) => JSON.stringify(envolver(documento)))
    writeFileSync(join(directorio, `${nombre}.json`), `${lineas.join("\n")}\n`)
  }
}

// ─── Núcleo ──────────────────────────────────────────────────────────────────

/** `core_user`. El `password` trae la forma de bcrypt con coste 10, como `utils/hash.ts`. */
export function usuario(sobre: Documento = {}): Documento {
  const n = contador + 1
  return marcas({
    _id: oid(),
    username: `persona${n}_ab${n}c`,
    name: "",
    lastname: "",
    dial: "+52",
    phone: "",
    imageId: oid(),
    admin: false,
    email: `persona${n}@ejemplo.mx`,
    password: "$2a$10$abcdefghijklmnopqrstuvXYZabcdefghijklmnopqrstuvXYZabc",
    active: true,
    // `DEFECTS.md` S-15: el alta forzaba `valid: true`; en el volcado real casi todas vienen así.
    valid: true,
    token: "",
    lastLogin: null,
    ...sobre,
  })
}

/** `core_companies`. `priority` es `Decimal128` de verdad en el origen. */
export function empresa(sobre: Documento = {}): Documento {
  return marcas({
    _id: oid(),
    name: "Empresa de ensayo",
    description: "Descripción de ensayo",
    email: "contacto@ejemplo.mx",
    fee: 12.5,
    imageId: oid(),
    priority: decimal("0"),
    ownerId: oid(),
    companyAddressesIds: [],
    companyServicesIds: [],
    sectorsIds: [],
    ...sobre,
  })
}

/** `core_companies_user`. Sin restricción única en el origen: los duplicados son posibles. */
export function membresia(sobre: Documento = {}): Documento {
  return marcas({
    _id: oid(),
    isOwner: false,
    isActive: true,
    companyId: oid(),
    userId: oid(),
    ...sobre,
  })
}

/** `core_role`. `permissions` es un objeto de claves a booleanos en el origen. */
export function rol(sobre: Documento = {}): Documento {
  return marcas({
    _id: oid(),
    name: "Rol de ensayo",
    permissions: {},
    companyId: oid(),
    ...sobre,
  })
}

/** `core_addresses`. Las coordenadas por defecto del esquema viejo son el Zócalo. */
export function direccionUsuario(sobre: Documento = {}): Documento {
  return marcas({
    _id: oid(),
    isPrimary: false,
    userId: oid(),
    name: "",
    latitude: 19.4326077,
    longitude: -99.13320799999997,
    zipcode: "",
    country: "",
    countryCode: "",
    state: "",
    city: "",
    colony: "",
    street: "",
    number: "",
    ...sobre,
  })
}

/** `core_companies_address`. */
export function direccionEmpresa(sobre: Documento = {}): Documento {
  return marcas({
    _id: oid(),
    isPrimary: false,
    companyId: oid(),
    name: "",
    latitude: 19.4326077,
    longitude: -99.13320799999997,
    zipcode: "",
    country: "",
    countryCode: "",
    state: "",
    city: "",
    colony: "",
    street: "",
    number: "",
    ...sobre,
  })
}

/** `core_client`. */
export function cliente(sobre: Documento = {}): Documento {
  return marcas({
    _id: oid(),
    alias: "client",
    companyId: oid(),
    userInfo: {},
    userCompanyInfo: {},
    userAddressInfo: {},
    ...sobre,
  })
}

/** `core_provider`. */
export function proveedor(sobre: Documento = {}): Documento {
  return marcas({
    _id: oid(),
    alias: "provider",
    companyId: oid(),
    userInfo: {},
    userCompanyInfo: {},
    userAddressInfo: {},
    ...sobre,
  })
}

/** `core_categories`. `childsIds` está desnormalizado en el origen; el destino lo ignora. */
export function categoria(sobre: Documento = {}): Documento {
  const n = contador + 1
  return marcas({
    _id: oid(),
    name: `Categoría ${n}`,
    description: "",
    color: "#000000",
    icon: "trash",
    slug: `categoria-${n}`,
    childsIds: [],
    ...sobre,
  })
}

/** `core_service`. */
export function servicio(sobre: Documento = {}): Documento {
  const n = contador + 1
  return marcas({
    _id: oid(),
    name: `Servicio ${n}`,
    description: "",
    disabled: false,
    keycode: `servicio-${n}`,
    color: "#123456",
    icon: "trash",
    imageId: oid(),
    admin: false,
    landing: false,
    ...sobre,
  })
}

/** `core_companies_service`. */
export function habilitacion(sobre: Documento = {}): Documento {
  return marcas({
    _id: oid(),
    companyId: oid(),
    serviceId: oid(),
    ...sobre,
  })
}

// ─── Archivos ────────────────────────────────────────────────────────────────

/** `core_upload`. */
export function subida(sobre: Documento = {}): Documento {
  const n = contador + 1
  return marcas({
    _id: oid(),
    url: `https://storage.googleapis.com/tfv-viejo/archivo-${n}.png`,
    quality: { thumbnail: null, small: null, medium: null, large: null },
    status: "uploaded",
    metaId: oid(),
    type: "IMAGE",
    default: false,
    ...sobre,
  })
}

/** `core_meta`. */
export function meta(sobre: Documento = {}): Documento {
  const n = contador + 1
  return marcas({
    _id: oid(),
    name: `archivo-${n}`,
    fileName: `archivo-${n}.png`,
    ext: "png",
    contentType: "image/png",
    size: 2048,
    path: `uploads/archivo-${n}.png`,
    ...sobre,
  })
}

// ─── Suscripciones y facturación ─────────────────────────────────────────────

/** `core_subscription`: el catálogo de planes. Los `features` traen `_id` de subdocumento. */
export function plan(sobre: Documento = {}): Documento {
  return marcas({
    _id: oid(),
    tier: 1,
    title: "Plan de ensayo",
    description: "Un plan",
    individual: false,
    recommended: false,
    features: [],
    productId: `prod_${contador + 1}`,
    ...sobre,
  })
}

/** `core_companies_subscription`. */
export function suscripcion(sobre: Documento = {}): Documento {
  const n = contador + 1
  return marcas({
    _id: oid(),
    companyId: oid(),
    userId: oid(),
    subscriptionId: oid(),
    status: "active",
    cancel_at_period_end: false,
    stripe_subscriptionId: `sub_${n}`,
    stripe_customerId: `cus_${n}`,
    stripe_priceId: `price_${n}`,
    stripe_productId: `prod_${n}`,
    quantity: 1,
    interval: "month",
    intervalCount: 1,
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-08-01T00:00:00.000Z"),
    ...sobre,
  })
}

/**
 * `core_companies_subscriptions_payment`.
 *
 * El `amount` está en **centavos**: el manejador del webhook guardaba `invoice.amount_paid` tal
 * cual, en la unidad menor de Stripe (`core/stripe/events.ts`, línea 64 del árbol viejo).
 */
export function pagoSuscripcion(sobre: Documento = {}): Documento {
  const n = contador + 1
  return marcas({
    _id: oid(),
    companyId: oid(),
    companySubscriptionId: oid(),
    stripe_subscriptionId: `sub_${n}`,
    stripe_invoiceId: `in_${n}`,
    stripe_customerId: `cus_${n}`,
    stripe_paymentIntentId: `pi_${n}`,
    amount: 49900,
    currency: "mxn",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-08-01T00:00:00.000Z"),
    quantity: 1,
    status: "paid",
    ...sobre,
  })
}
