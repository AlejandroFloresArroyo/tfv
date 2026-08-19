/**
 * Colecciones de archivos: qué se suelta y qué se conserva.
 *
 * Transcritas de `openspec/specs/media-storage/spec.md`, requisitos «Sustituir una colección de
 * archivos», «Sustituir un archivo elimina el anterior» y «Marcadores de posición compartidos».
 *
 * Corrigen `DEFECTS.md` L-01, que hacía justo lo contrario: borraba los conservados y dejaba
 * huérfanos los retirados. Por eso la prueba del diferencial mira **las dos** listas y no sólo el
 * recuento: intersecar y diferenciar dan el mismo número de elementos cuando se retira uno y se
 * añade otro, y ése es exactamente el caso que la implementación anterior invertía.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db, withRequester } from "@tfv/db"
import {
  companies,
  companyMembers,
  loginAttempts,
  notificationDeliveries,
  roles,
  sessions,
  uploads,
  users,
  warehouses,
} from "@tfv/db/schema"
import { eq, inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { Actor } from "../companies/companies.ts"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"
import { diffCollection, releaseUploads } from "./collections.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${warehouses}, ${uploads}, ${companies} cascade`,
  )
}

function request(method: string, path: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

let actor: Actor = { userId: "", sessionId: "" }
let companyId = ""

beforeAll(async () => {
  await reset()

  const email = "colecciones@ejemplo.mx"
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Colecciones" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  const cookie =
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, user?.id ?? ""))

  actor = { userId: user?.id ?? "", sessionId: session?.id ?? "" }

  const company = (await (
    await request("POST", "/companies", { name: "Casa de Renta" }, cookie)
  ).json()) as { id: string }
  companyId = company.id
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

/** Un archivo registrado y subido, como el que deja una subida que terminó bien. */
async function seedUpload(options: { placeholder?: boolean } = {}): Promise<string> {
  const id = newId()
  await db.insert(uploads).values({
    id,
    kind: "image",
    status: "uploaded",
    url: `https://ejemplo.mx/${companyId}/${id}/original.jpg`,
    fileName: "foto.jpg",
    extension: "jpg",
    contentType: "image/jpeg",
    byteSize: 4096,
    storagePath: `${companyId}/${id}`,
    isPlaceholder: options.placeholder ?? false,
  })
  return id
}

async function exists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: uploads.id }).from(uploads).where(eq(uploads.id, id))
  return row !== undefined
}

// ─── El diferencial ──────────────────────────────────────────────────────────

describe("sustituir una colección", () => {
  it("señala exactamente lo que dejó de estar", () => {
    // Escenario: «Sólo se elimina lo retirado». A, B, C → A, D.
    const diff = diffCollection(["A", "B", "C"], ["A", "D"])

    expect(diff.removed).toEqual(["B", "C"])
    expect(diff.kept).toEqual(["A"])
    expect(diff.added).toEqual(["D"])
  })

  it("no señala nada cuando la colección no cambia", () => {
    // Escenario: «Una colección sin cambios no borra nada».
    const diff = diffCollection(["A", "B"], ["A", "B"])

    expect(diff.removed).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.kept).toEqual(["A", "B"])
  })

  it("reordenar no retira ninguno", () => {
    // Es el caso de arrastrar una foto de la galería: cambia el orden y no cambia el conjunto.
    expect(diffCollection(["A", "B", "C"], ["C", "A", "B"]).removed).toEqual([])
  })

  it("vaciar la colección retira todos", () => {
    expect(diffCollection(["A", "B"], []).removed).toEqual(["A", "B"])
  })

  it("una repetición en lo que llega no duplica el archivo", () => {
    const diff = diffCollection(["A"], ["A", "B", "B"])

    expect(diff.added).toEqual(["B"])
    expect(diff.next).toEqual(["A", "B"])
  })

  it("conserva el orden en el que llega, que es el que se enseña", () => {
    expect(diffCollection(["A", "B"], ["B", "C", "A"]).next).toEqual(["B", "C", "A"])
  })
})

// ─── La liberación ───────────────────────────────────────────────────────────

describe("soltar un archivo", () => {
  beforeEach(async () => {
    await db.delete(warehouses)
    await db.delete(uploads)
  })

  it("borra el registro y devuelve su ubicación para retirar los objetos", async () => {
    // Requisito «Sustituir un archivo elimina el anterior»: el registro y **todos** sus objetos.
    const archivo = await seedUpload()

    const released = await withRequester(actor, (tx) => releaseUploads(tx, [archivo]))

    expect(released.deleted).toEqual([archivo])
    expect(released.paths).toEqual([`${companyId}/${archivo}`])
    expect(await exists(archivo)).toBe(false)
  })

  it("conserva el que otra entidad sigue referenciando", async () => {
    // Escenario: «Un archivo aún referenciado se conserva». Sin esta comprobación, el borrado
    // arrastraría al almacén que lo usa: su clave foránea es `on delete set null`, así que la otra
    // entidad se quedaría sin imagen **en silencio**.
    const archivo = await seedUpload()
    await db
      .insert(warehouses)
      .values({ id: newId(), companyId, name: "Bodega", imageUploadId: archivo })

    const released = await withRequester(actor, (tx) => releaseUploads(tx, [archivo]))

    expect(released.deleted).toEqual([])
    expect(await exists(archivo)).toBe(true)
  })

  it("nunca borra un marcador de posición", async () => {
    // Escenario: «Reemplazar un marcador no lo borra». Sigue existiendo para las demás entidades.
    const marcador = await seedUpload({ placeholder: true })

    const released = await withRequester(actor, (tx) => releaseUploads(tx, [marcador]))

    expect(released.deleted).toEqual([])
    expect(await exists(marcador)).toBe(true)
  })

  it("suelta los libres y conserva los ocupados en la misma llamada", async () => {
    const libre = await seedUpload()
    const ocupado = await seedUpload()
    const marcador = await seedUpload({ placeholder: true })
    await db
      .insert(warehouses)
      .values({ id: newId(), companyId, name: "Bodega", imageUploadId: ocupado })

    const released = await withRequester(actor, (tx) =>
      releaseUploads(tx, [libre, ocupado, marcador]),
    )

    expect(released.deleted).toEqual([libre])

    const quedan = await db
      .select({ id: uploads.id })
      .from(uploads)
      .where(inArray(uploads.id, [libre, ocupado, marcador]))
    expect(quedan.map((row) => row.id).sort()).toEqual([ocupado, marcador].sort())
  })

  it("una lista vacía no consulta nada", async () => {
    const released = await withRequester(actor, (tx) => releaseUploads(tx, []))

    expect(released.deleted).toEqual([])
    expect(released.paths).toEqual([])
  })
})
