/**
 * Los marcadores de posición, como activos propios.
 *
 * Ver `openspec/specs/media-storage/spec.md`, requisito «Marcadores de posición compartidos».
 * Rebanada 08.
 *
 * ## Qué se estaba arreglando
 *
 * `DEFECTS.md` O-06: en la implementación anterior los marcadores apuntaban a **dominios de
 * terceros** —`test-videos.co.uk`, `w3.org`—, de modo que la imagen que se enseña cuando una
 * entidad no tiene la suya dependía de que un sitio ajeno siguiera en pie y sirviera lo mismo. La
 * salvaguarda que impide borrarlos estaba escrita desde la `0017`, pero **no había ninguno
 * sembrado**: protegía algo que no existía.
 *
 * ## Los activos, y de dónde salen
 *
 * Los cuatro archivos de `assets/` son del repositorio y no de nadie más:
 *
 * - `marcador-imagen.svg` y `marcador-video.svg`, dibujados a mano. Vectores, así que sirven a
 *   cualquier tamaño.
 * - `marcador-documento.pdf`, PDF vectorial escrito a mano —sin fuentes ni imágenes incrustadas,
 *   736 bytes—. **Si se edita hay que recalcular los desplazamientos de la tabla `xref`**, que van
 *   escritos dentro.
 * - `marcador-video.mp4`, dos segundos del cartel anterior, producido con
 *   `ffmpeg -loop 1 -i cartel.png -t 2 -r 12 -c:v libx264 -pix_fmt yuv420p -profile:v baseline`.
 *
 * ## Por qué cinco objetos, si un vector no tiene tamaños
 *
 * Porque la cuenta de la spec no admite excepciones: una imagen son cinco objetos y un video son
 * cinco —el video y cuatro portadas—. Escribir el mismo vector bajo las cuatro claves de derivado
 * cuesta dos kilobytes y hace que **toda dirección que alguien construya encuentre un objeto**. La
 * alternativa —cuatro direcciones apuntando al original— obliga a quien lea a saber que este
 * archivo es distinto, y esa clase de excepción es la que después nadie recuerda.
 *
 * ## Dónde viven, y por qué no bajo una empresa
 *
 * Bajo el prefijo `sistema/`, que ninguna empresa puede tener: los identificadores son UUID y
 * `sistema` no lo es. Son de todas, así que no pueden colgar de una. Eso obliga a que
 * `assertUsableImages` los admita explícitamente — sin esa excepción, el acotamiento por prefijo
 * los volvía inservibles para todas las empresas a la vez.
 *
 * ## Lo que esto todavía no hace
 *
 * **Nadie los asigna solo.** Hoy ninguna entidad exige archivo —`image_upload_id` admite nulo en
 * todas—, así que el escenario «se crea una entidad que exige imagen sin proporcionar ninguna» no
 * tiene dónde ocurrir. Lo que aquí se cierra es que el marcador exista, se pueda referenciar y no
 * se pueda borrar; asignarlo por omisión es de la rebanada que introduzca la primera entidad que lo
 * exija. Ver `HALLAZGOS.md` H-133.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { UploadVariant } from "@tfv/contracts/media"
import { withElevated } from "@tfv/db"
import { type UploadVariants, uploads } from "@tfv/db/schema"
import { eq } from "drizzle-orm"
import { type BucketReport, ensureBucket } from "./bucket.ts"
import { authorizeWrite, publicUrl } from "./storage.ts"

/** El prefijo de lo que no es de ninguna empresa. Ningún identificador de empresa puede valer esto. */
export const PLACEHOLDER_PREFIX = "sistema"

export interface PlaceholderObject {
  readonly variant: UploadVariant
  /** Nombre del archivo en `assets/`. */
  readonly file: string
  readonly extension: string
  readonly contentType: string
}

export interface Placeholder {
  /**
   * Fijo, y el mismo en toda instalación.
   *
   * Es lo que permite que una entidad sembrada en una máquina referencie el marcador en otra, y que
   * volver a sembrar reconozca el que ya está en vez de crear un segundo —que además el índice
   * único por tipo rechazaría—.
   */
  readonly id: string
  readonly kind: "image" | "video" | "document"
  readonly fileName: string
  readonly objects: readonly PlaceholderObject[]
}

const IMAGEN: PlaceholderObject = {
  variant: "original",
  file: "marcador-imagen.svg",
  extension: "svg",
  contentType: "image/svg+xml",
}

const CARTEL: PlaceholderObject = {
  variant: "original",
  file: "marcador-video.svg",
  extension: "svg",
  contentType: "image/svg+xml",
}

const DERIVADOS: readonly UploadVariant[] = ["thumbnail", "small", "medium", "large"]

/** El mismo vector bajo las cuatro claves de derivado. */
function derivatives(source: PlaceholderObject): readonly PlaceholderObject[] {
  return DERIVADOS.map((variant) => ({ ...source, variant }))
}

