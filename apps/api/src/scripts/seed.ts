/**
 * Siembra de desarrollo.
 *
 * Deja la base local en un estado que se puede mirar: el catálogo de los cinco servicios, dos
 * empresas con habilitaciones **distintas**, y cuatro cuentas con papeles distintos.
 *
 * Todo lo que difiere aquí, difiere a propósito. Las habilitaciones, porque `app-shell` exige que
 * la navegación muestre sólo lo contratado y que cambiar de empresa lleve a la pantalla equivalente
 * «cuando exista, o a su portada cuando no» — con dos empresas idénticas ninguna de las dos reglas
 * se puede ver fallar. Y los papeles, porque las cuatro vías por las que se concede o se niega
 * —administración de plataforma, propiedad, rol acotado y ninguna membresía— sólo se distinguen si
 * hay una cuenta de cada.
 *
 * Es idempotente: se puede correr sobre una base ya sembrada sin duplicar nada.
 *
 * **Sólo para desarrollo.** Las contraseñas son públicas y están escritas aquí abajo; el guion se
 * niega a correr con `NODE_ENV=production`.
 */

import { newId, PERMISSION_KEYS, type PermissionKey } from "@tfv/contracts"
import { db } from "@tfv/db"
import {
  companies,
  companyAddresses,
  companyMembers,
  companyServices,
  counterparties,
  roles,
  services,
  users,
  warehouseCategories,
  warehouseMeasurements,
  warehousePriceLists,
  warehouseProductPrices,
  warehouseProducts,
  warehouseQuoteLines,
  warehouseQuotes,
  warehouseStockEvents,
  warehouseStockReservations,
  warehouseStockUnits,
  warehouseStorages,
  warehouses,
} from "@tfv/db/schema"
import { and, count, eq, inArray, isNull } from "drizzle-orm"
import { hashPassword } from "../auth/password.ts"
import { env } from "../env.ts"

if (env.NODE_ENV === "production") {
  throw new Error("La siembra no se ejecuta en producción: sus contraseñas son públicas.")
}

/** Contraseña única para todas las cuentas de prueba. No es un secreto y no pretende serlo. */
const PASSWORD = "Desarrollo.2026"

const CATALOG = [
  { keycode: "warehouses", name: "Almacenes", icon: "warehouse", color: "#25b1f2" },
  { keycode: "productions", name: "Producciones", icon: "clapperboard", color: "#e73070" },
  { keycode: "pixit", name: "Pixit", icon: "grid", color: "#ffd038" },
  { keycode: "websites", name: "Sitios", icon: "globe", color: "#20c997" },
  { keycode: "locations", name: "Locaciones", icon: "map-pin", color: "#ff922b" },
] as const

const COMPANIES = [
  {
    name: "Renta Fílmica del Norte",
    description: "Casa de renta de equipo. Almacén, sitio público y locaciones.",
    services: ["warehouses", "websites", "locations"],
  },
  {
    name: "Estudios Mariposa",
    description: "Productora. Rodajes, compras a almacenes y mosaicos.",
    services: ["productions", "pixit"],
  },
] as const

const ACCOUNTS = [
  {
    email: "admin@tfv.dev",
    name: "Ale",
    lastname: "Plataforma",
    username: "ale-plataforma",
    isPlatformAdmin: true,
    /** En las dos empresas, para poder ejercer el cambio de empresa. */
    memberships: [
      { company: "Renta Fílmica del Norte", isOwner: true },
      { company: "Estudios Mariposa", isOwner: true },
    ],
  },
  {
    email: "duena@tfv.dev",
    name: "Rosa",
    lastname: "Iturbide",
    username: "rosa-iturbide",
    isPlatformAdmin: false,
    /** Una sola empresa: no debe ver el selector con opciones. */
    memberships: [{ company: "Renta Fílmica del Norte", isOwner: true }],
  },
  {
    email: "almacenista@tfv.dev",
    name: "Beto",
    lastname: "Ramos",
    username: "beto-ramos",
    isPlatformAdmin: false,
    /**
     * Rol acotado, no propietario. Es la cuenta con la que se ve que los permisos hacen algo:
     * de las 255 claves recibe cinco, y todo lo demás le responde `403`.
     */
    memberships: [{ company: "Renta Fílmica del Norte", isOwner: false, role: "Almacén" }],
  },
  {
    email: "compradora@tfv.dev",
    name: "Nadia",
    lastname: "Cruz",
    username: "nadia-cruz",
    isPlatformAdmin: false,
    /** Sin membresías: es el caso del padrón único, quien compra en una tienda pública. */
    memberships: [],
  },
] as const

