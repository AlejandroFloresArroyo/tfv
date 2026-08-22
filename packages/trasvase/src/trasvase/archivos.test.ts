/**
 * La rutina de archivos: `core_upload` + `core_meta` → `uploads`.
 *
 * El destino fundió el archivo y su metainformación en una tabla (`media.ts` lo documenta), así
 * que la rutina absorbe `core_meta` dentro de cada fila. Lo que se afirma: la fusión, la
 * conversión de los tipos en mayúsculas, la derivación desde la URL cuando la meta no existe
 * —referencia rota real del origen—, y la idempotencia corriendo dos veces.
 */

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { uploads } from "@tfv/db/schema"
import postgres from "postgres"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { escribirVolcado } from "../accesorios/construir.ts"
import { type Ensayo, ensayo } from "../accesorios/ensayo.ts"
import { abrirVolcado } from "../volcado/leer.ts"
import { trasvasarArchivos } from "./archivos.ts"
import { abrirContexto, type Contexto } from "./contexto.ts"

const sql = postgres(process.env.DATABASE_URL as string, { max: 2 })
const raiz = mkdtempSync(join(tmpdir(), "trasvase-archivos-"))

let escenario: Ensayo
let contexto: Contexto

afterAll(async () => {
  await sql.end()
  rmSync(raiz, { recursive: true, force: true })
})

beforeEach(async () => {
  await sql`truncate table uploads cascade`
  await sql`drop schema if exists trasvase cascade`
  escenario = ensayo()
  const dir = join(raiz, `caso-${Math.random().toString(36).slice(2)}`)
  escribirVolcado(dir, escenario.colecciones)
  contexto = await abrirContexto(sql, abrirVolcado(dir))
})

async function filaDe(idViejo: string) {
  const idNuevo = contexto.registro.idExistente("core_upload", idViejo)
  if (!idNuevo) return undefined
  const filas = await contexto.db.select().from(uploads)
  return filas.find((fila) => fila.id === idNuevo)
}

describe("trasvasarArchivos", () => {
  it("funde la subida con su meta y convierte el tipo", async () => {
    await trasvasarArchivos(contexto)

    const avatar = await filaDe(escenario.ids.subidaAvatar)
    expect(avatar).toMatchObject({
      kind: "image",
      status: "uploaded",
      fileName: "archivo-1.png",
      extension: "png",
      contentType: "image/png",
      byteSize: 2048,
      storagePath: "uploads/archivo-1.png",
      isPlaceholder: false,
    })
    expect(avatar?.url).toContain("https://")
  })

  it("una subida sin meta se migra derivando de la URL, con incidencia", async () => {
    await trasvasarArchivos(contexto)

    const rota = await filaDe(escenario.ids.subidaSinMeta)
    expect(rota).toBeDefined()
    expect(rota?.fileName).not.toBe("")
    expect(rota?.contentType).toBe("application/octet-stream")
    expect(rota?.byteSize).toBe(0)

    const incidencias = await sql<{ campo: string }[]>`
      select campo from trasvase.incidencias
      where coleccion = 'core_upload' and id_viejo = ${escenario.ids.subidaSinMeta}
    `
    expect(incidencias.map((fila) => fila.campo)).toContain("metaId")
  })

  it("la pendiente eterna (O-05) migra pendiente: el recolector nuevo la encontrará", async () => {
    await trasvasarArchivos(contexto)

    const pendiente = await filaDe(escenario.ids.subidaPendiente)
    expect(pendiente?.status).toBe("pending")
  })

  it("cada fila del origen acaba migrada o en cuarentena, sin terceras opciones", async () => {
    await trasvasarArchivos(contexto)

    const destino = await sql<{ total: string }[]>`select count(*)::text as total from uploads`
    const cuarentena = await sql<{ total: string }[]>`
      select count(*)::text as total from trasvase.cuarentena where coleccion = 'core_upload'
    `
    const origen = escenario.colecciones.core_upload?.length ?? 0
    expect(Number(destino[0]?.total) + Number(cuarentena[0]?.total)).toBe(origen)
  })

  it("correr dos veces no duplica nada y conserva los identificadores", async () => {
    await trasvasarArchivos(contexto)
    const idPrimera = contexto.registro.idExistente("core_upload", escenario.ids.subidaAvatar)
    const antes = await sql<{ total: string }[]>`select count(*)::text as total from uploads`

    // La segunda corrida abre contexto nuevo, como haría una ejecución real repetida.
    const segundo = await abrirContexto(sql, contexto.volcado)
    await trasvasarArchivos(segundo)

    const despues = await sql<{ total: string }[]>`select count(*)::text as total from uploads`
    expect(despues[0]?.total).toBe(antes[0]?.total)
    expect(segundo.registro.idExistente("core_upload", escenario.ids.subidaAvatar)).toBe(idPrimera)

    const cuarentena = await sql<{ total: string }[]>`
      select count(*)::text as total from trasvase.cuarentena where coleccion = 'core_upload'
    `
    expect(cuarentena[0]?.total).toBe("0")
  })
})
