/**
 * Esquema completo.
 *
 * El orden de estas líneas **no importa**: lo que determina la evaluación es el grafo de
 * importaciones de cada módulo, no este barril. `commerce.ts` importa `websites.ts` directamente,
 * así que sitios se evalúa antes con independencia de cómo estén ordenadas estas reexportaciones.
 *
 * Cada módulo documenta, para sus tablas de arrendatario, **cuál es su vía hasta la empresa**: eso
 * es lo que las políticas de aislamiento de la rebanada 06 necesitan para poder expresarse.
 *
 * Dos referencias quedan **sin clave foránea a propósito**, por ciclos entre módulos, y ambas lo
 * documentan en su sitio: `warehouse_stock_units.created_by_quote_id` y
 * `production_shoppings.warehouse_order_id`. Las dos son trazabilidad, no propiedad.
 */

// ─── Base ────────────────────────────────────────────────────────────────────
export * from "./_shared.ts"
export * from "./activity.ts"
export * from "./addresses.ts"
// ─── Dinero de la plataforma ─────────────────────────────────────────────────
export * from "./billing.ts"
export * from "./categories.ts"
// ─── Comercio ────────────────────────────────────────────────────────────────
// Después de los dominios: la compra referencia sitios, y el pedido de almacén referencia tanto la
// orden de compra de producción como el pedido de comprador.
export * from "./commerce.ts"
export * from "./counterparties.ts"
// ─── Identidad y arrendatarios ───────────────────────────────────────────────
export * from "./identity.ts"
// ─── Infraestructura ─────────────────────────────────────────────────────────
export * from "./jobs.ts"
export * from "./locations.ts"
export * from "./media.ts"
export * from "./pixit.ts"
// ─── Administración de plataforma ────────────────────────────────────────────
export * from "./platform.ts"
export * from "./productions.ts"
export * from "./productions-ops.ts"
export * from "./services.ts"
export * from "./sessions.ts"
export * from "./warehouse-commerce.ts"
// ─── Dominios ────────────────────────────────────────────────────────────────
export * from "./warehouses.ts"
export * from "./websites.ts"