/**
 * Los roles que la siembra crea, con sus permisos.
 *
 * `Equipo` va vacío a propósito: es el caso de «un rol sin permisos no puede escribir», y sin una
 * cuenta que lo tenga sólo se comprueba en las pruebas.
 */
const ROLES: Record<string, readonly PermissionKey[]> = {
  Equipo: [],
  Almacén: [
    "warehouses.warehouses.view",
    "warehouses.products.view",
    "warehouses.products.create",
    "warehouses.products.edit_info",
    "companies.users.view",
  ],
  Ventas: [
    "companies.clients.view",
    "companies.clients.create",
    "companies.clients.edit",
    "companies.users.view",
    "warehouses.products.view",
  ],
  Compras: [
    "companies.providers.view",
    "companies.providers.create",
    "companies.providers.edit",
    "companies.addresses.view",
  ],
  Administración: [
    "companies.companies.view",
    "companies.companies.edit",
    "companies.users.view",
    "companies.roles.view",
    "companies.addresses.view",
    "companies.addresses.create",
  ],
  Contabilidad: ["companies.billings.view", "companies.companies.view"],
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD)

  const serviceIds = await seedCatalog()
  const companyIds = await seedCompanies(serviceIds)
  await seedAccounts(passwordHash, companyIds)
  const volume = await seedVolume(passwordHash, companyIds)

  report(companyIds, volume)
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

async function seedCatalog(): Promise<Map<string, string>> {
  const ids = new Map<string, string>()

  for (const entry of CATALOG) {
    const [existing] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.keycode, entry.keycode))
      .limit(1)

    if (existing) {
      ids.set(entry.keycode, existing.id)
      continue
    }

    const id = newId()
    await db.insert(services).values({
      id,
      keycode: entry.keycode,
      name: entry.name,
      icon: entry.icon,
      color: entry.color,
      isOnLanding: true,
    })
    ids.set(entry.keycode, id)
  }

  return ids
}

// ─── Empresas ────────────────────────────────────────────────────────────────

async function seedCompanies(serviceIds: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>()

  for (const entry of COMPANIES) {
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.name, entry.name), isNull(companies.deletedAt)))
      .limit(1)

    const companyId = existing?.id ?? newId()

    if (!existing) {
      await db.insert(companies).values({
        id: companyId,
        name: entry.name,
        description: entry.description,
      })
    }

    // Los roles se reescriben en cada siembra aunque la empresa ya exista: así, cambiar un permiso
    // en esta lista se refleja al volver a sembrar y no queda pegado al primer arranque.
    for (const [name, permissions] of Object.entries(ROLES)) {
      const [role] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.companyId, companyId), eq(roles.name, name)))
        .limit(1)

      if (role) {
        await db
          .update(roles)
          .set({ permissions: [...permissions] })
          .where(eq(roles.id, role.id))
      } else {
        await db
          .insert(roles)
          .values({ id: newId(), companyId, name, permissions: [...permissions] })
      }
    }

    for (const keycode of entry.services) {
      const serviceId = serviceIds.get(keycode)
      if (!serviceId) continue

      await db
        .insert(companyServices)
        .values({ id: newId(), companyId, serviceId })
        .onConflictDoNothing()
    }

    ids.set(entry.name, companyId)
  }

  return ids
}

// ─── Cuentas ─────────────────────────────────────────────────────────────────

async function seedAccounts(passwordHash: string, companyIds: Map<string, string>): Promise<void> {
  for (const entry of ACCOUNTS) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, entry.email), isNull(users.deletedAt)))
      .limit(1)

    const userId = existing?.id ?? newId()

    if (existing) {
      // Se reasigna la contraseña para que la siembra sirva también de reinicio.
      await db
        .update(users)
        .set({ passwordHash, emailVerifiedAt: new Date(), isActive: true })
        .where(eq(users.id, userId))
    } else {
      await db.insert(users).values({
        id: userId,
        email: entry.email,
        username: entry.username,
        name: entry.name,
        lastname: entry.lastname,
        passwordHash,
        // Verificadas: la siembra existe para poder entrar, y el enlace no se envía en local.
        emailVerifiedAt: new Date(),
        isPlatformAdmin: entry.isPlatformAdmin,
      })
    }

    for (const membership of entry.memberships) {
      const companyId = companyIds.get(membership.company)
      if (!companyId) continue

      const roleName = "role" in membership ? membership.role : undefined
      const roleId = roleName ? await findRole(companyId, roleName) : null

      // Se reasigna en cada siembra, no sólo al crear: cambiar el papel de una cuenta en esta
      // lista tiene que notarse al volver a sembrar.
      await db
        .insert(companyMembers)
        .values({ id: newId(), companyId, userId, roleId, isOwner: membership.isOwner })
        .onConflictDoUpdate({
          target: [companyMembers.companyId, companyMembers.userId],
          set: { roleId, isOwner: membership.isOwner, isActive: true },
        })
    }
  }
}

