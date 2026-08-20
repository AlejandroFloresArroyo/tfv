/**
 * Recaptura ordenada por el revisor: los cuatro nombres, con la pantalla correcta, datos sembrados
 * visibles y carga completa.
 *
 * Lo que enseñó la ronda inválida: `/products` no existe (el catálogo vive en la raíz del almacén,
 * y el detalle en `products/[productId]`), y producciones sólo se ve desde una empresa que tenga el
 * servicio — la de `duena@` no lo tiene y la guarda redirige en silencio.
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
  // La base es viva y las membresías cambian: si la cuenta cae en el selector, se entra a la
  // primera empresa en vez de suponer el aterrizaje directo de la siembra original.
  if (!new URL(p.url()).pathname.startsWith("/c/")) {
    await p.locator("main a[href^='/c/']").first().click()
    await p.waitForLoadState("networkidle")
  }
  return { ctx, p }
}

async function foto(p, nombre, requisito) {
  await p.waitForLoadState("networkidle")
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(1000)
  // La captura se valida antes de aceptarse: si el texto exigido no está, se reintenta una vez.
  const cuerpo = await p
    .locator("main")
    .innerText()
    .catch(() => "")
  if (requisito && !cuerpo.includes(requisito)) {
    log(`  ⟳ ${nombre}: falta «${requisito}», reintento tras recargar`)
    await p.reload({ waitUntil: "networkidle" })
    await p.waitForTimeout(1200)
  }
  await p.screenshot({ path: `${OUT}rec-${nombre}.png`, fullPage: true })
  const final = await p
    .locator("main")
    .innerText()
    .catch(() => "")
  const ok = !requisito || final.includes(requisito)
  log(`  ${ok ? "✓" : "✗"} ${nombre}`)
  return ok
}

let fallos = 0

// ── duena: el detalle de producto (products/[productId]) y el panel en claro ─
{
  const { ctx, p } = await sesion("duena@tfv.dev", "dark")
  const empresa = new URL(p.url()).pathname.match(/\/c\/([^/]+)/)?.[1]
  await p.goto(`${BASE}/c/${empresa}/warehouses`, { waitUntil: "networkidle" })
  await p.locator("main a[href*='/warehouses/']").first().click()
  await p.waitForLoadState("networkidle")
  const almacen = new URL(p.url()).pathname
  // Al detalle del primer producto por su href, no por posición: el primer enlace de la página es
  // la sub-navegación y un clic genérico vuelve a la lista.
  await p.locator(`main a[href*="/products/"]`).first().click()
  if (!(await foto(p, "duena-productos", "Medidas"))) fallos++
  await ctx.close()

  const claro = await sesion("duena@tfv.dev", "light")
  await claro.p.goto(`${BASE}${almacen}/panel`, { waitUntil: "networkidle" })
  if (!(await foto(claro.p, "duena-panel-claro", "Panel"))) fallos++
  await claro.ctx.close()
}

// ── admin: producciones, en la empresa que sí tiene el servicio ──────────────
{
  const { ctx, p } = await sesion("admin@tfv.dev", "dark")
  // admin aterriza en el selector o en una empresa; se busca la que tenga Producciones en su nav.
  await p.goto(`${BASE}/companies`, { waitUntil: "networkidle" })
  // Los href se recogen antes de navegar: un locator apunta a la página en la que nació, y en
  // cuanto se navega deja de responder.
  const hrefs = await p
    .locator("main a[href^='/c/']")
    .evaluateAll((nodos) => nodos.map((n) => n.getAttribute("href")))
  let hallada = false
  for (const href of hrefs) {
    const empresa = href?.match(/^\/c\/([^/]+)/)?.[1]
    if (!empresa) continue
    await p.goto(`${BASE}/c/${empresa}/productions`, { waitUntil: "networkidle" })
    if (new URL(p.url()).pathname.endsWith("/productions")) {
      hallada = true
      break
    }
  }
  if (!hallada) {
    log("  ✗ ninguna empresa con producciones")
    fallos++
  }
  if (!(await foto(p, "duena-producciones", "Producciones"))) fallos++
  const prods = p.locator("main ul li a")
  if ((await prods.count()) > 0) {
    await prods.first().click()
    if (!(await foto(p, "duena-produccion", ""))) fallos++
  } else {
    log("  ✗ sin producciones que abrir")
    fallos++
  }
  await ctx.close()
}

await navegador.close()
log(fallos === 0 ? "RECAPTURA VÁLIDA" : `${fallos} capturas siguen mal`)
process.exitCode = fallos === 0 ? 0 : 1
