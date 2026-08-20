import { chromium } from "@playwright/test"

const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1194, height: 834 } })).newPage()
await p.goto("http://127.0.0.1:3300/login", { waitUntil: "networkidle" })
await p.getByRole("textbox", { name: /correo/i }).fill("duena@tfv.dev")
await p.locator('input[type="password"]').first().fill("Desarrollo.2026")
await p.getByRole("button", { name: /entrar/i }).click()
await p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 })
if (!new URL(p.url()).pathname.startsWith("/c/")) {
  await p.locator("main a[href^='/c/']").first().click()
  await p.waitForLoadState("networkidle")
}
process.stdout.write(`url: ${p.url()}\n`)
process.stdout.write(`header: ${await p.locator("header").first().innerText()}\n`)
await b.close()