// ─── Volumen ─────────────────────────────────────────────────────────────────

/**
 * Gente y contrapartes suficientes para que una colección **se comporte como una colección**.
 *
 * Con cuatro cuentas y cero clientes, la búsqueda siempre encuentra, los filtros siempre dejan
 * todo, y la paginación no aparece nunca. Las tres cosas se ven funcionar sólo cuando hay más
 * elementos que los que caben en una página, así que aquí hay de sobra.
 *
 * Los nombres llevan acentos **a propósito**: es lo que hace visible que buscar «nunez» encuentre a
 * Núñez. Sin un solo acento en la base, la normalización de la búsqueda parecería funcionar
 * estuviera puesta o no.
 */
const FIRST_NAMES = [
  "Álvaro",
  "Beatriz",
  "César",
  "Dolores",
  "Elías",
  "Fátima",
  "Gerardo",
  "Helena",
  "Inés",
  "Joaquín",
  "Karla",
  "Lucía",
  "Martín",
  "Nuria",
  "Óscar",
  "Paloma",
  "Ramón",
  "Rocío",
  "Sergio",
  "Tomás",
  "Ulises",
  "Verónica",
  "Ximena",
  "Yolanda",
  "Zoé",
  "Andrés",
  "Bárbara",
  "Camila",
  "Diego",
  "Emilio",
  "Fernanda",
  "Guillermo",
] as const

const LAST_NAMES = [
  "Aguirre",
  "Beltrán",
  "Cárdenas",
  "Domínguez",
  "Escobar",
  "Fuentes",
  "Gálvez",
  "Herrera",
  "Ibáñez",
  "Jiménez",
  "Lozano",
  "Maldonado",
  "Núñez",
  "Ordóñez",
  "Peña",
  "Quintero",
  "Ríos",
  "Salazar",
  "Treviño",
  "Urbina",
  "Vázquez",
  "Wong",
  "Ximénez",
  "Ybarra",
  "Zúñiga",
  "Ávila",
] as const

const TRADE_PREFIXES = [
  "Producciones",
  "Rentas",
  "Estudios",
  "Foto",
  "Cine",
  "Servicios",
  "Grupo",
  "Taller",
] as const

const CITIES = [
  ["Monterrey", "Nuevo León"],
  ["Ciudad de México", "Ciudad de México"],
  ["Guadalajara", "Jalisco"],
  ["Mérida", "Yucatán"],
  ["Querétaro", "Querétaro"],
  ["Culiacán", "Sinaloa"],
] as const

/** Cuántos de cada cosa. Por encima de una página de 24 en todos los casos, que es el punto. */
const VOLUME = {
  teammates: 36,
  clients: 140,
  providers: 60,
  addresses: 28,
} as const

interface VolumeReport {
  readonly teammates: number
  readonly clients: number
  readonly providers: number
  readonly addresses: number
  readonly products: number
  readonly units: number
  readonly quotes: number
}

/**
 * El par (nombre, apellido) de la persona número `index`.
 *
 * Los dos ciclos tienen longitudes coprimas —32 y 26—, así que el par no se repite hasta la persona
 * 416. Es lo que hace que el correo derivado del nombre sea único sin tener que numerarlo, y lo que
 * mantiene la siembra idempotente: la misma persona sale siempre con el mismo correo.
 */
function personAt(index: number): { first: string; last: string } {
  return {
    first: FIRST_NAMES[index % FIRST_NAMES.length] as string,
    last: LAST_NAMES[index % LAST_NAMES.length] as string,
  }
}

