/**
 * Los sitios de una empresa, desde dentro: el listado y el constructor.
 *
 * ## Qué se recorre aquí y qué en `tienda.spec.ts`
 *
 * Aquí, **lo que hace quien administra el sitio**: darlo de alta, publicarlo, componer su página.
 * Allí, lo que ve quien la abre desde fuera. Se separan porque son dos sesiones distintas —una con
 * cookie del panel y otra sin ninguna— y porque un fallo en una no dice nada de la otra.
 *
 * ## Por qué estas dos pruebas y no una prueba de componente
 *
 * Porque lo que estaba sin ejercer no era la aritmética. La reordenación está probada sin navegador
 * (`packages/ui/src/lib/reorder.test.ts`) y la equivalencia entre la vista previa y lo que sirve la
 * tienda, también (`apps/api/src/websites/customizations.test.ts`). Lo que no había probado nadie
 * es que **esa maquinaria esté conectada a una pantalla que se puede usar**: que el asa mueva, que
 * el editor que se abre sea el del tipo de sección que se abrió, y que lo que se ve arriba cambie
 * al soltar. Ver `HALLAZGOS.md` H-151.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"
import { apartarLaPizarra } from "../setup/pizarra.ts"
import { verticalDeAlmacen } from "../setup/vertical.ts"

/** Marca de lo que crea cada recorrido. Distinta por prueba: corren a la vez y se limpian solas. */
const PREFIJO_LISTA = "Sitio e2e "
const PREFIJO_CONSTRUCTOR = "Constructor e2e "

/**
 * Retira lo que dejó una pasada anterior. **Al principio, no en un `finally`**: un tiempo agotado
 * se lleva por delante el navegador antes de que el `finally` corra.
 */
async function limpiar(
  context: import("@playwright/test").BrowserContext,
  companyId: string,
  prefijo: string,
): Promise<void> {
  const base = `/api/companies/${companyId}/websites`
  const previos = await context.request.get(`${base}?limit=50`)
  if (!previos.ok()) return

  const { items } = (await previos.json()) as { items: { id: string; name: string }[] }
  for (const item of items.filter((row) => row.name.startsWith(prefijo))) {
    await context.request.delete(`${base}/${item.id}`)
  }
}

