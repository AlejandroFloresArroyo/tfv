/**
 * La tienda pública, desde fuera.
 *
 * ## Lo que este archivo **no** cubre, y por qué
 *
 * El catálogo público y la ficha del producto están escritos enteros y **no se pueden recorrer**:
 * servir una tienda **exige suscripción vigente**, la siembra no deja ningún plan contratable y la
 * API no tiene alta de planes, así que sobre una base recién sembrada toda tienda responde «no
 * disponible» por facturación. Está anotado como `H-141`, y con él se cae también `H-140`.
 *
 * Fabricar aquí un plan y una suscripción a base de escribir en la base daría tres pruebas verdes
 * sobre un camino que **ninguna persona puede recorrer**, que es justo lo contrario de para lo que
 * existe esta suite.
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

  // Al principio, no en un `finally`. El sitio se crea por la API porque lo que esta prueba viene a
  // mirar es **la tienda vista desde fuera**, no su alta: el alta tiene su pantalla y su recorrido
  // en la rebanada que la trae. Lo que sigue sí se conduce como una persona.
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

test("la entrada «Sitios» del panel lleva a una pantalla, no a un callejón", async ({
  as,
  companies,
}) => {
  /**
   * La comprobación que sólo se hace abriendo el navegador.
   *
   * Una entrada de navegación que lleva a un `404`, a un `500` o a una pantalla que no existe es un
   * defecto que no se ve leyendo código —ya pasó con el alta de producto, `H-70`— y que ninguna
   * prueba de la API puede cazar, porque del otro lado no hay ninguna petición que falle.
   *
   * Se afirma lo que tiene que ser cierto **con la rebanada pendiente y con ella entregada**: que
   * se llega, que la pantalla se identifica, y que se sigue dentro del ámbito de la empresa. Lo que
   * haya dentro es de quien traiga la rebanada.
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

  await expect(page.getByRole("heading", { name: "Sitios" }).first()).toBeVisible()
  // Fallar una guarda saca al nivel de arriba, así que seguir viendo la navegación de la empresa es
  // la forma de decir que no se falló ninguna.
  await expect(page.getByRole("navigation", { name: WAREHOUSE_COMPANY })).toBeVisible()
})
