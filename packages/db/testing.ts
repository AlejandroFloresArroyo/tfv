/**
 * Preparación del entorno de pruebas.
 *
 * ## Por qué existe
 *
 * Las pruebas de integración truncan sus tablas, y lo hacían **sobre la base de desarrollo**: cada
 * ejecución de `pnpm test` borraba los datos con los que se estaba mirando la aplicación, y había
 * que volver a sembrar. En una sesión larga eso son cinco o seis siembras, cada una precedida de un
 * rato de desconcierto —«¿por qué no entro?»— mientras uno recuerda por qué (`HALLAZGOS.md` H-12).
 *
 * Ahora las pruebas hablan con **otra base**, en el mismo servidor local. Correrlas deja de tener
 * consecuencias fuera de sí mismas.
 *
 * ## Lo que sigue sin resolver
 *
 * **Dos ejecuciones simultáneas siguen pisándose**, porque comparten esa base de pruebas. Resolverlo
 * pediría un esquema por ejecución, y el remedio sería más complicado que la enfermedad mientras el
 * caso sea «se me olvidó que ya la tenía corriendo». Queda anotado.
 *
 * ## Qué hace, en orden
 *
 * 1. Carga `.env` sin pisar lo que venga del entorno real —integración continua manda—.
 * 2. Sustituye el nombre de la base por el de pruebas y lo publica como `DATABASE_URL`, de modo que
 *    todo lo que lea la configuración —el cliente, `drizzle-kit`, la aplicación bajo prueba— apunte
 *    ahí sin enterarse.
 * 3. La crea si no existe y le aplica las migraciones.
 *
 * Los dos primeros pasos son **síncronos y viven en la configuración de vitest**: `DATABASE_URL` se
 * lee al cargar el módulo del cliente, así que fijarla más tarde llegaría tarde.
 */

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Sql } from "postgres"

/** Nombre de la base de pruebas. Distinto del de desarrollo, en el mismo servidor. */
const TEST_DATABASE = "tfv_test"

/**
 * Carga `.env` sin pisar el entorno real.
 *
 * Lo hacían las dos configuraciones de vitest con el mismo bloque copiado. Aquí una vez.
 */
export function loadEnv(from: string): void {
  const envPath = resolve(from, "../../.env")
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (match?.[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]
    }
  }
}

/** La misma conexión, apuntando a otra base. */
export function testUrl(url: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${TEST_DATABASE}`
  return parsed.toString()
}

/**
 * Deja `DATABASE_URL` apuntando a la base de pruebas.
 *
 * Se llama desde la configuración de vitest, que corre **antes** de que ningún módulo de prueba se
 * importe y en el mismo proceso desde el que se lanzan los trabajadores.
 *
 * `TFV_TEST_DATABASE_URL` permite fijarla a mano —otro servidor, otro nombre—; sin ella se deriva
 * de la de desarrollo, que es lo que hace que esto no necesite configuración para funcionar.
 */
export function useTestDatabase(from: string): void {
  loadEnv(from)

  const explicit = process.env.TFV_TEST_DATABASE_URL
  const development = process.env.DATABASE_URL

  if (!explicit && !development) {
    throw new Error(
      "Falta DATABASE_URL. Copia .env.example a .env, o levanta la base local con `pnpm db:up`.",
    )
  }

  process.env.DATABASE_URL = explicit ?? testUrl(development as string)
}

/**
 * Crea la base de pruebas si no existe y le aplica las migraciones.
 *
 * Corre en la preparación global de vitest, una vez por ejecución. Aplicar las migraciones siempre
 * sale más barato que averiguar si hacen falta, y `drizzle` sabe cuáles ya están puestas.
 */
export async function prepareTestDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("useTestDatabase() no dejó DATABASE_URL puesta")

  const [{ default: postgres }, { drizzle }, { migrate }] = await Promise.all([
    import("postgres"),
    import("drizzle-orm/postgres-js"),
    import("drizzle-orm/postgres-js/migrator"),
  ])

  const target = new URL(url)
  const name = target.pathname.slice(1)

  // La creación se pide desde **otra** base del mismo servidor: no se puede crear aquella a la que
  // se está conectado.
  const admin = new URL(url)
  admin.pathname = "/postgres"
  const root = postgres(admin.toString(), { max: 1 })

  try {
    const [existing] = await root`select 1 from pg_database where datname = ${name}`
    // `create database` no admite parámetros y el nombre no viene de fuera: es constante o de la
    // variable de entorno de quien ejecuta las pruebas.
    if (!existing) await root.unsafe(`create database "${name.replaceAll('"', '""')}"`)
  } finally {
    await root.end()
  }

  const client = postgres(url, { max: 1 })
  try {
    await bootstrapProviderSurface(client)
    await migrate(drizzle(client), {
      migrationsFolder: resolve(import.meta.dirname, "drizzle"),
    })
  } finally {
    await client.end()
  }
}

/**
 * Lo mínimo del proveedor que las migraciones dan por hecho.
 *
 * La base de desarrollo la crea Supabase, así que trae su esquema `auth` puesto. Una base nueva del
 * mismo servidor **no**, y las migraciones fallan en la primera línea que nombra `auth.uid()`.
 *
 * Esto no inventa nada: reproduce las dos piezas de las que el modelo depende, y de las que la
 * migración 0006 ya deja escrito que son acoplamiento real —«tabla del proveedor y esquema interno
 * suyo… se acepta porque vive en un único predicado de una única función»—. Que hagan falta aquí es
 * la factura de ese acoplamiento, y verla escrita es mejor que no verla.
 *
 * Los roles son del **cúmulo**, no de la base, así que en el servidor de Supabase ya existen; se
 * crean igualmente para que esto funcione contra un Postgres pelado.
 */
async function bootstrapProviderSurface(client: Sql): Promise<void> {
  await client.unsafe(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
      end if;
    end $$;

    create schema if not exists auth;
    -- Donde el proveedor instala las extensiones. La migración de búsqueda pone ahí «unaccent».
    create schema if not exists extensions;
    grant usage on schema extensions to authenticated, service_role;

    -- La identidad que declara el token. Misma definición que la del proveedor.
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $fn$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $fn$;

    -- Las sesiones del proveedor. El modelo sólo consulta si existe una fila con ese identificador.
    create table if not exists auth.sessions (id uuid primary key);

    grant usage on schema auth to authenticated, service_role;
  `)
}
