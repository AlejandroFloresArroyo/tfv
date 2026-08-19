/**
 * Mudar las direcciones que ya están escritas.
 *
 * Ver `openspec/specs/media-storage/spec.md`: «Un cambio de proveedor SHALL contemplar la
 * actualización de las direcciones ya persistidas, porque están incrustadas en documentos generados
 * y en enlaces compartidos».
 *
 * ## Por qué esto no es configuración
 *
 * Cambiar `STORAGE_PROVIDER` cambia dónde se escribe **de ahora en adelante**. Las direcciones de
 * lectura de todo lo ya subido viven en la fila de cada archivo —`url` y las cuatro de
 * `variants`—, y ninguna variable de entorno las mueve. Mudarse sin esto deja el catálogo entero
 * apuntando a un almacenamiento que ya no se está usando: mientras el viejo siga en pie no se nota,
 * y el día que se apague se caen todas las imágenes a la vez.
 *
 * ## Qué se reescribe, y qué no hay que reescribir
 *
 * Sólo `uploads`. Se recorrió el esquema buscando dónde más pudiera haber una dirección de
 * almacenamiento guardada, y no hay: `receipt_url` y `checkout_url` son del procesador de pagos,
 * `activity.url` es una ruta de la aplicación, y los documentos generados **no incrustan
 * direcciones** todavía —se componen al pedirlos—. Que hoy sea una tabla es una propiedad del
 * sistema, no una suposición de este guion: ver `HALLAZGOS.md` H-135.
 *
 * ## Por prefijo, y sin aplicar por omisión
 *
 * Se cambia la **raíz** y se conserva la clave, que es lo que hace la operación idempotente y lo
 * que impide convertir una dirección ajena en una rota. Y `apply` llega en falso: lo primero que
 * hay que poder hacer antes de mover mil filas es contar cuántas se van a mover.
 */

import { withElevated } from "@tfv/db"
import { type UploadVariants, uploads } from "@tfv/db/schema"
import { eq } from "drizzle-orm"

/** Sin barra final: la raíz es un prefijo, y la barra la pone la clave. */
function normalizeRoot(root: string): string {
  return root.replace(/\/+$/, "")
}

/**
 * La misma dirección bajo otra raíz, o la de entrada si no cuelga de la vieja.
 *
 * Función pura, y por eso se prueba sin base: es la mitad de la operación que se puede equivocar
 * sin que ninguna consulta lo delate.
 */
export function rewriteAddress(address: string, from: string, to: string): string {
  const source = normalizeRoot(from)
  const target = normalizeRoot(to)

  if (!address.startsWith(`${source}/`)) return address
  return `${target}${address.slice(source.length)}`
}

function rewriteVariants(
  variants: UploadVariants | null,
  from: string,
  to: string,
): UploadVariants | null {
  if (variants === null) return null

  // Un derivado nulo sigue nulo: reescribir no inventa direcciones que nadie escribió.
  const at = (value: string | null) => (value === null ? null : rewriteAddress(value, from, to))

  return {
    thumbnail: at(variants.thumbnail),
    small: at(variants.small),
    medium: at(variants.medium),
    large: at(variants.large),
  }
}

export interface RewriteReport {
  /** Cuántas filas se miraron. */
  readonly scanned: number
  /** Cuántas cambian de raíz. Con `apply` en falso, cuántas **cambiarían**. */
  readonly changed: number
  readonly applied: boolean
  /** Un puñado de ejemplos, para poder mirar antes de aplicar. */
  readonly samples: readonly { readonly before: string; readonly after: string }[]
}

const SAMPLES = 5

/**
 * Recorre los archivos y lleva sus direcciones de una raíz a otra.
 *
 * Los marcadores de posición entran como cualquier otro: no se eliminan nunca, y por eso mismo son
 * los que más tiempo llevan apuntando a la raíz vieja. Dejarlos fuera sería dejar rota justamente
 * la imagen que se enseña cuando falta otra.
 */
export async function rewritePersistedUrls(options: {
  readonly from: string
  readonly to: string
  readonly apply: boolean
}): Promise<RewriteReport> {
  const { from, to, apply } = options

  return withElevated("reescribir direcciones de archivos", async (tx) => {
    const rows = await tx
      .select({ id: uploads.id, url: uploads.url, variants: uploads.variants })
      .from(uploads)

    let changed = 0
    const samples: { before: string; after: string }[] = []

    for (const row of rows) {
      const url = rewriteAddress(row.url, from, to)
      const variants = rewriteVariants(row.variants, from, to)

      // Se comparan **campo a campo** y no serializando: `jsonb` reordena las claves al guardarlas
      // —las ordena por longitud—, así que dos objetos con los mismos valores salen con otro orden
      // y comparar sus cadenas daba «cambió» en todas las filas. Con eso, correr el guion dos veces
      // reescribía las mil filas la segunda vez sin cambiar ni una dirección.
      const moved =
        url !== row.url ||
        variants?.thumbnail !== row.variants?.thumbnail ||
        variants?.small !== row.variants?.small ||
        variants?.medium !== row.variants?.medium ||
        variants?.large !== row.variants?.large

      if (!moved) continue

      changed += 1
      if (samples.length < SAMPLES) samples.push({ before: row.url, after: url })

      if (apply) {
        await tx.update(uploads).set({ url, variants }).where(eq(uploads.id, row.id))
      }
    }

    return { scanned: rows.length, changed, applied: apply, samples }
  })
}
