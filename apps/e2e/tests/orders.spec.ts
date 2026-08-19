/**
 * Pedidos de almacén, en el navegador.
 *
 * Lo que se comprueba aquí es la decisión del operador: que la falta se vea **antes** de aceptar, y
 * que aceptar lleve a la cotización que se acaba de generar. La aritmética de la aceptación tiene
 * sus trece pruebas en la API; repetirla contra un navegador sólo comprobaría que el número viaja.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"
import { firstWarehouse, ORDERS } from "../setup/warehouse.ts"

test.describe("la bandeja de pedidos", () => {
  /** Lo creado por cada prueba, para llevárselo al terminar. */
  const trash: { companyId: string; warehouseId: string; orderId: string }[] = []

  test.afterEach(async ({ as }) => {
    if (trash.length === 0) return
    const context = await as("owner")
    for (const { companyId, warehouseId, orderId } of trash.splice(0)) {
      const warehouse = `/api/companies/${companyId}/warehouses/${warehouseId}`

      // Dar de baja un pedido **desvincula** su cotización en vez de borrarla —es un documento con
      // importes—, así que la prueba tiene que llevarse las dos o deja rastro.
      const read = await context.request.get(`${warehouse}/orders/${orderId}`)
      const quoteId = read.ok() ? ((await read.json()) as { quoteId: string | null }).quoteId : null

      await context.request.delete(`${warehouse}/orders/${orderId}`)
      if (quoteId) await context.request.delete(`${warehouse}/quotes/${quoteId}`)
    }
  })

  /** Un pedido con dos líneas: una que cabe y otra que no. */
  async function shortOrder(
    context: import("@playwright/test").BrowserContext,
    companyId: string,
    warehouseId: string,
    name: string,
  ) {
    const warehouse = `/api/companies/${companyId}/warehouses/${warehouseId}`
    const rates = await context.request.get(`${warehouse}/rates?availableForRent=true&limit=30`)
    const { items } = (await rates.json()) as {
      items: { measurementId: string; available: number }[]
    }
    const sorted = [...items].sort((a, b) => b.available - a.available)
    const roomy = sorted[0]
    const scarce = sorted.at(-1)
    expect(roomy && scarce, "el almacén no tiene equipo con el que montar el caso").toBeTruthy()

    const created = await context.request.post(`${warehouse}/orders`, {
      data: {
        origin: "production",
        type: "rent",
        name,
        lines: [
          { measurementId: roomy?.measurementId, quantity: 1 },
          // Más de lo que hay: es lo que la ficha tiene que señalar antes de aceptar.
          { measurementId: scarce?.measurementId, quantity: (scarce?.available ?? 0) + 5 },
        ],
      },
    })
    expect(created.ok(), `no se pudo crear ${name}: ${await created.text()}`).toBe(true)

    const order = (await created.json()) as { id: string }
    trash.push({ companyId, warehouseId, orderId: order.id })
    return order.id
  }

  test("la ficha dice qué falta antes de aceptar, y aceptar lleva a la cotización", async ({
    as,
    companies,
  }) => {
    // Enterarse al fallar la reserva es enterarse tarde: el operador ya le dijo que sí al cliente.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const name = `Solicitud ${Date.now()}`
    await shortOrder(context, companyId, warehouseId, name)

    await page.goto(ORDERS(companyId, warehouseId))
    const card = page
      .getByRole("list", { name: "Resultados" })
      .getByRole("listitem")
      .filter({ hasText: name })
    await expect(card).toContainText("Pendiente")

    await page.getByRole("link", { name }).click()
    await page.waitForURL(/\/orders\/[^/]+$/)

    // La falta se ve por línea y en un aviso, antes de decidir nada.
    await expect(page.getByText("Sin unidades libres")).toBeVisible()
    await expect(page.getByText(/piden más equipo del que hay libre|pide más equipo/)).toBeVisible()

    await page.getByRole("button", { name: "Aceptar y cotizar" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/, { timeout: 20_000 })

    // La cotización nace en progreso y con el folio del pedido: es lo que la hace reconocible.
    await expect(page.getByText("En progreso").first()).toBeVisible()
    await expect(page.getByText(/^PED-/).first()).toBeVisible()
  })

  test("rechazar exige un motivo, y lo enseña", async ({ as, companies }) => {
    // El motivo lo lee quien hizo la solicitud desde otra empresa: sin él hay que llamar por
    // teléfono, que es lo que este sistema existe para evitar.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const name = `Rechazo ${Date.now()}`
    const orderId = await shortOrder(context, companyId, warehouseId, name)

    await page.goto(`${ORDERS(companyId, warehouseId)}/${orderId}`)
    await page.getByRole("button", { name: "Rechazar", exact: true }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("button", { name: "Rechazar el pedido" })).toBeDisabled()

    await dialog.getByLabel("Motivo").fill("No hay lentes libres esa semana")
    await dialog.getByRole("button", { name: "Rechazar el pedido" }).click()

    await expect(page.getByText(/No hay lentes libres esa semana/)).toBeVisible()
    await expect(page.getByText("Cancelado").first()).toBeVisible()
  })
})
