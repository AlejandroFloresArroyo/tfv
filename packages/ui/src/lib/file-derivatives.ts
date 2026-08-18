/**
 * Cuántos objetos tiene un archivo y de qué tamaño es cada uno.
 *
 * `openspec/specs/media-storage/spec.md` lo dice sin ambigüedad: **un archivo de imagen no es un
 * objeto sino cinco** —el original y cuatro derivados—, y un video son cinco también —el video y
 * cuatro portadas—. Los derivados **se generan antes de subirse**, de modo que el almacenamiento
 * reciba cada tamaño ya redimensionado; el navegador produce los cinco objetos y sube los cinco.
 *
 * De ahí que esto sea una política y no un detalle del lienzo: la regla que gobierna el tamaño
 * —**un derivado nunca es mayor que el original**— es lo que hay que poder probar, y probarla con
 * un `canvas` delante exige un navegador. Aquí se decide qué medidas tendrá cada objeto;
 * `browser-media.ts` se limita a dibujarlas.
 *
 * Sin la regla de no ampliar, una foto de perfil de 400 px llega al visor a pantalla completa
 * estirada a 1600 y se ve peor que el original, ocupando dieciséis veces más.
 */

import type { FileKind } from "./file-kinds.ts"

/** El original y los cuatro derivados de la spec, de mayor a menor. */
export type UploadVariant = "original" | "large" | "medium" | "small" | "thumbnail"

export type Derivative = Exclude<UploadVariant, "original">

/**
 * El lado mayor de cada derivado, en píxeles.
 *
 * Los usos son los de la tabla de la spec: el grande es el visor a pantalla completa y los
 * documentos generados; el mediano, las vistas de detalle; el pequeño, las tarjetas de listado; la
 * miniatura, los avatares y las celdas de tabla.
 */
export const DERIVATIVE_EDGE: Readonly<Record<Derivative, number>> = {
  large: 1600,
  medium: 800,
  small: 400,
  thumbnail: 160,
}

/**
 * El formato de los derivados, que **lo decide el cliente porque es el cliente quien los dibuja**.
 *
 * Va en la petición de autorización (`derivativeContentType`) para que el servidor firme las
 * escrituras de las cuatro con el tipo que de verdad va a recibir. Cuando esto era un supuesto
 * —el servidor daba por hecho `image/jpeg` y el navegador escribía lo que quisiera—, el objeto
 * quedaba guardado con un tipo que no era el suyo y el navegador que lo leyera se lo descargaría
 * en vez de pintarlo. Ver `H-53`.
 *
 * JPEG por defecto: es lo que todo navegador sabe escribir con `toBlob`.
 */
export type DerivativeContentType = "image/jpeg" | "image/webp" | "image/png"

export const DERIVATIVE_CONTENT_TYPE: DerivativeContentType = "image/jpeg"

const IMAGE_VARIANTS: readonly UploadVariant[] = [
  "original",
  "large",
  "medium",
  "small",
  "thumbnail",
]

const SINGLE: readonly UploadVariant[] = ["original"]

/**
 * Los objetos que hay que escribir para este archivo.
 *
 * El orden importa al subir: **el original va primero**. Si la conexión se corta a mitad, lo que
 * ya está escrito es el archivo de verdad y no una miniatura sin su original.
 */
export function plannedVariants(kind: FileKind): readonly UploadVariant[] {
  return kind === "image" || kind === "video" ? IMAGE_VARIANTS : SINGLE
}

export interface Size {
  readonly width: number
  readonly height: number
}

/**
 * El tamaño que cabe en un cuadro de `edge` de lado **sin ampliar nunca**.
 *
 * El factor se aplica al lado mayor, así que una imagen apaisada y una vertical del mismo original
 * dan derivados del mismo peso. Y el resultado se redondea hacia arriba a 1: un panorama de
 * 6000×20 reducido a la miniatura daría medio píxel de alto, y un lienzo de altura cero no dibuja
 * nada —lo que se subiría es un archivo vacío—.
 */
export function fitWithin(source: Size, edge: number): Size {
  const longest = Math.max(source.width, source.height)
  if (longest <= 0) return { width: source.width, height: source.height }
  if (longest <= edge) return { width: source.width, height: source.height }

  const factor = edge / longest
  return {
    width: Math.max(1, Math.round(source.width * factor)),
    height: Math.max(1, Math.round(source.height * factor)),
  }
}

/** Las medidas de los cuatro derivados de un original de este tamaño. */
export function derivativeSizes(source: Size): Readonly<Record<Derivative, Size>> {
  return {
    large: fitWithin(source, DERIVATIVE_EDGE.large),
    medium: fitWithin(source, DERIVATIVE_EDGE.medium),
    small: fitWithin(source, DERIVATIVE_EDGE.small),
    thumbnail: fitWithin(source, DERIVATIVE_EDGE.thumbnail),
  }
}
