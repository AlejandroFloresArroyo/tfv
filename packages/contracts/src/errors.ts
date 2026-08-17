/**
 * Contrato de error.
 *
 * Ver `openspec/specs/api-conventions/spec.md`.
 *
 * La implementación anterior lanzaba los errores de dominio sin código, así que **todo salía como
 * 500**: no había un solo 400, 403, 404 ni 409 en toda la API. Aquí cada error de dominio nace con
 * su código, y el manejador de la aplicación no tiene que adivinarlo.
 *
 * Detalle importante de `access-control`: pedir un recurso de otra empresa devuelve **404, no
 * 403**, para no revelar que existe. Por eso `outOfScope()` produce un `NotFoundError`.
 */

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500

/** Un problema atribuible a un campo concreto de la entrada. */
export interface FieldIssue {
  /** Ruta del campo, con puntos: `payment.advance`. */
  readonly key: string
  readonly message: string
}

/** La forma de toda respuesta de error. `details` sólo se rellena fuera de producción. */
export interface ErrorBody {
  readonly statusCode: ErrorStatus
  readonly error: string
  readonly message: string | readonly FieldIssue[]
  readonly details?: unknown
}

export abstract class DomainError extends Error {
  abstract readonly status: ErrorStatus
  /** Identificador estable del tipo de error, apto para que un cliente lo discrimine. */
  abstract readonly code: string

  /** Contexto para el registro del servidor. Nunca sale al cliente en producción. */
  readonly context: Readonly<Record<string, unknown>>

  constructor(message: string, context: Readonly<Record<string, unknown>> = {}) {
    super(message)
    this.name = new.target.name
    this.context = context
  }
}

/** La entrada no cumple el esquema declarado. */
export class ValidationError extends DomainError {
  readonly status = 400 as const
  readonly code = "validation_failed"
  readonly issues: readonly FieldIssue[]

  constructor(issues: readonly FieldIssue[], context?: Readonly<Record<string, unknown>>) {
    super("La solicitud no es válida", context)
    this.issues = issues
  }
}

/** Falta la credencial, o no verifica, o ha caducado. */
export class UnauthenticatedError extends DomainError {
  readonly status = 401 as const
  readonly code = "unauthenticated"

  constructor(message = "Se requiere autenticación") {
    super(message)
  }
}

/** La credencial es válida pero no autoriza esta operación. */
export class ForbiddenError extends DomainError {
  readonly status = 403 as const
  readonly code = "forbidden"

  constructor(message = "No tienes permiso para realizar esta acción", permission?: string) {
    super(message, permission ? { permission } : {})
  }
}

/** El recurso no existe, o existe fuera del alcance de quien lo pide. */
export class NotFoundError extends DomainError {
  readonly status = 404 as const
  readonly code = "not_found"

  constructor(message = "No se encontró el recurso", context?: Readonly<Record<string, unknown>>) {
    super(message, context)
  }
}

/** La operación choca con el estado actual: unicidad, transición ilegal, doble ejecución. */
export class ConflictError extends DomainError {
  readonly status = 409 as const
  readonly code = "conflict"
}

/** El cuerpo excede el límite del endpoint. */
export class PayloadTooLargeError extends DomainError {
  readonly status = 413 as const
  readonly code = "payload_too_large"

  constructor(message = "El contenido enviado es demasiado grande") {
    super(message)
  }
}

/** Cumple el esquema pero no tiene sentido: existencia insuficiente, fechas incoherentes. */
export class UnprocessableError extends DomainError {
  readonly status = 422 as const
  readonly code = "unprocessable"
}

/** Se superó el límite de peticiones. */
export class RateLimitedError extends DomainError {
  readonly status = 429 as const
  readonly code = "rate_limited"

  constructor(retryAfterSeconds: number) {
    super("Demasiadas solicitudes. Inténtalo más tarde.", { retryAfterSeconds })
  }
}

/** Fallo no previsto. El mensaje que ve el cliente es siempre genérico. */
export class InternalError extends DomainError {
  readonly status = 500 as const
  readonly code = "internal_error"

  constructor(cause?: unknown) {
    super("Error interno del servidor", cause === undefined ? {} : { cause })
  }
}

// ─── Ayudas de uso frecuente ─────────────────────────────────────────────────

/**
 * El recurso pertenece a otra empresa.
 *
 * Devuelve 404 a propósito: un 403 confirmaría que el recurso existe, que es justo lo que el
 * aislamiento entre arrendatarios trata de no revelar.
 */
export function outOfScope(resource: string, id?: string): NotFoundError {
  return new NotFoundError("No se encontró el recurso", { resource, id, reason: "out_of_scope" })
}

export function missingPermission(permission: string): ForbiddenError {
  return new ForbiddenError("No tienes permiso para realizar esta acción", permission)
}

// ─── Serialización ───────────────────────────────────────────────────────────

/**
 * Convierte cualquier error en el cuerpo de respuesta.
 *
 * `exposeDetails` debe ser falso en producción: ahí el cliente recibe un mensaje genérico y el
 * detalle íntegro queda sólo en el registro del servidor, correlacionado con la petición.
 */
export function toErrorBody(error: unknown, exposeDetails: boolean): ErrorBody {
  if (error instanceof ValidationError) {
    return {
      statusCode: error.status,
      error: error.code,
      message: error.issues,
      ...(exposeDetails && { details: error.context }),
    }
  }

  if (error instanceof DomainError) {
    return {
      statusCode: error.status,
      error: error.code,
      message: error.message,
      ...(exposeDetails && { details: error.context }),
    }
  }

  return {
    statusCode: 500,
    error: "internal_error",
    message: "Error interno del servidor",
    ...(exposeDetails && {
      details: error instanceof Error ? { name: error.name, stack: error.stack } : { error },
    }),
  }
}

export function statusOf(error: unknown): ErrorStatus {
  return error instanceof DomainError ? error.status : 500
}
