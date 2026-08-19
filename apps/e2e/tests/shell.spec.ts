/**
 * La cáscara: tema, idioma y navegación.
 *
 * Lo que sólo se puede comprobar con un navegador pintando de verdad.
 */

import { expect, PRODUCTION_COMPANY, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"
import { stateFor } from "../setup/roles.ts"

test.describe("tema", () => {
  test("se aplica antes del primer pintado, sin destello", async ({ browser, companies }) => {
    /**
     * El destello aparece cuando la elección vive sólo en el navegador: el servidor manda una
     * página clara, un guion la corrige, y entre las dos cosas parpadea.
     *
     * Se comprueba en el **HTML que llega**, no en lo que se ve después de hidratar. Si la clase ya
     * viene puesta desde el servidor, no hay nada que corregir y por tanto nada que parpadee.
     */
    const context = await browser.newContext({ storageState: stateFor("owner") })
    await context.addCookies([{ name: "tfv_theme", value: "dark", domain: "127.0.0.1", path: "/" }])

    const page = await context.newPage()
    const response = await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}`)
    const html = (await response?.text()) ?? ""

    expect(html, "el servidor tiene que mandar ya la clase del tema").toContain('class="dark"')

    /**
     * Y el fondo pintado es el del tema oscuro, no el del claro.
     *
     * **Sin nombrar el color.** Antes esta línea afirmaba un `rgb()` literal, y con eso la prueba
     * quedaba de rehén de la paleta: el rediseño del 2026-08-19 cambió el fondo oscuro y la tumbó
     * sin que nada del comportamiento se hubiera roto. El nombre de la prueba dice «sin destello»,
     * así que lo que tiene que afirmar es **cuál de los dos temas se pintó**, no de qué color es.
     *
     * Se compara consigo misma: el fondo con la clase puesta contra el fondo sin ella. Si el tema
     * oscuro está en efecto son distintos, y además el oscuro es más oscuro — que es lo que impide
     * que dos tonos claros cualesquiera satisfagan la comparación.
     */
    const luminancia = (color: string): number => {
      const [r, g, b] = color.match(/\d+/g)?.map(Number) ?? [0, 0, 0]
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
    }

    const fondos = await page.evaluate(() => {
      const raiz = document.documentElement
      const leer = () => getComputedStyle(document.body).backgroundColor
      const oscuro = leer()
      raiz.classList.remove("dark")
      const claro = leer()
      raiz.classList.add("dark")
      return { oscuro, claro }
    })

    expect(fondos.oscuro, "el tema oscuro tiene que pintar distinto del claro").not.toBe(
      fondos.claro,
    )
    expect(luminancia(fondos.oscuro)).toBeLessThan(luminancia(fondos.claro))

    await context.close()
  })

  test("la elección se conserva al navegar", async ({ browser, companies }) => {
    const context = await browser.newContext({ storageState: stateFor("owner") })
    await context.addCookies([{ name: "tfv_theme", value: "dark", domain: "127.0.0.1", path: "/" }])

    const page = await context.newPage()
    await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}`)
    await page.getByRole("link", { name: "Miembros" }).click()

    await expect(page.locator("html")).toHaveClass(/dark/)

    await context.close()
  })
})

test.describe("idioma", () => {
  test("la cookie manda sobre la preferencia del navegador", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" })
    await context.addCookies([{ name: "tfv_locale", value: "es", domain: "127.0.0.1", path: "/" }])

    const page = await context.newPage()
    await page.goto("/login")

    await expect(page.getByRole("heading", { name: "Entra a tu cuenta" })).toBeVisible()
    await context.close()
  })

  test("sin cookie se respeta la preferencia del navegador", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" })
    const page = await context.newPage()
    await page.goto("/login")

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
    await context.close()
  })
})

test.describe("la navegación refleja lo habilitado y lo permitido", () => {
  test("sólo aparecen los servicios contratados", async ({ as, companies }) => {
    const context = await as("admin")
    const page = await context.newPage()

    await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}`)
    const nav = page.getByRole("navigation", { name: WAREHOUSE_COMPANY })

    await expect(nav.getByRole("link", { name: "Almacenes" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Producciones" })).toBeHidden()

    // Y en la otra empresa, al revés. Las dos tienen servicios distintos a propósito.
    await page.goto(`/c/${companies[PRODUCTION_COMPANY]}`)
    const other = page.getByRole("navigation", { name: PRODUCTION_COMPANY })

    await expect(other.getByRole("link", { name: "Producciones" })).toBeVisible()
    await expect(other.getByRole("link", { name: "Almacenes" })).toBeHidden()
  })

  test("una sección sin permiso no se ofrece, y el servidor la niega igual", async ({
    as,
    companies,
  }) => {
    /**
     * Los dos lados del requisito, en la misma prueba. `app-shell` lo dice con estas palabras:
     * «Ocultar una entrada de navegación no SHALL considerarse control de acceso: la comprobación
     * real ocurre en el servidor».
     */
    const context = await as("limited")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY]

    await page.goto(`/c/${companyId}`)

    // El almacenista tiene `companies.users.view` y no tiene `companies.roles.view`.
    await expect(page.getByRole("link", { name: "Miembros" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Roles" })).toBeHidden()

    // Y escribiendo la dirección tampoco entra: se le dice qué pasa, no «algo salió mal».
    await page.goto(`/c/${companyId}/settings/roles`)
    await expect(page.getByText("No tienes acceso a esta sección")).toBeVisible()
  })

  test("una empresa ajena lleva al selector, no a la raíz", async ({ as, companies }) => {
    // Fallar una guarda lleva al nivel inmediatamente superior. El almacenista sólo pertenece a
    // una de las dos empresas.
    const context = await as("limited")
    const page = await context.newPage()

    await page.goto(`/c/${companies[PRODUCTION_COMPANY]}`)
    await expect(page).toHaveURL(/\/companies/)
  })
})
