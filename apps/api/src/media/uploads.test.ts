/**
 * Archivos, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/media-storage/spec.md`.
 *
 * **Estas pruebas escriben en el almacenamiento de verdad.** No hay doble: lo que se está
 * comprobando es justo lo que un doble daría por supuesto —que la autorización firmada escribe su
 * objeto sin credencial ninguna, y que sobre otro objeto no escribe nada—, y eso es una propiedad
 * del almacenamiento, no de este código. Requiere la pila local: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  loginAttempts,
  notificationDeliveries,
  roles,
  sessions,
  uploads,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${uploads}, ${companies} cascade`,
  )
}

beforeAll(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

function request(method: string, path: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

interface Target {
  variant: string
  method: string
  url: string
  headers: Record<string, string>
  expiresAt: string
}

interface Upload {
  id: string
  kind: string
  status: string
  url: string
  variants: Record<string, string | null> | null
}

interface Authorization {
  upload: Upload
  targets: Target[]
}

async function signUp(email: string): Promise<string> {
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Quien sube" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await request("POST", "/auth/login", { email, password: PASSWORD })
  const cookie = response.headers
    .getSetCookie()
    .find((raw) => raw.startsWith("tfv_session="))
    ?.split(";")[0]

  if (!cookie) throw new Error("no se abrió sesión")
  return cookie
}

async function newCompany(cookie: string, name: string): Promise<string> {
  const company = await json<{ id: string }>(await request("POST", "/companies", { name }, cookie))
  return company.id
}

let cookie = ""
let companyId = ""

beforeAll(async () => {
  cookie = await signUp(`archivos-${newId().slice(-6)}@ejemplo.mx`)
  companyId = await newCompany(cookie, "Casa de Renta")
})

const authorize = (body: unknown) =>
  request("POST", `/companies/${companyId}/uploads`, body, cookie)

const FOTO = { fileName: "camara.jpg", contentType: "image/jpeg", byteSize: 120_000 }

describe("la autorización de escritura", () => {
  it("registra el archivo y autoriza los cinco objetos de una imagen", async () => {
    // Escenarios: «Se obtiene autorización y se sube» y «Una extensión de imagen produce derivados».
    const response = await authorize(FOTO)
    expect(response.status).toBe(201)

    const { upload, targets } = await json<Authorization>(response)

    expect(upload.kind).toBe("image")
    expect(upload.status).toBe("pending")
    expect(targets).toHaveLength(5)
    // El original primero: si la conexión se corta, lo escrito es el archivo y no una miniatura.
    expect(targets[0]?.variant).toBe("original")
    expect(targets.every((target) => target.method === "PUT")).toBe(true)
  })

  it("escribe de verdad, sin credencial de la API", async () => {
    const { targets } = await json<Authorization>(await authorize(FOTO))
    const original = targets[0]
    if (!original) throw new Error("sin autorización que probar")

    const written = await fetch(original.url, {
      method: "PUT",
      headers: original.headers,
      body: new Uint8Array([1, 2, 3, 4]),
    })

    expect(written.ok).toBe(true)
  })

  it("no alcanza a otro objeto", async () => {
    // Escenario: «Una autorización no alcanza a otros objetos». Es la propiedad que sostiene todo
    // el modelo de subida directa: si esto no se cumple, entregar la autorización al navegador es
    // entregarle el almacenamiento entero.
    const { targets } = await json<Authorization>(await authorize(FOTO))
    const original = targets[0]
    if (!original) throw new Error("sin autorización que probar")

    const ajeno = original.url.replace("/original.jpg", "/robado.jpg")

    const written = await fetch(ajeno, {
      method: "PUT",
      headers: original.headers,
      body: new Uint8Array([1, 2, 3, 4]),
    })

    expect(written.ok).toBe(false)
  })

  it("una extensión desconocida es archivo genérico, y va sola", async () => {
    // Escenario: «Una extensión desconocida es archivo genérico».
    const { upload, targets } = await json<Authorization>(
      await authorize({
        fileName: "plano.sketch",
        contentType: "application/octet-stream",
        byteSize: 900,
      }),
    )

    expect(upload.kind).toBe("file")
    expect(targets).toHaveLength(1)
  })

  it("rechaza un nombre sin extensión", async () => {
    // Escenario: «Un nombre sin extensión se rechaza».
    const response = await authorize({
      fileName: "documento",
      contentType: "application/pdf",
      byteSize: 10,
    })

    expect(response.status).toBe(400)
  })

  it("rechaza un tipo que no corresponde a la extensión", async () => {
    const response = await authorize({
      fileName: "contrato.pdf",
      contentType: "image/jpeg",
      byteSize: 10,
    })

    expect(response.status).toBe(400)
  })
})

describe("la confirmación", () => {
  it("deja subido lo que llegó, con las variantes que existan", async () => {
    // Escenario: «Una subida correcta se confirma». Un navegador que no sabe descodificar `heic`
    // sube el original y ningún derivado: no es un fallo, es lo que ese navegador podía hacer.
    const { upload } = await json<Authorization>(await authorize(FOTO))

    const confirmed = await json<Upload>(
      await request(
        "POST",
        `/companies/${companyId}/uploads/${upload.id}/confirm`,
        { written: ["original", "medium"] },
        cookie,
      ),
    )

    expect(confirmed.status).toBe("uploaded")
    expect(confirmed.variants?.medium).toContain("medium.jpg")
    expect(confirmed.variants?.thumbnail).toBeNull()
  })

  it("sin el original queda en erróneo, aunque hayan entrado derivados", async () => {
    const { upload } = await json<Authorization>(await authorize(FOTO))

    const confirmed = await json<Upload>(
      await request(
        "POST",
        `/companies/${companyId}/uploads/${upload.id}/confirm`,
        { written: ["thumbnail", "small"] },
        cookie,
      ),
    )

    expect(confirmed.status).toBe("error")
    expect(confirmed.variants).toBeNull()
  })

  it("marca el fallo declarado", async () => {
    // Escenario: «Una subida fallida queda marcada».
    const { upload } = await json<Authorization>(await authorize(FOTO))

    const confirmed = await json<Upload>(
      await request(
        "POST",
        `/companies/${companyId}/uploads/${upload.id}/confirm`,
        { failed: true, reason: "network" },
        cookie,
      ),
    )

    expect(confirmed.status).toBe("error")
  })
})

describe("volver a autorizar", () => {
  it("reemite sobre el mismo registro", async () => {
    // Que caduque la firma no puede costar volver a subir un archivo de doce megas.
    const { upload } = await json<Authorization>(await authorize(FOTO))

    const again = await json<Authorization>(
      await request("POST", `/companies/${companyId}/uploads/${upload.id}/targets`, {}, cookie),
    )

    expect(again.upload.id).toBe(upload.id)
    expect(again.targets).toHaveLength(5)
  })

  it("no reemite sobre uno que ya se subió", async () => {
    const { upload } = await json<Authorization>(await authorize(FOTO))
    await request(
      "POST",
      `/companies/${companyId}/uploads/${upload.id}/confirm`,
      { written: ["original"] },
      cookie,
    )

    const response = await request(
      "POST",
      `/companies/${companyId}/uploads/${upload.id}/targets`,
      {},
      cookie,
    )

    expect(response.status).toBe(409)
  })
})

describe("el aislamiento entre arrendatarios", () => {
  it("un archivo no se alcanza desde otra empresa", async () => {
    // La fila de un archivo no lleva empresa —la referencian entidades que sí—, así que esto no lo
    // puede hacer el motor: lo sostiene el prefijo de la clave del objeto.
    const { upload } = await json<Authorization>(await authorize(FOTO))
    const otra = await newCompany(cookie, "Otra Casa")

    const response = await request(
      "POST",
      `/companies/${otra}/uploads/${upload.id}/confirm`,
      { written: ["original"] },
      cookie,
    )

    expect(response.status).toBe(404)
  })
})
