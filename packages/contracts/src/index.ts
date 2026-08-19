/**
 * Contratos compartidos entre el servidor y el navegador.
 *
 * Este paquete es la rebanada 01 del plan de migración: los mecanismos que **toda** capability
 * consume. No contiene lógica de dominio ni acceso a datos.
 *
 * Ver `openspec/specs/api-conventions`, `query-and-pagination` y `computed-fields`.
 */

export * from "./checkout.ts"
export * from "./api-client.ts"
export * from "./computed.ts"
export * from "./document.ts"
export * from "./errors.ts"
export * from "./idempotency.ts"
export * from "./ids.ts"
export * from "./money.ts"
export * from "./openapi-types.ts"
export * from "./order-chat.ts"
export * from "./order-status.ts"
export * from "./pagination.ts"
export * from "./permissions.ts"
export * from "./query.ts"
export * from "./quotation.ts"
export * from "./quote-status.ts"
export * from "./rate.ts"
export * from "./resource.ts"
export * from "./shipping.ts"
export * from "./shipping-status.ts"
export * from "./slug.ts"
export * from "./storefront.ts"
