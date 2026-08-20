import { chromium } from "@playwright/test"

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 834, height: 1194 }, colorScheme: "dark" })
const p = await ctx.newPage()
const log = (l) => process.stdout.write(l + "\n")
await p.goto("http://127.0.0.1:3300/login", { waitUntil: "networkidle" })
await p.getByRole("textbox", { name: /correo/i }).fill("duena@tfv.dev")
await p.locator('input[type="password"]').first().fill("Desarrollo.2026")
await p.getByRole("button", { name: /entrar/i }).click()
await p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 })
if (!new URL(p.url()).pathname.startsWith("/c/")) {
  await p.locator("main a[href^='/c/']").first().click()
  await p.waitForLoadState("networkidle")
}
const empresa = new URL(p.url()).pathname.match(/\/c\/([^/]+)/)?.[1]
await p.goto(`http://127.0.0.1:3300/c/${empresa}/settings/members`, { waitUntil: "networkidle" })
await p.waitForTimeout(800)

const sy = () => p.evaluate(() => window.scrollY)
await p.evaluate(() => window.scrollTo(0, 600))
await p.waitForTimeout(300)
log(`tras scrollTo: ${await sy()}`)
await p
  .getByRole("button", { name: /abrir el menú/i })
  .first()
  .click()
await p.waitForTimeout(500)
log(
  `abierto: ${await sy()} · bodyPos=${await p.evaluate(() => getComputedStyle(document.body).position)} · bodyOverflow=${await p.evaluate(() => getComputedStyle(document.body).overflow)}`,
)
await p.keyboard.press("Escape")
await p.waitForTimeout(200)
log(`cerrado+200ms: ${await sy()}`)
await p.waitForTimeout(800)
log(`cerrado+1000ms: ${await sy()}`)
await b.close()
