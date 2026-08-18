/**
 * Lo que hay que hacer con un `canvas` delante: reducir imágenes y sacarle un fotograma a un video.
 *
 * Es la única parte de todo esto que necesita un navegador, y por eso está sola en su archivo. La
 * política —qué tamaños, y que un derivado nunca sea mayor que el original— vive en
 * `file-derivatives.ts` con sus pruebas; aquí sólo se dibuja lo que aquélla decide.
 *
 * **Nada de esto tiene prueba unitaria.** `createImageBitmap`, `canvas.toBlob` y la búsqueda de un
 * fotograma en un `<video>` no existen fuera de un navegador, y fingirlos probaría el fingimiento.
 * Lo que sí se puede afirmar es lo que hace cuando no puede: **devolver menos objetos**, nunca uno
 * inventado.
 *
 * Dos cosas que se aprenden sólo al escribirlo:
 *
 * - **La orientación viene en los metadatos.** Una foto de teléfono trae `Orientation` en su EXIF y
 *   el lienzo no la aplica solo: sin `imageOrientation: "from-image"`, la miniatura de media
 *   plantilla de fotos sale tumbada mientras el original se ve derecho.
 * - **`heic` no se descodifica en un escritorio.** En un iPhone sí —Safari lo trae de casa—, así
 *   que el mismo código produce cinco objetos allí y uno aquí. No es un fallo que haya que tapar:
 *   es la razón de que la máquina admita que falten derivados. Ver `H-52`.
 */

import {
  DERIVATIVE_CONTENT_TYPE,
  type DerivativeContentType,
  derivativeSizes,
  type Size,
  type UploadVariant,
} from "./file-derivatives.ts"
import type { FileKind } from "./file-kinds.ts"

/**
 * Lo transparente se compone sobre blanco en lugar de quedar en negro, que es lo que hace un lienzo
 * vacío al aplanarse. El formato de salida es política y vive en `file-derivatives.ts`: **es el
 * mismo que se declara en la petición de autorización**, y por eso se pasa entero desde arriba en
 * vez de fijarse aquí.
 */
const DERIVATIVE_QUALITY = 0.82

/** Más de esto esperando un fotograma es un formato que este navegador no va a descodificar. */
const FRAME_TIMEOUT = 8_000

function canvasOf(size: Size): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size.width
  canvas.height = size.height
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, type: DerivativeContentType): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), type, DERIVATIVE_QUALITY)
  })
}

async function paint(
  source: CanvasImageSource,
  size: Size,
  type: DerivativeContentType,
): Promise<Blob | undefined> {
  if (size.width <= 0 || size.height <= 0) return undefined

  const canvas = canvasOf(size)
  const context = canvas.getContext("2d")
  if (context === null) return undefined

  // El blanco va debajo: aplanar transparencia sobre un lienzo vacío la deja en negro, y una
  // miniatura de un logo con fondo transparente acaba siendo un cuadro negro en la tabla.
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(source, 0, 0, size.width, size.height)

  return await toBlob(canvas, type)
}

/**
 * Descodifica la imagen respetando la orientación de su EXIF.
 *
 * Devuelve nada cuando el navegador no sabe leer el formato —`heic` y `heif` fuera de Apple—, que
 * es una respuesta legítima: se subirá el original y no sus derivados.
 */
async function decode(file: Blob): Promise<ImageBitmap | undefined> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    return undefined
  }
}

async function derivativesOf(
  source: ImageBitmap,
  variants: readonly UploadVariant[],
  type: DerivativeContentType,
): Promise<Map<UploadVariant, Blob>> {
  const sizes = derivativeSizes({ width: source.width, height: source.height })
  const produced = new Map<UploadVariant, Blob>()

  for (const variant of variants) {
    if (variant === "original") continue
    const size = sizes[variant]
    const blob = await paint(source, size, type)
    if (blob !== undefined) produced.set(variant, blob)
  }

  return produced
}

/**
 * Los objetos de una imagen: el original tal cual y los derivados ya reducidos.
 *
 * El original **no se toca**: es el archivo que el usuario eligió, y recomprimirlo para «ahorrar»
 * es perder información que los derivados ya no tienen.
 */
export async function imageObjects(
  file: File,
  variants: readonly UploadVariant[],
  type: DerivativeContentType = DERIVATIVE_CONTENT_TYPE,
): Promise<ReadonlyMap<UploadVariant, Blob>> {
  const source = await decode(file)
  const produced =
    source === undefined
      ? new Map<UploadVariant, Blob>()
      : await derivativesOf(source, variants, type)
  source?.close()

  if (variants.includes("original")) produced.set("original", file)
  return produced
}

/**
 * Un fotograma del video, o nada.
 *
 * Se busca un segundo adentro y no el instante cero: el primer fotograma de una grabación de
 * teléfono suele ser el suelo o un borrón de movimiento. Y hay un plazo, porque un formato que este
 * navegador no descodifica —`avi`, `mkv`, `wmv`— no falla: se queda callado para siempre.
 */
export function coverFrame(
  file: File,
  type: DerivativeContentType = DERIVATIVE_CONTENT_TYPE,
  timeout = FRAME_TIMEOUT,
): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    let settled = false

    function finish(blob: Blob | undefined) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeAttribute("src")
      video.load()
      URL.revokeObjectURL(url)
      resolve(blob)
    }

    const timer = setTimeout(() => finish(undefined), timeout)

    video.muted = true
    video.playsInline = true
    video.preload = "metadata"
    video.addEventListener("error", () => finish(undefined))

    video.addEventListener("loadeddata", () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      video.currentTime = duration > 2 ? 1 : duration / 2
    })

    video.addEventListener("seeked", () => {
      void paint(video, { width: video.videoWidth, height: video.videoHeight }, type).then(finish)
    })

    video.src = url
  })
}

/**
 * Los objetos de un video: el video tal cual y cuatro portadas del mismo fotograma.
 *
 * Si no hay fotograma, se devuelve sólo el video. Subir cuatro portadas en negro sería peor que no
 * tenerlas: la ficha enseñaría un cuadro negro y nadie sabría que es un fallo de descodificación.
 */
export async function videoObjects(
  file: File,
  variants: readonly UploadVariant[],
  type: DerivativeContentType = DERIVATIVE_CONTENT_TYPE,
): Promise<ReadonlyMap<UploadVariant, Blob>> {
  const frame = await coverFrame(file, type)
  const source = frame === undefined ? undefined : await decode(frame)

  const produced =
    source === undefined
      ? new Map<UploadVariant, Blob>()
      : await derivativesOf(source, variants, type)
  source?.close()

  if (variants.includes("original")) produced.set("original", file)
  return produced
}

/**
 * El puerto `prepare` de la máquina, para un archivo del navegador.
 *
 * Produce lo que puede y calla lo que no: es la máquina la que decide qué hacer con lo que falta.
 */
export function prepareObjects(
  file: File,
  kind: FileKind,
  variants: readonly UploadVariant[],
  /** El mismo que se declaró en la petición de autorización: ahí es donde se firma. */
  type: DerivativeContentType = DERIVATIVE_CONTENT_TYPE,
): Promise<ReadonlyMap<UploadVariant, Blob>> {
  if (kind === "image") return imageObjects(file, variants, type)
  if (kind === "video") return videoObjects(file, variants, type)
  return Promise.resolve(new Map<UploadVariant, Blob>([["original", file]]))
}
