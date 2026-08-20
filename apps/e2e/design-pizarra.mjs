/** Captura la pizarra flotante: iPad apaisada y vertical, cerrada y abierta, en los dos temas. */
import { mkdirSync } from "node:fs"
import { chromium } from "@playwright/test"

const log = (l) => process.stdout.write(`${l}\n`)
const OUT = new URL("../../.impeccable/review/", import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const BASE = "http://127.0.0.1:3300"

const navegador = await chromium.launch()
const ctx = await navegador.newContext({
  viewport: { width: 1194, height: 834 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
})
const p = await ctx.newPage()

await p.goto(`${BASE}/login`, { waitUntil: "networkidle" })
await p.getByRole("textbox", { name: /correo/i }).fill("duena@tfv.dev")
await p.locator('input[type="password"]').first().fill("Desarrollo.2026")
await p.getByRole("button", { name: /entrar/i }).click()
await p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 })
if (!new URL(p.url()).pathname.startsWith("/c/")) {
  await p.locator("main a[href^='/c/']").first().click()
  await p.waitForLoadState("networkidle")
}

/* En headless el puntero es fino incluso a tamaño iPad, así que la pizarra puede nacer abierta
   donde en el dispositivo real (puntero grueso) nace cerrada. La sonda no supone: comprueba. */
const abrir = async () => {
  if ((await p.locator("[role=dialog]").count()) === 0) {
    await p.getByRole("button", { name: /abrir el menú/i }).click()
    await p.waitForTimeout(400)
  }
}
const cerrar = async () => {
  if ((await p.locator("[role=dialog]").count()) > 0) {
    await p.keyboard.press("Escape")
    await p.waitForTimeout(400)
  }
}

const foto = async (nombre) => {
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(900)
  await p.screenshot({ path: `${OUT}pizarra-${nombre}.png`, fullPage: false })
  log(`  ${nombre}`)
}

await foto("apaisada-cerrada")
await abrir()
await foto("apaisada-abierta")

// Elegir cierra el cajón y navega.
await p.getByRole("link", { name: /miembros/i }).click()
await p.waitForLoadState("networkidle")
await foto("tras-elegir")

// Vertical, tema claro.
await p.setViewportSize({ width: 834, height: 1194 })
await p.emulateMedia({ colorScheme: "light" })
await p.reload({ waitUntil: "networkidle" })
await abrir()
await foto("vertical-abierta-claro")

// El scroll sobrevive al ciclo abrir/cerrar, y la barra fija sigue arriba con el menú abierto.
await cerrar()
await p.evaluate(() => window.scrollTo(0, 600))
await p.waitForTimeout(300)
await abrir()
const barraVisible = await p.evaluate(() => {
  const barra = document.querySelector("header")
  return barra
    ? barra.getBoundingClientRect().top >= 0 && barra.getBoundingClientRect().bottom > 0
    : false
})
await cerrar()
const scrollTras = await p.evaluate(() => window.scrollY)
log(`  scroll: antes=600 después=${scrollTras} · barra visible con menú abierto=${barraVisible}`)

// Escritorio con puntero fino: la pizarra nace abierta, elegir NO la cierra, y el empuje es
// rígido (el contenido conserva su ancho: se mide antes y después).
await p.setViewportSize({ width: 1440, height: 900 })
await p.emulateMedia({ colorScheme: "dark" })
// La preferencia pudo quedar escrita por los pasos táctiles simulados; el escritorio se prueba
// desde el estado de fábrica.
await p.evaluate(() => localStorage.removeItem("tfv_pizarra"))
await p.reload({ waitUntil: "networkidle" })
await p.waitForTimeout(1200)
const naceAbierta = await p.evaluate(() => document.documentElement.getAttribute("data-pizarra"))
const anchoAbierta = await p.evaluate(
  () => document.querySelector("main")?.getBoundingClientRect().width,
)
await foto("escritorio-persistente")
await p.getByRole("link", { name: /roles/i }).click()
await p.waitForLoadState("networkidle")
await p.waitForTimeout(800)
const sigueAbierta = await p.evaluate(() => document.documentElement.getAttribute("data-pizarra"))
log(
  `  persistente: nace=${naceAbierta === "abierta"} · sigue tras elegir=${sigueAbierta === "abierta"}`,
)
await p
  .getByRole("button", { name: /cerrar el menú/i })
  .first()
  .click()
await p.waitForTimeout(600)
const anchoCerrada = await p.evaluate(
  () => document.querySelector("main")?.getBoundingClientRect().width,
)
log(
  `  rígido: ancho abierta=${Math.round(anchoAbierta)} cerrada=${Math.round(anchoCerrada)} (deben ser iguales)`,
)
await foto("escritorio-cerrada")

await navegador.close()
log("listo")
