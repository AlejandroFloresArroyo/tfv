/**
 * La conversación del pedido.
 *
 * Lo que hay que comprobar con un navegador delante es que **el mensaje aparece sin recargar**: la
 * conversación se reconcilia en el cliente —el mensaje se pinta antes de que el servidor conteste, y
 * luego se sustituye por el que vuelve— y esa costura no existe en ninguna prueba de la API. Si se
 * rompe, el síntoma es un mensaje duplicado o uno que se queda en «enviando…» para siempre, y las
 * dos cosas se ven aquí y en ningún otro sitio.
 *
 * La otra mitad cruza rebanadas: **decidir sobre el pedido escribe en su conversación**. El hito lo
 * publica la misma transacción que cambia el pedido, así que un aviso que contara una aceptación
 * revertida no puede existir; lo que sí puede pasar es que el hito no llegue nunca a la pantalla, y
 * eso sólo se ve mirándola.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"
import { firstWarehouse, ORDERS, ownOrder, sweepOrders } from "../setup/warehouse.ts"

interface CreatedOrder {
  companyId: string
  warehouseId: string
  orderId: string
}

test.describe("la conversación del pedido", () => {
  const trash: CreatedOrder[] = []
  test.afterEach(async ({ as }) => await sweepOrders(await as("owner"), trash))

  test("un mensaje se escribe, aparece sin recargar y sobrevive a la recarga", async ({
    as,
    companies,
  }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const orderId = await ownOrder(context, companyId, warehouseId, `Charla ${Date.now()}`, trash)

    await page.goto(`${ORDERS(companyId, warehouseId)}/${orderId}`)

    const conversacion = page.getByRole("log", { name: "Conversación" })
    // Una conversación vacía dice para qué sirve. Es lo que distingue «no hay nada» de «no carga».
    await expect(conversacion).toContainText("Aquí se habla de este pedido")

    const texto = `El lente llega el jueves ${Date.now().toString(36).slice(-4)}`
    await page.getByLabel("Escribe un mensaje…").fill(texto)
    await page.getByRole("button", { name: "Enviar" }).click()

    // Sin recargar: es la reconciliación del cliente, y es lo único que esta prueba no comparte con
    // las de la API.
    await expect(conversacion).toContainText(texto)
    // Y una sola vez. El mensaje se pinta antes de que el servidor conteste y luego se sustituye
    // por el que vuelve; un empalme mal hecho deja los dos.
    await expect(conversacion.getByText(texto)).toHaveCount(1)

    // Ni se quedó en «enviando…» ni falló: eso es lo que se lee cuando el envío no cerró.
    await expect(conversacion.getByText("no se envió")).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole("log", { name: "Conversación" })).toContainText(texto)
  })

  test("lo escrito se corrige y se retira desde el propio mensaje", async ({ as, companies }) => {
    // Corregir deja marca —«editado»— y retirar lo quita de la vista de los dos lados. Un mensaje
    // que se puede cambiar sin que se note es peor que uno que no se puede cambiar.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const orderId = await ownOrder(
      context,
      companyId,
      warehouseId,
      `Corrección ${Date.now()}`,
      trash,
    )

    await page.goto(`${ORDERS(companyId, warehouseId)}/${orderId}`)

    const conversacion = page.getByRole("log", { name: "Conversación" })
    await page.getByLabel("Escribe un mensaje…").fill("Salen dos cuerpos")
    await page.getByRole("button", { name: "Enviar" }).click()
    await expect(conversacion).toContainText("Salen dos cuerpos")

    await conversacion.getByRole("button", { name: "Editar" }).first().click()
    await conversacion.getByRole("textbox").first().fill("Salen tres cuerpos")
    await conversacion.getByRole("button", { name: "Guardar" }).first().click()

    await expect(conversacion).toContainText("Salen tres cuerpos")
    await expect(conversacion).toContainText("editado")

    await conversacion.getByRole("button", { name: "Eliminar" }).first().click()
    await expect(conversacion).not.toContainText("Salen tres cuerpos")
  })

  test("decidir sobre el pedido lo deja escrito en su conversación", async ({ as, companies }) => {
    // El hito lo publica la **misma transacción** que rechaza el pedido, con el motivo dentro: quien
    // pidió el equipo lee por qué sin tener que llamar por teléfono, que es lo que este sistema
    // existe para evitar.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const orderId = await ownOrder(context, companyId, warehouseId, `Hito ${Date.now()}`, trash)

    await page.goto(`${ORDERS(companyId, warehouseId)}/${orderId}`)
    await page.getByRole("button", { name: "Rechazar", exact: true }).click()

    const dialogo = page.getByRole("dialog")
    await dialogo.getByLabel("Motivo").fill("El cuerpo sale el jueves con otro rodaje")
    await dialogo.getByRole("button", { name: "Rechazar el pedido" }).click()

    const conversacion = page.getByRole("log", { name: "Conversación" })
    await expect(conversacion).toContainText("El almacén rechazó el pedido")
    await expect(conversacion).toContainText("El cuerpo sale el jueves con otro rodaje")
    // Se distingue de lo que escribió una persona, que es lo que impide leerlo como una promesa
    // de alguien.
    await expect(conversacion).toContainText("Sistema")
  })
})
