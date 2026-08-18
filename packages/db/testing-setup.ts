/**
 * Preparación global: crea la base de pruebas y le aplica las migraciones.
 *
 * Corre una vez por ejecución, antes de que ningún archivo de prueba se importe.
 */
export { prepareTestDatabase as setup } from "./testing.ts"
