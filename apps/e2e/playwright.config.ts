import { defineConfig, devices } from "@playwright/test"
import { API_URL, apiEnv, BASE_URL, ENTORNO, MANAGES_SERVERS, webEnv } from "./setup/environment.ts"

/**
 * Pruebas de extremo a extremo.
 *
 * Ejercitan **el sistema entero** —navegador, aplicación web, API y base—, no el paquete web por su
 * cuenta. Por eso viven aquí y no dentro de `apps/web`: no son pruebas de un paquete, y meterlas
 * allí metería el navegador en el grafo de dependencias de la aplicación.
 *
 * ## Qué cubren, y por qué no lo cubre Vitest
 *
 * Las pruebas de Vitest llegan hasta la respuesta HTTP. Lo que empieza donde ellas terminan:
 *
 * - Que la renovación ante un `401` ocurra **una sola vez** con varias peticiones en vuelo. Dos
 *   renovaciones simultáneas hacen que la API detecte reutilización y **cierre la sesión del
 *   usuario legítimo**. Sólo se comprueba contando peticiones desde fuera.
 * - Que el tema se aplique antes del primer pintado. Necesita un navegador pintando.
 * - Que crear algo lo haga aparecer en su listado **sin recargar**.
 * - Que las guardas del servidor redirijan a donde deben, conservando el destino.
 * - Que una pantalla terminada **tenga por dónde llegar**. Es lo único que no se ve leyendo código,
 *   y ya pasó una vez: el asistente de alta de producto estaba entero y no lo enlazaba nadie
 *   (`HALLAZGOS.md` H-70).
 *
 * ## Contra el build de producción, no contra el servidor de desarrollo
 *
 * El primer intento corrió contra `next dev` y falló de una forma engañosa: navegaciones enteras
 * caídas con «This page couldn't load». La causa era el servidor de desarrollo compilando bajo
 * demanda y sirviendo trozos de cliente incoherentes a pestañas recién abiertas.
 *
 * Se compila y se sirve **en sus propios puertos**, así que se prueba lo que se despliega y no hay
 * que compilar cada ruta la primera vez que una prueba la visita.
 *
 * Para iterar contra una pila que ya está levantada y ahorrarse la compilación:
 * `E2E_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e`. En ese modo la suite no levanta ni prepara
 * nada — ver `setup/environment.ts`.
 *
 * ## Su base y sus puertos, no los de nadie
 *
 * Antes reutilizaba la API del `5000`, que es **la de desarrollo**: sembrar y borrar desde aquí
 * destruía los datos con los que otra persona estaba mirando la aplicación, y el `3100` fijo hacía
 * que dos árboles de trabajo no pudieran correrla a la vez. Ahora levanta su propia API contra su
 * propia base, en un par de puertos deducidos del árbol desde el que se lanza.
 *
 * No borra la base al empezar: la siembra es idempotente y **cada prueba retira lo suyo al
 * principio**, no en un `finally`. Un tiempo agotado se lleva por delante el navegador antes de que
 * el `finally` corra, así que la limpieza que de verdad funciona es la de la entrada.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./setup/global-setup.ts",

  // Un fallo en una prueba de interfaz suele ser una espera mal puesta, y sin traza se depura a
  // ciegas. Se guarda sólo del reintento, para no llenar el disco en cada ejecución verde.
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  fullyParallel: true,
  // En integración continua, un `test.only` olvidado deja pasar una suite que no se ejecutó entera.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // En integración continua se acota, porque la máquina comparte la base con las dos aplicaciones.
  // La clave se omite en lugar de pasarse como `undefined`: con `exactOptionalPropertyTypes` no es
  // lo mismo «sin valor» que «valor indefinido».
  ...(process.env.CI ? { workers: 2 } : {}),

  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  /**
   * Los servicios.
   *
   * **Ninguno se reutiliza.** Lo que escuche en estos puertos es de una ejecución anterior que no
   * se apagó, y hablar con ella significa hablar con código viejo o —peor— con otra base. Que falle
   * el arranque diciendo que el puerto está ocupado es la respuesta correcta.
   *
   * La API arranca con `start` y no con `dev`: `dev` recarga al cambiar un archivo y lee el `.env`
   * de la raíz, que apunta a la base de desarrollo. Aquí el entorno se pasa entero y a mano.
   */
  ...(MANAGES_SERVERS
    ? {
        webServer: [
          {
            // La base se crea, se migra y se siembra **antes** de que la API abra su conexión.
            // Playwright levanta los servidores antes de `globalSetup`, así que no hay otro sitio.
            command:
              "node --experimental-strip-types apps/e2e/setup/prepare-database.ts && " +
              "pnpm --filter @tfv/api start",
            url: `${API_URL}/health`,
            reuseExistingServer: false,
            // Migrar una base recién creada y sembrarla es lo que más tarda de aquí.
            timeout: 180_000,
            cwd: "../..",
            env: apiEnv(),
          },
          {
            command: `pnpm --filter @tfv/web build && pnpm --filter @tfv/web start --port ${ENTORNO.webPort}`,
            url: `${BASE_URL}/login`,
            reuseExistingServer: false,
            timeout: 300_000,
            cwd: "../..",
            env: webEnv(),
          },
        ],
      }
    : {}),
})