/** Sin acentos y en minúsculas, para lo que tiene que ser mecanografiable. */
function plain(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

async function seedVolume(
  passwordHash: string,
  companyIds: Map<string, string>,
): Promise<VolumeReport> {
  const primary = companyIds.get("Renta Fílmica del Norte")
  const secondary = companyIds.get("Estudios Mariposa")
  if (!primary || !secondary) {
    return {
      teammates: 0,
      clients: 0,
      providers: 0,
      addresses: 0,
      products: 0,
      units: 0,
      quotes: 0,
    }
  }

  const teammates = await seedTeammates(passwordHash, primary)
  const clients = await seedCounterparties(primary, "client", VOLUME.clients, 0)
  const providers = await seedCounterparties(primary, "provider", VOLUME.providers, 500)
  // La segunda empresa también necesita cartera: si sólo una tiene datos, cambiar de empresa
  // parecería romper el listado en lugar de cambiar de alcance.
  await seedCounterparties(secondary, "client", 40, 900)
  const addresses = await seedAddresses(primary)
  const catalog = await seedCatalogFor(primary)
  const quotes = await seedQuotes(primary)

  return { teammates, clients, providers, addresses, ...catalog, quotes }
}

// ─── Almacén con catálogo ────────────────────────────────────────────────────

/**
 * Un almacén con su nave, su taxonomía y su catálogo.
 *
 * Los tipos de ubicación se mezclan a propósito —pisos, racks, estantes y cajas— porque el árbol
 * sólo se ve funcionar cuando tiene profundidad: con una lista plana de cajas, el código
 * autogenerado, el camino a la raíz y la eliminación recursiva se comportan igual estén bien o mal.
 */
const CATEGORIES = [
  { name: "Cámaras", children: ["Cuerpos", "Ópticas", "Monitores"] },
  { name: "Iluminación", children: ["LED", "Tungsteno", "Accesorios de luz"] },
  { name: "Grip", children: ["Tripiés", "Dollies"] },
  { name: "Vestuario", children: ["Época", "Contemporáneo"] },
] as const

const GEAR = [
  "Cámara Sony FX6",
  "Cámara RED Komodo",
  "Lente Zeiss 50mm",
  "Lente Sigma 18-35",
  "Monitor Atomos Ninja",
  "Panel Aputure 300x",
  "Fresnel Arri 650",
  "Kino Flo 4Bank",
  "Tripié Sachtler",
  "Dolly Dana",
  "Grúa Jimmy Jib",
  "Estabilizador Ronin",
  "Micrófono Sennheiser",
  "Grabadora Zoom F8",
  "Claqueta digital",
  "Slider Rhino",
  "Batería V-Mount",
  "Cargador cuádruple",
  "Difusor Chimera",
  "Bandera 4x4",
  "Rebotador 8x8",
  "Traje de época 1920",
  "Vestido de gala",
  "Uniforme militar",
] as const

async function seedCatalogFor(companyId: string): Promise<{ products: number; units: number }> {
  const [existing] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.companyId, companyId), isNull(warehouses.deletedAt)))
    .limit(1)

  const warehouseId = existing?.id ?? newId()

  if (!existing) {
    await db.insert(warehouses).values({
      id: warehouseId,
      companyId,
      name: "Nave Monterrey",
      description: "El almacén principal. Equipo de cámara, iluminación, grip y vestuario.",
      slug: "nave-monterrey",
      isPublished: true,
      priority: "10",
    })
  }

  const storageIds = await seedStorages(warehouseId)
  const categoryIds = await seedWarehouseCategories(warehouseId)

  const [already] = await db
    .select({ value: count() })
    .from(warehouseProducts)
    .where(eq(warehouseProducts.warehouseId, warehouseId))

  if ((already?.value ?? 0) > 0) {
    const [units] = await db.select({ value: count() }).from(warehouseStockUnits)
    return { products: already?.value ?? 0, units: units?.value ?? 0 }
  }

  let units = 0

  for (const [index, name] of GEAR.entries()) {
    const productId = newId()
    await db.insert(warehouseProducts).values({
      id: productId,
      warehouseId,
      name,
      description: `${name}. Equipo de la nave, disponible para renta.`,
      code: labelCode(),
      slug: `${plain(name)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`,
      cost: String((index + 1) * 1500),
      price: String((index + 1) * 350),
      availableForRent: true,
      availableForSale: index % 4 === 0,
      isPublished: index % 3 !== 0,
      storageId: storageIds[index % storageIds.length] ?? null,
      categoryId: categoryIds[index % categoryIds.length] ?? null,
      responsibleId: null,
    })

    // Dos medidas por producto, con existencias distintas: la disponibilidad por medida sólo se
    // ve funcionar cuando las medidas no tienen el mismo número.
    for (const [suffix, quantity] of [
      ["Cuerpo", 2 + (index % 4)],
      ["Kit completo", 1 + (index % 3)],
    ] as const) {
      const measurementId = newId()
      await db.insert(warehouseMeasurements).values({
        id: measurementId,
        productId,
        name: suffix,
        dimensions: { height: 20 + index, width: 30, length: 40, weight: 2000 + index * 100 },
      })

      await db.insert(warehouseStockUnits).values(
        Array.from({ length: quantity }, () => ({
          id: newId(),
          measurementId,
          code: labelCode(),
        })),
      )
      units += quantity
    }
  }

  return { products: GEAR.length, units }
}

