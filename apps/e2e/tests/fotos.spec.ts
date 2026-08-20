/**
 * Las fotos de un producto, desde el selector hasta el objeto que se sirve.
 *
 * Aquí es donde una prueba de navegador vale más que cualquier otra: **los bytes no pasan por la
 * API**. La API firma una autorización acotada y el navegador escribe directo al almacenamiento,
 * así que el recorrido entero —producir los tamaños con un lienzo, pedir la firma, escribir, y
 * confirmar— sólo ocurre de verdad con un navegador delante. Una prueba de la API comprueba que se
 * firma; ninguna comprueba que la foto acaba existiendo.
 *
 * Y la otra mitad del recorrido, que es la que se rompe en silencio: **quitar una foto tiene que
 * dejar de servirla**. El endpoint del proveedor recibe un campo llamado `prefixes` y no borra por
 * prefijo, así que durante un tiempo el almacenamiento respondía `200` y los objetos se quedaban
 * ahí sin fila que los reclamara (H-71). Se comprueba pidiendo la dirección después de quitarla.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"
import { TRANSPORTE } from "../setup/transporte.ts"
import { firstWarehouse } from "../setup/warehouse.ts"

/** Marca de lo que crea este recorrido, para reconocerlo y retirarlo. */
const PREFIJO = "Foto e2e "

/**
 * Una imagen de verdad, de 48×48 y de un solo color.
 *
 * Tiene que ser un PNG que el navegador sepa **descodificar**: el selector le saca los tamaños
 * pequeños con un lienzo, y unos bytes cualesquiera con nombre de foto fallarían ahí, que es un
 * sitio distinto del que esta prueba mira.
 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAQklEQVR4nO3OQQ0AIAwAsclBBP6DLFxwPJpU" +
    "QOes/ZXJB0JCQkL1QEhISKgeCAkJCdUDISEhoXogJCQkVA+EhIQeu46EjJcTa+dXAAAAAElFTkSuQmCC",
  "base64",
)

/** Retira los productos que dejaron pasadas anteriores. */
async function limpiarRestos(
  context: import("@playwright/test").BrowserContext,
  companyId: string,
  warehouseId: string,
): Promise<void> {
  const base = `/api/companies/${companyId}/warehouses/${warehouseId}/products`
  const response = await context.request.get(
    `${base}?search=${encodeURIComponent(PREFIJO)}&limit=50`,
    TRANSPORTE,
  )
  if (!response.ok()) return

  const { items } = (await response.json()) as { items: { id: string; name: string }[] }
  for (const item of items.filter((row) => row.name.startsWith(PREFIJO))) {
    await context.request.delete(`${base}/${item.id}`, TRANSPORTE)
  }
}

