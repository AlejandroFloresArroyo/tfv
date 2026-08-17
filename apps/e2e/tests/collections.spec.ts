/**
 * Exploración de colecciones, en el navegador.
 *
 * Lo que se prueba aquí es lo que **sólo existe en el navegador**: que el estado viva en la
 * dirección, que retroceder deshaga, que recargar conserve, y que escribir deprisa no dispare una
 * consulta por letra. Las transformaciones de parámetros se prueban en `apps/web`, donde son
 * funciones puras y no hacen falta ni navegador ni servidor.
 *
 * La empresa sembrada tiene cuarenta personas, así que la paginación es real: con cuatro cuentas
 * nunca aparecería y esta suite no comprobaría nada.
 */

import type { Page } from "@playwright/test"
import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

/**
 * Los elementos **de la colección**, no los de la cáscara.
 *
 * La navegación y los menús también son listas. Sin acotar por el nombre de la lista, contar
 * elementos cuenta también las entradas del menú lateral, y el número sale distinto según qué
 * servicios tenga contratados la empresa.
 */
const results = (page: Page) => page.getByRole("list", { name: "Resultados" }).getByRole("listitem")

const MEMBERS = (companyId: string) => `/c/${companyId}/settings/members`

test.describe("el estado de exploración vive en la dirección", () => {
  test("un listado filtrado se comparte por enlace", async ({ as, companies }) => {
    // Escenario: «Un listado filtrado se comparte por enlace». Se abre la dirección en una pestaña
    // nueva, que es lo que hace quien recibe el enlace.
    const context = await as("owner")
    const companyId = companies[WAREHOUSE_COMPANY] as string

    const page = await context.newPage()
    await page.goto(`${MEMBERS(companyId)}?search=nunez`)

    await expect(page.getByRole("heading", { name: "Martín Núñez" })).toBeVisible()
    await expect(page.getByLabel("Buscar en la lista")).toHaveValue("nunez")
  })

  test("recargar conserva la exploración", async ({ as, companies }) => {
    // Escenario: «Recargar conserva la exploración».
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(`${MEMBERS(companies[WAREHOUSE_COMPANY] as string)}?isActive=false`)
    await expect(page.getByText("Estado: Inactiva")).toBeVisible()

    await page.reload()
    await expect(page.getByText("Estado: Inactiva")).toBeVisible()
  })

  test("retroceder deshace el último cambio", async ({ as, companies }) => {
    // Escenario: «Retroceder deshace el filtro». Sin entrada en la historia, el gesto de atrás se
    // sale de la pantalla en lugar de deshacer, que es el fallo que esta prueba fija.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(MEMBERS(companyId))
    await page.getByLabel("Buscar en la lista").fill("nunez")
    await expect(page).toHaveURL(/search=nunez/)
    await expect(page.getByRole("heading", { name: "Martín Núñez" })).toBeVisible()

    await page.goBack()

    await expect(page).not.toHaveURL(/search=nunez/)
    await expect(page.getByLabel("Buscar en la lista")).toHaveValue("")
  })
})

test.describe("búsqueda", () => {
  test("escribir deprisa dispara una sola consulta", async ({ as, companies }) => {
    // Escenario: «Escribir rápido no dispara una consulta por letra». Se cuentan las peticiones que
    // salen de verdad, que es lo único que distingue un retardo puesto de uno que no se aplica.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(MEMBERS(companyId))

    let queries = 0
    page.on("request", (request) => {
      if (request.url().includes("search=")) queries += 1
    })

    await page.getByLabel("Buscar en la lista").pressSequentially("herrera", { delay: 30 })
    await expect(page.getByRole("heading", { name: "Beatriz Herrera" })).toBeVisible()
    await page.waitForTimeout(600)

    expect(queries, "salió una consulta por tecla en lugar de una por pausa").toBe(1)
  })

  test("ignora acentos", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(`${MEMBERS(companies[WAREHOUSE_COMPANY] as string)}?search=NUNEZ`)

    await expect(page.getByRole("heading", { name: "Martín Núñez" })).toBeVisible()
  })

  test("sin resultados se ofrece limpiar, no crear", async ({ as, companies }) => {
    // Escenario: «Se distingue vacío de sin resultados». Ofrecer «crear» a quien no encuentra algo
    // que sí existe le hace crear un duplicado.
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(`${MEMBERS(companies[WAREHOUSE_COMPANY] as string)}?search=zzzznadie`)

    await expect(page.getByText("Ningún elemento coincide")).toBeVisible()
    await page.getByRole("button", { name: "Quitar los filtros y ver todo" }).click()

    await expect(page.getByText("Ningún elemento coincide")).toBeHidden()
    await expect(page).not.toHaveURL(/search=/)
  })
})

