/**
 * Los trabajos que este servicio sabe hacer.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md` y la rebanada 09. El registro es explícito
 * —igual que la tabla de rutas y por lo mismo—: lo que no esté aquí no se ejecuta, y encolarlo se
 * rinde a la primera diciendo que no hay manejador.
 *
 * Dos de los tres son deuda de otras rebanadas. Estaban escritos, probados y sin que nadie los
 * llamara:
 *
 * | Trabajo | De dónde viene | Qué pasaba sin él |
 * |---|---|---|
 * | `archivos.recoger-abandonados` | Rebanada 08 | Una subida interrumpida deja un registro huérfano para siempre (`DEFECTS.md` O-05) |
 * | `almacenes.verificar-coherencia` | Rebanada 13 (`HALLAZGOS.md` H-11) | Un descuadre de inventario puede vivir meses sin que nadie mire |
 * | `avisos.entregar` | Ésta | Las entregas se quedan encoladas |
 */

import { withElevated, withSystem } from "@tfv/db"
import { uploads, warehouses } from "@tfv/db/schema"
import { and, eq, isNull, lt } from "drizzle-orm"
import { audienceFor, deliverQueued, enqueueInbox, requeueFailed } from "../activity/delivery.ts"
import { env } from "../env.ts"
import { collectAbandoned } from "../media/uploads.ts"
import { checkCoherence } from "../warehouses/reservations.ts"
import { registerJob, scheduleJob } from "./dispatcher.ts"

export const COLLECT_ABANDONED = "archivos.recoger-abandonados"
export const STOCK_COHERENCE = "almacenes.verificar-coherencia"
export const DELIVER_NOTIFICATIONS = "avisos.entregar"

/**
 * Con quién corre el recolector de archivos.
 *
 * `collectAbandoned` pide un solicitante porque corre bajo `withRequester`, y un trabajo en segundo
 * plano no tiene sesión de nadie. Se le da una identidad que **el motor resuelve como nula**, y aun
 * así funciona: las políticas de `uploads` son `true` a propósito —la fila de un archivo no lleva
 * empresa, y lo que protege el contenido es la URL firmada (ver la migración `0015`)—.
 *
 * Queda escrito porque es un supuesto que hoy se cumple y podría dejar de cumplirse: **si algún día
 * el archivo lleva dueño, este trabajo deja de ver nada** y hay que darle vía de sistema. Fallaría
 * recogiendo cero, que al menos es el lado bueno del fallo.
 */
const SIN_SESION = {
  userId: "00000000-0000-0000-0000-000000000000",
  sessionId: "00000000-0000-0000-0000-000000000000",
}

/**
 * Recoge las subidas que nadie confirmó pasado el plazo.
 *
 * El plazo es configurable —`UPLOADS_ABANDONED_AFTER_HOURS`, y la carga útil del trabajo puede
 * pisarlo— porque no es una constante del dominio: veinticuatro horas es generoso para una foto y
 * corto para un video de dos gigas subiéndose por una conexión mala.
 *
 * **Nunca toca un archivo referenciado**, y eso no lo garantiza esta función sino el motor: la
 * migración `0017` omite el borrado de cualquier archivo al que apunte algo. Aquí sólo se cuenta
 * cuántos sobrevivieron por esa razón, que es información de operación: un número que crece dice que
 * alguien está dejando entidades apuntando a subidas que nunca se confirman.
 */
async function collectAbandonedUploads(payload: Record<string, unknown>): Promise<string> {
  const horas = Number(payload.olderThanHours ?? env.UPLOADS_ABANDONED_AFTER_HOURS)
  const limite = new Date(Date.now() - horas * 3_600_000)

  const seleccionados = await collectAbandoned(SIN_SESION, horas)

  // Los que el recolector eligió y el motor no dejó borrar: siguen ahí, pendientes, vencidos y
  // referenciados por algo. Contarlos es lo que convierte una guarda silenciosa en información.
  const protegidos = await withSystem(COLLECT_ABANDONED, [], async (tx) =>
    tx
      .select({ id: uploads.id })
      .from(uploads)
      .where(
        and(
          eq(uploads.status, "pending"),
          eq(uploads.isPlaceholder, false),
          lt(uploads.createdAt, limite),
        ),
      ),
  )

  const recogidos = Math.max(0, seleccionados - protegidos.length)

  return `${recogidos} subidas abandonadas recogidas (plazo ${horas} h; ${protegidos.length} protegidas por estar referenciadas)`
}

