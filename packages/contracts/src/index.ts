/**
 * Contratos compartidos entre el servidor y el navegador.
 *
 * Este paquete es la rebanada 01 del plan de migración: los mecanismos que **toda** capability
 * consume. No contiene lógica de dominio ni acceso a datos.
 *
 * Ver `openspec/specs/api-conventions`, `query-and-pagination` y `computed-fields`.
 */

export * from "./errors.ts"
export * from "./ids.ts"
export * from "./money.ts"
export * from "./pagination.ts"
export * from "./permissions.ts"
export * from "./query.ts"
export * from "./resource.ts"