test("un sitio se da de alta, se publica y se abre desde su listado", async ({ as, companies }) => {
  test.setTimeout(90_000)

  const context = await as("owner")
  const companyId = companies[WAREHOUSE_COMPANY] as string
  await limpiar(context, companyId, PREFIJO_LISTA)

  const page = await context.newPage()
  const nombre = `${PREFIJO_LISTA}${Date.now().toString(36).slice(-5)}`

  // ─── Se llega por la navegación, no escribiendo la dirección ───────────────
  await page.goto(`/c/${companyId}`)
  await page
    .getByRole("navigation", { name: WAREHOUSE_COMPANY })
    .getByRole("link", { name: "Sitios" })
    .click()
  await page.waitForURL(/\/websites$/)
  await expect(page.getByRole("heading", { name: "Sitios" }).first()).toBeVisible()

  // Con la pizarra abierta el borde derecho de la cabecera queda recortado y «Nuevo sitio» no se
  // puede pulsar. Ver `setup/pizarra.ts` y `HALLAZGOS.md` H-300.
  await apartarLaPizarra(page)

  // ─── Alta ──────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Nuevo sitio" }).first().click()
  const alta = page.getByRole("dialog")
  await alta.getByLabel("Nombre").fill(nombre)
  await alta.getByLabel("Descripción").fill("Sitio del recorrido de extremo a extremo.")
  // La fuente del catálogo es lo que hace que el sitio tenga algo que vender. Se elige el primer
  // almacén de la empresa, sin nombrarlo: cuál sea es de la siembra, no de esta prueba.
  const fuente = alta.getByLabel("Fuente del catálogo")
  const almacenes = await fuente.locator("option").allTextContents()
  expect(
    almacenes.length,
    "la empresa sembrada no ofrece ningún almacén como fuente",
  ).toBeGreaterThan(1)
  await fuente.selectOption({ index: 1 })
  await alta.getByRole("button", { name: "Crear" }).click()
  await expect(alta).toBeHidden()

  // ─── Aparece con su dirección pública, y sin publicar ──────────────────────
  const fila = page.locator("li").filter({ hasText: nombre }).first()
  await expect(fila).toBeVisible()
  await expect(fila.getByText("Sin publicar")).toBeVisible()

  // La dirección se deriva del nombre y **es el subdominio** en el que se sirve la tienda: sin ella
  // el sitio existe y nadie sabe dónde abrirlo.
  const publica = fila.getByRole("link").filter({ hasText: /^http/ })
  await expect(publica).toBeVisible()
  await expect(publica).toHaveAttribute("target", "_blank")

  // ─── Publicar cambia el estado en la pantalla, con su nombre al lado ───────
  await fila.getByRole("switch", { name: "Publicar" }).click()
  await expect(fila.getByText("Publicado")).toBeVisible()
  await expect(fila.getByText("Sin publicar")).toHaveCount(0)

  // Y no es optimismo del navegador: recargando sigue publicado.
  await page.reload()
  const recargada = page.locator("li").filter({ hasText: nombre }).first()
  await expect(recargada.getByText("Publicado")).toBeVisible()

  // ─── Y el nombre lleva al constructor ──────────────────────────────────────
  await recargada.getByRole("link", { name: nombre }).click()
  await page.waitForURL(/\/websites\/[^/]+$/)
  await expect(page.getByRole("heading", { name: nombre })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Vista previa" })).toBeVisible()

  await limpiar(context, companyId, PREFIJO_LISTA)
})

test("el constructor compone la página: editores por tipo, arrastre y vista previa", async ({
  as,
  companies,
}) => {
  test.setTimeout(120_000)

  const context = await as("owner")
  const companyId = companies[WAREHOUSE_COMPANY] as string
  await limpiar(context, companyId, PREFIJO_CONSTRUCTOR)

  /**
   * El sitio se crea por la API porque su alta ya tiene su recorrido en la prueba de arriba, y
   * repetirla aquí sólo alargaría ésta. Lo que sí importa es **con qué categoría**: la vertical se
   * declara con ella, y de ella depende con qué secciones nace un tema.
   */
  const plataforma = await as("admin")
  const vertical = await verticalDeAlmacen(plataforma, companyId)

  const naves = await context.request.get(`/api/companies/${companyId}/warehouses?limit=1`)
  const { items: almacenes } = (await naves.json()) as { items: { id: string }[] }

  const nombre = `${PREFIJO_CONSTRUCTOR}${Date.now().toString(36).slice(-5)}`
  const creado = await context.request.post(`/api/companies/${companyId}/websites`, {
    data: {
      name: nombre,
      warehouseId: almacenes[0]?.id,
      categoryId: vertical,
      isPublished: true,
    },
  })
  expect(creado.ok(), `no se pudo crear el sitio: ${await creado.text()}`).toBe(true)
  const sitio = (await creado.json()) as { id: string }

  const page = await context.newPage()
  await page.goto(`/c/${companyId}/websites/${sitio.id}`)
  await apartarLaPizarra(page)

  // ─── Un sitio nuevo no tiene tema: se crea desde aquí ──────────────────────
  await expect(page.getByRole("heading", { name: "Temas" })).toBeVisible()
  await page.getByRole("button", { name: "Nuevo", exact: true }).click()
  await expect(page.getByText("Tema nuevo")).toBeVisible()

  /** Las filas de la lista que se reordena: las que llevan asa. */
  const secciones = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /^Mover la sección de/ }) })

  /**
   * La fila de un tipo de sección, por **su botón de abrir** y no por su texto.
   *
   * Por texto no vale: en cuanto se abre el editor de la portada, su desplegable de destinos
   * enumera todos los tipos que hay, así que esa fila pasa a contener el nombre de todas las demás.
   */
  const seccion = (nombre: string) =>
    secciones.filter({ has: page.getByRole("button", { name: new RegExp(`^${nombre}`) }) }).first()

  // ─── Los editores son los del tipo, no un formulario para todos ────────────
  // Es lo que `sectionSpec` promete y lo que nadie conducía: la portada admite botones y no
  // elementos; las preguntas frecuentes, elementos y no botones; y una sección de catálogo **no
  // ofrece elementos**, porque los suyos los pone el almacén y no hay dónde escribirlos.
  const portada = seccion("Portada")
  await portada.getByRole("button", { name: /^Portada/ }).click()
  await expect(portada.getByLabel("Título")).toBeVisible()
  await expect(portada.getByLabel("Descripción")).toBeVisible()
  await expect(portada.getByText("Botones", { exact: true })).toBeVisible()
  await expect(portada.getByText("Elementos", { exact: true })).toHaveCount(0)

  const preguntas = seccion("Preguntas frecuentes")
  await preguntas.getByRole("button", { name: /^Preguntas frecuentes/ }).click()
  await expect(preguntas.getByText("Elementos", { exact: true })).toBeVisible()
  await expect(preguntas.getByLabel("Título del elemento").first()).toBeVisible()
  await expect(preguntas.getByText("Botones", { exact: true })).toHaveCount(0)

  const catalogo = seccion("Categorías")
  await catalogo.getByRole("button", { name: /^Categorías/ }).click()
  await expect(catalogo.getByLabel("Título")).toBeVisible()
  await expect(catalogo.getByText("Elementos", { exact: true })).toHaveCount(0)
  await expect(catalogo.getByText("Botones", { exact: true })).toHaveCount(0)

  // ─── Escribir en un editor cambia la vista previa ──────────────────────────
  const titulo = `Rodaje sin sobresaltos ${Date.now().toString(36).slice(-4)}`
  await portada.getByLabel("Título").fill(titulo)

  const vista = page.locator("#seccion-hero")
  await expect(vista.getByText(titulo)).toBeVisible()

  // ─── El orden de la vista previa es el de la lista ─────────────────────────
  const ordenAntes = await page
    .locator("section[id^='seccion-']")
    .evaluateAll((nodes) => nodes.map((node) => node.id))
  expect(ordenAntes.slice(0, 2)).toEqual(["seccion-hero", "seccion-categories"])

  // ─── Y mover la portada la mueve de verdad ─────────────────────────────────
  // El asa es un botón: recibe foco y las flechas mueven su fila. Es la misma llamada a `move` que
  // dispara el arrastre —`ReorderList` no tiene dos caminos—, y la única que se puede conducir sin
  // depender de la simulación de arrastre del navegador.
  await portada.getByRole("button", { name: /^Mover la sección de Portada/ }).focus()
  await page.keyboard.press("ArrowDown")

  const ordenDespues = await page
    .locator("section[id^='seccion-']")
    .evaluateAll((nodes) => nodes.map((node) => node.id))
  expect(ordenDespues.slice(0, 2)).toEqual(["seccion-categories", "seccion-hero"])

  // ─── Se guarda a mano, y lo guardado sobrevive a la recarga ────────────────
  // El constructor **no autoguarda**, a propósito: lo que se edita es una página pública.
  await expect(page.getByText("Cambios sin guardar")).toBeVisible()
  await page.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByText("Todo guardado")).toBeVisible()

  await page.reload()
  const ordenRecargado = await page
    .locator("section[id^='seccion-']")
    .evaluateAll((nodes) => nodes.map((node) => node.id))
  expect(ordenRecargado.slice(0, 2)).toEqual(["seccion-categories", "seccion-hero"])
  await expect(page.locator("#seccion-hero").getByText(titulo)).toBeVisible()

  await limpiar(context, companyId, PREFIJO_CONSTRUCTOR)
})
