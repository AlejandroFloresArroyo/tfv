/**
 * Qué se conserva y qué se suelta cuando una entidad cambia de archivos.
 *
 * Ver `openspec/specs/media-storage/spec.md`, requisitos «Sustituir un archivo elimina el
 * anterior», «Sustituir una colección de archivos» y «Marcadores de posición compartidos».
 * Rebanada 08, bloque de correcciones.
 *
 * ## Por qué vive aquí y no dentro del catálogo
 *
 * Lo van a llamar el producto con su galería, el almacén y la ubicación con su imagen única, y
 * después los comprobantes de gasto, las firmas de entrega y las láminas de mosaico. Escondido en
 * el módulo del catálogo, el segundo llamante lo copia — y una copia de esta regla en particular es
 * cara: el defecto que corrige es exactamente el de una implementación que se equivocó de conjunto.
 *
 * ## El defecto que corrige, dicho entero
 *
 * `DEFECTS.md` L-01: al sustituir una colección, la implementación anterior **intersecaba** en vez
 * de diferenciar. Borraba los que seguían estando y dejaba huérfanos los que se habían retirado, de
 * modo que actualizar un producto de A, B, C a A, D borraba A —la que se quería conservar— y dejaba
 * B y C ocupando almacenamiento para siempre. Las dos mitades del error se compensan en el
 * recuento, y por eso nadie lo vio: seguían quedando dos archivos.
 *
 * ## Tres razones para no borrar, y las tres se comprueban
 *
 * 1. **Sigue en la colección.** Lo dice el diferencial.
 * 2. **Lo referencia otra entidad.** Lo dice el motor, que es quien tiene las claves foráneas:
 *    `app.upload_is_referenced` recorre las treinta y dos columnas que apuntan a `uploads` sin que
 *    nadie tenga que mantener la lista. Ver `0016_imagenes_de_producto.sql`.
 * 3. **Es un marcador de posición.** Nunca se elimina, aunque deje de estar referenciado.
 *
 * ## Los bytes se retiran después de que la transacción cuaje
 *
 * `releaseUploads` borra las filas dentro de la transacción y devuelve **dónde** viven los objetos;
 * quien la llama retira los objetos con `sweepObjects` cuando la transacción ha terminado bien. Al
 * revés —retirar los objetos primero— una transacción que se revierte deja filas apuntando a
 * objetos que ya no existen, que es una imagen rota en la pantalla. Así, el único fallo posible es
 * dejar objetos que ya no reclama nadie: basura, no una referencia colgando.
 */

import { NotFoundError, UnprocessableError } from "@tfv/contracts"
import type { Transaction } from "@tfv/db"
import { uploads } from "@tfv/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import { removeObjects } from "./storage.ts"

/**
 * En qué queda una colección al sustituirla.
 *
 * `next` no es lo que llegó tal cual: es lo que llegó **sin repeticiones y en su orden**, que es la
 * colección que se va a guardar. Se devuelve para que quien escriba no tenga que volver a limpiarla
 * y para que las posiciones que persista sean las mismas que se calcularon aquí.
 */
export interface CollectionDiff {
  readonly next: readonly string[]
  /** Los que estaban y siguen. **No se tocan.** */
  readonly kept: readonly string[]
  readonly added: readonly string[]
  /** Los que dejaron de estar. Son los candidatos a borrarse, y sólo ellos. */
  readonly removed: readonly string[]
}

/**
 * La diferencia entre lo que hay y lo que llega.
 *
 * Función pura: es la mitad del requisito que se puede equivocar sin que ninguna base lo delate, y
 * por eso se prueba sin base.
 */
export function diffCollection(
  current: readonly string[],
  incoming: readonly string[],
): CollectionDiff {
  const next = [...new Set(incoming)]
  const before = new Set(current)
  const after = new Set(next)

  return {
    next,
    kept: next.filter((id) => before.has(id)),
    added: next.filter((id) => !before.has(id)),
    // En el orden en que estaban: lo que se enumere en un registro o en un mensaje se lee mejor
    // como estaba que como salga de un conjunto.
    removed: current.filter((id) => !after.has(id)),
  }
}

/**
 * Lo que quedó suelto, y dónde vivían sus objetos.
 *
 * `paths` es el prefijo de cada archivo en el almacenamiento, no la clave de un objeto: bajo él
 * cuelgan el original y los cuatro derivados, y se retiran los cinco de una vez.
 */
export interface Released {
  readonly deleted: readonly string[]
  readonly paths: readonly string[]
}

const NOTHING: Released = { deleted: [], paths: [] }

