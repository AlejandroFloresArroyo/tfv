/**
 * Qué es cada archivo, qué se admite y qué se puede enseñar antes de subirlo.
 *
 * La tabla es la de `openspec/specs/media-storage/spec.md`, y está aquí —fuera de React, con sus
 * pruebas— por la misma razón que la máquina del asistente: lo que decide si un archivo entra o se
 * rechaza no puede vivir dentro de un manejador de `drop`, donde sólo se ejerce con un ratón.
 *
 * Tres decisiones que no son evidentes leyendo la tabla:
 *
 * - **El tipo de contenido lo dicta la extensión, no el navegador.** Windows declara un `.csv` como
 *   hoja de Excel; la API rechaza con `400` un tipo que no case con la extensión. Confiar en
 *   `File.type` es cambiar un archivo bueno por un error del servidor.
 * - **Un nombre sin extensión se rechaza aquí**, que es donde el usuario todavía tiene el diálogo
 *   abierto, en vez de gastar la petición que la API va a rechazar igualmente.
 * - **`heic` y `heif` se clasifican como imagen y no se pueden previsualizar.** Son cosas
 *   distintas: la API los acepta y el navegador de escritorio no los pinta. Ver `H-51`.
 */

/** El reparto de la spec. `signature` no sale de ninguna extensión: la produce el capturador. */
export type FileKind = "image" | "video" | "document" | "file" | "signature"

/** Extensiones por tipo, **en el orden de la tabla**: es el que ve quien abre el selector. */
const EXTENSIONS: Readonly<Record<"image" | "video" | "document" | "file", readonly string[]>> = {
  image: ["jpg", "jpeg", "png", "gif", "svg", "heic", "heif", "webp"],
  video: ["mp4", "mov", "m4v", "avi", "mkv", "webm", "ogv", "wmv", "flv", "3gp", "3g2", "hevc"],
  document: ["pdf"],
  file: ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"],
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",

  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  webm: "video/webm",
  ogv: "video/ogg",
  wmv: "video/x-ms-wmv",
  flv: "video/x-flv",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  hevc: "video/hevc",

  pdf: "application/pdf",

  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
}

/**
 * Formatos de imagen que ningún navegador de escritorio pinta sin una biblioteca de descodificación
 * entera. Se aceptan y se suben; lo que no se puede es enseñarlos.
 */
const UNPREVIEWABLE_IMAGES: readonly string[] = ["heic", "heif"]

/** La extensión en minúsculas, o nada si el nombre no tiene **nombre y** extensión. */
export function extensionOf(fileName: string): string | undefined {
  const cut = fileName.lastIndexOf(".")
  // `cut < 1` cubre las dos formas inválidas de una vez: sin punto, y con el punto al principio
  // —`.gitignore`, que tiene extensión pero no nombre—.
  if (cut < 1 || cut === fileName.length - 1) return undefined
  return fileName.slice(cut + 1).toLowerCase()
}

/** El tipo de la spec. Lo no reconocido es archivo genérico, incluido el nombre sin extensión. */
export function classify(fileName: string): FileKind {
  const extension = extensionOf(fileName)
  if (extension === undefined) return "file"

  for (const [kind, extensions] of Object.entries(EXTENSIONS)) {
    if (extensions.includes(extension)) return kind as FileKind
  }
  return "file"
}

/**
 * El tipo de contenido que se declara a la API.
 *
 * `declared` es lo que dijo el navegador, y sólo se usa cuando la extensión no está en la tabla:
 * para las que sí están, la extensión manda, porque es con ella con la que la API va a comprobar la
 * coherencia.
 */
export function contentTypeFor(fileName: string, declared?: string | undefined): string {
  const extension = extensionOf(fileName)
  const known = extension === undefined ? undefined : CONTENT_TYPES[extension]

  if (known !== undefined) return known
  return declared !== undefined && declared !== "" ? declared : "application/octet-stream"
}

