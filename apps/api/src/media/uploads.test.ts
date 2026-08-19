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
import { removeObjects } from "./storage.ts"
import { collectAbandoned } from "./uploads.ts"

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

  it("reemite sobre un objeto que ya se había escrito, y la nueva firma sirve", async () => {
    // Es **el** caso del reintento por objeto: el original entró y la miniatura no. La máquina de
    // subida vuelve a pedir autorización para el archivo entero —no sabe pedir cuatro de cinco—,
    // así que si firmar una clave ya ocupada falla, el único camino de reintento que existe se
    // cierra justo en el escenario para el que se escribió. Ver `HALLAZGOS.md` H-132.
    const { upload, targets } = await json<Authorization>(await authorize(FOTO))
    const original = targets[0]
    if (!original) throw new Error("sin autorización que probar")

    expect(
      (
        await fetch(original.url, {
          method: "PUT",
          headers: original.headers,
          body: new Uint8Array([1]),
        })
      ).ok,
    ).toBe(true)

    const response = await request(
      "POST",
      `/companies/${companyId}/uploads/${upload.id}/targets`,
      {},
      cookie,
    )
    expect(response.status).toBe(200)

    const again = (await json<Authorization>(response)).targets[0]
    if (!again) throw new Error("la reemisión no trajo el original")

    const rewritten = await fetch(again.url, {
      method: "PUT",
      headers: again.headers,
      body: new Uint8Array([1, 2, 3, 4, 5, 6]),
    })

    expect(rewritten.ok).toBe(true)
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

describe("retirar los objetos", () => {
  it("se lleva los cinco, no sólo el registro", async () => {
    // El endpoint de borrado del proveedor recibe un campo llamado `prefixes` y **borra por clave
    // exacta**: pasarle `empresa/archivo` responde `200` sin tocar `empresa/archivo/original.jpg`.
    // Sin esta prueba, sustituir una foto seguía dejando sus cinco objetos ocupando almacenamiento
    // para siempre, y la base sin fila que los reclamara. Ver `HALLAZGOS.md` H-71.
    const { upload, targets } = await json<Authorization>(await authorize(FOTO))

    for (const target of targets) {
      const written = await fetch(target.url, {
        method: "PUT",
        headers: target.headers,
        body: new Uint8Array([1, 2, 3, 4]),
      })
      expect(written.ok).toBe(true)
    }

    const [row] = await db
      .select({ storagePath: uploads.storagePath, url: uploads.url })
      .from(uploads)
      .where(eq(uploads.id, upload.id))
    if (!row) throw new Error("el archivo debería estar registrado")

    expect((await fetch(row.url)).ok).toBe(true)

    await removeObjects([row.storagePath])

    expect((await fetch(row.url)).ok).toBe(false)
  })
})

/**
 * El recolector corre **sin sesión de nadie**, igual que el trabajo en segundo plano que lo dispara.
 *
 * Las políticas de `uploads` son `true` a propósito —la fila de un archivo no lleva empresa— y lo
 * que protege el contenido es la clave firmada. Ver `jobs/handlers.ts`, donde se explica al llamarlo.
 */
const SIN_SESION = {
  userId: "00000000-0000-0000-0000-000000000000",
  sessionId: "00000000-0000-0000-0000-000000000000",
}

const haceDosDias = () => new Date(Date.now() - 48 * 3_600_000)

/** Una subida registrada y con sus cinco objetos escritos, pero **sin confirmar**. */
async function subidaSinConfirmar(): Promise<{ id: string; url: string }> {
  const { upload, targets } = await json<Authorization>(await authorize(FOTO))

  for (const target of targets) {
    const written = await fetch(target.url, {
      method: "PUT",
      headers: target.headers,
      body: new Uint8Array([1, 2, 3, 4]),
    })
    expect(written.ok).toBe(true)
  }

  return { id: upload.id, url: upload.url }
}

describe("la recolección de lo abandonado", () => {
  it("se lleva la subida que nadie confirmó, con sus objetos", async () => {
    // Escenario: «Una subida abandonada se limpia». Sin esto, una subida interrumpida deja un
    // registro huérfano para siempre y sus cinco objetos ocupando almacenamiento (`DEFECTS.md`
    // O-05). El recolector estaba escrito desde la rebanada 08 y **sin ejecutar nunca**.
    const abandonada = await subidaSinConfirmar()
    const enCurso = await subidaSinConfirmar()

    expect((await fetch(abandonada.url)).ok).toBe(true)

    await db.update(uploads).set({ createdAt: haceDosDias() }).where(eq(uploads.id, abandonada.id))

    const elegidas = await collectAbandoned(SIN_SESION)

    expect(elegidas).toBe(1)
    expect(await db.select().from(uploads).where(eq(uploads.id, abandonada.id))).toHaveLength(0)
    expect((await fetch(abandonada.url)).ok).toBe(false)

    // Y la que está ocurriendo ahora mismo sigue entera: el plazo no es decoración, es lo que separa
    // «subida interrumpida» de «subida en curso por una conexión mala».
    expect(await db.select().from(uploads).where(eq(uploads.id, enCurso.id))).toHaveLength(1)
    expect((await fetch(enCurso.url)).ok).toBe(true)
  })

  it("no toca un archivo referenciado, ni su fila ni sus objetos", async () => {
    // Escenario: «Un archivo referenciado nunca se recoge». Un archivo **pendiente** y referenciado
    // existe de verdad: la entidad se guardó antes de que llegara la confirmación, o la confirmación
    // se perdió — es el caso que describe la propia guarda de la migración `0017`. La fila la
    // protege el motor; los objetos los tiene que proteger el recolector, y retirarlos antes de
    // borrar dejaba la fila viva apuntando a bytes que ya no estaban. Ver `HALLAZGOS.md` H-160.
    const referenciada = await subidaSinConfirmar()

    await db
      .update(companies)
      .set({ logoUploadId: referenciada.id })
      .where(eq(companies.id, companyId))
    await db
      .update(uploads)
      .set({ createdAt: haceDosDias() })
      .where(eq(uploads.id, referenciada.id))

    await collectAbandoned(SIN_SESION)

    expect(await db.select().from(uploads).where(eq(uploads.id, referenciada.id))).toHaveLength(1)
    expect((await fetch(referenciada.url)).ok).toBe(true)

    // Se retira a mano: sigue pendiente y vencida, así que dejarla ahí la haría recogible en la
    // prueba siguiente y su cuenta dejaría de ser la que esa prueba afirma.
    await db.update(companies).set({ logoUploadId: null }).where(eq(companies.id, companyId))
    await db.delete(uploads).where(eq(uploads.id, referenciada.id))
  })

  it("nunca se lleva un marcador de posición", async () => {
    // No se eliminan **aunque dejen de estar referenciados**: son la fila a la que apuntan las
    // entidades que exigen archivo y no tienen ninguno. Se comprueba aquí porque el recolector es el
    // único camino que borra archivos sin que nadie se lo haya pedido.
    const marcador = await subidaSinConfirmar()

    await db
      .update(uploads)
      .set({ isPlaceholder: true, createdAt: haceDosDias() })
      .where(eq(uploads.id, marcador.id))

    expect(await collectAbandoned(SIN_SESION)).toBe(0)
    expect(await db.select().from(uploads).where(eq(uploads.id, marcador.id))).toHaveLength(1)
    expect((await fetch(marcador.url)).ok).toBe(true)
  })
})
