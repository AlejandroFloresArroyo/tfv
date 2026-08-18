/**
 * Cotizaciones, en el navegador.
 *
 * Lo que se comprueba aquí es que **se pueden mirar**: que la bandeja llega ordenada por lo que hay
 * que atender antes, que un filtro por estado se comparte por enlace, y que la ficha muestra el
 * equipo apartado y los importes que calculó el servidor.
 *
 * Los importes no se recalculan aquí a propósito. Su aritmética tiene treinta y nueve pruebas en
 * `@tfv/contracts`, donde es una función pura; repetirla contra un navegador sólo comprobaría que
 * el número viaja.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

const QUOTES = (companyId: string, warehouseId: string) =>
  `/c/${companyId}/warehouses/${warehouseId}/quotes`

/** Lo que una prueba creó y tiene que llevarse al terminar. */
interface Created {
  companyId: string
  warehouseId: string
  quoteId: string
}

/**
 * Crea una cotización de renta **propia**, con equipo dentro si se le pide.
 *
 * Las pruebas que escriben no pueden compartir documento: el guardado de líneas y el de condiciones
 * de pago mandan **el conjunto completo**, así que dos que corran a la vez sobre el mismo se borran
 * lo que la otra acaba de escribir. Con `--repeat-each` la prueba compite además consigo misma.
 *
 * Toma la medida con **más unidades libres**, para no dejar seco al buscador que otra prueba está
 * usando en ese mismo instante.
 */
async function ownQuote(
  context: import("@playwright/test").BrowserContext,
  companyId: string,
  warehouseId: string,
  name: string,
  trash: Created[],
  units = 0,
): Promise<string> {
  const warehouse = `/api/companies/${companyId}/warehouses/${warehouseId}`
  const attempt = async (measurementId?: string) =>
    await context.request.post(`${warehouse}/quotes`, {
      data: {
        type: "rent",
        name,
        startsOn: "2026-09-03T00:00:00.000Z",
        endsOn: "2026-09-10T00:00:00.000Z",
        ...(measurementId === undefined ? {} : { lines: [{ measurementId, quantity: units }] }),
      },
    })

  let created = units > 0 ? undefined : await attempt()

  if (units > 0) {
    const rates = await context.request.get(`${warehouse}/rates?availableForRent=true&limit=30`)
    expect(rates.ok(), "no se pudieron leer las tarifas").toBe(true)
    const { items } = (await rates.json()) as {
      items: { measurementId: string; available: number }[]
    }

    // **En orden aleatorio, y reintentando.** Quedarse siempre con la más abundante hace que todas
    // las pruebas que corren a la vez se peleen por la misma medida; y aun eligiendo al azar, otra
    // prueba puede haberse llevado esas unidades entre la consulta y el alta. La existencia libre
    // que se leyó hace un instante es una foto, no una reserva.
    const roomy = items
      .filter((item) => item.available >= units)
      .map((item) => ({ item, order: Math.random() }))
      .sort((a, b) => a.order - b.order)
      .map(({ item }) => item)
    expect(roomy.length, "el almacén no tiene equipo libre que rentar").toBeGreaterThan(0)

    for (const { measurementId } of roomy) {
      created = await attempt(measurementId)
      if (created.ok()) break
    }
  }

  expect(created?.ok(), `no se pudo crear ${name}: ${await created?.text()}`).toBe(true)

  const quote = (await (created as import("@playwright/test").APIResponse).json()) as {
    id: string
  }
  trash.push({ companyId, warehouseId, quoteId: quote.id })
  return quote.id
}

/**
 * Se lleva lo que creó una prueba.
 *
 * **Sin navegar**: una limpieza que necesita abrir una página y pulsar un enlace se cae con la
 * prueba que acaba de fallar, y entonces lo creado se queda para siempre. Cancelar antes de borrar,
 * porque cancelar es lo que devuelve el equipo a la nave.
 */
