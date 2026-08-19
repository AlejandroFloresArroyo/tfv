/**
 * Los marcadores de posición, sembrados de verdad.
 *
 * Escenarios de `openspec/specs/media-storage/spec.md`, requisito «Marcadores de posición
 * compartidos». Rebanada 08.
 *
 * **Escriben en el almacenamiento de verdad**, como el resto de las pruebas de archivos: lo que hay
 * que comprobar es justamente que los tres marcadores dejan de ser una fila y pasan a ser objetos
 * que responden. Requiere la pila local: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db, withElevated } from "@tfv/db"
import { companies, uploads, warehouses } from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { assertUsableImages, releaseUploads } from "./collections.ts"
import { assetBytes, ensurePlaceholders, PLACEHOLDERS } from "./placeholders.ts"
import { removeObjects } from "./storage.ts"

/**
 * Se limpian las dos mitades, y la del almacenamiento importa.
 *
 * Las claves de los marcadores son **fijas** —es lo que permite que una entidad los referencie
 * entre instalaciones—, así que sobreviven a la ejecución anterior. Sin retirar sus objetos, la
 * segunda vez que corren estas pruebas no habría nada que escribir y lo que se estaría comprobando
 * sería el trabajo de la primera.
 */
async function reset() {
  await db.execute(sql`truncate table ${uploads}, ${companies} cascade`)
  await removeObjects(PLACEHOLDERS.map((placeholder) => `sistema/${placeholder.id}`))
}

beforeAll(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

describe("sembrar los marcadores de posición", () => {
  it("deja uno por tipo, subido y protegido", async () => {
    const report = await ensurePlaceholders()

    expect(report.rows).toBe(3)
    expect(report.written).toBe(11)

    const rows = await db.select().from(uploads).where(eq(uploads.isPlaceholder, true))

    expect(rows.map((row) => row.kind).sort()).toEqual(["document", "image", "video"])
    expect(rows.every((row) => row.status === "uploaded")).toBe(true)
    // No cuelgan de ninguna empresa: los comparten todas.
    expect(rows.every((row) => row.storagePath.startsWith("sistema/"))).toBe(true)
  })

  it("los objetos responden, y son los del repositorio", async () => {
    // Es la mitad del requisito que O-06 incumplía: los marcadores apuntaban a dominios de
    // terceros. Que la dirección responda no basta —también respondía `w3.org`—; tiene que
    // responder **con el activo que vive aquí**.
    await ensurePlaceholders()

    for (const placeholder of PLACEHOLDERS) {
      const [row] = await db.select().from(uploads).where(eq(uploads.id, placeholder.id))
      if (!row) throw new Error(`falta la fila de ${placeholder.kind}`)

      const original = await fetch(row.url)
      expect(original.ok).toBe(true)
      expect(new Uint8Array(await original.arrayBuffer()).byteLength).toBe(
        assetBytes(placeholder.objects[0]?.file as string).byteLength,
      )
    }
  })

  it("la imagen y el video traen sus cuatro derivados; el documento va solo", async () => {
    // La spec cuenta cinco objetos para una imagen y cinco para un video —el video y cuatro
    // portadas—, y uno para lo demás. El marcador no es la excepción de esa cuenta.
    await ensurePlaceholders()

    const byKind = new Map(
      (await db.select().from(uploads).where(eq(uploads.isPlaceholder, true))).map((row) => [
        row.kind,
        row,
      ]),
    )

    for (const kind of ["image", "video"] as const) {
      const variants = byKind.get(kind)?.variants
      expect(Object.values(variants ?? {}).filter((url) => url !== null)).toHaveLength(4)

      for (const url of Object.values(variants ?? {})) {
        expect((await fetch(url as string)).ok).toBe(true)
      }
    }

    const documento = byKind.get("document")
    expect(Object.values(documento?.variants ?? {}).every((url) => url === null)).toBe(true)
  })

  it("sembrar dos veces no duplica ni falla", async () => {
    // Corre en cada arranque de la siembra y puede correr en una instalación que ya los tenga. Si
    // la segunda vez fallara, sembrar sería una operación de una sola oportunidad.
    await ensurePlaceholders()
    const antes = await db.select().from(uploads).where(eq(uploads.isPlaceholder, true))

    const segunda = await ensurePlaceholders()

    const despues = await db.select().from(uploads).where(eq(uploads.isPlaceholder, true))
    expect(despues).toHaveLength(antes.length)
    expect(segunda.written).toBe(0)
    expect(despues.map((row) => row.id).sort()).toEqual(antes.map((row) => row.id).sort())
  })

  it("repara el objeto que falte sin tocar la fila", async () => {
    // El caso de una instalación cuyo depósito se recreó: la fila sigue y los bytes no. Sin esto,
    // «ya está sembrado» significaría «no vuelvas a mirar», y la imagen quedaría rota para siempre.
    const [imagen] = PLACEHOLDERS
    if (!imagen) throw new Error("sin marcadores que sembrar")

    await ensurePlaceholders()
    await removeObjects([`sistema/${imagen.id}`])

    const reparada = await ensurePlaceholders()

    expect(reparada.written).toBe(5)
    const [row] = await db.select().from(uploads).where(eq(uploads.id, imagen.id))
    expect((await fetch(row?.url as string)).ok).toBe(true)
  })
})

describe("un marcador de posición se puede usar y no se puede borrar", () => {
  let companyId = ""

  beforeAll(async () => {
    await ensurePlaceholders()
    companyId = newId()
    await db.insert(companies).values({ id: companyId, name: "Casa de Renta" })
  })

  it("una entidad de cualquier empresa puede referenciarlo", async () => {
    // Escenario: «Una entidad sin imagen recibe el marcador». El archivo se acota a un arrendatario
    // por el prefijo de la clave de su objeto, y el marcador **no vive bajo ninguno**: comprobar el
    // prefijo a secas lo hacía inservible para todas las empresas a la vez.
    const imagen = PLACEHOLDERS.find((one) => one.kind === "image")
    if (!imagen) throw new Error("sin marcador de imagen")

    await expect(
      withElevated("prueba", (tx) => assertUsableImages(tx, companyId, [imagen.id])),
    ).resolves.toBeUndefined()
  })

  it("no se borra al dejar de estar referenciado", async () => {
    // Escenario: «Reemplazar un marcador no lo borra».
    const imagen = PLACEHOLDERS.find((one) => one.kind === "image")
    if (!imagen) throw new Error("sin marcador de imagen")

    await db
      .insert(warehouses)
      .values({ id: newId(), companyId, name: "Bodega", imageUploadId: imagen.id })

    const released = await withElevated("prueba", (tx) => releaseUploads(tx, [imagen.id]))

    expect(released.deleted).toEqual([])
    const [row] = await db.select().from(uploads).where(eq(uploads.id, imagen.id))
    expect(row).toBeDefined()
  })
})
