/**
 * Roles: crear, editar y eliminar desde la pantalla.
 *
 * Es el recorrido de escritura completo, y el que comprueba el criterio de la 28: **crear un
 * elemento lo hace aparecer en su listado sin recargar la página**.
 *
 * Cada prueba limpia lo que crea. Estas pruebas **no truncan la base** —correrlas no debe destruir
 * los datos con los que se está mirando la aplicación—, así que dejar basura acumulada sería
 * empeorar el problema que evitan.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

/** Nombre irrepetible, para que dos ejecuciones en paralelo no se pisen. */
function uniqueName(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 8)}`
}

test.describe("crear un rol", () => {
  test("aparece en el listado sin recargar, y persiste", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY]
    const name = uniqueName("Rol")

    await page.goto(`/c/${companyId}/settings/roles`)

    // Se marca el documento: si sobrevive, no hubo recarga. Es lo que sustituye a las llamadas
    // manuales de refresco de la pila anterior (`DEFECTS.md` F-02).
    await page.evaluate(() => {
      ;(window as unknown as { __marca: string }).__marca = "misma-carga"
    })

    await page.getByRole("button", { name: "Crear rol" }).click()
    await page.getByLabel("Nombre").fill(name)

    // La casilla de grupo marca las ocho claves de `companies.users` de una vez.
    await page.getByLabel("companies.users", { exact: true }).check()
    await page.getByRole("button", { name: "Crear", exact: true }).click()

    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible()

    const survived = await page.evaluate(
      () => (window as unknown as { __marca?: string }).__marca === "misma-carga",
    )
    expect(survived, "el listado se actualizó recargando la página entera").toBe(true)

    // Y no sólo en la pantalla: en la base, con sus ocho claves. `context.request` comparte las
    // cookies del navegador, así que pregunta como la misma persona.
    const listed = await context.request.get(`/api/companies/${companyId}/roles`)
    const body = (await listed.json()) as {
      items: { id: string; name: string; permissions: string[] }[]
    }
    const saved = body.items.find((role) => role.name === name)

    expect(saved?.permissions).toHaveLength(8)

    if (saved) await context.request.delete(`/api/companies/${companyId}/roles/${saved.id}`)
  })

  test("una clave inventada se rechaza, y el diálogo lo dice", async ({ as, companies }) => {
    /**
     * La matriz sólo ofrece claves del catálogo, así que este caso no se alcanza pulsando. Se
     * fuerza inyectando un campo, que es lo que haría quien manipule la petición: el catálogo tiene
     * que ser la autoridad **en el servidor**, no en la pantalla.
     */
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}/settings/roles`)
    await page.getByRole("button", { name: "Crear rol" }).click()
    await page.getByLabel("Nombre").fill(uniqueName("Inventado"))

    await page.evaluate(() => {
      const form = document.querySelector("form")
      const field = document.createElement("input")
      field.type = "hidden"
      field.name = "permissions"
      field.value = "warehouses.products.aprobar"
      form?.appendChild(field)
    })

    await page.getByRole("button", { name: "Crear", exact: true }).click()

    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page.getByRole("dialog")).toContainText("no existe en el catálogo")
  })
})

test.describe("eliminar un rol", () => {
  test("la confirmación nombra la entidad y enumera la cascada", async ({ as, companies }) => {
    /**
     * `forms-and-wizards` pide las dos cosas: nombrar qué se elimina y decir qué se lleva por
     * delante. «¿Eliminar?» se contesta que sí sin leer.
     */
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY]
    const name = uniqueName("Efímero")

    await page.goto(`/c/${companyId}/settings/roles`)
    await page.getByRole("button", { name: "Crear rol" }).click()
    await page.getByLabel("Nombre").fill(name)
    await page.getByRole("button", { name: "Crear", exact: true }).click()
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible()

    const row = page.getByRole("row").filter({ hasText: name })
    await row.getByRole("button", { name: "Eliminar" }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(name)
    await expect(dialog).toContainText("Nadie lo tiene asignado")
    await expect(dialog).toContainText("No se puede deshacer")

    await dialog.getByRole("button", { name: "Eliminar" }).click()

    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByRole("cell", { name, exact: true })).toBeHidden()
  })

  test("cancelar no elimina nada", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}/settings/roles`)

    const row = page.getByRole("row").filter({ hasText: "Almacén" })
    await row.getByRole("button", { name: "Eliminar" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click()

    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByRole("cell", { name: "Almacén", exact: true })).toBeVisible()
  })
})

test.describe("quien no puede, no ve el botón", () => {
  test("el rol acotado no ve ni crear ni editar", async ({ as, companies }) => {
    const context = await as("limited")
    const page = await context.newPage()

    await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}/settings/members`)
    await expect(page.getByRole("heading", { name: "Miembros" })).toBeVisible()

    // Tiene `companies.users.view` y ninguna de escritura.
    await expect(page.getByRole("button", { name: "Incorporar" })).toBeHidden()
    await expect(page.getByRole("button", { name: "Editar" })).toBeHidden()
  })
})
