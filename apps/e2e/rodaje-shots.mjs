/**
 * Recorrido de revisión visual de Rodaje: personajes, sets, videos y jornadas.
 *
 * Guion desechable de la rebanada `chunk-pantallas-rodaje`, calcado de `design-recorrido.mjs`:
 * entra como administración de plataforma (para no depender de permisos concretos), navega el
 * flujo real con clics y captura cada parada en los tres tamaños de referencia.
 */
import { mkdirSync } from "node:fs"
import { chromium } from "@playwright/test"

const log = (l) => process.stdout.write(`${l}\n`)
const OUT = new URL("../../.impeccable/review/", import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const BASE = process.env.SHOT_URL ?? "http://127.0.0.1:3014"

const COMPANY = "01a02ab9-f3f7-72b1-a482-c1f74567d0b4"
const PRODUCTION = "01a02abb-5113-7b2d-973c-8832f571eea3"
const RECORDING_CLOSED = "01a02abb-51f4-75ce-bc43-70cb4db132ba"
const RECORDING_ONGOING = "01a02abb-529c-7045-aace-e0adeaf93652"
const CHARACTER_ELENA = "01a02abb-5124-7a01-b2f7-fb6e516ebe5e"
const SET_COCINA = "01a02abb-51ad-7503-8b9a-85eeb273c6a5"

const PROD_BASE = `${BASE}/c/${COMPANY}/productions/${PRODUCTION}`

const TAMANOS = [
  { nombre: "tablet", width: 834, height: 1194 },
  { nombre: "phone", width: 390, height: 844 },
  { nombre: "desktop", width: 1440, height: 900 },
]

const navegador = await chromium.launch()

async function sesion(tamano, esquema) {
  const ctx = await navegador.newContext({
    viewport: { width: tamano.width, height: tamano.height },
    deviceScaleFactor: 2,
    colorScheme: esquema,
  })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" })
  await p.getByRole("textbox", { name: /correo/i }).fill("admin@tfv.dev")
  await p.locator('input[type="password"]').first().fill("Desarrollo.2026")
  await p.getByRole("button", { name: /entrar|iniciar|acceder/i }).click()
  await p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 })
  await p.waitForLoadState("networkidle")
  return { ctx, p }
}

async function foto(p, nombre, tamano, esquema) {
  await p.waitForLoadState("networkidle")
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(900)
  const archivo = `${OUT}rodaje-${nombre}-${tamano.nombre}-${esquema}.png`
  await p.screenshot({ path: archivo, fullPage: true })
  log(`  ${nombre.padEnd(22)} ${tamano.nombre.padEnd(8)} ${esquema}`)
}

const PARADAS = [
  ["jornadas", `${PROD_BASE}/rodaje`],
  ["jornada-cerrada", `${PROD_BASE}/rodaje/${RECORDING_CLOSED}`],
  ["jornada-en-curso", `${PROD_BASE}/rodaje/${RECORDING_ONGOING}`],
  ["personajes", `${PROD_BASE}/rodaje/characters`],
  ["personaje-historial", `${PROD_BASE}/rodaje/characters/${CHARACTER_ELENA}`],
  ["sets", `${PROD_BASE}/rodaje/sets`],
  ["set-composicion", `${PROD_BASE}/rodaje/sets/${SET_COCINA}`],
  ["videos", `${PROD_BASE}/rodaje/videos`],
]

// ── Tableta y celular, oscuro: el orden de dispositivos de PRODUCT.md ────────
for (const tamano of [TAMANOS[0], TAMANOS[1]]) {
  const { ctx, p } = await sesion(tamano, "dark")
  for (const [nombre, url] of PARADAS) {
    await p.goto(url, { waitUntil: "networkidle" })
    await foto(p, nombre, tamano, "dark")
  }
  await ctx.close()
}

// ── Escritorio, claro: el otro tema, el otro extremo de la calibración ───────
{
  const tamano = TAMANOS[2]
  const { ctx, p } = await sesion(tamano, "light")
  for (const [nombre, url] of PARADAS) {
    await p.goto(url, { waitUntil: "networkidle" })
    await foto(p, nombre, tamano, "light")
  }
  await ctx.close()
}

await navegador.close()
log("\nCapturas listas en .impeccable/review/")
