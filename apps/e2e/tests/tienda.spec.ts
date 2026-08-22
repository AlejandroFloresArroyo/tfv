/**
 * La tienda pública, desde fuera.
 *
 * ## Qué cambió aquí, y por qué
 *
 * Este archivo decía que el catálogo público **no se podía recorrer**, y ya no es verdad. Se
 * escribió cuando no había ningún plan contratable (`H-141`) y por eso toda tienda respondía «no
 * disponible» por facturación. Desde que la siembra deja tres planes y el suplente del procesador
 * cierra el círculo (`H-163`), contratar se puede; y desde que la categoría que declara la vertical
 * se puede dar de alta por la ruta de la plataforma —ver `setup/vertical.ts` y `H-301`—, un sitio
 * puede nacer siendo tienda de almacén. Con las dos cosas el recorrido existe: **contratar, la
 * tienda sirve, catálogo, ficha, carrito y la compra con su equipo apartado**.
 *
 * Donde se para es en el cobro, y no por decisión de esta prueba: el suplente del procesador no
 * tiene página de pago para una compra de tienda —devuelve la dirección de vuelta— así que nadie
 * emite el evento que la confirmaría. Es el atajo que se corrigió para las suscripciones en H-163 y
 * que en este camino sigue puesto (`H-304`).
 *
 * ## Lo que se dejó de afirmar aquí, y dónde está ahora
 *
 * Que una tienda de empresa sin suscripción vigente se cierre **diciendo que es por facturación**.
 * Ya no cabe en el navegador: la única empresa de la siembra con el servicio de sitios es
 * `Renta Fílmica del Norte` (H-168 — no hay ruta que conceda un servicio a otra), así que para que
 * su tienda se pueda recorrer hay que contratarle un plan, y una empresa con plan ya no puede
 * enseñar la compuerta cerrada. La afirmación se conserva donde sí se puede montar el estado:
 * `apps/api/src/websites/storefront.test.ts`, «compuerta dos · la suscripción de la empresa está
 * vigente». Lo que sí sigue aquí, y no está en ningún otro sitio, es la otra salida: una dirección
 * que no corresponde a ninguna tienda.
 *
 * ## Sobre la suscripción que este archivo deja puesta
 *
 * La deja, y a propósito. Cancelar de verdad exigiría un evento firmado del procesador con la
 * referencia externa de la suscripción, y **ninguna ruta la expone**. Como la contratación es
 * idempotente desde aquí —se mira antes de contratar—, la segunda pasada encuentra el trabajo
 * hecho y sigue. Ninguna otra prueba afirma nada sobre el plan de esta empresa.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"
import { apartarLaPizarra } from "../setup/pizarra.ts"
import { verticalDeAlmacen } from "../setup/vertical.ts"

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
   * Lo que hay **dentro** de esa pantalla se recorre en `sitios.spec.ts`: el alta, la publicación y
   * el constructor. Aquí sólo se afirma que la puerta abre y que sigue dentro del ámbito.
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

test("el recorrido entero: se contrata, la tienda sirve, y se compra en ella", async ({
  as,
  companies,
  browser,
}) => {
  /**
   * Un solo recorrido y no seis pruebas: cada paso **sólo existe si el anterior ocurrió**. Sin
   * suscripción no hay tienda que servir, sin catálogo no hay ficha, sin ficha no hay carrito y sin
   * carrito no hay compra. Partirlo obligaría a fabricar el estado de entrada de cada tramo por
   * fuera, que es lo que esta suite existe para no hacer.
   */
  test.setTimeout(180_000)

  const duena = await as("owner")
  const plataforma = await as("admin")
  const companyId = companies[WAREHOUSE_COMPANY] as string
  const base = `/api/companies/${companyId}/websites`

  // ─── Limpieza de la entrada ────────────────────────────────────────────────
  const previos = await duena.request.get(`${base}?limit=50`)
  if (previos.ok()) {
    const { items } = (await previos.json()) as { items: { id: string; name: string }[] }
    for (const item of items.filter((row) => row.name.startsWith(PREFIJO))) {
      await duena.request.delete(`${base}/${item.id}`)
    }
  }

  /**
   * Y la compra que dejó la pasada anterior, **con sus unidades apartadas**.
   *
   * Sin esto la segunda vuelta se encuentra el equipo agotado por su propia primera vuelta: apartar
   * es escribir, y lo escrito sigue ahí. Cancelar devuelve las unidades al catálogo, que es lo que
   * hace que este recorrido se pueda repetir sin gastarse la siembra.
   */
  const compradora = await as("outsider")
  const compras = await compradora.request.get("/api/me/checkouts?limit=50")
  if (compras.ok()) {
    const anteriores = (await compras.json()) as { id: string; status: string }[]
    for (const compra of anteriores.filter((row) => row.status === "pending")) {
      await compradora.request.post(`/api/me/checkouts/${compra.id}/cancellation`)
    }
  }

  // ─── 1 · La empresa, al corriente ──────────────────────────────────────────
  // Se conduce por la pantalla, que es lo que esta suite viene a comprobar. Si una pasada anterior
  // ya la dejó contratada, no hay nada que contratar y se sigue: la pantalla lo dice sola.
  const estado = await duena.request.get(`/api/companies/${companyId}/entitlements`)
  const { subscription } = (await estado.json()) as {
    subscription: { isOperating: boolean } | null
  }

  if (!subscription?.isOperating) {
    const panel = await duena.newPage()
    await panel.goto(`/c/${companyId}/settings/plan`)
    await apartarLaPizarra(panel)

    const casaDeRenta = panel.locator("li").filter({ hasText: "Casa de renta" }).first()
    await casaDeRenta.getByRole("button", { name: "Contratar" }).click()
    await panel.getByRole("dialog").getByRole("button", { name: "Ir al pago" }).click()

    await panel.waitForURL(/\/payments\/local\/checkouts\//)
    await panel.getByRole("button", { name: /^Pagar/ }).click()

    await panel.waitForURL(/\/settings\/plan/)
    await expect(panel.getByText("Activa")).toBeVisible()
    await panel.close()
  }

  // ─── 2 · Y con cuenta de comercio ──────────────────────────────────────────
  /**
   * Sin **perfil de facturación primario** la tienda no abre sesión de pago: contesta «esta tienda
   * no puede procesar pagos en este momento» y ahí se acaba la compra. Es una compuerta distinta de
   * la suscripción —una paga la plataforma, la otra cobra el comercio— y las dos hacen falta.
   *
   * Se da de alta por la API porque **su asistente ya tiene recorrido propio** en
   * `suscripcion.spec.ts`; repetirlo aquí alargaría este camino sin añadir nada. El primero que se
   * crea queda primario, y un segundo sobre la misma empresa responde `500`, así que se mira antes.
   */
  const perfiles = await duena.request.get(`/api/companies/${companyId}/billing-profiles?limit=1`)
  const { items: existentes } = (await perfiles.json()) as { items: unknown[] }

  if (existentes.length === 0) {
    const alta = await duena.request.post(`/api/companies/${companyId}/billing-profiles`, {
      data: {
        alias: "Comercio de la tienda e2e",
        business: {
          type: "company",
          legalName: "Renta Fílmica del Norte SA de CV",
          taxId: "RFN200101AB1",
          email: "facturacion@ejemplo.mx",
        },
        bank: {
          bankName: "Banco de prueba",
          holderType: "company",
          holder: "Renta Fílmica del Norte SA de CV",
          clabe: "012345678901234567",
          currency: "MXN",
          country: "MX",
        },
        representative: {
          name: "Rosa",
          lastname: "Iturbide",
          birthdate: { day: 14, month: 3, year: 1985 },
          address: {
            line1: "Río Nazas 88",
            city: "Monterrey",
            state: "Nuevo León",
            postalCode: "64000",
            country: "MX",
          },
          relationship: { isRepresentative: true },
        },
      },
    })
    expect(alta.ok(), `no se pudo dar de alta el comercio: ${await alta.text()}`).toBe(true)
  }

  // ─── 3 · Un sitio publicado, de vertical almacén ───────────────────────────
  // La vertical se declara con la categoría, y sin ella el sitio nace «en construcción» para
  // siempre: la siembra no la deja (H-301) y la pone quien administra la plataforma.
  const vertical = await verticalDeAlmacen(plataforma, companyId)
  const naves = await duena.request.get(`/api/companies/${companyId}/warehouses?limit=1`)
  const { items: almacenes } = (await naves.json()) as { items: { id: string }[] }

  const creado = await duena.request.post(base, {
    data: {
      name: `${PREFIJO}${Date.now().toString(36).slice(-5)}`,
      warehouseId: almacenes[0]?.id,
      categoryId: vertical,
      isPublished: true,
    },
  })
  expect(creado.ok(), `no se pudo crear el sitio: ${await creado.text()}`).toBe(true)
  const sitio = (await creado.json()) as { id: string; slug: string }

  // ─── 4 · El catálogo, visto por quien no tiene cuenta ──────────────────────
  const visitante = await browser.newContext()
  const anonima = await visitante.newPage()
  await anonima.goto(`/s/${sitio.slug}`)

  await expect(anonima.getByRole("heading", { name: "Catálogo" })).toBeVisible()
  // Ni «no disponible» ni «en construcción»: las dos salidas por las que este recorrido no pasaba.
  await expect(anonima.getByText("Esta tienda no está disponible")).toHaveCount(0)
  await expect(anonima.getByText("Estamos preparando esta tienda")).toHaveCount(0)

  // El catálogo sale del almacén sembrado, y se busca por él: pedir por nombre es lo que hace
  // cualquiera que sabe a qué viene, y de paso fija que el buscador de la tienda filtra.
  await anonima.getByLabel("Buscar").fill("Batería V-Mount")
  await anonima.getByRole("button", { name: "Buscar" }).click()
  await expect(anonima).toHaveURL(/search=/)

  const ficha = anonima.getByRole("link").filter({ hasText: "Batería V-Mount" }).first()
  await expect(ficha).toBeVisible()
  await ficha.click()

  // ─── 5 · La ficha ──────────────────────────────────────────────────────────
  await anonima.waitForURL(/\/s\/[^/]+\/p\//)
  await expect(anonima.getByRole("heading", { name: "Batería V-Mount" })).toBeVisible()
  // Quien no ha entrado también puede llenar el carrito: la sesión se pide al pagar, no al mirar.
  await expect(anonima.getByRole("button", { name: "Añadir al carrito" })).toBeVisible()
  await visitante.close()

  // ─── 6 · El carrito, ya como quien va a comprar ────────────────────────────
  // La misma ficha, con cuenta. El padrón es único: quien compra en una tienda es un usuario del
  // sistema, y sin sesión el carrito ofrece entrar en vez de pagar.
  const page = await compradora.newPage()
  await page.goto(`/s/${sitio.slug}/p/bateria-v-mount`)

  await page.getByLabel("Cantidad").fill("2")
  await page.getByRole("button", { name: "Añadir al carrito" }).click()
  await page.getByRole("link", { name: "Ver el carrito" }).click()
  await page.waitForURL(/\/carrito$/)

  // Lo que se enseña **no** es la copia del navegador: el carrito se valora contra el catálogo
  // publicado. Dos unidades a 5.950,00 son 11.900,00, y ese importe lo pone el servidor.
  await expect(page.getByRole("listitem").getByText("11.900,00")).toBeVisible()
  await expect(page.getByRole("complementary").getByText("11.900,00")).toBeVisible()

  // ─── 7 · La compra: se aparta el equipo, con su desglose ───────────────────
  // Recojo en tienda, que es el modo por defecto y el único que no pide dirección.
  await page.getByRole("button", { name: "Continuar al pago" }).click()

  // «Las existencias se reservan al crear la sesión», con las palabras de la spec: lo que se enseña
  // aquí es la instantánea que el servidor acaba de escribir, y es la que se cobrará.
  await expect(page.getByRole("heading", { name: "Tu equipo está apartado" })).toBeVisible()
  await expect(page.getByText("11.900,00").first()).toBeVisible()
  await expect(page.getByText("2 × Batería V-Mount · Cuerpo")).toBeVisible()

  // ─── 8 · Y el pago lleva a su compra ───────────────────────────────────────
  /**
   * Hasta aquí llega el navegador, y no es una decisión de esta prueba.
   *
   * El suplente del procesador **no tiene página de cobro para una compra de tienda**: devuelve
   * como dirección de pago la de vuelta, así que pulsar «Pagar» aterriza en la propia compra sin
   * que nada haya cobrado y sin que nadie emita `payment_intent.succeeded`. Es exactamente el atajo
   * que se corrigió para las suscripciones en H-163 y que en este camino sigue puesto: está anotado
   * como `HALLAZGOS.md` **H-304**. Por eso se afirma el estado que de verdad se alcanza —la compra
   * existe, es suya y está esperando confirmación— y no uno que hoy nadie puede ver.
   *
   * Efecto lateral bueno: como la compra nunca se paga, su reserva sigue viva y **se puede
   * cancelar**, que es lo que hace la limpieza de la entrada. La prueba no consume inventario.
   */
  await page.getByRole("link", { name: "Pagar", exact: true }).click()
  await page.waitForURL(/\/s\/[^/]+\/compra\//)
  await expect(page.getByRole("heading", { name: "Estamos confirmando tu pago" })).toBeVisible()
  await expect(page.getByText("11.900,00").first()).toBeVisible()

  await duena.request.delete(`${base}/${sitio.id}`)
})
