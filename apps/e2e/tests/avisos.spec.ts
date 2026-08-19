/**
 * La bitácora y la bandeja, desde el hecho que las origina.
 *
 * Estas dos pantallas **no se pueden probar por separado sin mentir**: una bitácora que enseña
 * asientos sembrados y una bandeja que enseña avisos sembrados pasan las dos aunque nada de lo que
 * ocurre en la aplicación llegue a ninguna. Lo que hay que comprobar es la cadena entera —alguien
 * guarda algo en una pantalla, y eso aparece en otras dos, para **otra persona**— y esa cadena sólo
 * existe con dos sesiones abiertas a la vez.
 *
 * Por eso el recorrido es uno solo y no tres pruebas: partirlo obligaría a repetir el hecho tres
 * veces, y las tres veces contarían asientos de las otras dos.
 *
 * **El autor no recibe el suyo**, que es lo que separa una bitácora de un buzón de ruido. De ahí
 * que actúe una cuenta y mire la otra.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

/** Lo que la bandeja del propietario tenga sin leer de pasadas anteriores, marcado como visto. */
async function limpiarBandeja(context: import("@playwright/test").BrowserContext): Promise<void> {
  const response = await context.request.get("/api/me/notifications?filter=unread")
  if (!response.ok()) return

  const { items } = (await response.json()) as { items: { id: string }[] }
  for (const { id } of items) {
    await context.request.post(`/api/me/notifications/${id}/read`, { data: { read: true } })
  }
}

/**
 * Deja al menos un asiento de tipo «Cambio» en la bitácora, guardándolo desde la pantalla.
 *
 * Las pruebas que **leen** la bitácora no pueden dar por hecho que haya algo: sobre una base recién
 * sembrada está vacía, y una prueba que se apoya en lo que dejaron las anteriores pasa la segunda
 * vuelta y falla la primera. Cada una se hace su asiento, que además es la única forma honesta de
 * mirar la bitácora — comprobando lo que uno mismo acaba de escribir.
 */
async function dejarAsiento(
  page: import("@playwright/test").Page,
  companyId: string,
): Promise<void> {
  await page.goto(`/c/${companyId}/settings/company`)
  await page.getByRole("button", { name: "Acciones" }).first().click()
  await page.getByRole("menuitem", { name: "Editar" }).click()

  const dialogo = page.getByRole("dialog")
  await dialogo.getByLabel("Descripción").fill(`Bitácora e2e ${Date.now().toString(36)}`)
  await dialogo.getByRole("button", { name: "Guardar" }).click()
  await expect(dialogo).toBeHidden()
}

