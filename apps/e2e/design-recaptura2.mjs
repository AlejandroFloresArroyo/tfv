/**
 * Segunda recaptura, dos archivos, con las lecciones de las dos rondas fallidas:
 *
 * - La validación por texto se deja engañar por etiquetas de pestañas («Panel», «Medidas» como
 *   nombre de paso). Se valida por URL y por texto negativo.
 * - Cada sesión es un inicio de sesión, y el limitador de frecuencia de la API corta a la tercera
 *   ráfaga. UNA sola sesión; el tema claro se emula con `emulateMedia`, que no reinicia nada.
 */
import { mkdirSync } from "node:fs"
import { chromium } from "@playwright/test"

const log = (l) => process.stdout.write(`${l}\n`)
const OUT = new URL("../../.impeccable/review/", import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const BASE = "http://127.0.0.1:3300"

const navegador = await chromium.launch()
const ctx = await navegador.newContext({
  viewport: { width: 834, height: 1194 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
})
const p = await ctx.newPage()
let fallos = 0

await p.goto(`${BASE}/login`, { waitUntil: "networkidle" })
await p.getByRole("textbox", { name: /correo/i }).fill("duena@tfv.dev")
await p.locator('input[type="password"]').first().fill("Desarrollo.2026")
await p.getByRole("button", { name: /entrar/i }).click()
await p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 })
if (!new URL(p.url()).pathname.startsWith("/c/")) {
  await p.locator("main a[href^='/c/']").first().click()
  await p.waitForLoadState("networkidle")
}
const empresa = new URL(p.url()).pathname.match(/\/c\/([^/]+)/)?.[1]

// El almacén y, de su catálogo, el primer producto real — nunca `/new`.
await p.goto(`${BASE}/c/${empresa}/warehouses`, { waitUntil: "networkidle" })
const hrefAlmacen = await p.locator("main a[href*='/warehouses/']").first().getAttribute("href")
await p.goto(`${BASE}${hrefAlmacen}`, { waitUntil: "networkidle" })
const hrefs = await p
  .locator("main a[href*='/products/']")
  .evaluateAll((ns) => ns.map((n) => n.getAttribute("href")))
const hrefProducto = hrefs.find((h) => h && !h.endsWith("/new"))
if (!hrefProducto) {
  log("✗ sin producto real en el catálogo")
  process.exit(1)
}

await p.goto(`${BASE}${hrefProducto}`, { waitUntil: "networkidle" })
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(1000)
{
  const url = new URL(p.url()).pathname
  const texto = await p.locator("main").innerText()
  const ok =
    /\/products\/[^/]+$/.test(url) &&
    !texto.includes("Paso 1") &&
    !texto.includes("No se pudo cargar")
  if (!ok) fallos++
  await p.screenshot({ path: `${OUT}rec-duena-productos.png`, fullPage: true })
  log(`${ok ? "✓" : "✗"} duena-productos (${url})`)
}

// El panel del almacén en claro, misma sesión, sin segundo inicio.
await p.emulateMedia({ colorScheme: "light" })
await p.goto(`${BASE}${hrefAlmacen}/panel`, { waitUntil: "networkidle" })
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(1200)
{
  const url = new URL(p.url()).pathname
  let texto = await p.locator("main").innerText()
  if (texto.includes("No se pudo cargar")) {
    log("  ⟳ corte de la lista; espera y reintento")
    await p.waitForTimeout(8000)
    await p.reload({ waitUntil: "networkidle" })
    await p.waitForTimeout(1200)
    texto = await p.locator("main").innerText()
  }
  const ok =
    url.endsWith("/panel") &&
    texto.includes("esperando a alguien") &&
    !texto.includes("No se pudo cargar")
  if (!ok) fallos++
  await p.screenshot({ path: `${OUT}rec-duena-panel-claro.png`, fullPage: true })
  log(`${ok ? "✓" : "✗"} duena-panel-claro (${url})`)
}

await navegador.close()
log(fallos === 0 ? "RECAPTURA VÁLIDA" : `${fallos} siguen mal`)
process.exitCode = fallos === 0 ? 0 : 1
