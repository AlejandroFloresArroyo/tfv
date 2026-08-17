/**
 * Registro estructurado con correlación por petición.
 *
 * Cada petición recibe un identificador que viaja en la respuesta y aparece en todo lo que se
 * registre durante su atención. Es lo que permite que un `500` genérico en producción se pueda
 * diagnosticar: el cliente ve el identificador, y con él se encuentra la traza íntegra en el
 * servidor.
 */

import { randomUUID } from "node:crypto"
import { isProduction } from "../env.ts"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogFields {
  readonly [key: string]: unknown
}

function emit(level: LogLevel, message: string, fields: LogFields): void {
  const entry = { level, message, at: new Date().toISOString(), ...fields }

  // En producción una línea por evento, para que la ingesta lo parsee.
  // En desarrollo, legible por una persona.
  const line = isProduction ? JSON.stringify(entry) : formatForHuman(level, message, fields)

  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.error(line)
}

function formatForHuman(level: LogLevel, message: string, fields: LogFields): string {
  const rest = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ")

  return `${level.toUpperCase().padEnd(5)} ${message}${rest ? ` · ${rest}` : ""}`
}

export interface Logger {
  readonly requestId: string
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
}

export function createLogger(requestId: string = randomUUID()): Logger {
  const withId = (fields: LogFields = {}) => ({ requestId, ...fields })

  return {
    requestId,
    debug: (message, fields) => emit("debug", message, withId(fields)),
    info: (message, fields) => emit("info", message, withId(fields)),
    warn: (message, fields) => emit("warn", message, withId(fields)),
    error: (message, fields) => emit("error", message, withId(fields)),
  }
}

/** Registro sin petición asociada: arranque, apagado, trabajos en segundo plano. */
export const rootLogger = {
  info: (message: string, fields?: LogFields) => emit("info", message, fields ?? {}),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields ?? {}),
  error: (message: string, fields?: LogFields) => emit("error", message, fields ?? {}),
}
