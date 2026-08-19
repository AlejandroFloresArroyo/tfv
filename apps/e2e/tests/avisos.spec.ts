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

  // Lo guardado se ve en la ficha, que es lo que hace creíble el resto del recorrido.
  await expect(actuando.getByText(marca)).toBeVisible()

  // ─── La bitácora: el asiento, con quién y con qué tipo ──────────────────────
  await actuando.goto(`/c/${companyId}/settings/activity`)

  /**
   * Se busca antes de mirar, y no se mira el primero de todos.
   *
   * La bitácora de esta empresa la escriben también las otras pruebas que corren a la vez —editar
   * una membresía desde la paginación deja su asiento—, así que «el más reciente de la bitácora»
   * es el de quien haya guardado un instante antes. Acotando por el título quedan sólo los de esta
   * prueba, y ahí sí el primero es el que acaba de hacerse: la bitácora ordena por cuándo,
   * descendente. Es la misma lección de H-23 —comprobar el orden, no el censo— aplicada al revés.
   */
  await actuando.getByRole("searchbox").fill("Editó los datos de la empresa")

  const asientos = actuando.getByRole("list", { name: "Resultados" }).getByRole("listitem")
  await expect(asientos.first()).toContainText("Editó los datos de la empresa")
  await expect(asientos.first()).toContainText("Cambio")
  // Y con el nombre de quien lo hizo, que es la mitad del «quién hizo qué» que la spec pide.
  await expect(asientos.first()).toContainText("Ale Plataforma")

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
  await mirando.getByRole("button", { name: "Marcar como leída" }).first().click()
  await expect(mirando.getByRole("button", { name: "Marcar como no leída" }).first()).toBeVisible()

  // Y la campana, en la pantalla siguiente, ya no la cuenta.
  await mirando.goto(`/c/${companyId}`)
  await expect(mirando.getByRole("link", { name: "Notificaciones", exact: true })).toBeVisible()
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

  await page.goto(`/c/${companyId}/settings/activity`)

  const asientos = page.getByRole("list", { name: "Resultados" }).getByRole("listitem")
  await expect(asientos.first()).toBeVisible()
  await expect(asientos.first().getByRole("button", { name: "Acciones" })).toHaveCount(0)
})
