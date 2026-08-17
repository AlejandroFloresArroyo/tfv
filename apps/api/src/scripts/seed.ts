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
import { companies, companyMembers, companyServices, roles, services, users } from "@tfv/db/schema"
import { and, eq, isNull } from "drizzle-orm"
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
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD)

  const serviceIds = await seedCatalog()
  const companyIds = await seedCompanies(serviceIds)
  await seedAccounts(passwordHash, companyIds)

  report(companyIds)
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

async function findRole(companyId: string, name: string): Promise<string | null> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.companyId, companyId), eq(roles.name, name)))
    .limit(1)

  return role?.id ?? null
}

// ─── Informe ─────────────────────────────────────────────────────────────────

function report(companyIds: Map<string, string>): void {
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
    `  Identificadores: ${[...companyIds.values()].join(", ")}`,
    "",
  ]

  // biome-ignore lint/suspicious/noConsole: es un guion de línea de órdenes; imprimir es su salida.
  console.log(lines.join("\n"))
}

await main()
process.exit(0)