async function sweep(context: import("@playwright/test").BrowserContext, trash: Created[]) {
  for (const { companyId, warehouseId, quoteId } of trash.splice(0)) {
    const base = `/api/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}`

    // Primero el retorno de lo que esté fuera: cancelar proyecta el inventario a disponible, y con
    // el equipo en la calle el servidor lo rechaza —con razón, porque escribiría que hay cámaras
    // en el estante que no están.
    const out = await context.request.get(`${base}/units`)
    if (out.ok()) {
      const { items } = (await out.json()) as { items: { id: string; status: string }[] }
      const rented = items.filter((unit) => unit.status === "rented")
      if (rented.length > 0) {
        await context.request.post(`${base}/returns`, {
          data: { units: rented.map((unit) => ({ unitId: unit.id, status: "available" })) },
        })
      }
    }

    await context.request.patch(`${base}/status`, { data: { status: "canceled" } })
    await context.request.delete(base)
  }
}

/** El primer almacén de la empresa, tal y como lo encuentra quien entra por la navegación. */
async function firstWarehouse(page: import("@playwright/test").Page, companyId: string) {
  await page.goto(`/c/${companyId}/warehouses`)
  await page.getByRole("link", { name: "Nave Monterrey" }).click()
  await page.waitForURL(/\/warehouses\/[^/]+$/)
  return page.url().split("/warehouses/")[1] as string
}

