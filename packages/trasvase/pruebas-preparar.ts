/**
 * Preparación global: la misma que la del paquete de base de datos.
 *
 * Crea la base de pruebas si no existe y le aplica las migraciones de `@tfv/db`. Este paquete no
 * tiene migraciones propias: su esquema `trasvase` lo crean sus propias rutinas en tiempo de
 * ejecución, que es exactamente lo que también harán sobre la base real.
 */
export { prepareTestDatabase as setup } from "@tfv/db/testing"