export const PLACEHOLDERS: readonly Placeholder[] = [
  {
    id: "00000000-0000-7000-8000-000000000001",
    kind: "image",
    fileName: "marcador-imagen.svg",
    objects: [IMAGEN, ...derivatives(IMAGEN)],
  },
  {
    id: "00000000-0000-7000-8000-000000000002",
    kind: "video",
    fileName: "marcador-video.mp4",
    objects: [
      {
        variant: "original",
        file: "marcador-video.mp4",
        extension: "mp4",
        contentType: "video/mp4",
      },
      // Las portadas de un video son imágenes, con independencia del formato del video.
      ...derivatives(CARTEL),
    ],
  },
  {
    id: "00000000-0000-7000-8000-000000000003",
    kind: "document",
    fileName: "marcador-documento.pdf",
    objects: [
      {
        variant: "original",
        file: "marcador-documento.pdf",
        extension: "pdf",
        contentType: "application/pdf",
      },
    ],
  },
]

const ASSETS = resolve(import.meta.dirname, "assets")

/** Los bytes de un activo del repositorio. Se lee en cada llamada: se siembra una vez, no en bucle. */
export function assetBytes(file: string): Buffer {
  return readFileSync(resolve(ASSETS, file))
}

/** La clave del objeto de una variante del marcador. */
export function placeholderPath(placeholder: Placeholder, object: PlaceholderObject): string {
  return `${PLACEHOLDER_PREFIX}/${placeholder.id}/${object.variant}.${object.extension}`
}

/** Las direcciones de los cuatro derivados, o nulas cuando el tipo no tiene. */
function variantsOf(placeholder: Placeholder): UploadVariants {
  const byVariant = new Map(
    placeholder.objects.map((object) => [
      object.variant,
      publicUrl(placeholderPath(placeholder, object)),
    ]),
  )

  return {
    thumbnail: byVariant.get("thumbnail") ?? null,
    small: byVariant.get("small") ?? null,
    medium: byVariant.get("medium") ?? null,
    large: byVariant.get("large") ?? null,
  }
}

/** ¿Está el objeto puesto? La dirección de lectura es pública, así que preguntarlo no cuesta firma. */
async function objectIsThere(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { method: "GET" })).ok
  } catch {
    return false
  }
}

export interface EnsureReport {
  /** Cuántas filas de marcador hay al terminar. Siempre tres. */
  readonly rows: number
  /** Cuántos objetos hubo que escribir. Cero cuando ya estaban todos. */
  readonly written: number
  /** El depósito en el que se escribieron, dejado puesto y comprobado antes de escribir nada. */
  readonly bucket: BucketReport
}

/**
 * Deja los tres marcadores puestos: sus objetos en el almacenamiento y sus filas en la base.
 *
 * **Idempotente y reparadora.** Se pregunta por cada objeto en lugar de fiarse de que la fila
 * exista, porque las dos mitades pueden separarse: un depósito recreado deja las filas apuntando a
 * bytes que ya no están, y ahí «ya está sembrado» significaría «la imagen queda rota para siempre».
 *
 * Escribe **por el mismo camino que el navegador**: pide una autorización acotada al objeto y la
 * usa. No es ceremonia — es lo que hace que sembrar funcione con cualquier proveedor sin escribir
 * una segunda forma de subir, y que un fallo de firma aparezca aquí y no la primera vez que alguien
 * sube una foto.
 */
export async function ensurePlaceholders(): Promise<EnsureReport> {
  // Primero el depósito: escribir por el camino del navegador da por hecho que hay dónde, y hasta
  // ahora ese «dónde» existía porque alguien lo creó a mano (`HALLAZGOS.md` H-136). Con esto, la
  // única vía que deja marcadores en producción deja también el depósito que los sostiene.
  const bucket = await ensureBucket()
  let written = 0

  for (const placeholder of PLACEHOLDERS) {
    for (const object of placeholder.objects) {
      const path = placeholderPath(placeholder, object)
      if (await objectIsThere(publicUrl(path))) continue

      const authorization = await authorizeWrite(path, object.contentType)
      const response = await fetch(authorization.url, {
        method: authorization.method,
        headers: authorization.headers,
        body: new Uint8Array(assetBytes(object.file)),
      })

      if (!response.ok) {
        throw new Error(
          `No se pudo escribir el marcador de ${placeholder.kind} (${path}): ${response.status}`,
        )
      }

      written += 1
    }
  }

  const rows = await withElevated("sembrar marcadores de posición", async (tx) => {
    for (const placeholder of PLACEHOLDERS) {
      const original = placeholder.objects[0]
      if (original === undefined) continue

      const row = {
        kind: placeholder.kind,
        status: "uploaded" as const,
        url: publicUrl(placeholderPath(placeholder, original)),
        variants: variantsOf(placeholder),
        fileName: placeholder.fileName,
        extension: original.extension,
        contentType: original.contentType,
        byteSize: assetBytes(original.file).byteLength,
        storagePath: `${PLACEHOLDER_PREFIX}/${placeholder.id}`,
        isPlaceholder: true,
      }

      // Se actualiza además de insertar: cambiar de proveedor cambia las direcciones, y un marcador
      // que apunta al almacenamiento anterior es la imagen rota que O-06 dejaba ver.
      await tx
        .insert(uploads)
        .values({ id: placeholder.id, ...row })
        .onConflictDoUpdate({ target: uploads.id, set: { ...row, updatedAt: new Date() } })
    }

    return tx.select({ id: uploads.id }).from(uploads).where(eq(uploads.isPlaceholder, true))
  })

  return { rows: rows.length, written, bucket }
}
