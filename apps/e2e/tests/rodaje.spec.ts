/**
 * Rodaje: personajes, sets, videos y jornadas, en el navegador.
 *
 * Es el recorrido de `apps/api/src/productions/rodaje-recorrido.test.ts` —del guion a la
 * continuidad— pero conducido con clics en vez de con `fetch`: dar de alta el reparto y la
 * utilería, componer un set, programar una jornada, asignarle el reparto —lo que abre una
 * continuidad por personaje—, colgarle utilería —un artículo o un video, nunca los dos a la vez— y
 * cerrarla. Al final, «¿qué llevaba puesto este personaje?» se contesta desde su propia ficha.
 *
 * Los catálogos y la escena de la jornada se preparan por API —crearlos es de otras pantallas—;
 * lo que se conduce con el navegador es exactamente lo que construye este encargo.
 */

import { expect, PRODUCTION_COMPANY, test } from "../setup/fixtures.ts"

function marca(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

test.describe("rodaje", () => {
  // La tableta es el dispositivo de referencia de `PRODUCT.md`, no el escritorio: a 1280 px el
  // riel lateral de la cáscara dobla el ancho de `<main>` (`336px` a `1616px`) más allá del
  // viewport sin generar scroll de página —se reproduce igual en `budget/page.tsx`, ya servida—,
  // así que un botón de la barra de acciones queda inalcanzable. Es de la cáscara, no de esta
  // pantalla; se anota en `HALLAZGOS.md` y aquí se rodea usando el ancho para el que el producto
  // sí está calibrado.
  test.use({ viewport: { width: 834, height: 1194 } })

  const trash: { companyId: string; productionId: string }[] = []

  test.afterEach(async ({ as }) => {
    if (trash.length === 0) return
    const context = await as("admin")
    for (const { companyId, productionId } of trash.splice(0)) {
      // Dar de baja la producción se lleva personajes, sets, videos, artículos y jornadas: es la
      // limpieza más corta y la que no deja rastro de ninguna de las pantallas de este encargo.
      await context.request.delete(`/api/companies/${companyId}/productions/${productionId}`)
    }
  })

  test("del catálogo a la continuidad: se arma con clics y se cierra con clics", async ({
    as,
    companies,
  }) => {
    const context = await as("admin")
    const page = await context.newPage()
    const companyId = companies[PRODUCTION_COMPANY] as string
    const sello = marca()

    const production = await context.request.post(`/api/companies/${companyId}/productions`, {
      data: { name: `Rodaje E2E ${sello}` },
    })
    expect(production.ok(), "no se pudo crear la producción de la prueba").toBe(true)
    const { id: productionId } = (await production.json()) as { id: string }
    trash.push({ companyId, productionId })

    const base = `/api/companies/${companyId}/productions/${productionId}`

    const chamarra = await context.request.post(`${base}/items`, {
      data: { name: `Chamarra ${sello}` },
    })
    expect(chamarra.ok(), "no se pudo dar de alta el artículo de la prueba").toBe(true)

    const silla = await context.request.post(`${base}/items`, { data: { name: `Silla ${sello}` } })
    expect(silla.ok(), "no se pudo dar de alta el artículo de la prueba").toBe(true)

    // ─── Personajes: de alta con un clic, desde la pantalla ──────────────────

    await page.goto(`/c/${companyId}/productions/${productionId}/rodaje/characters`)
    // Con la colección vacía, el botón de alta aparece dos veces —en la barra y en el estado
    // vacío—: es la misma pantalla que `items/page.tsx` ya usa, y las dos abren el mismo diálogo.
    await page.getByRole("button", { name: "Añadir personaje" }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByLabel("Nombre").fill(`Elena ${sello}`)
    await page.getByRole("dialog").getByRole("button", { name: "Añadir personaje" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText(`Elena ${sello}`)).toBeVisible()

    // El historial se lee desde la propia tarjeta: es el extremo de personaje del mismo recorrido
    // que `rodaje-recorrido.test.ts` demuestra desde el artículo.
    await page.getByRole("link", { name: `Elena ${sello}` }).click()
    await expect(
      page.getByText("Este personaje todavía no apareció en ninguna jornada."),
    ).toBeVisible()
    const elenaId = new URL(page.url()).pathname.split("/").pop() as string

    // ─── Sets: alta y composición ──────────────────────────────────────────────

    await page.goto(`/c/${companyId}/productions/${productionId}/rodaje/sets`)
    await page.getByRole("button", { name: "Añadir set" }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByLabel("Nombre").fill(`Cocina ${sello}`)
    await page.getByRole("dialog").getByRole("button", { name: "Añadir set" }).click()

    // Al crear un set se entra directo a su ficha: ahí se compone.
    await expect(page).toHaveURL(/\/rodaje\/sets\/[^/]+$/)
    await page.getByRole("button", { name: "Componer" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    // Sólo la casilla responde al clic, no la fila: es el mismo patrón que ya usa
    // `ComposeDelivery` para el inventario de las notas de entrega.
    await page
      .getByRole("dialog")
      .getByRole("checkbox", { name: `Silla ${sello}` })
      .click()
    await page.getByRole("dialog").getByRole("button", { name: "Guardar composición" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText(`Silla ${sello}`)).toBeVisible()

    // ─── Videos: alta sin archivo, sólo el registro ─────────────────────────────

    await page.goto(`/c/${companyId}/productions/${productionId}/rodaje/videos`)
    await page.getByRole("button", { name: "Añadir video" }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByLabel("Nombre").fill(`Referencia ${sello}`)
    await page.getByRole("dialog").getByRole("button", { name: "Añadir video" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()

    // ─── La jornada: programarla, asignar reparto, colgar utilería, cerrar ─────

    await page.goto(`/c/${companyId}/productions/${productionId}/rodaje`)
    await page.getByRole("button", { name: "Programar jornada" }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByLabel("Nombre").fill(`Día 1 · cocina ${sello}`)
    await page.getByRole("dialog").getByRole("button", { name: "Programar jornada" }).click()

    await expect(page).toHaveURL(/\/rodaje\/[^/]+$/)
    await expect(page.getByText("BORRADOR", { exact: false })).toBeVisible()

    await page.getByRole("button", { name: "Asignar reparto" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page
      .getByRole("dialog")
      .getByRole("checkbox", { name: `Elena ${sello}` })
      .click()
    await page.getByRole("dialog").getByRole("button", { name: "Asignar" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()

    // Asignar reparto pone la jornada en curso: es lo que hace `assignCharacters` en el servidor.
    await expect(page.getByText("EN CURSO", { exact: false })).toBeVisible()

    await page.getByRole("button", { name: "Editar artículos" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page
      .getByRole("dialog")
      .getByRole("checkbox", { name: `Chamarra ${sello}` })
      .click()
    await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText(`Chamarra ${sello}`)).toBeVisible()

    await page.getByRole("button", { name: "Añadir nota" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    // No `getByLabel`: «Nota» es subcadena del título del diálogo («Añadir nota»), que también
    // lo nombra. El nombre accesible del campo en sí no tiene ambigüedad.
    await page.getByRole("textbox", { name: "Nota", exact: true }).fill("Repetir con contraluz.")
    await page.getByRole("dialog").getByRole("button", { name: "Añadir" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText("Repetir con contraluz.")).toBeVisible()

    await page.getByRole("button", { name: "Cerrar jornada" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    // Dos botones se llaman «Cerrar»: la aspa del diálogo y el de enviar. El de enviar es el
    // último en el orden del documento.
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cerrar", exact: true })
      .last()
      .click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText("TERMINADA", { exact: false })).toBeVisible()

    // ─── «¿Qué llevaba puesto este personaje?» — desde su propia ficha ─────────

    await page.goto(`/c/${companyId}/productions/${productionId}/rodaje/characters/${elenaId}`)
    await expect(page.getByText(`Chamarra ${sello}`)).toBeVisible()
    await expect(page.getByText(`Día 1 · cocina ${sello}`)).toBeVisible()
  })
})
