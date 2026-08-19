/**
 * Recorrido de verificación de la fase C: entra, navega el flujo real del almacén y las
 * producciones pulsando lo que un usuario pulsa, y captura cada parada.
 */
import { mkdirSync } from "node:fs"
import { chromium } from "@playwright/test"

const log = (l) => process.stdout.write(`${l}\n`)
const OUT = new URL("../../.impeccable/review/", import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const BASE = "http://127.0.0.1:3300"

const navegador = await chromium.launch()

async function sesion(cuenta, esquema) {
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
  return { ctx, p, empresa: new URL(p.url()).pathname.match(/\/c\/([^/]+)/)?.[1] ?? "" }
}

async function foto(p, nombre) {
  await p.waitForLoadState("networkidle")
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${OUT}rec-${nombre}.png`, fullPage: true })
  log(`  ${nombre}`)
}

// ── dueña: el flujo entero, en oscuro ────────────────────────────────────────
{
  const { ctx, p, empresa } = await sesion("duena@tfv.dev", "dark")

  await p.goto(`${BASE}/c/${empresa}/warehouses`, { waitUntil: "networkidle" })
  await foto(p, "duena-almacenes")

  // Al primer almacén, pulsando su enlace como lo haría cualquiera.
  await p.locator("main ul li a").first().click()
  await foto(p, "duena-almacen")

  const almacen = new URL(p.url()).pathname
  for (const [ruta, nombre] of [
    ["/panel", "duena-panel-almacen"],
    ["/quotes", "duena-cotizaciones"],
    ["/products", "duena-productos"],
  ]) {
    await p.goto(`${BASE}${almacen}${ruta}`, { waitUntil: "networkidle" })
    await foto(p, nombre)
  }

  // A la primera cotización: el constructor es el primer viewport del contrato.
  await p.goto(`${BASE}${almacen}/quotes`, { waitUntil: "networkidle" })
  const filas = p.locator("main ul li a")
  if ((await filas.count()) > 0) {
    await filas.first().click()
    await foto(p, "duena-cotizacion")
  } else {
    log("  (sin cotizaciones que abrir)")
  }

  await p.goto(`${BASE}/c/${empresa}/productions`, { waitUntil: "networkidle" })
  await foto(p, "duena-producciones")
  const prods = p.locator("main ul li a")
  if ((await prods.count()) > 0) {
    await prods.first().click()
    await foto(p, "duena-produccion")
  }
  await ctx.close()
}

// ── dueña en claro: las dos paradas clave ────────────────────────────────────
{
  const { ctx, p, empresa } = await sesion("duena@tfv.dev", "light")
  await p.goto(`${BASE}/c/${empresa}/warehouses`, { waitUntil: "networkidle" })
  await p.locator("main ul li a").first().click()
  const almacen = new URL(p.url()).pathname
  await p.goto(`${BASE}${almacen}/quotes`, { waitUntil: "networkidle" })
  const filas = p.locator("main ul li a")
  if ((await filas.count()) > 0) {
    await filas.first().click()
    await foto(p, "duena-cotizacion-claro")
  }
  await p.goto(`${BASE}${almacen}/panel`, { waitUntil: "networkidle" })
  await foto(p, "duena-panel-claro")
  await ctx.close()
}

// ── almacenista: 5 de 255 permisos — cómo se ven las compuertas ──────────────
{
  const { ctx, p, empresa } = await sesion("almacenista@tfv.dev", "dark")
  await p.goto(`${BASE}/c/${empresa}/warehouses`, { waitUntil: "networkidle" })
  await foto(p, "almacenista-almacenes")
  const filas = p.locator("main ul li a")
  if ((await filas.count()) > 0) {
    await filas.first().click()
    await foto(p, "almacenista-almacen")
  }
  await ctx.close()
}

await navegador.close()
log("listo")
