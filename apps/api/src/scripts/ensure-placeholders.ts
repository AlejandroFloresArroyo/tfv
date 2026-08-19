/**
 * Deja puestos los tres marcadores de posición.
 *
 * Ver `openspec/specs/media-storage/spec.md`, requisito «Marcadores de posición compartidos».
 *
 * Existe aparte de la siembra porque **la siembra no corre en producción** —sus contraseñas son
 * públicas y el guion se niega—, y los marcadores sí hacen falta allí: son inventario del sistema,
 * no datos de ejemplo. Su sitio en un despliegue es junto a las migraciones, después de ellas.
 *
 * Es idempotente y reparadora: se puede correr en cada despliegue. Y hay que correrla **cada vez
 * que se cambie de proveedor de almacenamiento**, porque las direcciones de los marcadores viven en
 * su fila igual que las de cualquier archivo.
 */

import { closeConnection } from "@tfv/db"
import { ensurePlaceholders } from "../media/placeholders.ts"

const report = await ensurePlaceholders()

// biome-ignore lint/suspicious/noConsole: es un guion de línea de órdenes; imprimir es su salida.
console.log(
  `Marcadores de posición: ${report.rows} filas · ${report.written} objetos escritos` +
    (report.written === 0 ? " (ya estaban todos)" : ""),
)

await closeConnection()