// ─── Cotizaciones ────────────────────────────────────────────────────────────

/**
 * Cuatro cotizaciones en cuatro estados distintos.
 *
 * Los estados difieren a propósito, como todo lo demás de esta siembra: la bandeja ordena por
 * prioridad derivada del estado, y con cuatro cotizaciones pendientes ese orden se comportaría
 * igual estuviera bien o mal. Y el inventario tiene que verse **proyectado**: en cotización lo
 * apartado, rentado lo que salió.
 *
 * Todas nacen abiertas. Una cerrada tendría que llevar su desglose congelado, y congelarlo aquí a
 * mano sería reimplementar la transición: para verlo, se cierra desde la aplicación.
 */
const QUOTES = [
  { name: "Rodaje Serie Norte · bloque 1", status: "in_rent", lines: 3, days: 14 },
  { name: "Comercial Cervecería", status: "in_progress", lines: 2, days: 7 },
  { name: "Cortometraje Estudiantil", status: "pending", lines: 1, days: 21 },
  { name: "Documental Sierra · presupuesto", status: "pre_quote", lines: 2, days: 30 },
] as const

async function seedQuotes(companyId: string): Promise<number> {
  const [warehouse] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.companyId, companyId), isNull(warehouses.deletedAt)))
    .limit(1)

  if (!warehouse) return 0

  const [already] = await db
    .select({ value: count() })
    .from(warehouseQuotes)
    .where(eq(warehouseQuotes.warehouseId, warehouse.id))

  if ((already?.value ?? 0) > 0) return already?.value ?? 0

  const priceListId = await seedPriceList(warehouse.id)
  const clients = await db
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(and(eq(counterparties.companyId, companyId), eq(counterparties.role, "client")))
    .limit(QUOTES.length)

  const [owner] = await db
    .select({ id: companyMembers.userId })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.isOwner, true)))
    .limit(1)

  for (const [index, spec] of QUOTES.entries()) {
    const starts = new Date(Date.UTC(2026, 8, 1 + index * 3))
    const ends = new Date(starts.getTime() + spec.days * 86_400_000)
    const quoteId = newId()

    await db.insert(warehouseQuotes).values({
      id: quoteId,
      warehouseId: warehouse.id,
      clientId: clients[index]?.id ?? null,
      responsibleId: owner?.id ?? null,
      code: labelCode(),
      folio: `COT-${String(index + 1).padStart(4, "0")}`,
      name: spec.name,
      description: "Sembrada para desarrollo.",
      type: "rent",
      status: spec.status,
      startsOn: starts,
      endsOn: ends,
      clientContacts: [{ name: "Ana Villarreal", phone: "8112345678", position: "Productora" }],
      sellerContacts: [{ name: "Luis Cantú", position: "Ventas" }],
      taxes: { version: 1, iva: { enabled: true, rate: "16", type: "trasladado" } },
      paymentTerms: { version: 1, transferFeeRate: "3" },
    })

    await seedQuoteLines(quoteId, warehouse.id, priceListId, spec.lines, spec.status)
  }

  return QUOTES.length
}

