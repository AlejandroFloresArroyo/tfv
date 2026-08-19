/**
 * Qué es cada archivo, y cuántos objetos hay que escribir para guardarlo.
 *
 * Ver `openspec/specs/media-storage/spec.md`. Está aquí y no en el servicio porque lo necesitan los
 * dos lados: el navegador para saber qué produce antes de subir, y la API para autorizar la
 * escritura de exactamente eso y no de otra cosa.
 *
 * **La clasificación se hace por la extensión, no por lo que declare el navegador.** Un `.csv`
 * sale de Windows declarado como hoja de cálculo de Excel; fiarse de esa declaración es rechazar
 * archivos legítimos por incoherentes. La extensión la escribió una persona; el tipo lo adivinó un
 * sistema operativo.
 */

export const UPLOAD_KINDS = ["image", "video", "document", "file", "signature"] as const
export type UploadKind = (typeof UPLOAD_KINDS)[number]

/**
 * Por qué se dio por fallida una subida.
 *
 * Es un conjunto cerrado y no un texto libre porque **lo rellena una máquina, no una persona**: el
 * sistema de diseño no compone cadenas y el navegador no sabe en qué idioma se sirve la página, así
 * que un texto libre llegaría vacío o traducido al idioma del sistema operativo de quien subió.
 * Con claves, quien lo lea puede contarlas — y «este navegador no sabe descodificar este formato»
 * es una estadística útil, no un mensaje de error.
 */
export const UPLOAD_FAILURES = ["decode", "network", "abandoned"] as const
export type UploadFailure = (typeof UPLOAD_FAILURES)[number]

/** El original primero: si la conexión se corta, lo escrito es el archivo y no una miniatura. */
export const UPLOAD_VARIANTS = ["original", "thumbnail", "small", "medium", "large"] as const
export type UploadVariant = (typeof UPLOAD_VARIANTS)[number]

/**
 * La tabla de la spec, **en su orden**, que es el que ve quien abre el selector de archivos.
 *
 * `signature` no sale de ninguna extensión: la produce el capturador de firma.
 */
export const EXTENSIONS_BY_KIND: Readonly<
  Record<"image" | "video" | "document" | "file", readonly string[]>
> = {
  image: ["jpg", "jpeg", "png", "gif", "svg", "heic", "heif", "webp"],
  video: ["mp4", "mov", "m4v", "avi", "mkv", "webm", "ogv", "wmv", "flv", "3gp", "3g2", "hevc"],
  document: ["pdf"],
  file: ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"],
}

/** Derivado de la tabla, para preguntar por una extensión sin recorrerla. */
const EXTENSIONS: Readonly<Record<string, UploadKind>> = Object.fromEntries(
  Object.entries(EXTENSIONS_BY_KIND).flatMap(([kind, extensions]) =>
    extensions.map((extension) => [extension, kind as UploadKind]),
  ),
)

/**
 * El nombre partido, o nada si no sirve.
 *
 * La spec lo exige con su escenario: sin nombre o sin extensión se rechaza con `400`. Un archivo
 * llamado `.gitignore` tiene extensión y no nombre, y tampoco vale.
 */
export function splitFileName(fileName: string): { base: string; extension: string } | undefined {
  const trimmed = fileName.trim()
  const cut = trimmed.lastIndexOf(".")

  if (cut <= 0 || cut === trimmed.length - 1) return undefined

  return { base: trimmed.slice(0, cut), extension: trimmed.slice(cut + 1).toLowerCase() }
}

/** Lo que no está en la tabla es archivo genérico: se guarda igual, sin derivados. */
export function classify(extension: string): UploadKind {
  return EXTENSIONS[extension.toLowerCase()] ?? "file"
}

/** Los objetos a escribir. Cinco para lo que tiene derivados; uno para lo demás. */
export function plannedVariants(kind: UploadKind): readonly UploadVariant[] {
  return kind === "image" || kind === "video" ? UPLOAD_VARIANTS : ["original"]
}

function familyOf(contentType: string): UploadKind | undefined {
  const type = contentType.trim().toLowerCase()
  if (type === "") return undefined
  if (type.startsWith("image/")) return "image"
  if (type.startsWith("video/")) return "video"
  if (type === "application/pdf") return "document"
  return "file"
}

/**
 * Si lo declarado y la extensión hablan del mismo tipo de cosa.
 *
 * Compara **familias**, no cadenas: quien sube puede declarar `image/png` para un `.jpg` sin
 * mentir, y exigir la correspondencia exacta rechazaría medio catálogo por un desacuerdo entre
 * navegadores. Lo que no puede pasar es que un `.pdf` llegue declarado como imagen.
 */
export function isCoherent(contentType: string, extension: string): boolean {
  const family = familyOf(contentType)
  return family !== undefined && family === classify(extension)
}