test.describe("filtros", () => {
  test("se aplican desde el panel y se quitan desde su indicador", async ({ as, companies }) => {
    // Escenario: «Se quita un filtro desde su indicador»: desaparece ese y el otro permanece.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(`${MEMBERS(companyId)}?isActive=false&isOwner=false`)

    await expect(page.getByText("Estado: Inactiva")).toBeVisible()
    await expect(page.getByText("Propiedad: Miembro")).toBeVisible()

    await page.getByRole("button", { name: "Quitar el filtro Estado: Inactiva" }).click()

    await expect(page.getByText("Estado: Inactiva")).toBeHidden()
    await expect(page.getByText("Propiedad: Miembro")).toBeVisible()
  })

  test("el panel aplica al confirmar, no a cada casilla", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(MEMBERS(companyId))
    await page.getByRole("button", { name: "Filtros" }).click()

    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Estado").selectOption("false")

    // Todavía nada: el borrador no ha salido del diálogo.
    await expect(page).not.toHaveURL(/isActive/)

    await dialog.getByRole("button", { name: "Aplicar" }).click()

    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page).toHaveURL(/isActive=false/)
    await expect(page.getByText("Estado: Inactiva")).toBeVisible()
  })

  test("un filtro que la API no admite no se puede escribir desde la pantalla", async ({
    as,
    companies,
  }) => {
    // Pero sí desde la barra de direcciones, y ahí la gramática cerrada responde `400`. La pantalla
    // lo presenta como fallo de la lista, con reintento, y no como una página rota.
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(`${MEMBERS(companies[WAREHOUSE_COMPANY] as string)}?apellido=Nu%C3%B1ez`)

    await expect(page.getByText("No se pudo cargar la lista")).toBeVisible()
    await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible()
  })
})

test.describe("paginación", () => {
  test("informa del total y navega sin perder la búsqueda", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(`${MEMBERS(companyId)}?limit=12`)

    await expect(page.getByText(/Página 1 de \d+ · \d+ elementos/)).toBeVisible()
    await expect(results(page)).toHaveCount(12)

    await page.getByRole("button", { name: "Página siguiente" }).click()

    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText(/Página 2 de/)).toBeVisible()
  })

  test("cambiar el tamaño de página vuelve a la primera", async ({ as, companies }) => {
    // Escenario: «Cambiar el tamaño reinicia la página». Sin esto, pasar de doce a cuarenta y ocho
    // desde la página cuatro deja mirando una lista vacía que sí tiene contenido.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(`${MEMBERS(companyId)}?limit=12`)
    const primero = await results(page).first().getByRole("heading").innerText()

    await page.goto(`${MEMBERS(companyId)}?limit=12&page=3`)
    await expect(page.getByText(/Página 3 de/)).toBeVisible()

    await page.getByLabel("Por página").selectOption("48")

    await expect(page).toHaveURL(/limit=48/)
    await expect(page).not.toHaveURL(/page=/)
    // Y se está viendo el principio de la colección, no lo que había en la tercera página.
    await expect(results(page).first().getByRole("heading")).toHaveText(primero)
  })

  test("editar desde una página interior no devuelve a la primera", async ({ as, companies }) => {
    /**
     * El criterio que la 28 tenía pendiente por falta de paginación.
     *
     * Con un diálogo abierto sobre el listado, guardar vuelve a resolver el árbol de servidor —es
     * lo que hace aparecer el cambio sin recargar— y **no toca la dirección**. Por eso la página
     * sobrevive: no hay estado que reiniciar porque la página no es estado.
     */
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(`${MEMBERS(companyId)}?limit=12&page=3`)
    await expect(page.getByText(/Página 3 de/)).toBeVisible()

    const card = results(page).first()
    const name = await card.getByRole("heading").innerText()

    await card.getByRole("button", { name: "Acciones" }).click()
    await page.getByRole("menuitem", { name: "Editar" }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Guardar" }).click()

    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page).toHaveURL(/page=3/)
    await expect(page.getByText(/Página 3 de/)).toBeVisible()
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
  })
})

test.describe("disposición", () => {
  test("cambiar de vista conserva el conjunto y no toca la consulta", async ({ as, companies }) => {
    // Escenario: «Cambiar de vista no cambia el conjunto». La disposición es una clave interna —
    // empieza por guion bajo—, así que no llega a la API ni como filtro ni como error.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(`${MEMBERS(companyId)}?limit=12`)
    const before = await results(page).allInnerTexts()

    await page.getByRole("button", { name: "Ver como rejilla" }).click()

    await expect(page).toHaveURL(/_view=grid/)
    await expect(results(page)).toHaveCount(12)
    expect(await results(page).allInnerTexts()).toEqual(before)
  })
})