/** Qué se puede enseñar de este archivo antes de subirlo. */
export type Previewability =
  /** El navegador lo pinta tal cual. */
  | "image"
  /** Hay que extraerle un fotograma para verlo. */
  | "video"
  /** Es una imagen y aquí no se puede pintar: se dice, no se deja el hueco. */
  | "unsupported"
  /** No hay nada que enseñar, y no es un fallo. */
  | "none"

export function previewability(fileName: string): Previewability {
  const kind = classify(fileName)
  if (kind === "video") return "video"
  if (kind !== "image") return "none"

  const extension = extensionOf(fileName)
  return extension !== undefined && UNPREVIEWABLE_IMAGES.includes(extension)
    ? "unsupported"
    : "image"
}

/** Lo que este campo admite. Todo opcional: sin política no se rechaza nada. */
export interface SelectionPolicy {
  readonly accept?: readonly FileKind[] | undefined
  readonly maxBytes?: number | undefined
  /** Cuántos archivos admite la colección en total, no cuántos se añaden de una vez. */
  readonly maxFiles?: number | undefined
}

export interface FileCandidate {
  readonly fileName: string
  readonly byteSize: number
  /** Lo que declara el navegador. Ver `contentTypeFor`: sólo se usa como último recurso. */
  readonly contentType?: string | undefined
}

export interface AcceptedFile {
  readonly fileName: string
  readonly byteSize: number
  readonly contentType: string
  readonly kind: FileKind
}

/** Por qué se rechazó. El texto lo pone quien usa el selector: aquí no se habla ningún idioma. */
export type RejectionReason = "name" | "kind" | "size" | "count"

export interface Rejection {
  readonly fileName: string
  readonly reason: RejectionReason
}

export interface Review {
  readonly accepted: readonly AcceptedFile[]
  readonly rejected: readonly Rejection[]
}

/**
 * Revisa lo que se acaba de elegir o soltar.
 *
 * `taken` son los que ya estaban elegidos, porque el límite es de la colección entera: soltar tres
 * sobre un campo que ya tiene dos y admite cuatro acepta dos y rechaza uno.
 */
export function review(
  candidates: readonly FileCandidate[],
  policy: SelectionPolicy = {},
  taken = 0,
): Review {
  const accepted: AcceptedFile[] = []
  const rejected: Rejection[] = []

  for (const candidate of candidates) {
    const { fileName, byteSize } = candidate

    if (extensionOf(fileName) === undefined) {
      rejected.push({ fileName, reason: "name" })
      continue
    }

    const kind = classify(fileName)
    if (policy.accept !== undefined && !policy.accept.includes(kind)) {
      rejected.push({ fileName, reason: "kind" })
      continue
    }

    if (policy.maxBytes !== undefined && byteSize > policy.maxBytes) {
      rejected.push({ fileName, reason: "size" })
      continue
    }

    if (policy.maxFiles !== undefined && taken + accepted.length >= policy.maxFiles) {
      rejected.push({ fileName, reason: "count" })
      continue
    }

    accepted.push({
      fileName,
      byteSize,
      contentType: contentTypeFor(fileName, candidate.contentType),
      kind,
    })
  }

  return { accepted, rejected }
}

/**
 * El `accept` del `<input type=file>`.
 *
 * Extensiones y no `image/*`: el comodín deja pasar formatos que la API rechaza, y ese rechazo
 * llega cuando el usuario ya eligió. Nada admitido significa no restringir, no restringirlo todo.
 */
export function acceptAttribute(kinds?: readonly FileKind[] | undefined): string | undefined {
  if (kinds === undefined || kinds.length === 0) return undefined

  const extensions = kinds.flatMap((kind) => (kind === "signature" ? [] : EXTENSIONS[kind]))
  return extensions.length === 0 ? undefined : extensions.map((one) => `.${one}`).join(",")
}
