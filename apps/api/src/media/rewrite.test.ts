/**
 * La reescritura de las direcciones ya persistidas.
 *
 * Ver `openspec/specs/media-storage/spec.md`, requisito «Las direcciones públicas de lectura son
 * estables»: «Un cambio de proveedor SHALL contemplar la actualización de las direcciones ya
 * persistidas, porque están incrustadas en documentos generados y en enlaces compartidos».
 *
 * Es la mitad de un cambio de proveedor que **no** es configuración: poner otra variable cambia
 * dónde se escribe de ahora en adelante y no toca ni una de las direcciones que ya se repartieron.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import { uploads } from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { rewriteAddress, rewritePersistedUrls } from "./rewrite.ts"

const VIEJO = "http://127.0.0.1:54321/storage/v1/object/public/tfv"
const NUEVO = "https://tfv.s3.us-east-1.amazonaws.com"

async function reset() {
  await db.execute(sql`truncate table ${uploads} cascade`)
}

beforeAll(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

describe("una dirección suelta", () => {
  it("cambia de raíz y conserva la clave entera", () => {
    expect(rewriteAddress(`${VIEJO}/empresa/archivo/original.jpg`, VIEJO, NUEVO)).toBe(
      `${NUEVO}/empresa/archivo/original.jpg`,
    )
  })

  it("no toca lo que no cuelga de esa raíz", () => {
    // Reescribir por coincidencia parcial en vez de por prefijo convertiría una dirección ajena en
    // una dirección rota, y de eso no se entera nadie hasta que una pantalla enseña el hueco.
    const ajena = "https://otro-sitio.mx/imagenes/foto.jpg"
    expect(rewriteAddress(ajena, VIEJO, NUEVO)).toBe(ajena)
  })

  it("es idempotente: lo ya reescrito no se vuelve a reescribir", () => {
    // El guion se puede correr dos veces —se corre en un despliegue— y la segunda no debe encontrar
    // nada. Sin esto, una raíz nueva que contuviera a la vieja se duplicaría dentro de sí misma.
    const nueva = rewriteAddress(`${VIEJO}/a/b/original.jpg`, VIEJO, NUEVO)
    expect(rewriteAddress(nueva, VIEJO, NUEVO)).toBe(nueva)
  })

  it("tolera la barra final en cualquiera de las dos raíces", () => {
    expect(rewriteAddress(`${VIEJO}/a/original.jpg`, `${VIEJO}/`, `${NUEVO}/`)).toBe(
      `${NUEVO}/a/original.jpg`,
    )
  })
})

/** Un archivo con su original y sus cuatro derivados, apuntando todos a la raíz vieja. */
async function seedUpload(options: { placeholder?: boolean; root?: string } = {}): Promise<string> {
  const id = newId()
  const root = options.root ?? VIEJO
  const at = (variant: string) => `${root}/empresa/${id}/${variant}.jpg`

  await db.insert(uploads).values({
    id,
    kind: "image",
    status: "uploaded",
    url: at("original"),
    variants: {
      thumbnail: at("thumbnail"),
      small: at("small"),
      medium: null,
      large: at("large"),
    },
    fileName: "foto.jpg",
    extension: "jpg",
    contentType: "image/jpeg",
    byteSize: 4096,
    storagePath: `empresa/${id}`,
    isPlaceholder: options.placeholder ?? false,
  })

  return id
}

async function addressesOf(id: string): Promise<string[]> {
  const [row] = await db.select().from(uploads).where(eq(uploads.id, id))
  if (!row) throw new Error("el archivo debería existir")
  return [row.url, ...Object.values(row.variants ?? {})].filter(
    (value): value is string => value !== null,
  )
}

describe("la reescritura sobre la base", () => {
  it("sin aplicar, cuenta lo que cambiaría y no cambia nada", async () => {
    // Reescribir direcciones es tocar datos, no configuración: lo primero que tiene que poder
    // hacerse es mirar cuántas filas se van a mover sin moverlas.
    const id = await seedUpload()

    const informe = await rewritePersistedUrls({ from: VIEJO, to: NUEVO, apply: false })

    expect(informe.changed).toBe(1)
    expect(informe.applied).toBe(false)
    expect(await addressesOf(id)).toEqual(expect.arrayContaining([expect.stringContaining(VIEJO)]))
  })

  it("aplicando, mueve el original y los cuatro derivados", async () => {
    const id = await seedUpload()

    await rewritePersistedUrls({ from: VIEJO, to: NUEVO, apply: true })

    const direcciones = await addressesOf(id)
    expect(direcciones).toHaveLength(4)
    expect(direcciones.every((value) => value.startsWith(NUEVO))).toBe(true)
    // El derivado que no existía sigue sin existir: reescribir no inventa direcciones.
    const [row] = await db.select().from(uploads).where(eq(uploads.id, id))
    expect(row?.variants?.medium).toBeNull()
  })

  it("también mueve los marcadores de posición", async () => {
    // No se eliminan nunca, y por eso mismo son los que más tiempo llevan apuntando a la raíz
    // vieja: dejarlos fuera sería dejar rota justamente la imagen que se enseña cuando falta otra.
    const marcador = await seedUpload({ placeholder: true })

    await rewritePersistedUrls({ from: VIEJO, to: NUEVO, apply: true })

    expect((await addressesOf(marcador)).every((value) => value.startsWith(NUEVO))).toBe(true)
  })

  it("no toca las filas de otra raíz", async () => {
    const ajena = await seedUpload({ root: "https://otro-sitio.mx" })

    await rewritePersistedUrls({ from: VIEJO, to: NUEVO, apply: true })

    expect(
      (await addressesOf(ajena)).every((value) => value.startsWith("https://otro-sitio.mx")),
    ).toBe(true)
  })

  it("correrlo dos veces no encuentra nada la segunda", async () => {
    await seedUpload()

    await rewritePersistedUrls({ from: VIEJO, to: NUEVO, apply: true })
    const segunda = await rewritePersistedUrls({ from: VIEJO, to: NUEVO, apply: true })

    expect(segunda.changed).toBe(0)
  })
})
