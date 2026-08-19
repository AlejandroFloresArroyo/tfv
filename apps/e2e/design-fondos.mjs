/**
 * Captura las cuatro opciones de fondo sobre el tablero real, en los dos temas.
 *
 * El fondo no está decidido. Esto existe para poder compararlas sobre contenido de verdad en vez
 * de sobre una muestra, que es donde un fondo siempre se ve bien y nunca dice la verdad.
 */
import { mkdirSync } from "node:fs"
import { chromium } from "@playwright/test"

const log = (linea) => process.stdout.write(`${linea}\n`)
const OUT = new URL("../../.impeccable/review/", import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const DIRECCION = process.env.SHOT_URL ?? "http://127.0.0.1:3300/sistema"
const OPCIONES = ["Sin fondo", "Derrame de luz", "Grano", "Los dos"]
const ARCHIVOS = ["nada", "derrame", "grano", "ambos"]

const navegador = await chromium.launch()

for (const tema of ["dark", "light"]) {
  const ctx = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const p = await ctx.newPage()
  await p.goto(DIRECCION, { waitUntil: "networkidle" })
  await p.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), tema)
  await p.evaluate(() => document.fonts.ready)

  for (let i = 0; i < OPCIONES.length; i++) {
    await p.getByRole("button", { name: OPCIONES[i], exact: true }).click()
    // Se deja asentar el encendido antes de disparar.
    await p.waitForTimeout(900)
    await p.screenshot({ path: `${OUT}fondo-${ARCHIVOS[i]}-${tema}.png`, fullPage: false })
    log(`${tema.padEnd(5)} ${OPCIONES[i]}`)
  }

  await ctx.close()
}

await navegador.close()
log("\nlisto")