test.describe("la bandeja de cotizaciones", () => {
  test("llega ordenada por lo que hay que atender antes", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(QUOTES(companyId, warehouseId))

    // Lo que se comprueba es el **orden**, no el censo: otras pruebas crean las suyas en paralelo
    // y contar todo lo que hay convertiría esta prueba en un contador de vecinos.
    const items = page.getByRole("list", { name: "Resultados" }).getByRole("listitem")
    const names = await items.allTextContents()

    // La prioridad la deriva el servidor del estado: pre-cotización primero, en renta al final.
    const sierra = names.findIndex((name) => name.includes("Documental Sierra"))
    const norte = names.findIndex((name) => name.includes("Rodaje Serie Norte"))
    expect(sierra, "no aparece la pre-cotización sembrada").toBeGreaterThanOrEqual(0)
    expect(norte, "no aparece la renta sembrada").toBeGreaterThan(sierra)
  })

  test("un filtro por estado se comparte por enlace", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_rent`)

    // Todo lo listado está en renta, y la sembrada figura. El número exacto depende de lo que
    // estén haciendo las otras pruebas en este mismo instante.
    const items = page.getByRole("list", { name: "Resultados" }).getByRole("listitem")
    await expect(items.filter({ hasText: "Rodaje Serie Norte" })).toHaveCount(1)
    for (const text of await items.allTextContents()) expect(text).toContain("En renta")
  })
})

test.describe("la ficha de una cotización", () => {
  test("muestra el equipo apartado y los importes del servidor", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_rent`)
    await page.getByRole("link", { name: "Rodaje Serie Norte · bloque 1" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    // El estado proyectado sobre el inventario: en renta significa equipo fuera de la nave, y con
    // el equipo fuera las líneas se enseñan pero no se editan.
    await expect(page.getByText("En renta").first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "Equipo de la cotización" })).toBeVisible()
    // Con el equipo fuera el buscador no está: no se añade nada a una renta ya salida.
    await expect(page.getByLabel("Añadir equipo")).toHaveCount(0)

    // Los importes vienen calculados del servidor, con su cadena entera visible.
    await expect(page.getByRole("heading", { name: "Importes" })).toBeVisible()
    await expect(page.getByText("Total a pagar", { exact: true })).toBeVisible()
    await expect(page.getByText("Neto")).toBeVisible()
  })

  test("una cotización abierta advierte que sus importes todavía se mueven", async ({
    as,
    companies,
  }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=pending`)
    await page.getByRole("link", { name: "Cortometraje Estudiantil" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    await expect(page.getByText(/se congelan al cerrar/i)).toBeVisible()
  })
})

test.describe("la compuerta alcanza a las cotizaciones", () => {
  test("un rol sin la clave no ve la sección", async ({ as, companies }) => {
    // La cuenta acotada tiene cinco claves de doscientas cincuenta y cinco, y ninguna es de
    // cotizaciones. Ocultar la entrada no es control de acceso —eso lo hace la API—, pero
    // ofrecerla llevaría a un 403 sin explicación.
    const context = await as("limited")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(`/c/${companyId}/warehouses`)
    await expect(page.getByRole("link", { name: "Cotizaciones" })).toHaveCount(0)
  })
})

test.describe("el constructor de cotizaciones", () => {
  test("los importes de la previsualización son los que calculó el servidor", async ({
    as,
    companies,
  }) => {
    // Es el requisito de `quotation-pricing`: la previsualización coincide, y coincide porque es la
    // misma función. Aquí no se comprueba la aritmética —eso son cuarenta y ocho casos en
    // `@tfv/contracts`—, sino que las dos cifras que la pantalla enseña a la vez son la misma.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_progress`)
    await page.getByRole("link", { name: "Comercial Cervecería" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    const lines = page.getByRole("listitem").filter({ has: page.getByLabel("Cantidad") })
    await expect(lines.first()).toBeVisible()

    // Un importe pintado, sea cual sea el idioma: dígitos con sus separadores y dos decimales.
    const totals = await lines.getByText(/^[\d.,]+[.,]\d\d$/).allTextContents()
    const sum = totals.reduce((carry, value) => carry + asNumber(value), 0)

    const subtotal = await page
      .getByRole("term")
      .filter({ hasText: "Subtotal" })
      .locator("xpath=following-sibling::dd[1]")
      .textContent()

    expect(asNumber(subtotal ?? "")).toBeCloseTo(sum, 2)
  })

  test("añadir equipo mueve los importes sin haber guardado nada", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_progress`)
    await page.getByRole("link", { name: "Comercial Cervecería" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    const save = page.getByRole("button", { name: "Guardar líneas" })
    await expect(save).toBeDisabled()

    const lines = page.getByRole("listitem").filter({ has: page.getByLabel("Cantidad") })
    const before = await lines.count()

    await page.getByLabel("Añadir equipo").fill("bandera")
    await page
      .getByRole("button", { name: /Bandera 4x4/ })
      .first()
      .click()

    await expect(lines).toHaveCount(before + 1)
    // Hay algo que guardar: el botón deja de estar apagado, y nada ha viajado todavía.
    await expect(save).toBeEnabled()
  })

  test("la disponibilidad está delante mientras se edita", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_progress`)
    await page.getByRole("link", { name: "Comercial Cervecería" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    await page.getByLabel("Añadir equipo").fill("camara")
    await expect(page.getByText(/libres|Sin unidades libres/).first()).toBeVisible()
  })

  test("pedir más de lo que hay impide guardar antes de intentarlo", async ({ as, companies }) => {
    // El servidor rechaza la reserva que no cabe y no aparta nada a medias. Pero enterarse al
    // guardar es enterarse después de haberle prometido el equipo a alguien.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_progress`)
    await page.getByRole("link", { name: "Comercial Cervecería" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    await page.getByLabel("Cantidad").first().fill("999")

    await expect(page.getByText(/más equipo del que hay libre/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Guardar líneas" })).toBeDisabled()
  })
})

test.describe("el cambio de estado", () => {
  test("sólo ofrece las transiciones previstas desde donde está", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_rent`)
    await page.getByRole("link", { name: "Rodaje Serie Norte · bloque 1" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    await page.getByRole("button", { name: "Cambiar de estado" }).click()

    // Desde «en renta» la máquina sólo admite completar o cancelar. Volver atrás no está previsto.
    const menu = page.getByRole("menu")
    await expect(menu.getByRole("menuitem", { name: "Completada" })).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: "Cancelada" })).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: "En progreso" })).toHaveCount(0)
    // Y una renta no se «vende».
    await expect(menu.getByRole("menuitem", { name: "Vendida" })).toHaveCount(0)
  })
})

test.describe("el retorno del equipo", () => {
  /**
   * Saca equipo de la nave en una renta **propia**, y la deja abierta en su ficha.
   *
   * Antes esto usaba la renta sembrada, y registrar un retorno **consume** su equipo: la primera
   * pasada verde dejaba a la siguiente sin nada que devolver, y la siembra no lo repone porque
   * respeta lo que ya existe. La suite pasaba una vez y luego mentía.
   */
  const trash: Created[] = []
  test.afterEach(async ({ as }) => await sweep(await as("owner"), trash))

  async function rentedQuote(
    context: import("@playwright/test").BrowserContext,
    page: import("@playwright/test").Page,
    companyId: string,
    warehouseId: string,
  ) {
    const quoteId = await ownQuote(
      context,
      companyId,
      warehouseId,
      `Retorno ${Date.now()}`,
      trash,
      2,
    )

    const base = `/api/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/status`
    for (const status of ["in_progress", "in_rent"]) {
      const moved = await context.request.patch(base, { data: { status } })
      expect(moved.ok(), `no se pudo pasar a ${status}: ${await moved.text()}`).toBe(true)
    }

    await page.goto(`${QUOTES(companyId, warehouseId)}/${quoteId}`)
    return page.getByRole("region", { name: "Retorno del equipo" })
  }

  test("una renta en curso nombra el equipo que tiene fuera", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    const returns = await rentedQuote(context, page, companyId, warehouseId)
    await expect(returns).toBeVisible()

    // Cada unidad por su código, que es lo que lleva escrito la etiqueta de la nave.
    await expect(returns.getByRole("listitem").first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Registrar retorno" })).toBeDisabled()
  })

  test("con el equipo fuera la ficha no ofrece editar las líneas", async ({ as, companies }) => {
    // Ofrecer el editor sería ofrecer un botón cuyo guardado responde `409` siempre. Y el motivo no
    // es el documento: bajar una cantidad soltaría el vínculo de una unidad que está en un rodaje.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await rentedQuote(context, page, companyId, warehouseId)

    // Se congela la composición, no el precio: la cantidad se ve apagada, el buscador desaparece
    // y el precio de cada línea se sigue pudiendo ajustar.
    await expect(page.getByText(/ya salió de la nave/i)).toBeVisible()
    await expect(page.getByLabel("Añadir equipo")).toHaveCount(0)
    await expect(page.getByLabel("Cantidad").first()).toBeDisabled()
    await expect(page.getByLabel("Precio negociado").first()).toBeEnabled()

    // Y el camino de vuelta está en la misma página.
    await expect(page.getByRole("region", { name: "Retorno del equipo" })).toBeVisible()
  })

  test("registrar el retorno devuelve el equipo al inventario", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    const returns = await rentedQuote(context, page, companyId, warehouseId)
    const before = await returns.getByRole("listitem").count()

    await returns.getByRole("checkbox").first().check()
    await page.getByRole("button", { name: /Registrar 1 unidad/ }).click()

    // Lo devuelto deja de figurar: el vínculo se liberó y la unidad volvió a la nave.
    await expect(returns.getByRole("listitem")).toHaveCount(before - 1)
  })
})

test.describe("el precio negociado", () => {
  const trash: Created[] = []
  test.afterEach(async ({ as }) => await sweep(await as("owner"), trash))

  test("sustituye a la tarifa y arrastra la cadena entera de importes", async ({
    as,
    companies,
  }) => {
    // Es el modo con el que se cotiza cuando la lista de precios está sin llenar, que es casi
    // siempre. El importe escrito es el total de esa línea para el periodo: ni por día ni por
    // unidad, y por eso la línea deja de tener precio unitario.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)

    await page.goto(`${QUOTES(companyId, warehouseId)}?status=in_progress`)
    await page.getByRole("link", { name: "Comercial Cervecería" }).click()
    await page.waitForURL(/\/quotes\/[^/]+$/)

    const amounts = page.getByRole("heading", { name: "Importes" }).locator("..")
    const before = await total(amounts)

    await page.getByLabel("Precio negociado").first().fill("3500.00")

    // La línea cobra lo escrito, sin multiplicarlo por los días ni por las unidades.
    const lines = page.getByRole("listitem").filter({ has: page.getByLabel("Cantidad") })
    // Pintado en español: el punto agrupa los miles y la coma separa los decimales.
    await expect(lines.first()).toContainText("3500,00")

    // Y el panel de al lado se mueve con ella: dos cifras a un palmo no pueden decir cosas
    // distintas mientras se edita.
    await expect.poll(() => total(amounts)).not.toBe(before)
    await expect(amounts).toContainText(/todavía no se han guardado/i)
  })

  test("guardarlo lo conserva al recargar", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const quoteId = await ownQuote(
      context,
      companyId,
      warehouseId,
      `Negociado ${Date.now()}`,
      trash,
      2,
    )

    await page.goto(`${QUOTES(companyId, warehouseId)}/${quoteId}`)

    const field = page.getByLabel("Precio negociado").first()
    await expect(field).toHaveValue("")

    const next = "1234.00"
    await field.fill(next)
    await page.getByRole("button", { name: "Guardar líneas" }).click()
    await expect(page.getByText("Guardado")).toBeVisible()

    // El aviso dice que la API contestó, no que el árbol de servidor haya terminado de rehacerse.
    // Recargar encima de esa revalidación en vuelo sirve el documento anterior.
    await page.waitForLoadState("networkidle")
    await page.reload()
    await expect(page.getByLabel("Precio negociado").first()).toHaveValue(next, { timeout: 15_000 })
  })
})

test.describe("las condiciones de pago", () => {
  const trash: Created[] = []
  test.afterEach(async ({ as }) => await sweep(await as("owner"), trash))

  /** Crea una cotización propia y abre su ficha con el bloque de pago a la vista. */
  async function openPayment(
    context: import("@playwright/test").BrowserContext,
    page: import("@playwright/test").Page,
    companyId: string,
    warehouseId: string,
    name: string,
  ) {
    const quoteId = await ownQuote(context, companyId, warehouseId, name, trash)
    await page.goto(`${QUOTES(companyId, warehouseId)}/${quoteId}`)
    await expect(page.getByRole("heading", { name: "Condiciones de pago" })).toBeVisible()
    return page.getByRole("region", { name: "Condiciones de pago" })
  }

  test("un concepto adicional se guarda solo y suma al subtotal", async ({ as, companies }) => {
    // Sin botón: el texto viaja al perder el foco. Y la fila no viaja hasta tener nombre e importe,
    // porque un concepto a medio llenar acaba en el documento del cliente con el nombre en blanco.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const payment = await openPayment(
      context,
      page,
      companyId,
      warehouseId,
      `Adicionales ${Date.now()}`,
    )

    const amounts = page.getByRole("heading", { name: "Importes" }).locator("..")
    const before = await total(amounts)

    await payment.getByRole("button", { name: "Añadir concepto" }).click()
    await expect(payment.getByText(/todavía no se guarda/i)).toBeVisible()

    await payment.getByLabel("Concepto", { exact: true }).fill("Traslado")
    await payment.getByLabel("Concepto", { exact: true }).blur()
    await payment.locator("li").first().getByLabel("Importe").fill("1500.00")
    await payment.locator("li").first().getByLabel("Importe").blur()

    await expect(payment.getByText("Guardado")).toBeVisible()
    await expect(amounts).toContainText("Conceptos adicionales")
    await expect.poll(() => total(amounts)).not.toBe(before)

    // Y sigue ahí después de recargar, que es lo que distingue guardar de parecer que se guardó.
    await page.waitForLoadState("networkidle")
    await page.reload()
    const reopened = page.getByRole("region", { name: "Condiciones de pago" })
    await expect(reopened.getByLabel("Concepto", { exact: true })).toHaveValue("Traslado", {
      timeout: 15_000,
    })

    await reopened
      .getByRole("button", { name: /Quitar/ })
      .first()
      .click()
    await expect(reopened.getByText("Guardado")).toBeVisible()
    await expect(amounts).not.toContainText("Conceptos adicionales")
  })

  test("el precio por paquete manda y esconde los importes de línea", async ({ as, companies }) => {
    // Enseñar al lado las cifras que ya no rigen sólo invita a discutir sobre ellas.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const payment = await openPayment(
      context,
      page,
      companyId,
      warehouseId,
      `Paquete ${Date.now()}`,
    )

    const amounts = page.getByRole("heading", { name: "Importes" }).locator("..")
    await expect(amounts).toContainText("Total de líneas")

    await payment.getByLabel("Precio del paquete").fill("9000.00")
    await payment.getByLabel("Precio del paquete").blur()

    await expect(page.getByText(/El precio del paquete manda/)).toBeVisible()
    await expect(amounts).toContainText("Precio del paquete")
    await expect(amounts).not.toContainText("Total de líneas")

    // Retirarlo devuelve la cuenta por líneas: el paquete sustituye, no borra.
    await payment.getByLabel("Precio del paquete").fill("")
    await payment.getByLabel("Precio del paquete").blur()
    await expect(amounts).toContainText("Total de líneas")
  })

  test("el depósito se informa aparte y no toca el total", async ({ as, companies }) => {
    // Es una garantía que se devuelve: meterla en el total a pagar hace que el documento mienta
    // sobre lo que cuesta el servicio.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const payment = await openPayment(
      context,
      page,
      companyId,
      warehouseId,
      `Depósito ${Date.now()}`,
    )

    const amounts = page.getByRole("heading", { name: "Importes" }).locator("..")
    const before = await total(amounts)

    const deposit = payment.getByRole("group", { name: "Depósito en garantía" })
    await deposit.getByLabel("Importe").fill("5000.00")
    await deposit.getByLabel("Importe").blur()

    await expect(amounts).toContainText("Importes contingentes")
    await expect(amounts).toContainText("Depósito en garantía")
    await expect.poll(() => total(amounts)).toBe(before)

    await deposit.getByLabel("Importe").fill("")
    await deposit.getByLabel("Importe").blur()
    await expect(amounts).not.toContainText("Depósito en garantía")
  })
})

test.describe("la extensión de renta", () => {
  const trash: Created[] = []
  test.afterEach(async ({ as }) => await sweep(await as("owner"), trash))

  test("se lleva el equipo que sigue fuera y deja el resto a la original", async ({
    as,
    companies,
  }) => {
    // Una renta no se alarga editándola: su equipo está fuera y su composición está congelada. La
    // extensión recibe los vínculos sin que la unidad pase un instante por «disponible», que es
    // donde otra cotización podría llevársela mientras sigue en un rodaje.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const quoteId = await ownQuote(
      context,
      companyId,
      warehouseId,
      `Extender ${Date.now()}`,
      trash,
      3,
    )

    const base = `/api/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/status`
    for (const status of ["in_progress", "in_rent"]) {
      await context.request.patch(base, { data: { status } })
    }

    await page.goto(`${QUOTES(companyId, warehouseId)}/${quoteId}`)
    await page.getByRole("button", { name: "Extender la renta" }).click()

    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Empieza").fill("2026-09-17")
    await dialog.getByLabel("Termina").fill("2026-10-01")
    // Parcial: una unidad no sigue y se queda esperando su retorno en la original.
    await dialog.getByRole("checkbox").first().uncheck()
    await expect(dialog.getByText("2 unidades siguen fuera")).toBeVisible()

    await page.getByRole("button", { name: "Crear la extensión" }).click()
    await page.waitForURL((url) => !url.pathname.endsWith(quoteId), { timeout: 20_000 })

    const extensionId = page.url().split("/quotes/")[1] as string
    trash.unshift({ companyId, warehouseId, quoteId: extensionId })

    // Nace en renta, enlazada, con su ventana y sin precio: el periodo es otro.
    await expect(page.getByText("En renta").first()).toBeVisible()
    await expect(page.getByRole("link", { name: /Extiende a/ })).toBeVisible()
    await expect(page.getByText(/17 sept 2026/)).toBeVisible()
    await expect(page.getByText(/no tiene precio/i)).toBeVisible()

    // Dos unidades responden a la extensión, y la que no sigue se quedó en la original.
    const kept = page.getByRole("region", { name: "Retorno del equipo" })
    await expect(kept.getByRole("listitem")).toHaveCount(2)

    await page.goto(`${QUOTES(companyId, warehouseId)}/${quoteId}`)
    const left = page.getByRole("region", { name: "Retorno del equipo" })
    await expect(left.getByRole("listitem")).toHaveCount(1)
  })
})

test.describe("el alta provisional", () => {
  const trash: Created[] = []
  const products: { companyId: string; warehouseId: string; productId: string }[] = []

  test.afterEach(async ({ as }) => {
    const context = await as("owner")
    await sweep(context, trash)
    // Los productos van después: mientras una cotización los sujete, borrarlos deja unidades
    // comprometidas sin dueño.
    for (const { companyId, warehouseId, productId } of products.splice(0)) {
      await context.request.delete(
        `/api/companies/${companyId}/warehouses/${warehouseId}/products/${productId}`,
      )
    }
  })

  test("da de alta lo que no está en el catálogo y lo pone en la cotización", async ({
    as,
    companies,
  }) => {
    // El caso real: alguien cotiza con un cliente delante y el equipo existe en la nave pero no en
    // el catálogo. Mandarle a la pantalla de catálogo a rellenar cinco pasos es lo que hace que la
    // cotización termine a mano en otro sitio.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const quoteId = await ownQuote(context, companyId, warehouseId, `Alta ${Date.now()}`, trash)

    const name = `Dolly ${Date.now()}`
    await page.goto(`${QUOTES(companyId, warehouseId)}/${quoteId}`)
    await page.getByLabel("Añadir equipo").fill(name)
    await expect(page.getByText("No hay equipo que coincida")).toBeVisible()

    await page.getByRole("button", { name: "Dar de alta provisional" }).click()
    // El nombre llega escrito: es lo que se estaba buscando.
    await expect(page.getByLabel("Nombre del equipo")).toHaveValue(name)
    await page.getByRole("dialog").getByLabel("Cantidad").fill("2")
    await page.getByRole("button", { name: "Dar de alta y añadir" }).click()

    // Queda en la cotización, con sus dos unidades y **sin precio**: para eso está el negociado.
    const lines = page.getByRole("listitem").filter({ has: page.getByLabel("Cantidad") })
    await expect(lines).toHaveCount(1)
    await expect(lines.first()).toContainText(name)
    await expect(lines.first()).toContainText("2 libres")
    await expect(lines.first()).toContainText(/Nadie fijó tarifa/)

    // Y aparece en la bandeja de lo que falta por completar, marcado y sin publicar.
    const listed = await context.request.get(
      `/api/companies/${companyId}/warehouses/${warehouseId}/products?isProvisional=true`,
    )
    const { items } = (await listed.json()) as { items: { id: string; name: string }[] }
    const created = items.find((product) => product.name === name)
    expect(created, "el alta no aparece en la bandeja").toBeTruthy()
    products.push({ companyId, warehouseId, productId: created?.id as string })

    await page.goto(`/c/${companyId}/warehouses/${warehouseId}?isProvisional=true`)
    const card = page
      .getByRole("list", { name: "Resultados" })
      .getByRole("listitem")
      .filter({ hasText: name })
    await expect(card).toHaveCount(1)
    await expect(card).toContainText("Por completar")
    await expect(card).toContainText("No publicado")
  })
})

test.describe("los cobros", () => {
  const trash: Created[] = []
  test.afterEach(async ({ as }) => await sweep(await as("owner"), trash))

  test("un cobro mueve el saldo y deja quieto el total pactado", async ({ as, companies }) => {
    // El anticipo es lo pactado y mueve el documento; el cobro es lo que entró y mueve el saldo.
    // Pactar no es cobrar, y hasta que alguien registre el pago no tienen por qué coincidir.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string
    const warehouseId = await firstWarehouse(page, companyId)
    const quoteId = await ownQuote(
      context,
      companyId,
      warehouseId,
      `Cobros ${Date.now()}`,
      trash,
      2,
    )

    await page.goto(`${QUOTES(companyId, warehouseId)}/${quoteId}`)
    const amounts = page.getByRole("heading", { name: "Importes" }).locator("..")
    const pactado = await total(amounts)

    // Sin nada cobrado el bloque no se enseña: «Saldo» y «Total a pagar» serían dos cifras
    // distintas sin que hubiera pasado nada.
    await expect(amounts).not.toContainText("Saldo")

    const collections = page.getByRole("region", { name: "Cobros" })
    await collections.getByLabel("Importe").fill("120.00")
    await collections.getByLabel("Nota").fill("Depósito en ventanilla")
    await collections.getByRole("button", { name: "Registrar cobro" }).click()

    await expect(amounts).toContainText("Cobrado")
    await expect(amounts).toContainText("Saldo")
    await expect.poll(() => total(amounts)).toBe(pactado)

    // Y darlo de baja devuelve el saldo a donde estaba.
    await collections
      .getByRole("button", { name: /Dar de baja/ })
      .first()
      .click()
    await expect(amounts).not.toContainText("Saldo")
  })
})

/**
 * El total a pagar que enseña el panel de importes.
 *
 * El rótulo va **exacto**: hay textos de ayuda en el formulario que mencionan el total a pagar de
 * pasada, y una coincidencia por subcadena los recoge también.
 */
async function total(panel: import("@playwright/test").Locator): Promise<string> {
  return (await panel.getByText("Total a pagar", { exact: true }).locator("..").textContent()) ?? ""
}

/**
 * Un importe de la pantalla, como número.
 *
 * La aplicación pinta en español: el punto agrupa los miles y la coma separa los decimales. Leerlo
 * como si fuera inglés —quitar comas y ya— da `21.000.00`, que no es un número.
 */
function asNumber(text: string): number {
  return Number(
    text
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  )
}