/**
 * Verifica que las reservas y el inventario digan lo mismo, almacén por almacén.
 *
 * La verificación existía desde la rebanada 13 y sólo corría **a mano**, pidiéndola por su ruta. Un
 * descuadre —una unidad comprometida que ya nadie reclama, o una reserva que no proyecta— podía
 * vivir meses sin que nadie mirara, que es justo el tipo de defecto que esta comprobación existe
 * para encontrar.
 *
 * La lista de almacenes se lee por la vía elevada porque **no cabe en el alcance de nadie**: recorre
 * todas las empresas, y para declarar el alcance habría que conocerlo antes. Es una lectura, no
 * escribe nada, y lleva su motivo escrito en el nombre. La verificación de cada almacén sí declara
 * su empresa, así que las políticas siguen aplicándose sobre lo que se consulta de verdad.
 *
 * Encontrar discrepancias **no es fallar**: el trabajo termina bien y avisa a quien puede
 * arreglarlas. Marcarlo como fallido dejaría la lista de trabajos rendidos llena de cosas que no son
 * fallos del sistema, y esa lista sólo sirve si se mira.
 */
async function verifyStockCoherence(): Promise<string> {
  const naves = await withElevated(
    "enumerar los almacenes para la verificación periódica de coherencia",
    async (tx) =>
      tx
        .select({ id: warehouses.id, companyId: warehouses.companyId, name: warehouses.name })
        .from(warehouses)
        .where(isNull(warehouses.deletedAt)),
  )

  let discrepancias = 0

  for (const nave of naves) {
    const encontradas = await withSystem(STOCK_COHERENCE, [nave.companyId], async (tx) => {
      const resultado = await checkCoherence(tx, nave.id)
      if (resultado.length === 0) return resultado

      // A quien puede arreglarlo: el permiso que autoriza mover una unidad de existencias es el
      // mismo que selecciona la audiencia, como en cualquier otra actividad.
      const audiencia = await audienceFor(tx, {
        companyId: nave.companyId,
        permissions: ["warehouses.products.stock_edit"],
      })

      await enqueueInbox(tx, {
        recipients: audiencia,
        kind: "stock_coherence",
        payload: {
          title: nave.name,
          body: `La verificación encontró ${resultado.length} ${
            resultado.length === 1 ? "unidad descuadrada" : "unidades descuadradas"
          }`,
          url: `/${nave.companyId}/warehouses/${nave.id}`,
          warehouseId: nave.id,
          discrepancies: resultado.length,
        },
      })

      return resultado
    })

    discrepancias += encontradas.length
  }

  return `${naves.length} almacenes verificados, ${discrepancias} discrepancias`
}

/** Entrega lo encolado, y devuelve a la cola lo que falló de forma transitoria. */
async function deliverNotifications(): Promise<string> {
  const reintentadas = await requeueFailed()
  const report = await deliverQueued()

  return (
    `${report.sent} entregadas, ${report.failed} fallidas, ${report.skipped} omitidas por ` +
    `preferencia, ${report.waiting} esperando proveedor, ${report.fanned} abiertas hacia fuera, ` +
    `${reintentadas} reintentadas`
  )
}

/**
 * Deja el registro listo. Se llama una vez, al arrancar.
 *
 * Las pruebas del despachador **no** llaman aquí: registran sus propios trabajos, para poder
 * comprobar cómo se falla sin depender de lo que hagan éstos.
 */
export function registerBuiltinJobs(): void {
  registerJob(COLLECT_ABANDONED, collectAbandonedUploads)
  registerJob(STOCK_COHERENCE, verifyStockCoherence)
  registerJob(DELIVER_NOTIFICATIONS, deliverNotifications)

  scheduleJob({ kind: COLLECT_ABANDONED, everyMs: env.UPLOADS_COLLECT_EVERY_MS })
  scheduleJob({ kind: STOCK_COHERENCE, everyMs: env.STOCK_COHERENCE_EVERY_MS })
  scheduleJob({ kind: DELIVER_NOTIFICATIONS, everyMs: env.NOTIFICATIONS_DELIVER_EVERY_MS })
}
