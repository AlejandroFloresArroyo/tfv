import { defineConfig, devices } from "@playwright/test"

/**
 * Pruebas de extremo a extremo.
 *
 * Ejercitan **el sistema entero** —navegador, aplicación web, API y base—, no el paquete web por su
 * cuenta. Por eso viven aquí y no dentro de `apps/web`: no son pruebas de un paquete, y meterlas
 * allí metería el navegador en el grafo de dependencias de la aplicación.
 *
 * ## Qué cubren, y por qué no lo cubre Vitest
 *
 * Las 204 pruebas de Vitest llegan hasta la respuesta HTTP. Lo que empieza donde ellas terminan:
 *
 * - Que la renovación ante un `401` ocurra **una sola vez** con varias peticiones en vuelo. Dos
 *   renovaciones simultáneas hacen que la API detecte reutilización y **cierre la sesión del
 *   usuario legítimo**. Sólo se comprueba contando peticiones desde fuera.
 * - Que el tema se aplique antes del primer pintado. Necesita un navegador pintando.
 * - Que crear algo lo haga aparecer en su listado **sin recargar**.
 * - Que las guardas del servidor redirijan a donde deben, conservando el destino.
 *
 * ## Contra el build de producción, no contra el servidor de desarrollo
 *
 * El primer intento corrió contra `next dev` y falló de una forma engañosa: navegaciones enteras
 * caídas con «This page couldn't load». La causa era el servidor de desarrollo compilando bajo
 * demanda y sirviendo trozos de cliente incoherentes a pestañas recién abiertas.
 *
 * Se compila y se sirve **en su propio puerto**, así que:
 *
 * - se prueba lo que se despliega, no una compilación de desarrollo con recarga en caliente;
 * - no hay que compilar cada ruta la primera vez que una prueba la visita;
 * - correr las pruebas **no interfiere con el `pnpm dev` que se tenga abierto** en el 3000.
 *
 * Para iterar contra el servidor de desarrollo y ahorrarse la compilación:
 * `E2E_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e`.
 *
 * ## No borran la base
 *
 * A diferencia de las pruebas de la API, que truncan sus tablas. Correr esto no debe destruir los
 * datos con los que se está mirando la aplicación; cada prueba crea lo suyo con nombre irrepetible.
 */

/** El puerto propio de las pruebas, para no chocar con el `pnpm dev` del 3000. */
const PORT = 3100
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`
const usesOwnServer = !process.env.E2E_BASE_URL

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./setup/global-setup.ts",

  // Un fallo en una prueba de interfaz suele ser una espera mal puesta, y sin traza se depura a
  // ciegas. Se guarda sólo del reintento, para no llenar el disco en cada ejecución verde.
  use: {
    baseURL,
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
  // En local decide Playwright según los núcleos; en integración continua se acota, porque la
  // máquina comparte la base con las dos aplicaciones. La clave se omite en lugar de pasarse como
  // `undefined`: con `exactOptionalPropertyTypes` no es lo mismo «sin valor» que «valor indefinido».
  ...(process.env.CI ? { workers: 2 } : {}),

  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  /**
   * Los servicios.
   *
   * La API se reutiliza si ya está levantada —es la misma en desarrollo y en pruebas, y arrancar
   * una segunda fallaría por el puerto ocupado—. La aplicación web, en cambio, se compila y se
   * sirve aparte, salvo que se apunte a una existente con `E2E_BASE_URL`.
   */
  webServer: [
    {
      command: "pnpm --filter @tfv/api dev",
      url: "http://127.0.0.1:5000/health",
      reuseExistingServer: true,
      timeout: 60_000,
      cwd: "../..",
    },
    ...(usesOwnServer
      ? [
          {
            command: `pnpm --filter @tfv/web build && pnpm --filter @tfv/web start --port ${PORT}`,
            url: `${baseURL}/login`,
            // Nunca se reutiliza: si hay algo escuchando en este puerto, es de una ejecución
            // anterior y podría ser código viejo — que es peor que no tener nada.
            reuseExistingServer: false,
            timeout: 240_000,
            cwd: "../..",
          },
        ]
      : []),
  ],
})
