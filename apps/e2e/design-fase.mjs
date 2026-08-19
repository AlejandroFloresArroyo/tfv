/**
 * Capturas de fase contra la app viva con datos sembrados.
 *
 * Uso: node design-fase.mjs <cuenta> <ruta-relativa-de-captura...>
 * Entra con la cuenta sembrada, navega cada ruta y captura en iPad, tema oscuro y claro.
 */
import { mkdirSync } from "node:fs"
import { chromium } from "@playwright/test"

const log = (l) => process.stdout.write(`${l}\n`)
const OUT = new URL("../../.impeccable/review/", import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const BASE = process.env.SHOT_URL ?? "http://127.0.0.1:3300"
const [cuenta = "duena@tfv.dev", ...rutas] = process.argv.slice(2)
if (rutas.length === 0) rutas.push("/dashboard")

const navegador = await chromium.launch()

for (const esquema of ["dark", "light"]) {
  const ctx = await navegador.newContext({
    viewport: { width: 834, height: 1194 },
    deviceScaleFactor: 2,
    colorScheme: esquema,
  })
  const p = await ctx.newPage()

  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" })
  await p.getByRole("textbox", { name: /correo/i }).fill(cuenta)
  await p.locator('input[type="password"]').first().fill("Desarrollo.2026")
  await p.getByRole("button", { name: /entrar|iniciar|acceder/i }).click()
  await p.waitForURL((u) => !u.pathname.includes("/login") && !u.pathname.includes("/dashboard"), {
    timeout: 30_000,
  })
  await p.waitForLoadState("networkidle")

  // La empresa activa sale de la dirección a la que aterrizó: las rutas con `~` la interpolan.
  const empresa = new URL(p.url()).pathname.match(/\/c\/([^/]+)/)?.[1] ?? ""

  for (const ruta of rutas) {
    const destino = ruta.replaceAll("~", empresa)
    await p.goto(`${BASE}${destino}`, { waitUntil: "networkidle" })
    await p.evaluate(() => document.fonts.ready)
    await p.waitForTimeout(900)
    const nombre = `fase-${cuenta.split("@")[0]}-${destino.replaceAll("/", "_").replaceAll("~", "") || "raiz"}-${esquema}.png`
    await p.screenshot({ path: `${OUT}${nombre}`, fullPage: true })
    log(`${esquema.padEnd(5)} ${cuenta.split("@")[0].padEnd(12)} ${destino}`)
  }
  await ctx.close()
}

await navegador.close()
log("\nlisto")
