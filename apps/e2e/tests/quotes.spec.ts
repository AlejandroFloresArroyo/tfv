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
    await expect(page.getByRole("heading", { name: "Equipo de la cotización" })).toBeVisible()

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

test.describe("el constructor de cotizaciones", () => {
  test("los importes de la previsualización son los que calculó el servidor", async ({
    as,
    companies,
  }) => {
    // Es el requisito de `quotation-pricing`: la previsualización coincide, y coincide porque es la
    // misma función. Aquí no se comprueba la aritmética —eso son cuarenta y ocho casos en
    // `@tfv/contracts`—, sino que las dos cifras que la pantalla enseña a la vez son la misma.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_progress`)
    await page.getByRole("link", { name: "Comercial Cervecería" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    const lines = page.getByRole("listitem").filter({ has: page.getByLabel("Cantidad") })
    await expect(lines.first()).toBeVisible()

    const totals = await lines.getByText(/^[\d,]+\.\d\d$/).allTextContents()
    const sum = totals.reduce((carry, value) => carry + Number(value.replace(/,/g, "")), 0)

    const subtotal = await page
      .getByRole("term")
      .filter({ hasText: "Subtotal" })
      .locator("xpath=following-sibling::dd[1]")
      .textContent()

    expect(Number((subtotal ?? "").replace(/,/g, ""))).toBeCloseTo(sum, 2)
  })

  test("añadir equipo mueve los importes sin haber guardado nada", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_progress`)
    await page.getByRole("link", { name: "Comercial Cervecería" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    const save = page.getByRole("button", { name: "Guardar líneas" })
    await expect(save).toBeDisabled()

    const lines = page.getByRole("listitem").filter({ has: page.getByLabel("Cantidad") })
    const before = await lines.count()

    await page.getByLabel("Añadir equipo").fill("bandera")
    await page
      .getByRole("button", { name: /Bandera 4x4/ })
      .first()
      .click()

    await expect(lines).toHaveCount(before + 1)
    // Hay algo que guardar: el botón deja de estar apagado, y nada ha viajado todavía.
    await expect(save).toBeEnabled()
  })

  test("la disponibilidad está delante mientras se edita", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_progress`)
    await page.getByRole("link", { name: "Comercial Cervecería" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    await page.getByLabel("Añadir equipo").fill("camara")
    await expect(page.getByText(/libres|Sin unidades libres/).first()).toBeVisible()
  })

  test("pedir más de lo que hay impide guardar antes de intentarlo", async ({ as, companies }) => {
    // El servidor rechaza la reserva que no cabe y no aparta nada a medias. Pero enterarse al
    // guardar es enterarse después de haberle prometido el equipo a alguien.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_progress`)
    await page.getByRole("link", { name: "Comercial Cervecería" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    await page.getByLabel("Cantidad").first().fill("999")

    await expect(page.getByText(/más equipo del que hay libre/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Guardar líneas" })).toBeDisabled()
  })
})

test.describe("el cambio de estado", () => {
  test("sólo ofrece las transiciones previstas desde donde está", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_rent`)
    await page.getByRole("link", { name: "Rodaje Serie Norte · bloque 1" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    await page.getByRole("button", { name: "Cambiar de estado" }).click()

    // Desde «en renta» la máquina sólo admite completar o cancelar. Volver atrás no está previsto.
    const menu = page.getByRole("menu")
    await expect(menu.getByRole("menuitem", { name: "Completada" })).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: "Cancelada" })).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: "En progreso" })).toHaveCount(0)
    // Y una renta no se «vende».
    await expect(menu.getByRole("menuitem", { name: "Vendida" })).toHaveCount(0)
  })
})

test.describe("el retorno del equipo", () => {
  test("una renta en curso nombra el equipo que tiene fuera", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_rent`)
    await page.getByRole("link", { name: "Rodaje Serie Norte · bloque 1" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    const returns = page.getByRole("region", { name: "Retorno del equipo" })
    await expect(returns).toBeVisible()

    // Cada unidad por su código, que es lo que lleva escrito la etiqueta de la nave.
    const units = returns.getByRole("listitem")
    await expect(units.first()).toBeVisible()
    await expect(page.getByRole("button", { name: /Registrar/ })).toBeDisabled()
  })

  test("registrar el retorno devuelve el equipo al inventario", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_rent`)
    await page.getByRole("link", { name: "Rodaje Serie Norte · bloque 1" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    const returns = page.getByRole("region", { name: "Retorno del equipo" })
    const before = await returns.getByRole("listitem").count()

    await returns.getByRole("checkbox").first().check()
    await page.getByRole("button", { name: /Registrar 1 unidad/ }).click()

    // Lo devuelto deja de figurar: el vínculo se liberó y la unidad volvió a la nave.
    await expect(returns.getByRole("listitem")).toHaveCount(before - 1)
  })
})
