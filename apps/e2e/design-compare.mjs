/**
 * Compara la misma ruta en las dos apps: la vieja del :3000 y la del rediseño en el :3300.
 *
 * Entra con una cuenta sembrada y sólo navega — no crea, no edita, no borra nada. Las dos apps
 * hablan con la misma API y la misma base, así que lo único que cambia entre las dos capturas es
 * el diseño, que es justo lo que se quiere comparar.
 */
import { mkdirSync } from "node:fs"
import { chromium } from "@playwright/test"

const log = (linea) => process.stdout.write(`${linea}\n`)

const OUT = new URL("../../.impeccable/review/", import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// El tema por defecto de la aplicación es `system`, así que el esquema del navegador decide. Se
// declara por app para poder ver el mundo nuevo en el oscuro para el que está diseñado.
const APPS = [
  { nombre: "viejo", base: "http://localhost:3000", esquema: "light" },
  { nombre: "nuevo-claro", base: "http://localhost:3300", esquema: "light" },
  { nombre: "nuevo", base: "http://localhost:3300", esquema: "dark" },
]

const CUENTA = { correo: "duena@tfv.dev", clave: "Desarrollo.2026" }

// El dispositivo de referencia del producto.
const VIEWPORT = { width: 834, height: 1194 }

const navegador = await chromium.launch()

for (const app of APPS) {
  const contexto = await navegador.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: app.esquema,
  })
  const pagina = await contexto.newPage()

  await pagina.goto(`${app.base}/login`, { waitUntil: "networkidle" })
  await pagina.evaluate(() => document.fonts.ready)
  await pagina.screenshot({ path: `${OUT}app-${app.nombre}-login.png`, fullPage: true })
  log(`${app.nombre.padEnd(6)} acceso`)

  // El formulario de acceso, por sus etiquetas reales.
  // Por rol y no por etiqueta: «Contraseña» también casa con el botón de mostrarla.
  await pagina.getByRole("textbox", { name: /correo/i }).fill(CUENTA.correo)
  await pagina.locator('input[type="password"]').first().fill(CUENTA.clave)
  await pagina.getByRole("button", { name: /entrar|iniciar|acceder/i }).click()

  await pagina.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 })
  await pagina.waitForLoadState("networkidle")
  await pagina.evaluate(() => document.fonts.ready)
  await pagina.waitForTimeout(400)

  const destino = new URL(pagina.url()).pathname
  await pagina.screenshot({ path: `${OUT}app-${app.nombre}-panel.png`, fullPage: true })
  log(`${app.nombre.padEnd(6)} panel   ${destino}`)

  await contexto.close()
}

await navegador.close()
log("\nlisto")
