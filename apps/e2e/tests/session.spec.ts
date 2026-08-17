/**
 * Sesión: renovación, cierre y guardas.
 *
 * Transcritas de `openspec/changes/rebuild-ui-foundation/tasks.md`, sección de verificación.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

test.describe("renovación ante un 401", () => {
  test("una credencial caducada se renueva sola y la pantalla sigue funcionando", async ({
    as,
    companies,
  }) => {
    /**
     * El efecto visible de la renovación. **Cuántas veces** se renueva se comprueba aparte, en
     * `apps/web/src/lib/api.client.test.ts`: allí el reloj y la red los pone la prueba, y contar
     * tres peticiones simultáneas es fiable. Aquí lo que importa es que la persona no se entere.
     *
     * Es el estado en el que amanece cualquier pestaña que llevara una hora abierta: la credencial
     * de acceso caducó, la de renovación sigue viva.
     */
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}/settings/roles`)
    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible()

    let refreshes = 0
    await page.route("**/api/auth/refresh", async (route) => {
      refreshes++
      await route.continue()
    })

    // Se retira sólo la de acceso, dejando viva la de renovación.
    await context.clearCookies({ name: "tfv_session" })

    // Una acción que sí pasa por el transporte de la aplicación.
    await page.getByRole("button", { name: "Crear rol" }).click()
    await page.getByLabel("Nombre").fill(`Renovada ${Date.now().toString().slice(-6)}`)
    await page.getByRole("button", { name: "Crear", exact: true }).click()

    // Terminó bien, y por el camino se renovó sin decir nada.
    await expect(page.getByRole("dialog")).toBeHidden()
    expect(refreshes, "la petición debería haber disparado una renovación").toBe(1)
  })

  test("una renovación imposible lleva a la pantalla de acceso", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}/settings/members`)
    await expect(page.getByRole("heading", { name: "Miembros" })).toBeVisible()

    // Sin ninguna de las dos credenciales no hay nada que renovar.
    await context.clearCookies()
    await page.reload()

    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("cierre de sesión", () => {
  /**
   * Estas dos abren **su propia sesión**, no la compartida.
   *
   * En este sistema cerrar sesión la revoca de verdad en el servidor, así que cerrar la que
   * comparten todas las pruebas expulsa a las que corran a la vez. Se descubrió justo así: tres
   * pruebas de roles fallaron con la pantalla de acceso delante, sin haber tocado nada de sesiones.
   */
  test("lleva a la pantalla de acceso sin recargar la página", async ({ fresh, companies }) => {
    const context = await fresh("owner")
    const page = await context.newPage()
    await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}`)

    // Se marca el documento. Si sobrevive, no hubo recarga: es la corrección de F-01, donde la
    // credencial se fijaba al cargar el módulo y cerrar sesión obligaba a recargar entero.
    await page.evaluate(() => {
      ;(window as unknown as { __marca: string }).__marca = "misma-carga"
    })

    await page.getByLabel("Mi cuenta").click()
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click()

    await expect(page).toHaveURL(/\/login/)

    const survived = await page.evaluate(
      () => (window as unknown as { __marca?: string }).__marca === "misma-carga",
    )
    expect(survived, "la navegación recargó la página entera").toBe(true)
  })

  test("la credencial deja de servir de inmediato", async ({ fresh, companies }) => {
    const context = await fresh("owner")
    const page = await context.newPage()
    await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}`)

    await page.getByLabel("Mi cuenta").click()
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click()
    await expect(page).toHaveURL(/\/login/)

    // Volver atrás con el botón del navegador no devuelve el acceso: la guarda corre en el
    // servidor y la credencial ya está revocada.
    await page.goto(`/c/${companies[WAREHOUSE_COMPANY]}`)
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("las guardas conservan el destino", () => {
  test("sin sesión, se vuelve a la ruta que se pedía", async ({ browser, companies }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    const target = `/c/${companies[WAREHOUSE_COMPANY]}/settings/members`
    await page.goto(target)

    // Requisito de `app-shell`: «Tras iniciar sesión, el usuario SHALL volver a la ruta que
    // intentaba abrir».
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(target)}`))

    await page.getByRole("textbox", { name: "Correo electrónico" }).fill("duena@tfv.dev")
    await page.getByRole("textbox", { name: "Contraseña" }).fill("Desarrollo.2026")
    await page.getByRole("button", { name: "Entrar" }).click()

    await expect(page).toHaveURL(target)
    await expect(page.getByRole("heading", { name: "Miembros" })).toBeVisible()

    await context.close()
  })

  test("con sesión, la pantalla de acceso lleva al panel", async ({ as }) => {
    const context = await as("owner")
    const page = await context.newPage()

    await page.goto("/login")
    await expect(page).not.toHaveURL(/\/login/)
  })
})