/** Una lista de precios con tarifa para todo el catálogo: sin ella, los importes salen a cero. */
async function seedPriceList(warehouseId: string): Promise<string> {
  const [existing] = await db
    .select({ id: warehousePriceLists.id })
    .from(warehousePriceLists)
    .where(eq(warehousePriceLists.warehouseId, warehouseId))
    .limit(1)

  if (existing) return existing.id

  const priceListId = newId()
  await db.insert(warehousePriceLists).values({
    id: priceListId,
    warehouseId,
    name: "Tarifas 2026",
    description: "Renta por día, semana y mes; venta al precio de catálogo.",
  })

  const products = await db
    .select({ id: warehouseProducts.id, price: warehouseProducts.price })
    .from(warehouseProducts)
    .where(eq(warehouseProducts.warehouseId, warehouseId))

  if (products.length > 0) {
    await db.insert(warehouseProductPrices).values(
      products.map((product) => {
        const base = Number(product.price)
        return {
          id: newId(),
          priceListId,
          productId: product.id,
          sale: product.price,
          // Las tres periodicidades, no sólo la semanal: sin tarifa para la frecuencia elegida el
          // motor cobra el precio base, y una lista a medias hace que eso parezca un defecto de la
          // pantalla en lugar de una lista sin rellenar.
          rent: {
            isFixed: false,
            daily: (base / 40).toFixed(2),
            weekly: (base / 10).toFixed(2),
            monthly: (base / 3).toFixed(2),
          },
          penalty: { isFixed: true, fixed: (base * 2).toFixed(2) },
        }
      }),
    )
  }

  return priceListId
}

/**
 * Las líneas y su equipo apartado, con el estado que proyecta la cotización.
 *
 * El vínculo se **libera** cuando la proyección lo suelta —una venta cerrada o una cancelación—;
 * aquí todas las cotizaciones están abiertas o en renta, así que todas lo conservan. Mantenerlo
 * coherente importa: la verificación de coherencia recorre este mismo inventario.
 */
async function seedQuoteLines(
  quoteId: string,
  warehouseId: string,
  priceListId: string,
  howMany: number,
  status: (typeof QUOTES)[number]["status"],
): Promise<void> {
  const candidates = await db
    .select({
      measurementId: warehouseMeasurements.id,
      productId: warehouseProducts.id,
    })
    .from(warehouseMeasurements)
    .innerJoin(warehouseProducts, eq(warehouseProducts.id, warehouseMeasurements.productId))
    .where(eq(warehouseProducts.warehouseId, warehouseId))
    .limit(200)

  const projected = status === "in_rent" ? ("rented" as const) : ("in_quote" as const)
  let taken = 0

  for (const candidate of candidates) {
    if (taken >= howMany) break

    const free = await db
      .select({ id: warehouseStockUnits.id })
      .from(warehouseStockUnits)
      .where(
        and(
          eq(warehouseStockUnits.measurementId, candidate.measurementId),
          eq(warehouseStockUnits.status, "available"),
          isNull(warehouseStockUnits.deletedAt),
        ),
      )
      .limit(2)

    if (free.length === 0) continue

    const [price] = await db
      .select({ id: warehouseProductPrices.id })
      .from(warehouseProductPrices)
      .where(
        and(
          eq(warehouseProductPrices.priceListId, priceListId),
          eq(warehouseProductPrices.productId, candidate.productId),
        ),
      )
      .limit(1)

    const lineId = newId()
    await db.insert(warehouseQuoteLines).values({
      id: lineId,
      quoteId,
      measurementId: candidate.measurementId,
      productPriceId: price?.id ?? null,
      frequency: "weekly",
      position: taken,
      positionProduct: taken,
    })

    const unitIds = free.map((row) => row.id)
    await db.insert(warehouseStockReservations).values(
      unitIds.map((stockUnitId) => ({
        id: newId(),
        stockUnitId,
        quoteLineId: lineId,
        quoteId,
      })),
    )
    await db
      .update(warehouseStockUnits)
      .set({ status: projected })
      .where(inArray(warehouseStockUnits.id, unitIds))
    await db.insert(warehouseStockEvents).values(
      unitIds.map((stockUnitId) => ({
        id: newId(),
        stockUnitId,
        fromStatus: "available" as const,
        toStatus: projected,
        reason: "quote_reservation" as const,
        causeId: quoteId,
      })),
    )

    taken += 1
  }
}