/**
 * Borra los archivos que ya no reclama nadie.
 *
 * Se llama **después** de haber retirado las referencias —borrada la fila de la galería, o puesta
 * la columna al archivo nuevo— y **dentro de la misma transacción**: la comprobación de referencias
 * mira el estado de la transacción, así que hacerla antes diría que el archivo sigue en uso por la
 * referencia que se está quitando.
 *
 * Devuelve sólo lo que borró de verdad. Un archivo que se conserva por cualquiera de las tres
 * razones no aparece, y por eso quien la llame no puede confundir «se pidió soltarlo» con «se
 * soltó».
 */
export async function releaseUploads(tx: Transaction, ids: readonly string[]): Promise<Released> {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return NOTHING

  const loose = await tx
    .select({ id: uploads.id, storagePath: uploads.storagePath })
    .from(uploads)
    .where(
      and(
        inArray(uploads.id, wanted),
        // Un marcador de posición nunca se elimina, aunque deje de estar referenciado: lo usan
        // todas las entidades que no subieron archivo propio.
        eq(uploads.isPlaceholder, false),
        sql`not app.upload_is_referenced(${uploads.id})`,
      ),
    )

  if (loose.length === 0) return NOTHING

  await tx.delete(uploads).where(
    inArray(
      uploads.id,
      loose.map((row) => row.id),
    ),
  )

  return {
    deleted: loose.map((row) => row.id),
    paths: loose.map((row) => row.storagePath),
  }
}

/**
 * Retira del almacenamiento los objetos de lo que se soltó.
 *
 * Va **fuera** de la transacción, y a propósito: es una llamada de red que puede tardar o fallar, y
 * tenerla dentro haría que la lentitud del almacenamiento se convirtiera en filas bloqueadas.
 */
export async function sweepObjects(released: Released): Promise<void> {
  if (released.paths.length === 0) return
  await removeObjects(released.paths)
}

/**
 * Sustituir **un** archivo por otro.
 *
 * El mismo requisito con la colección de un solo elemento, y se resuelve con el mismo diferencial
 * para que no haya dos reglas: asignar el que ya estaba no retira nada, y quitarlo sin poner otro
 * lo retira.
 */
export function diffSingle(current: string | null, incoming: string | null): CollectionDiff {
  return diffCollection(current === null ? [] : [current], incoming === null ? [] : [incoming])
}

// ─── Lo que se puede referenciar, y cómo se lee ──────────────────────────────

/**
 * Que las imágenes existan, sean de esta empresa y estén subidas.
 *
 * El archivo no lleva empresa —lo explica `0015_confirmacion_de_archivos.sql`—, así que lo que lo
 * acota a un arrendatario es el prefijo de la clave de su objeto. Uno de otra empresa responde **que
 * no existe**, no que no se puede: distinguir las dos cosas sería confirmar que existe.
 *
 * Y uno que no llegó a subirse tampoco entra. La spec dice que un archivo erróneo «no se muestra
 * como una imagen válida en ninguna superficie», y referenciarlo desde una entidad es meterlo en
 * una: la pantalla acabaría pintando un hueco roto sin saber por qué.
 */
export async function assertUsableImages(
  tx: Transaction,
  companyId: string,
  ids: readonly string[],
): Promise<void> {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return

  const rows = await tx
    .select({
      id: uploads.id,
      kind: uploads.kind,
      status: uploads.status,
      storagePath: uploads.storagePath,
    })
    .from(uploads)
    .where(inArray(uploads.id, wanted))

  const byId = new Map(rows.map((row) => [row.id, row]))

  for (const id of wanted) {
    const row = byId.get(id)
    if (row === undefined) throw new NotFoundError("La imagen no existe")
    // La misma respuesta para una de otra empresa: distinguirla sería confirmar que existe.
    if (!row.storagePath.startsWith(`${companyId}/`)) {
      throw new NotFoundError("La imagen no existe")
    }
    if (row.status !== "uploaded") {
      throw new UnprocessableError("La imagen no llegó a subirse")
    }
    if (row.kind !== "image") {
      throw new UnprocessableError("El archivo no es una imagen")
    }
  }
}

/** Las dos direcciones que una pantalla necesita de una imagen: la que se ve y la de celda. */
export interface ImageRef {
  readonly url: string
  /** El derivado de celda. Nulo cuando el navegador que la subió no supo producirlo. */
  readonly thumbnailUrl: string | null
}

/**
 * Las direcciones de un puñado de archivos, en **una** consulta.
 *
 * Una por entidad al pintar un listado son tantas consultas como filas tenga, que es el modo
 * clásico de que una rejilla con imágenes tarde diez veces más que la misma rejilla sin ellas.
 */
export async function imageRefs(
  tx: Transaction,
  ids: readonly (string | null)[],
): Promise<Map<string, ImageRef>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()

  const rows = await tx
    .select({ id: uploads.id, url: uploads.url, variants: uploads.variants })
    .from(uploads)
    .where(inArray(uploads.id, wanted))

  return new Map(
    rows.map((row) => [row.id, { url: row.url, thumbnailUrl: row.variants?.thumbnail ?? null }]),
  )
}