test("lo que uno guarda aparece en la bitácora y en la bandeja del otro", async ({
  as,
  companies,
}) => {
  const companyId = companies[WAREHOUSE_COMPANY] as string

  const propietaria = await as("owner")
  const administracion = await as("admin")

  // La limpieza va **al principio**. Si se dejara para el final, un tiempo agotado se llevaría por
  // delante el navegador antes de que corriera, y la pasada siguiente encontraría la bandeja con
  // avisos de ésta — que es exactamente lo que hace fallar a la segunda vuelta.
  await limpiarBandeja(propietaria)

  const marca = `Nota de la pasada ${Date.now().toString(36)}`

  // ─── El hecho: la administración edita la empresa desde su pantalla ─────────
  const actuando = await administracion.newPage()
  await actuando.goto(`/c/${companyId}/settings/company`)

  await actuando.getByRole("button", { name: "Acciones" }).first().click()
  await actuando.getByRole("menuitem", { name: "Editar" }).click()

  const dialogo = actuando.getByRole("dialog")
  await dialogo.getByLabel("Descripción").fill(marca)
  await dialogo.getByRole("button", { name: "Guardar" }).click()
  await expect(dialogo).toBeHidden()

  // No se relee la descripción de la ficha: es un campo compartido, y las otras dos pruebas de este
  // archivo escriben en él para hacerse su asiento. Lo que este recorrido tiene que demostrar no es
  // que el campo se guarde —eso lo dice el diálogo al cerrarse— sino a dónde llega el hecho.

  // ─── La bitácora: el asiento, con quién y con qué tipo ──────────────────────
  await actuando.goto(`/c/${companyId}/settings/activity`)

  /**
   * Se busca antes de mirar, y se busca **el asiento de quien actuó**, no el más reciente.
   *
   * La bitácora de esta empresa la escriben también las otras pruebas que corren a la vez, y con el
   * mismo título: «el más reciente» sería el de quien haya guardado un instante antes. Es la
   * lección de H-23 —comprobar lo propio, no el censo— llevada a una bitácora que, por definición,
   * es de todos.
   *
   * Que el asiento sea **de esta pasada** lo demuestra la bandeja de abajo, que se vació al
   * empezar y que sólo esta prueba puede llenar: las demás actúan como la propietaria, y el autor
   * no recibe el suyo.
   */
  await actuando.getByRole("searchbox").fill("Editó los datos de la empresa")

  const asientos = actuando.getByRole("list", { name: "Resultados" }).getByRole("listitem")
  // El nombre de quien lo hizo es la mitad del «quién hizo qué» que la spec pide.
  const mio = asientos.filter({ hasText: "Ale Plataforma" }).first()
  await expect(mio).toContainText("Editó los datos de la empresa")
  await expect(mio).toContainText("Cambio")

  // ─── La bandeja de la otra: el aviso, y el contador de la campana ───────────
  const mirando = await propietaria.newPage()
  await mirando.goto(`/c/${companyId}`)

  // El número va en el nombre accesible de la campana y no sólo en el punto de color: un punto no
  // dice cuántas hay. Es lo que se lee desde cualquier pantalla del panel.
  await expect(mirando.getByRole("link", { name: /Notificaciones, \d+ sin leer/ })).toBeVisible()

  await mirando.getByRole("link", { name: /Notificaciones/ }).click()
  await mirando.waitForURL(/\/account\/notifications/)

  const avisos = mirando.getByRole("listitem")
  await expect(avisos.first()).toContainText(/editó los datos de la empresa/i)

  // ─── Marcarla leída baja el contador, sin recargar a mano ──────────────────
  const sinLeer = async () => {
    const etiqueta = await mirando
      .getByRole("link", { name: /Notificaciones/ })
      .getAttribute("aria-label")
    return Number(/(\d+)/.exec(etiqueta ?? "")?.[1] ?? 0)
  }

  await mirando.goto(`/c/${companyId}`)
  const antes = await sinLeer()
  expect(antes, "la campana no cuenta el aviso recién llegado").toBeGreaterThan(0)

  await mirando.goto("/account/notifications")
  await mirando.getByRole("button", { name: "Marcar como leída" }).first().click()
  await expect(mirando.getByRole("button", { name: "Marcar como no leída" }).first()).toBeVisible()

  // Y la campana, en la pantalla siguiente, cuenta una menos. Se compara con lo que había y no con
  // cero: la bandeja es de una persona, no de una prueba, y otra puede haberle dejado algo.
  await mirando.goto(`/c/${companyId}`)
  expect(await sinLeer()).toBeLessThan(antes)
})

test("la bitácora se filtra por tipo de acción, y el filtro se comparte por enlace", async ({
  as,
  companies,
}) => {
  // Es una colección como las demás —el estado vive en la dirección— y aquí eso pesa más que en
  // ninguna otra: una bitácora que no se puede acotar es un archivo, no una herramienta.
  const context = await as("owner")
  const page = await context.newPage()
  const companyId = companies[WAREHOUSE_COMPANY] as string

  await dejarAsiento(page, companyId)
  await page.goto(`/c/${companyId}/settings/activity?action=update`)

  const asientos = page.getByRole("list", { name: "Resultados" }).getByRole("listitem")
  await expect(asientos.first()).toBeVisible()
  for (const texto of await asientos.allTextContents()) expect(texto).toContain("Cambio")
})

test("los asientos no se pueden tocar: la bitácora no ofrece editar ni borrar", async ({
  as,
  companies,
}) => {
  // «Los asientos no se pueden modificar ni borrar» es lo que hace que la bitácora sirva de algo.
  // Ofrecer el botón y negarlo en el servidor sería peor que no ofrecerlo.
  const context = await as("owner")
  const page = await context.newPage()
  const companyId = companies[WAREHOUSE_COMPANY] as string

  await dejarAsiento(page, companyId)
  await page.goto(`/c/${companyId}/settings/activity`)

  const asientos = page.getByRole("list", { name: "Resultados" }).getByRole("listitem")
  await expect(asientos.first()).toBeVisible()
  await expect(asientos.first().getByRole("button", { name: "Acciones" })).toHaveCount(0)
})
