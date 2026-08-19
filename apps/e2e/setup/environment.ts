/**
 * Dónde escucha esta suite y contra qué base habla.
 *
 * ## Por qué existe
 *
 * La suite reutilizaba la API del `5000` y ocupaba el `3100` — es decir, hablaba con **la base de
 * desarrollo**, donde hay alguien trabajando. Lanzarla le borraba los datos a esa persona, y dos
 * árboles de trabajo lanzándola a la vez chocaban en el puerto. El efecto práctico era que nadie la
 * corría, y una suite que no se corre no es una red: es documentación.
 *
 * Aquí se decide lo único que hacía falta para que se pueda correr sin pedir permiso a nadie: **una
 * base propia y un par de puertos propios**, deducidos del árbol de trabajo desde el que se lanza.
 *
 * ## La base
 *
 * Misma historia que `packages/db/testing.ts` cuenta para vitest (`HALLAZGOS.md` H-12): se deriva
 * de `DATABASE_URL` cambiándole el nombre, así que no hay que configurar nada, y se puede fijar a
 * mano con `E2E_DATABASE_URL` o `TFV_TEST_DATABASE_URL` — la segunda es la que ya usan las suites
 * de vitest y la que `turbo.json` deja pasar (`H-74`).
 *
 * El nombre por defecto es **distinto del de vitest** a propósito. `pnpm test` trunca sus tablas;
 * si compartieran base, correr las dos cosas a la vez dejaría a esta suite sin siembra a media
 * pasada, y el fallo aparecería lejos de la causa (es H-83 otra vez).
 *
 * Y hay una comprobación que nunca sobra: si lo que se resuelve resulta ser **la base de
 * desarrollo**, se para en seco. Es la única barrera entre una variable mal puesta y el trabajo de
 * otra persona.
 *
 * ## Los puertos
 *
 * Se deducen de la ruta del árbol de trabajo. No es un capricho: con seis árboles a la vez, unos
 * puertos fijos obligan a que cada uno los escriba en su `.env` —y quien no se acuerde se lleva por
 * delante la ejecución del vecino—, mientras que unos puertos al azar cambiarían en cada pasada y
 * dejarían servidores huérfanos imposibles de reconocer. Deducidos de la ruta son **estables para
 * el mismo árbol y distintos entre árboles**, que es exactamente la propiedad que hace falta.
 *
 * `E2E_WEB_PORT` y `E2E_API_PORT` mandan sobre lo deducido, para cuando dos árboles caigan en la
 * misma casilla o haya que hablar con algo que ya está levantado.
 */

import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { loadEnv } from "@tfv/db/testing"

/** La raíz del árbol de trabajo. De ella salen los puertos, y en ella vive el `.env`. */
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))

// El `.env` de la raíz, sin pisar lo que venga del entorno real. Es el mismo cargador que usa
// vitest, y por la misma razón: `turbo` filtra el entorno, y el archivo sí se lee (`H-74`).
loadEnv(fileURLToPath(new URL("../", import.meta.url)))

/** Nombre de la base propia de esta suite. Distinto del `tfv_test` de vitest, y a propósito. */
const DEFAULT_DATABASE = "tfv_test_e2e"

/**
 * Cuántas casillas de puerto hay. Cada árbol de trabajo cae en una, y la casilla mueve los dos
 * puertos a la vez para que la pareja sea reconocible: web `32xx`, API `52xx` con el mismo final.
 */
const SLOTS = 400
const WEB_PORT_BASE = 3200
const API_PORT_BASE = 5200

/** La casilla de este árbol de trabajo. Estable mientras la ruta no cambie. */
function slot(): number {
  const digest = createHash("sha256").update(REPO_ROOT).digest()
  return digest.readUInt16BE(0) % SLOTS
}

function port(override: string | undefined, base: number): number {
  if (override === undefined || override === "") return base + slot()

  const parsed = Number(override)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Puerto inválido: ${override}`)
  }
  return parsed
}

/** Dos bases son la misma cuando coinciden servidor y nombre. El usuario y la clave no cuentan. */
function sameDatabase(a: string, b: string): boolean {
  const left = new URL(a)
  const right = new URL(b)
  return left.host === right.host && left.pathname === right.pathname
}

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${name}`
  return parsed.toString()
}

function resolveDatabaseUrl(): string {
  const development = process.env.DATABASE_URL
  const explicit = process.env.E2E_DATABASE_URL ?? process.env.TFV_TEST_DATABASE_URL

  if (!explicit && !development) {
    throw new Error(
      "Falta DATABASE_URL. Copia .env.example a .env, o levanta la base local con `pnpm db:up`.",
    )
  }

  const resolved = explicit ?? withDatabase(development as string, DEFAULT_DATABASE)

  // La siembra escribe y las pruebas borran lo que crean. Sobre la base de desarrollo eso es
  // destruir el trabajo de otra persona, así que aquí se para y se dice por qué.
  if (development && sameDatabase(resolved, development)) {
    throw new Error(
      "Las pruebas de extremo a extremo apuntan a la base de desarrollo. Siembran y borran: " +
        "eso destruiría los datos con los que se está mirando la aplicación. Deja " +
        "E2E_DATABASE_URL o TFV_TEST_DATABASE_URL apuntando a otra base del mismo servidor.",
    )
  }

  return resolved
}

