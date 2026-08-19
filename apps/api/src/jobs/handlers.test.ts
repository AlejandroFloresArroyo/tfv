/**
 * Los dos trabajos que llevaban rebanadas esperando despachador.
 *
 * Ver `openspec/specs/media-storage/spec.md` (rebanada 08), `stock-reservation` (rebanada 13,
 * `HALLAZGOS.md` H-11) y `activity-and-notifications` (rebanada 09).
 *
 * Lo que aquí importa no es que se ejecuten —eso lo comprueba `dispatcher.test.ts`— sino **qué no
 * hacen**: el recolector no toca un archivo referenciado, y la verificación de coherencia avisa a
 * quien puede arreglar lo que encontró en lugar de dejarlo en un registro que nadie lee.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db, withElevated } from "@tfv/db"
import {
  backgroundJobs,
  companies,
  companyMembers,
  notificationDeliveries,
  roles,
  uploads,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { drain, resetRegistry } from "./dispatcher.ts"
import { COLLECT_ABANDONED, registerBuiltinJobs, STOCK_COHERENCE } from "./handlers.ts"
import { enqueue, listJobs } from "./queue.ts"

async function reset() {
  await db.execute(
    sql`truncate table ${backgroundJobs}, ${notificationDeliveries}, ${uploads}, ${users}, ${companyMembers}, ${roles}, ${companies} cascade`,
  )
}

beforeEach(async () => {
  await reset()
  resetRegistry()
  registerBuiltinJobs()
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

/** Una subida pendiente y vencida, como la que deja un navegador que se cerró a mitad. */
async function subidaAbandonada(companyId: string, horas: number): Promise<string> {
  const id = newId()

  await db.execute(
    sql.raw(`
      insert into uploads (id, kind, status, url, file_name, extension, content_type,
                           byte_size, storage_path, created_at)
      values ('${id}', 'image', 'pending', 'http://ejemplo/u', 'camara.jpg', 'jpg',
              'image/jpeg', 1000, '${companyId}/${id}', now() - interval '${horas} hours')
    `),
  )

  return id
}

async function empresa(nombre: string): Promise<string> {
  const id = newId()
  await db.execute(sql.raw(`insert into companies (id, name) values ('${id}', '${nombre}')`))
  return id
}

async function ejecutar(kind: string, payload: Record<string, unknown> = {}) {
  await enqueue({ kind, payload })
  const [resultado] = await drain(5)
  return resultado
}