async function seedStorages(warehouseId: string): Promise<string[]> {
  const existing = await db
    .select({ id: warehouseStorages.id })
    .from(warehouseStorages)
    .where(eq(warehouseStorages.warehouseId, warehouseId))

  if (existing.length > 0) return existing.map((row) => row.id)

  const ids: string[] = []
  let boxes = 0

  for (const [floorIndex, floorName] of ["Planta baja", "Entrepiso"].entries()) {
    const floorId = newId()
    await db.insert(warehouseStorages).values({
      id: floorId,
      warehouseId,
      kind: "floor",
      code: `FLR${floorIndex + 1}`,
      name: floorName,
    })

    for (let rackIndex = 0; rackIndex < 3; rackIndex++) {
      const rackId = newId()
      await db.insert(warehouseStorages).values({
        id: rackId,
        warehouseId,
        parentId: floorId,
        kind: "rack",
        code: `RCK${floorIndex * 3 + rackIndex + 1}`,
        name: `Rack ${floorIndex * 3 + rackIndex + 1}`,
      })

      for (let boxIndex = 0; boxIndex < 2; boxIndex++) {
        boxes += 1
        const boxId = newId()
        await db.insert(warehouseStorages).values({
          id: boxId,
          warehouseId,
          parentId: rackId,
          kind: "box",
          code: `BOX${boxes}`,
          name: `Caja ${boxes}`,
        })
        ids.push(boxId)
      }
    }
  }

  return ids
}

async function seedWarehouseCategories(warehouseId: string): Promise<string[]> {
  const existing = await db
    .select({ id: warehouseCategories.id })
    .from(warehouseCategories)
    .where(eq(warehouseCategories.warehouseId, warehouseId))

  if (existing.length > 0) return existing.map((row) => row.id)

  const leaves: string[] = []

  for (const entry of CATEGORIES) {
    const parentId = newId()
    await db.insert(warehouseCategories).values({
      id: parentId,
      warehouseId,
      name: entry.name,
      slug: plain(entry.name),
    })

    for (const child of entry.children) {
      const childId = newId()
      await db.insert(warehouseCategories).values({
        id: childId,
        warehouseId,
        parentId,
        name: child,
        slug: plain(child).replace(/[^a-z0-9]+/g, "-"),
      })
      leaves.push(childId)
    }
  }

  return leaves
}

/** Mismo alfabeto que el catálogo: sin caracteres que se confundan en una etiqueta impresa. */
const LABEL_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function labelCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => LABEL_ALPHABET[byte % LABEL_ALPHABET.length]).join("")
}

async function seedTeammates(passwordHash: string, companyId: string): Promise<number> {
  const roleIds = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(eq(roles.companyId, companyId))

  const wanted = Array.from({ length: VOLUME.teammates }, (_, index) => {
    const { first, last } = personAt(index)
    return {
      index,
      first,
      last,
      email: `${plain(first)}.${plain(last)}@tfv.dev`,
      username: `${plain(first)}-${plain(last)}`,
    }
  })

  const existing = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      inArray(
        users.email,
        wanted.map((person) => person.email),
      ),
    )
  const byEmail = new Map(existing.map((row) => [row.email, row.id]))

  const missing = wanted.filter((person) => !byEmail.has(person.email))
  if (missing.length > 0) {
    await db.insert(users).values(
      missing.map((person) => ({
        id: newId(),
        email: person.email,
        username: person.username,
        name: person.first,
        lastname: person.last,
        passwordHash,
        emailVerifiedAt: new Date(),
      })),
    )

    const inserted = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        inArray(
          users.email,
          missing.map((person) => person.email),
        ),
      )
    for (const row of inserted) byEmail.set(row.email, row.id)
  }

  for (const person of wanted) {
    const userId = byEmail.get(person.email)
    if (!userId) continue

    // Uno de cada cinco se queda sin rol y uno de cada siete inactivo: son los dos filtros de la
    // pantalla, y sin nadie en el caso contrario un filtro que no filtre nada parece funcionar.
    const roleId =
      person.index % 5 === 0 ? null : (roleIds[person.index % roleIds.length]?.id ?? null)
    const isActive = person.index % 7 !== 0

    await db
      .insert(companyMembers)
      .values({ id: newId(), companyId, userId, roleId, isOwner: false, isActive })
      .onConflictDoNothing({ target: [companyMembers.companyId, companyMembers.userId] })
  }

  return wanted.length
}

