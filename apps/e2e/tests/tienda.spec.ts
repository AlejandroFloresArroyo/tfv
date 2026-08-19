/**
 * La tienda pública, desde fuera.
 *
 * ## Lo que este archivo **no** cubre, y por qué
 *
 * El catálogo público y la ficha del producto están escritos enteros y **no se pueden recorrer**.
 * Hacen falta tres cosas encadenadas y ninguna existe hoy:
 *
 * 1. Un sitio. La API tiene el alta (`POST /companies/{id}/websites`) y la aplicación web no tiene
 *    pantalla: `/c/{id}/websites` es la de «rebanada pendiente».
 * 2. Nada enlaza a la tienda desde el panel, así que ni sabiendo el identificador legible se llega
 *    sin escribir la dirección a mano.
 * 3. Y sobre todo: servir una tienda **exige suscripción vigente**, la siembra no deja ningún plan
 *    contratable, y la API no tiene alta de planes. Con la base recién sembrada, toda tienda
 *    responde «no disponible» por facturación.
 *
 * Está anotado en `HALLAZGOS.md`. Fabricar aquí un plan y una suscripción a base de escribir en la
 * base daría tres pruebas verdes sobre un camino que **ninguna persona puede recorrer**, que es
 * justo lo contrario de para lo que existe esta suite.
 *
 * ## Lo que sí se recorre
 *
 * Las dos salidas que un visitante alcanza de verdad hoy, y que son requisito de la spec: una
 * dirección que no corresponde a ninguna tienda, y una tienda cuya empresa no está al corriente.
 * Las dos se ven igual y **dicen cosas distintas**, que es exactamente lo que la spec pide no
 * confundir.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

/** Marca de lo que crea este recorrido, para reconocerlo y retirarlo. */
const PREFIJO = "Tienda e2e "

test("una dirección que no es de ninguna tienda lo dice, sin ofrecer el panel", async ({
  browser,
}) => {
  // Sin sesión: es el estado de quien abre un enlace que le pasaron. Y no se le redirige a entrar,
  // porque no tiene cuenta ni la va a hacer para ver que la dirección estaba mal.
  const visitante = await browser.newContext()
  const page = await visitante.newPage()

  await page.goto("/s/esta-tienda-no-existe")

  await expect(page.getByRole("heading", { name: "Aquí no hay ninguna tienda" })).toBeVisible()
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByLabel("Mi cuenta")).toHaveCount(0)

  await visitante.close()
})

test("una tienda de una empresa sin suscripción vigente se cierra, y dice por qué", async ({
  as,
  companies,
  browser,
}) => {
  const context = await as("owner")
  const companyId = companies[WAREHOUSE_COMPANY] as string
  const base = `/api/companies/${companyId}/websites`

  // Al principio, no en un `finally`. Y por la API, porque **no hay pantalla que dé de alta un
  // sitio**: es el hallazgo, no un atajo. La tienda que se abre después sí se conduce como una
  // persona, que es lo que esta prueba viene a comprobar.
  const previos = await context.request.get(`${base}?limit=50`)
  if (previos.ok()) {
    const { items } = (await previos.json()) as { items: { id: string; name: string }[] }
    for (const item of items.filter((row) => row.name.startsWith(PREFIJO))) {
      await context.request.delete(`${base}/${item.id}`)
    }
  }

  const warehouses = await context.request.get(`/api/companies/${companyId}/warehouses?limit=1`)
  const { items: naves } = (await warehouses.json()) as { items: { id: string }[] }

  const creado = await context.request.post(base, {
    data: {
      name: `${PREFIJO}${Date.now().toString(36).slice(-5)}`,
      warehouseId: naves[0]?.id,
      isPublished: true,
    },
  })
  expect(creado.ok(), `no se pudo crear el sitio: ${await creado.text()}`).toBe(true)
  const sitio = (await creado.json()) as { id: string; slug: string }

  const visitante = await browser.newContext()
  const page = await visitante.newPage()
  await page.goto(`/s/${sitio.slug}`)

  await expect(page.getByRole("heading", { name: "Esta tienda no está disponible" })).toBeVisible()
  // El motivo, que es lo que la spec pide no confundir: no es que no exista ni que le falte el
  // servicio, es que la empresa que la publica no está al corriente.
  await expect(page.getByText(/no tiene una suscripción vigente/)).toBeVisible()

  // Y ni con la compuerta cerrada se le enseña nada de la empresa: ni catálogo, ni navegación.
  await expect(page.getByRole("heading", { name: "Catálogo" })).toHaveCount(0)
  await expect(page.getByRole("navigation", { name: WAREHOUSE_COMPANY })).toHaveCount(0)

  await visitante.close()
  await context.request.delete(`${base}/${sitio.id}`)
})

test("el panel no ofrece por dónde administrar una tienda todavía", async ({ as, companies }) => {
  /**
   * Es un hallazgo escrito como prueba, y por eso comprueba **lo que hay**, no lo que debería.
   *
   * La entrada «Sitios» de la navegación existe porque la empresa tiene el servicio contratado, y
   * lleva a la pantalla de rebanada pendiente. Cuando la 19 traiga la gestión, esta prueba fallará
   * — y eso es lo que se quiere: que el día que exista, alguien venga aquí y escriba el recorrido
   * de verdad en lugar de que la tienda pública siga sin recorrer otras seis rebanadas.
   */
  const context = await as("owner")
  const page = await context.newPage()
  const companyId = companies[WAREHOUSE_COMPANY] as string

  await page.goto(`/c/${companyId}`)
  // Por la navegación de la empresa: la portada también ofrece el servicio en una tarjeta, y lo que
  // se comprueba es a dónde lleva la entrada permanente, no el atajo.
  await page
    .getByRole("navigation", { name: WAREHOUSE_COMPANY })
    .getByRole("link", { name: "Sitios" })
    .click()
  await page.waitForURL(/\/websites$/)

  await expect(page.getByText(/rebanada|pendiente/i).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /Nuevo sitio|Crear sitio/ })).toHaveCount(0)
})
