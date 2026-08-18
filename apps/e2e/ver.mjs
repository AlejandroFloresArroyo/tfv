import { chromium } from "@playwright/test"

const OUT = process.env.SCRATCH
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
const page = await context.newPage()
page.on("pageerror", (e) => process.stdout.write(`ERROR: ${e.message}\n`))
await context.request.post("http://localhost:3000/api/auth/login", {
  data: { email: "duena@tfv.dev", password: "Desarrollo.2026" },
})
const list = await context.request.get("http://localhost:3000/api/companies?limit=20")
const companies = (await list.json()).items
const companyId = companies.find((one) => one.name.includes("Renta")).id
await page.goto(`http://localhost:3000/c/${companyId}/warehouses`)
await page.getByRole("link", { name: "Nave Monterrey" }).click()
await page.waitForURL(/\/warehouses\/[^/]+$/)
const warehouseId = page.url().split("/warehouses/")[1]
await page.goto(
  `http://localhost:3000/c/${companyId}/warehouses/${warehouseId}/quotes?status=in_progress`,
)
await page.getByRole("link", { name: "Comercial Cervecería" }).click()
await page.waitForURL(/\/quotes\/[^/]+$/)
await page.waitForLoadState("networkidle")

const amounts = page.getByRole("heading", { name: "Importes" }).locator("..")
process.stdout.write(`ANTES: ${(await amounts.innerText()).replace(/\n+/g, " | ")}\n`)

const cobros = page.getByRole("region", { name: "Cobros" })
await cobros.getByLabel("Importe").fill("120.00")
await cobros.getByLabel("Nota").fill("Depósito en ventanilla")
await cobros.getByRole("button", { name: "Registrar cobro" }).click()
await page.waitForTimeout(1500)
process.stdout.write(`DESPUÉS: ${(await amounts.innerText()).replace(/\n+/g, " | ")}\n`)
await page.screenshot({ path: `${OUT}/cobros.png`, fullPage: true })

await cobros
  .getByRole("button", { name: /Dar de baja/ })
  .first()
  .click()
await page.waitForTimeout(1500)
process.stdout.write(`TRAS LA BAJA: ${(await amounts.innerText()).replace(/\n+/g, " | ")}\n`)
await browser.close()
process.exit(0)
