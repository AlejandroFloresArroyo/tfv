/**
 * Cotizaciones, en el navegador.
 *
 * Lo que se comprueba aquí es que **se pueden mirar**: que la bandeja llega ordenada por lo que hay
 * que atender antes, que un filtro por estado se comparte por enlace, y que la ficha muestra el
 * equipo apartado y los importes que calculó el servidor.
 *
 * Los importes no se recalculan aquí a propósito. Su aritmética tiene treinta y nueve pruebas en
 * `@tfv/contracts`, donde es una función pura; repetirla contra un navegador sólo comprobaría que
 * el número viaja.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

const QUOTES = (companyId: string, warehouseId: string) =>
  `/c/${companyId}/warehouses/${warehouseId}/quotes`

/** El primer almacén de la empresa, tal y como lo encuentra quien entra por la navegación. */
async function firstWarehouse(page: import("@playwright/test").Page, companyId: string) {
  await page.goto(`/c/${companyId}/warehouses`)
  await page.getByRole("link", { name: "Nave Monterrey" }).click()
  await page.waitForURL(/\/warehouses\/[^/]+$/)
  return page.url().split("/warehouses/")[1] as string
}

test.describe("la bandeja de cotizaciones", () => {
  test("llega ordenada por lo que hay que atender antes", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(QUOTES(companyId, warehouseId))

    const items = page.getByRole("list", { name: "Resultados" }).getByRole("listitem")
    await expect(items).toHaveCount(4)

    // La prioridad la deriva el servidor del estado: pre-cotización primero, en renta al final.
    await expect(items.first()).toContainText("Documental Sierra")
    await expect(items.last()).toContainText("Rodaje Serie Norte")
  })

  test("un filtro por estado se comparte por enlace", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_rent`)

    const items = page.getByRole("list", { name: "Resultados" }).getByRole("listitem")
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText("Rodaje Serie Norte")
  })
})

test.describe("la ficha de una cotización", () => {
  test("muestra el equipo apartado y los importes del servidor", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_rent`)
    await page.getByRole("link", { name: "Rodaje Serie Norte · bloque 1" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    // El estado proyectado sobre el inventario: en renta significa equipo fuera de la nave.
    await expect(page.getByText("En renta").first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "Líneas" })).toBeVisible()
    await expect(page.getByText(/unidades apartadas|unidad apartada/).first()).toBeVisible()

    // Los importes vienen calculados del servidor, con su cadena entera visible.
    await expect(page.getByRole("heading", { name: "Importes" })).toBeVisible()
    await expect(page.getByText("Total a pagar")).toBeVisible()
    await expect(page.getByText("Neto")).toBeVisible()
  })

  test("una cotización abierta advierte que sus importes todavía se mueven", async ({
    as,
    companies,
  }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=pending`)
    await page.getByRole("link", { name: "Cortometraje Estudiantil" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    await expect(page.getByText(/se congelan al cerrar/i)).toBeVisible()
  })
})

test.describe("la compuerta alcanza a las cotizaciones", () => {
  test("un rol sin la clave no ve la sección", async ({ as, companies }) => {
    // La cuenta acotada tiene cinco claves de doscientas cincuenta y cinco, y ninguna es de
    // cotizaciones. Ocultar la entrada no es control de acceso —eso lo hace la API—, pero
    // ofrecerla llevaría a un 403 sin explicación.
    const context = await as("limited")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(`/c/${companyId}/warehouses`)
    await expect(page.getByRole("link", { name: "Cotizaciones" })).toHaveCount(0)
  })
})