test("una foto se sube desde la ficha, manda como portada y deja de servirse al quitarla", async ({
  as,
  companies,
}) => {
  // Producir los tamaños, firmar, escribir y confirmar, cuatro veces entre las dos fotos.
  test.setTimeout(120_000)

  const context = await as("owner")
  const page = await context.newPage()
  const companyId = companies[WAREHOUSE_COMPANY] as string
  const warehouseId = await firstWarehouse(page, companyId)

  // Al principio, no en un `finally`: un tiempo agotado se lleva el navegador antes de que corra.
  await limpiarRestos(context, companyId, warehouseId)

  const nombre = `${PREFIJO}${Date.now().toString(36).slice(-5)}`
  const base = `/api/companies/${companyId}/warehouses/${warehouseId}/products`

  // El producto se crea por la API a propósito: el alta por el asistente ya tiene su recorrido en
  // `nave-completa.spec.ts`, y repetirlo aquí sólo alargaría lo que esta prueba viene a mirar.
  const creado = await context.request.post(base, { ...TRANSPORTE, data: { name: nombre } })
  expect(creado.ok(), `no se pudo crear el producto: ${await creado.text()}`).toBe(true)
  const { id: productId } = (await creado.json()) as { id: string }

  const ficha = `/c/${companyId}/warehouses/${warehouseId}/products/${productId}`
  await page.goto(ficha)

  // ─── Subir dos ─────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Acciones" }).first().click()
  await page.getByRole("menuitem", { name: "Fotos" }).click()

  const dialogo = page.getByRole("dialog")
  await expect(dialogo.getByText("Todavía no hay fotos")).toBeVisible()

  await dialogo.locator('input[type="file"]').setInputFiles([
    { name: "primera.png", mimeType: "image/png", buffer: PNG },
    { name: "segunda.png", mimeType: "image/png", buffer: PNG },
  ])

  await dialogo.getByRole("button", { name: "Guardar" }).click()
  await expect(dialogo).toBeHidden({ timeout: 60_000 })

  // La galería se rehace con la respuesta del servidor, así que las direcciones ya están: sin eso
  // la ficha pintaba huecos hasta recargar. Se comprueba **sin recargar**, que es donde fallaba.
  // Acotada al contenido: la marca de la barra superior también es un enlace con imagen dentro,
  // y contarla haría que esta prueba dijera «tres fotos» el día que la marca cambie de forma.
  const galeria = page
    .getByRole("main")
    .getByRole("link")
    .filter({ has: page.locator("img") })
  await expect(galeria).toHaveCount(2)

  // Y existen de verdad: el objeto responde. Es lo que separa «se guardó la fila» de «se subió».
  const primera = (await galeria.first().getAttribute("href")) ?? ""
  expect(primera, "la foto se guardó sin dirección").toMatch(/^https?:\/\//)
  expect((await context.request.get(primera)).status(), "la foto no se sirve").toBe(200)

  // ─── La portada es una decisión aparte del orden ────────────────────────────
  await page.reload()
  await page.getByRole("button", { name: "Acciones" }).first().click()
  await page.getByRole("menuitem", { name: "Fotos" }).click()

  const fotos = dialogo.getByRole("listitem")
  await expect(fotos).toHaveCount(2)
  await expect(fotos.first()).toContainText("Portada")

  // Elegir portada **sin arrastrar nada al principio**: son dos decisiones distintas, y atarlas es
  // lo que obliga a mover una foto doce posiciones para que sea la que se enseña.
  await fotos.nth(1).getByRole("button", { name: "Usar como portada" }).click()
  await expect(fotos.nth(1)).toContainText("Portada")
  await expect(fotos.first()).not.toContainText("Portada")

  // ─── Quitar una la retira del almacenamiento ────────────────────────────────
  await fotos.first().getByRole("button", { name: "Quitar esta foto" }).click()
  await expect(dialogo.getByRole("listitem")).toHaveCount(1)

  await dialogo.getByRole("button", { name: "Guardar" }).click()
  await expect(dialogo).toBeHidden({ timeout: 60_000 })

  await expect(galeria).toHaveCount(1)

  // El objeto de la retirada deja de responder. Es H-71 dicho como prueba: borrar «por prefijo»
  // devolvía `200` y no borraba nada, y leyendo el código era correcto.
  await expect
    .poll(async () => (await context.request.get(primera)).status(), { timeout: 15_000 })
    .not.toBe(200)

  // La recogida, con reintento de transporte: es la llamada que caía con `ECONNRESET` una vuelta de
  // cada catorce (H-146), después de un recorrido largo que deja la conexión en reposo.
  await context.request.delete(`${base}/${productId}`, TRANSPORTE)
})

test("lo que el selector no admite lo dice por su nombre, y no lo sube", async ({
  as,
  companies,
}) => {
  // El rechazo nombra el archivo. Sin el nombre, quien arrastra doce fotos y una es un PDF recibe
  // «algo no se pudo» y tiene que adivinar cuál.
  const context = await as("owner")
  const page = await context.newPage()
  const companyId = companies[WAREHOUSE_COMPANY] as string
  const warehouseId = await firstWarehouse(page, companyId)

  await page.goto(`/c/${companyId}/warehouses/${warehouseId}/storages`)
  await page.getByRole("button", { name: "Nueva ubicación" }).first().click()

  const dialogo = page.getByRole("dialog")
  await dialogo
    .locator('input[type="file"]')
    .setInputFiles([
      { name: "contrato.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") },
    ])

  await expect(dialogo.getByText(/contrato\.pdf.*sólo se admiten imágenes/i)).toBeVisible()
})
