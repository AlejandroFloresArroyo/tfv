/**
 * Los errores de un esquema del contrato, puestos en su campo.
 *
 * El asistente valida cada paso con **el mismo esquema que usa el servidor** (`@tfv/contracts`).
 * Lo que falta entre una cosa y la otra es esto: convertir la lista de incidencias de Zod en un
 * mapa `campo → mensaje`, que es lo que la cáscara de campo sabe pintar.
 *
 * El mensaje no sale de Zod. Los suyos están en inglés y son para quien programa —«String must
 * contain at least 1 character(s)»—; la aplicación se sirve en dos idiomas y le habla a quien
 * llena un formulario. Así que de la incidencia se toma **qué clase de error es**, y el texto lo
 * pone la capa de traducción.
 */

interface Issue {
  readonly code?: string | undefined
  readonly path: readonly PropertyKey[]
  /** En Zod 4, de qué es el tamaño que no cuadra: una cadena, un número, un array… */
  readonly origin?: string | undefined
}

interface ParseFailure {
  readonly success: boolean
  readonly error?: { readonly issues: readonly Issue[] } | undefined
}

/** Las clases de error que la aplicación sabe explicar. */
export type FieldErrorCode = "required" | "tooLong" | "tooShort" | "tooBig" | "tooSmall" | "invalid"

function codeOf(issue: Issue): FieldErrorCode {
  const text = issue.origin === "string"

  switch (issue.code) {
    // Un campo que el formulario no manda llega como ausente, no como vacío.
    case "invalid_type":
      return "required"
    case "too_small":
      return text ? "required" : "tooSmall"
    case "too_big":
      return text ? "tooLong" : "tooBig"
    default:
      return "invalid"
  }
}

/**
 * Devuelve `campo → mensaje`, con el camino separado por puntos para los anidados.
 *
 * Se queda con **el primer error de cada campo**: enseñar dos mensajes bajo un mismo control es
 * pedirle a quien lo lee que decida cuál arregla primero.
 */
export function fieldErrors(
  result: ParseFailure,
  translate: (code: FieldErrorCode) => string,
): Record<string, string> {
  if (result.success || result.error === undefined) return {}

  const errors: Record<string, string> = {}

  for (const issue of result.error.issues) {
    const field = issue.path.map(String).join(".")
    if (field === "" || field in errors) continue
    errors[field] = translate(codeOf(issue))
  }

  return errors
}