/** Todo lo que la configuración y la preparación necesitan saber, resuelto una sola vez. */
export const ENTORNO = {
  /** La base propia de la suite. Se crea y se migra sola antes de que arranque la API. */
  databaseUrl: resolveDatabaseUrl(),
  webPort: port(process.env.E2E_WEB_PORT, WEB_PORT_BASE),
  apiPort: port(process.env.E2E_API_PORT, API_PORT_BASE),
} as const

/**
 * Contra qué aplicación se conduce.
 *
 * `E2E_BASE_URL` apunta a una que ya está levantada —para iterar sin esperar a la compilación— y en
 * ese modo la suite **no levanta ni prepara nada**: quien la fija se hace cargo de la pila entera,
 * incluida su base. Mezclar las dos cosas es lo que llevaba a sembrar sobre lo ajeno.
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${ENTORNO.webPort}`
export const MANAGES_SERVERS = !process.env.E2E_BASE_URL

/** Dónde escucha la API que levanta esta suite. */
export const API_URL = `http://127.0.0.1:${ENTORNO.apiPort}`

/**
 * Lo heredado del proceso, sin los huecos.
 *
 * Playwright declara el entorno de un servidor como cadenas y no como «cadena o nada», y con
 * `exactOptionalPropertyTypes` eso no es un detalle: una variable presente y vacía y una ausente
 * son casos distintos, y quien las mezcla acaba pasando `undefined` a un `spawn`.
 */
function inherited(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
}

/**
 * El entorno con el que arranca la API de las pruebas.
 *
 * Se construye entero aquí en lugar de dejarlo al `.env`, porque cuatro de estos valores nombran
 * **el puerto propio de esta suite** y con los de desarrollo la mitad de lo que hay que probar no
 * funciona: la tienda pública se resuelve por el dominio, el retorno del cobro vuelve a una
 * dirección concreta, y la credencial de renovación viaja con el prefijo bajo el que el navegador
 * ve la API — sin él declara `/auth`, que no es `/api/auth/refresh`, y **no se envía nunca**.
 */
export function apiEnv(): Record<string, string> {
  return {
    ...inherited(),
    DATABASE_URL: ENTORNO.databaseUrl,
    API_PORT: String(ENTORNO.apiPort),
    // Escuchando sólo en la interfaz local: es una API de pruebas en una máquina compartida.
    API_HOST: "127.0.0.1",
    // El navegador ve la API bajo `/api`, reenviada por Next. Ver `COOKIE_PATH_PREFIX` en `env.ts`.
    COOKIE_PATH_PREFIX: "/api",
    CORS_ORIGINS: `http://127.0.0.1:${ENTORNO.webPort},http://localhost:${ENTORNO.webPort}`,
    SITES_DOMAIN: `localhost:${ENTORNO.webPort}`,
    BILLING_RETURN_ORIGIN: `http://localhost:${ENTORNO.webPort}`,
    // Un suplente en memoria que no mueve dinero. Sin él, toda pantalla de cobro falla al abrirse
    // y las suscripciones no se pueden recorrer.
    PAYMENTS_PROVIDER: "local",
    PAYMENTS_WEBHOOK_SECRET: "e2e-secreto-compartido-de-pruebas",
    // Fijo, para que un enlace público firmado siga valiendo si el servicio se reinicia entre dos
    // pasadas. Sin él se firma con uno al azar por proceso.
    DOCUMENTS_LINK_SECRET: "e2e-firma-de-enlaces-publicos-de-prueba",
    NODE_ENV: "development",
  }
}

/**
 * El entorno con el que se compila y se sirve la aplicación web.
 *
 * `API_ORIGIN` hace falta **en la compilación y en el arranque**: el reenvío de `/api/*` se resuelve
 * al compilar y se escribe en el manifiesto, y el lado servidor lo vuelve a leer al atender.
 * `NEXT_PUBLIC_SITES_DOMAIN` sólo en la compilación, porque se incrusta en el paquete.
 *
 * `NODE_ENV` se fija a mano: el `.env` de desarrollo lo trae en `development`, y heredarlo aquí
 * haría que `next build` compilara algo que no es lo que se despliega.
 */
export function webEnv(): Record<string, string> {
  return {
    ...inherited(),
    API_ORIGIN: API_URL,
    NEXT_PUBLIC_SITES_DOMAIN: `localhost:${ENTORNO.webPort}`,
    NODE_ENV: "production",
  }
}
