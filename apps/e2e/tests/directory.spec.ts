/**
 * Clientes, proveedores y direcciones desde la pantalla.
 *
 * Son las tres colecciones que la 28d dejó explorables sin nadie que las mirara. Aquí se comprueba
 * el recorrido completo —alta, edición, baja— y las dos reglas que estas pantallas tienen y las
 * demás no: **clientes y proveedores no comparten permiso**, y **la dirección primaria es una sola**.
 *
 * Cada prueba limpia lo que crea: correrlas no debe destruir los datos con los que se está mirando
 * la aplicación.
 */

import type { Page } from "@playwright/test"
import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

const results = (page: Page) => page.getByRole("list", { name: "Resultados" }).getByRole("listitem")

function uniqueName(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 8)}`
}

test.describe("cartera de clientes", () => {
  test("dar de alta uno lo hace aparecer sin recargar, y persiste", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const alias = uniqueName("Cliente")

    await page.goto(`/c/${companyId}/directory/clients`)

    await page.evaluate(() => {
      ;(window as unknown as { __marca: string }).__marca = "misma-carga"
    })

    await page.getByRole("button", { name: "Nuevo cliente" }).click()
    await page.getByLabel("Alias").fill(alias)
    await page.getByLabel("Nombre", { exact: true }).fill("Consuelo")
    await page.getByRole("dialog").getByRole("button", { name: "Crear" }).click()

    await expect(page.getByRole("dialog")).toBeHidden()
    // Aparece buscándolo: la cartera sembrada tiene más de cien y la primera página no lo alcanza.
    await page.getByLabel("Buscar en la lista").fill(alias)
    await expect(page.getByRole("heading", { name: alias })).toBeVisible()

    const survived = await page.evaluate(
      () => (window as unknown as { __marca?: string }).__marca === "misma-carga",
    )
    expect(survived, "el listado se actualizó recargando la página entera").toBe(true)

    const listed = await context.request.get(
      `/api/companies/${companyId}/clients?search=${encodeURIComponent(alias)}`,
    )
    const body = (await listed.json()) as { items: { id: string; alias: string }[] }
    const saved = body.items.find((row) => row.alias === alias)

    expect(saved).toBeDefined()
    if (saved) await context.request.delete(`/api/companies/${companyId}/clients/${saved.id}`)
  })

  test("distingue quién tiene cuenta de quién no", async ({ as, companies }) => {
    // La cartera sembrada es toda externa. El filtro responde a «cuánta cartera sigue fuera de la
    // plataforma», que es la pregunta que se hace antes de una campaña de invitación.
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(`/c/${companies[WAREHOUSE_COMPANY] as string}/directory/clients?userId=null`)

    await expect(page.getByText("Cuenta: Externo")).toBeVisible()
    await expect(results(page).first().getByText("Externo")).toBeVisible()
  })

  test("la baja avisa de que los documentos emitidos conservan el nombre", async ({
    as,
    companies,
  }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const alias = uniqueName("Efímero")

    await context.request.post(`/api/companies/${companyId}/clients`, { data: { alias } })

    await page.goto(`/c/${companyId}/directory/clients?search=${encodeURIComponent(alias)}`)
    await results(page).first().getByRole("button", { name: "Acciones" }).click()
    await page.getByRole("menuitem", { name: "Eliminar" }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(alias)
    await expect(dialog).toContainText("conservan su nombre")

    await dialog.getByRole("button", { name: "Eliminar" }).click()

    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText("Ningún elemento coincide")).toBeVisible()
  })
})

test.describe("clientes y proveedores no comparten permiso", () => {
  test("son dos colecciones distintas, no la misma con un parámetro", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const alias = uniqueName("SóloCliente")

    await context.request.post(`/api/companies/${companyId}/clients`, { data: { alias } })

    await page.goto(`/c/${companyId}/directory/providers?search=${encodeURIComponent(alias)}`)
    await expect(page.getByText("Ningún elemento coincide")).toBeVisible()

    await page.goto(`/c/${companyId}/directory/clients?search=${encodeURIComponent(alias)}`)
    await expect(page.getByRole("heading", { name: alias })).toBeVisible()

    const listed = await context.request.get(
      `/api/companies/${companyId}/clients?search=${encodeURIComponent(alias)}`,
    )
    const body = (await listed.json()) as { items: { id: string }[] }
    const saved = body.items[0]
    if (saved) await context.request.delete(`/api/companies/${companyId}/clients/${saved.id}`)
  })

  test("un rol sin la clave no ve la sección y el servidor la niega igual", async ({
    as,
    companies,
  }) => {
    // Ocultar no es proteger: la entrada no se pinta **y** la dirección responde que no.
    const context = await as("limited")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(`/c/${companyId}`)
    await expect(page.getByRole("link", { name: "Clientes" })).toBeHidden()

    await page.goto(`/c/${companyId}/directory/clients`)
    await expect(page.getByText("No tienes acceso a esta sección")).toBeVisible()
  })
})

test.describe("libreta de direcciones", () => {
  test("la primaria va primero y sólo hay una", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(`/c/${companies[WAREHOUSE_COMPANY] as string}/settings/addresses`)

    // El orden por defecto lo pone el servidor, no un reordenado en memoria: con paginación, la
    // primaria podría estar en la página nueve.
    await expect(results(page).first().getByText("Primaria")).toBeVisible()
    await expect(page.getByText("Primaria", { exact: true })).toHaveCount(1)
  })

  test("marcar otra como primaria desmarca la anterior", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(`/c/${companyId}/settings/addresses`)

    const antes = await results(page).first().getByRole("heading").innerText()
    const otra = results(page).nth(1)
    const nombreOtra = await otra.getByRole("heading").innerText()

    await otra.getByRole("button", { name: "Acciones" }).click()
    await page.getByRole("menuitem", { name: "Marcar como primaria" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Marcar como primaria" }).click()

    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(results(page).first().getByRole("heading")).toHaveText(nombreOtra)
    await expect(page.getByText("Primaria", { exact: true })).toHaveCount(1)

    // Se devuelve al estado anterior: estas pruebas no destruyen los datos de la siembra.
    const listed = await context.request.get(`/api/companies/${companyId}/addresses?limit=96`)
    const body = (await listed.json()) as { items: { id: string; label: string }[] }
    const original = body.items.find((row) => row.label === antes)
    if (original) {
      await context.request.patch(`/api/companies/${companyId}/addresses/${original.id}`, {
        data: { isPrimary: true },
      })
    }
  })

  test("la búsqueda alcanza la calle y la ciudad, no sólo la etiqueta", async ({
    as,
    companies,
  }) => {
    // El registro de la spec decía «nombre», que para una dirección es su etiqueta y casi siempre
    // está vacía. Se corrigió porque una dirección se reconoce por dónde está.
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(
      `/c/${companies[WAREHOUSE_COMPANY] as string}/settings/addresses?search=monterrey`,
    )

    await expect(results(page).first()).toContainText("Monterrey")
  })
})