async function seedCounterparties(
  companyId: string,
  role: "client" | "provider",
  howMany: number,
  seed: number,
): Promise<number> {
  const wanted = Array.from({ length: howMany }, (_, offset) => {
    const index = seed + offset
    const { first, last } = personAt(index)
    // Dos de cada tres son un negocio; el resto, una persona. Es la mezcla real de una cartera, y
    // la que hace que buscar por nombre de persona y por razón social tengan que funcionar los dos.
    const isBusiness = index % 3 !== 0
    const trade = TRADE_PREFIXES[index % TRADE_PREFIXES.length] as string

    return {
      alias: isBusiness ? `${trade} ${last}` : `${first} ${last}`,
      snapshot: {
        name: first,
        lastname: last,
        email: `${plain(first)}.${plain(last)}.${index}@ejemplo.mx`,
        ...(isBusiness ? { companyName: `${trade} ${last}, S.A. de C.V.` } : {}),
      },
    }
  })

  const existing = await db
    .select({ alias: counterparties.alias })
    .from(counterparties)
    .where(and(eq(counterparties.companyId, companyId), eq(counterparties.role, role)))
  const known = new Set(existing.map((row) => row.alias))

  // El alias se repite entre índices distintos —hay ocho prefijos y veintiséis apellidos—, así que
  // se deduplica aquí: la cartera queda con menos filas que las pedidas, y eso está bien. Lo que no
  // estaría bien es que volver a sembrar añadiera duplicados cada vez.
  const missing = new Map<string, (typeof wanted)[number]>()
  for (const entry of wanted) {
    if (known.has(entry.alias) || missing.has(entry.alias)) continue
    missing.set(entry.alias, entry)
  }

  if (missing.size > 0) {
    await db.insert(counterparties).values(
      [...missing.values()].map((entry) => ({
        id: newId(),
        companyId,
        role,
        alias: entry.alias,
        snapshot: entry.snapshot,
      })),
    )
  }

  return known.size + missing.size
}

async function seedAddresses(companyId: string): Promise<number> {
  const existing = await db
    .select({ id: companyAddresses.id })
    .from(companyAddresses)
    .where(eq(companyAddresses.companyId, companyId))

  if (existing.length > 0) return existing.length

  await db.insert(companyAddresses).values(
    Array.from({ length: VOLUME.addresses }, (_, index) => {
      const [city, state] = CITIES[index % CITIES.length] as readonly [string, string]
      const { last } = personAt(index)

      return {
        id: newId(),
        companyId,
        label: index === 0 ? "Bodega principal" : `Bodega ${last}`,
        street: `Avenida ${last}`,
        number: String(100 + index * 7),
        colony: "Centro",
        city,
        state,
        country: "México",
        countryCode: "MX",
        postalCode: String(64000 + index),
        // Sólo la primera es primaria: el índice único parcial rechazaría la segunda, que es
        // exactamente lo que se quiere que haga.
        isPrimary: index === 0,
      }
    }),
  )

  return VOLUME.addresses
}

async function findRole(companyId: string, name: string): Promise<string | null> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.companyId, companyId), eq(roles.name, name)))
    .limit(1)

  return role?.id ?? null
}

// ─── Informe ─────────────────────────────────────────────────────────────────

function report(companyIds: Map<string, string>, volume: VolumeReport): void {
  const lines = [
    "",
    "  Siembra aplicada.",
    "",
    `  Contraseña de todas las cuentas:  ${PASSWORD}`,
    "",
    "  Cuenta                 Papel",
    "  ─────────────────────  ────────────────────────────────────────────",
    "  admin@tfv.dev          Administración de plataforma · las dos empresas",
    "  duena@tfv.dev          Propietaria · sólo Renta Fílmica del Norte",
    `  almacenista@tfv.dev    Rol acotado · ${ROLES["Almacén"]?.length ?? 0} de ${PERMISSION_KEYS.length} permisos`,
    "  compradora@tfv.dev     Sin membresías · padrón único",
    "",
    "  Empresa                      Servicios",
    "  ───────────────────────────  ──────────────────────────────────",
    ...COMPANIES.map((entry) => `  ${entry.name.padEnd(27)}  ${entry.services.join(", ")}`),
    "",
    "  Volumen en Renta Fílmica del Norte, para que las colecciones se comporten como tales:",
    `    ${volume.teammates} personas · ${volume.clients} clientes · ${volume.providers} proveedores · ${volume.addresses} direcciones`,
    `    Nave Monterrey: ${volume.products} productos · ${volume.units} unidades · 12 cajas en dos pisos`,
    `    ${volume.quotes} cotizaciones en cuatro estados, con su equipo apartado`,
    "",
    `  Identificadores: ${[...companyIds.values()].join(", ")}`,
    "",
  ]

  // biome-ignore lint/suspicious/noConsole: es un guion de línea de órdenes; imprimir es su salida.
  console.log(lines.join("\n"))
}

await main()
process.exit(0)
