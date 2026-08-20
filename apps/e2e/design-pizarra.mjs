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

const foto = async (nombre) => {
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(900)
  await p.screenshot({ path: `${OUT}pizarra-${nombre}.png`, fullPage: false })
  log(`  ${nombre}`)
}

await foto("apaisada-cerrada")
await p.getByRole("button", { name: /renta fílmica/i }).click()
await foto("apaisada-abierta")

// Elegir cierra el cajón y navega.
await p.getByRole("link", { name: /miembros/i }).click()
await p.waitForLoadState("networkidle")
await foto("tras-elegir")

// Vertical, tema claro.
await p.setViewportSize({ width: 834, height: 1194 })
await p.emulateMedia({ colorScheme: "light" })
await p.reload({ waitUntil: "networkidle" })
await p.getByRole("button", { name: /renta fílmica/i }).click()
await foto("vertical-abierta-claro")

await navegador.close()
log("listo")
