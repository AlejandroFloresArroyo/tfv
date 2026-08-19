/**
 * El documento de la cotización, y el enlace que se le manda al cliente.
 *
 * Es el recorrido que más capas cruza de todos: la ficha, el documento del panel, la firma del
 * enlace y **la única pantalla de la aplicación que se sirve sin sesión**. Ninguna prueba de la API
 * puede cubrirlo entero, porque lo que hay que comprobar es precisamente que quien no tiene cuenta
 * —otro navegador, sin cookies— ve la misma hoja.
 *
 * Y hay una razón concreta para conducirlo por la pantalla: **el enlace se compone con el origen de
 * la petición**, no con configuración. Si esa aritmética se equivoca, la dirección que se copia y
 * se manda por correo apunta a otro sitio, y eso no se ve en ninguna prueba de unidad — se ve
 * cuando el cliente responde que no le abre.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"
import { type Created, firstWarehouse, ownQuote, QUOTES, sweep } from "../setup/warehouse.ts"

/** Lo que la hoja imprime de la cotización, sea cual sea el camino por el que se llegó a ella. */
async function expectSheet(page: import("@playwright/test").Page, folio: string) {
  await expect(page.getByText(folio).first()).toBeVisible()
  await expect(page.getByText("Emisor").first()).toBeVisible()
  await expect(page.getByText("Firma del cliente")).toBeVisible()
  await expect(page.getByText("Firma de quien entrega")).toBeVisible()
}

test.describe("el documento de una cotización", () => {
  const trash: Created[] = []
  test.afterEach(async ({ as }) => await sweep(await as("owner"), trash))

  test("se llega desde la ficha, y trae el folio y las dos firmas", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const quoteId = await ownQuote(
      context,
      companyId,
      warehouseId,
      `Documento ${Date.now()}`,
      trash,
      1,
    )

    await page.goto(`${QUOTES(companyId, warehouseId)}/${quoteId}`)

    // Por el enlace, no escribiendo la dirección. Una pantalla a la que sólo se llega tecleando es
    // una pantalla que no existe para quien la usa — ya pasó con el alta de producto (H-70).
    await page.getByRole("link", { name: "Documento de cotización" }).click()
    await page.waitForURL(/\/document$/)

    const folio = (
      (await page
        .getByText(/^COT-\d+$/)
        .first()
        .textContent()) ?? ""
    ).trim()
    expect(folio, "la hoja no imprime folio").toMatch(/^COT-\d+$/)

    await expectSheet(page, folio)
  })

  test("el enlace público lo abre quien no tiene cuenta, y no le enseña el panel", async ({
    as,
    companies,
    browser,
  }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const quoteId = await ownQuote(
      context,
      companyId,
      warehouseId,
      `Enlace ${Date.now()}`,
      trash,
      1,
    )

    await page.goto(`${QUOTES(companyId, warehouseId)}/${quoteId}/document`)
    const folio = (
      (await page
        .getByText(/^COT-\d+$/)
        .first()
        .textContent()) ?? ""
    ).trim()

    // La dirección se lee **de la pantalla**, que es de donde la saca una persona: el aviso la
    // escribe entera al lado del botón de copiar. Leerla de la API sería comprobar otra cosa.
    const shared = (
      (await page
        .getByText(/https?:\/\/\S+\/d\/\S+/)
        .last()
        .textContent()) ?? ""
    )
      .trim()
      .replace(/^.*?(https?:\/\/)/s, "$1")
    expect(shared, "la pantalla no enseña el enlace público").toMatch(/\/d\/[A-Za-z0-9._~-]+$/)

    // Un navegador **sin nada**: ni sesión guardada, ni cookies, ni haber pasado por el acceso.
    const stranger = await browser.newContext()
    const outside = await stranger.newPage()
    await outside.goto(shared)

    await expectSheet(outside, folio)

    // «No ve navegación ni datos de la empresa ajenos al documento». Las tres piezas del panel que
    // delatarían que aquí hay una aplicación detrás.
    await expect(outside.getByRole("navigation", { name: WAREHOUSE_COMPANY })).toHaveCount(0)
    await expect(outside.getByLabel("Mi cuenta")).toHaveCount(0)
    await expect(outside.getByRole("link", { name: "Notificaciones" })).toHaveCount(0)

    // Y no se le manda a entrar: quien recibe el enlace no tiene cuenta.
    await expect(outside).not.toHaveURL(/\/login/)

    await stranger.close()
  })

  test("una referencia alterada no lleva a ningún documento", async ({ browser }) => {
    // Es lo único que hace impredecible la referencia que se comparte. Sin esta comprobación, una
    // firma que dejara de verificarse convertiría el enlace en un identificador adivinable, y nadie
    // se enteraría: los documentos legítimos seguirían abriéndose igual.
    const stranger = await browser.newContext()
    const outside = await stranger.newPage()

    await outside.goto("/d/no-es-una-referencia-firmada")

    await expect(outside.getByText("Este enlace no lleva a ningún documento")).toBeVisible()
    await expect(outside.getByText("Firma del cliente")).toHaveCount(0)

    await stranger.close()
  })
})
