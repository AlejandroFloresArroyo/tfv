/**
 * Configuración de la conexión.
 *
 * Se valida al cargar el módulo: el servicio **no arranca** si falta o es inválida
 * (`openspec/changes/add-hono-api-runtime`). La implementación anterior arrancaba aunque la base
 * estuviese caída, porque la conexión no se esperaba ni se comprobaba (`DEFECTS.md` O-01).
 */

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error(
    "Falta DATABASE_URL. Copia .env.example a .env, o levanta la base local con `pnpm db:up`.",
  )
}

export const DATABASE_URL = url

/** Número máximo de conexiones del grupo. */
export const POOL_SIZE = Number(process.env.DATABASE_POOL_SIZE ?? 10)
