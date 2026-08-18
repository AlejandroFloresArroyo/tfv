/**
 * La siembra, corrida de verdad.
 *
 * Se ejecuta el guion como lo ejecuta quien escribe `pnpm db:seed` —en su propio proceso, contra la
 * base que diga `DATABASE_URL`, que en las pruebas es `tfv_test`—, porque lo que hay que comprobar
 * es justamente lo que hace al correr: **sembrar dos veces no duplica nada**.
 *
 * Lo que se comprueba aquí no es el volumen sino una promesa de `openspec/specs/stock-units/spec.md`
 * que los datos sembrados incumplían (`HALLAZGOS.md` H-32): toda unidad tiene su alta en el
 * historial. Las creadas por la API sí la llevan; las sembradas empezaban en su segundo estado, y
 * la ficha de una unidad apartada por una cotización enseñaba una vida que empieza a la mitad.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  services,
  users,
  warehouseStockEvents,
  warehouseStockUnits,
} from "@tfv/db/schema"
import { asc, eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const run = promisify(execFile)
const script = fileURLToPath(new URL("./seed.ts", import.meta.url))

/**
 * Todo lo que la siembra escribe cuelga de estas tres tablas.
 *
 * `cascade` alcanza al resto siguiendo las claves foráneas, que es lo que evita mantener a mano una
 * lista de treinta tablas que se queda vieja con la siguiente rebanada.
 */
async function reset() {
  await db.execute(sql`truncate table ${users}, ${companies}, ${services} cascade`)
}

/** El guion en su propio proceso, con el entorno de la prueba —y por tanto con `tfv_test`—. */
async function seed(): Promise<void> {
  await run(process.execPath, ["--experimental-strip-types", script], { env: process.env })
}

beforeAll(reset)

afterAll(async () => {
  await reset()
  await closeConnection()
})

describe("la siembra deja el historial completo", () => {
  it("toda unidad sembrada tiene su alta, y es lo más antiguo que le pasó", async () => {
    await seed()

    const units = await db
      .select({ id: warehouseStockUnits.id, createdAt: warehouseStockUnits.createdAt })
      .from(warehouseStockUnits)
    const events = await db
      .select()
      .from(warehouseStockEvents)
      .orderBy(asc(warehouseStockEvents.occurredAt))

    expect(units.length).toBeGreaterThan(0)

    const altas = events.filter((row) => row.reason === "created")
    expect(altas).toHaveLength(units.length)
    expect(altas.every((row) => row.fromStatus === null && row.toStatus === "available")).toBe(true)

    // Y el alta es el primer momento de cada unidad. Sin esto la corrección sería sólo aritmética:
    // el evento existiría y el historial —que ordena por fecha— seguiría empezando por otro sitio.
    const primeroPorUnidad = new Map<string, string>()
    for (const row of events) {
      if (!primeroPorUnidad.has(row.stockUnitId)) primeroPorUnidad.set(row.stockUnitId, row.reason)
    }

    expect([...primeroPorUnidad.values()].every((reason) => reason === "created")).toBe(true)
    expect(primeroPorUnidad.size).toBe(units.length)
  })

  it("sembrar dos veces no duplica el alta", async () => {
    // La siembra respeta lo que ya existe: es la promesa que tiene escrita en su cabecera, y la
    // que hace que se pueda correr sin pensarlo dos veces.
    const antes = await db.select({ value: sql<number>`count(*)::int` }).from(warehouseStockEvents)

    await seed()

    const despues = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(warehouseStockEvents)
    expect(despues[0]?.value).toBe(antes[0]?.value)

    const [altas] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(warehouseStockEvents)
      .where(eq(warehouseStockEvents.reason, "created"))
    const [unidades] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(warehouseStockUnits)

    expect(altas?.value).toBe(unidades?.value)
  })

  it("repara las unidades que sembró una versión anterior", async () => {
    /**
     * El caso que de verdad importa para las bases que ya existen.
     *
     * La siembra respeta lo que encuentra: con el catálogo puesto no vuelve a crear nada, así que
     * una corrección que sólo escribiera el evento **al insertar la unidad** no llegaría nunca a
     * las unidades ya sembradas — que son todas las de cualquier base de desarrollo.
     */
    await db.delete(warehouseStockEvents).where(eq(warehouseStockEvents.reason, "created"))

    await seed()

    const [unidades] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(warehouseStockUnits)
    const [altas] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(warehouseStockEvents)
      .where(eq(warehouseStockEvents.reason, "created"))

    expect(altas?.value).toBe(unidades?.value)

    // Y siguen siendo lo más antiguo de cada unidad: el alta se fecha con la unidad, no con el
    // momento de repararla, o quedaría por encima de los movimientos que la siguieron.
    const events = await db
      .select()
      .from(warehouseStockEvents)
      .orderBy(asc(warehouseStockEvents.occurredAt))

    const primeroPorUnidad = new Map<string, string>()
    for (const row of events) {
      if (!primeroPorUnidad.has(row.stockUnitId)) primeroPorUnidad.set(row.stockUnitId, row.reason)
    }

    expect([...primeroPorUnidad.values()].every((reason) => reason === "created")).toBe(true)
  })
})