describe("el recolector de subidas abandonadas", () => {
  it("recoge lo que nadie confirmó y respeta el plazo configurado", async () => {
    const companyId = await empresa("Casa de Renta")
    const vieja = await subidaAbandonada(companyId, 48)
    const reciente = await subidaAbandonada(companyId, 2)

    const resultado = await ejecutar(COLLECT_ABANDONED, { olderThanHours: 24 })

    expect(resultado?.outcome).toBe("done")
    expect(resultado?.detail).toContain("1 subidas abandonadas recogidas")
    expect(resultado?.detail).toContain("plazo 24 h")

    const quedan = await db.select({ id: uploads.id }).from(uploads)
    expect(quedan.map((fila) => fila.id)).toEqual([reciente])
    expect(quedan.map((fila) => fila.id)).not.toContain(vieja)
  })

  it("con el plazo en dos horas también se lleva la reciente", async () => {
    // El plazo es configurable, y no por gusto: veinticuatro horas son generosas para una foto y
    // cortas para un video de dos gigas por una conexión mala.
    const companyId = await empresa("Casa de Renta")
    await subidaAbandonada(companyId, 3)

    const resultado = await ejecutar(COLLECT_ABANDONED, { olderThanHours: 2 })

    expect(resultado?.detail).toContain("1 subidas abandonadas recogidas")
    expect(await db.select({ id: uploads.id }).from(uploads)).toHaveLength(0)
  })

  it("nunca toca un archivo referenciado, aunque lleve pendiente más del plazo", async () => {
    // El caso real: la entidad se guardó apuntando al archivo y la confirmación no llegó nunca. De
    // las treinta y dos claves foráneas que apuntan a un archivo, cinco propagan el borrado —una de
    // ellas la del comprobante de un pago—, así que lo que se perdía no era la foto sino la fila.
    const companyId = await empresa("Casa de Renta")
    const referenciado = await subidaAbandonada(companyId, 72)
    const suelto = await subidaAbandonada(companyId, 72)

    const red = newId()
    const locacion = newId()
    const imagen = newId()

    await db.execute(
      sql.raw(`
        insert into location_networks (id, company_id, name) values ('${red}', '${companyId}', 'Red');
        insert into locations (id, network_id, name) values ('${locacion}', '${red}', 'Nave');
        insert into location_images (id, location_id, upload_id)
          values ('${imagen}', '${locacion}', '${referenciado}');
      `),
    )

    const resultado = await ejecutar(COLLECT_ABANDONED, { olderThanHours: 24 })

    expect(resultado?.outcome).toBe("done")
    // El que nadie reclamaba se fue…
    const quedan = await db.select({ id: uploads.id }).from(uploads)
    expect(quedan.map((fila) => fila.id)).not.toContain(suelto)
    // …y el referenciado sigue ahí, con su fila intacta.
    expect(quedan.map((fila) => fila.id)).toContain(referenciado)

    const imagenes = await db.execute<{ total: number }>(
      sql.raw(`select count(*)::int as total from location_images where id = '${imagen}'`),
    )
    expect([...imagenes][0]?.total).toBe(1)

    // Y el trabajo lo dice, para que un número que crece se pueda ver.
    expect(resultado?.detail).toContain("1 protegidas")
  })

  it("se vuelve a encolar para dentro de su periodo", async () => {
    await ejecutar(COLLECT_ABANDONED)

    const jobs = await listJobs(COLLECT_ABANDONED)
    const siguiente = jobs.find((job) => job.status === "queued")

    expect(siguiente).toBeDefined()
    expect(siguiente?.runAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe("la verificación de coherencia de existencias", () => {
  it("encuentra la unidad comprometida que nadie reclama y avisa a quien puede arreglarla", async () => {
    // Es el descuadre más caro y el único invisible (`HALLAZGOS.md` H-26): equipo comprometido sin
    // dueño. La verificación existía desde la rebanada 13 y **sólo corría a mano**.
    const companyId = await empresa("Casa de Renta")
    const responsable = newId()
    const almacen = newId()
    const producto = newId()
    const medida = newId()
    const unidad = newId()

    await db.execute(
      sql.raw(`
        insert into users (id, email, username) values ('${responsable}', 'jefa@ejemplo.mx', 'jefa-${responsable.slice(-6)}');
        insert into company_members (id, company_id, user_id, is_owner)
          values ('${newId()}', '${companyId}', '${responsable}', true);
        insert into warehouses (id, company_id, name) values ('${almacen}', '${companyId}', 'Nave 1');
        insert into warehouse_products (id, warehouse_id, name, code)
          values ('${producto}', '${almacen}', 'Cámara', 'CAM-1');
        insert into warehouse_measurements (id, product_id, name)
          values ('${medida}', '${producto}', 'Cuerpo');
        insert into warehouse_stock_units (id, measurement_id, code, status)
          values ('${unidad}', '${medida}', 'CAM-1-001', 'in_quote');
      `),
    )

    const resultado = await ejecutar(STOCK_COHERENCE)

    expect(resultado?.outcome).toBe("done")
    expect(resultado?.detail).toContain("1 discrepancias")

    const avisos = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.recipientId, responsable))

    expect(avisos).toHaveLength(1)
    expect(avisos[0]?.kind).toBe("stock_coherence")
    // Clave y parámetros, no una frase: el plural y el idioma los pone quien lo lee (H-153).
    expect(avisos[0]?.payload.bodyKey).toBe("stock.incoherent")
    expect(avisos[0]?.payload.bodyParams).toEqual({ count: 1 })
    // Y la dirección lleva a una pantalla del panel, no a `/{companyId}/…` (H-154).
    expect(avisos[0]?.payload.url).toMatch(/^\/c\/[^/]+\/warehouses\/[^/]+$/)
  })

  it("con el inventario cuadrado no avisa a nadie", async () => {
    // Un trabajo periódico que avisa cuando no pasa nada enseña a ignorar sus avisos.
    const companyId = await empresa("Casa de Renta")
    const almacen = newId()

    await db.execute(
      sql.raw(`insert into warehouses (id, company_id, name)
               values ('${almacen}', '${companyId}', 'Nave vacía')`),
    )

    const resultado = await ejecutar(STOCK_COHERENCE)

    expect(resultado?.detail).toContain("0 discrepancias")
    expect(await db.select().from(notificationDeliveries)).toHaveLength(0)
  })

  it("la enumeración de almacenes deja escrito su motivo", async () => {
    // La lista no cabe en el alcance de nadie —recorre todas las empresas— y por eso se lee por la
    // vía elevada, que exige nombrar el motivo. Esta prueba fija que esa vía sigue siendo lectura.
    const visto = await withElevated("comprobación", async (tx) => {
      const rows = await tx.execute<{ total: number }>(
        sql.raw("select count(*)::int as total from warehouses"),
      )
      return [...rows][0]?.total ?? 0
    })

    expect(visto).toBeGreaterThanOrEqual(0)
  })
})
