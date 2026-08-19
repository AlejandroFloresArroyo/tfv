/**
 * De la nave vacía a la cotización.
 *
 * Es el único recorrido que comprueba **que el sistema se puede usar sin sembrar la base**. Los
 * demás parten de lo que dejó la siembra —un almacén con veinticinco productos, sus ubicaciones,
 * sus listas— y por eso ninguno se habría enterado de que faltaba la mitad de las altas: hasta esta
 * rebanada, en el módulo de almacenes **no se podía crear nada desde la pantalla**.
 *
 * Aquí no se usa nada sembrado salvo la empresa y la cuenta. Todo lo demás lo crea la prueba, en el
 * orden en que lo recorre una persona el primer día: almacén → categoría → ubicación → producto →
 * lista de precios → cotización.
 *
 * ## Dos cosas que conviene saber antes de tocarla
 *
 * **La empresa se hereda de la siembra a la fuerza.** Crear un almacén exige que la empresa tenga
 * contratado el servicio, y contratarlo no tiene ruta todavía —es la rebanada 11—. El primer
 * eslabón del recorrido, por tanto, no se puede probar: está anotado como `H-40`.
 *
 * **La cotización es de venta y no de renta**, para que el importe salga del precio del producto
 * que la propia prueba escribió. Una renta cobra por la lista de precios, y qué lista aplica es una
 * regla de precedencia con sus propias pruebas en `@tfv/contracts`; meterla aquí convertiría un
 * recorrido de altas en una comprobación de aritmética que ya está hecha donde se puede hacer bien.
 */

import type { BrowserContext } from "@playwright/test"
import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

/** Marca de lo que crea este recorrido, para poder reconocerlo y retirarlo. */
const PREFIJO = "Nave e2e "

/**
 * Retira los almacenes de pasadas anteriores.
 *
 * En orden: las cotizaciones primero, porque un almacén con trabajo en curso **no se da de baja**
 * —y eso es una guarda del servicio, no un estorbo de la prueba—.
 */
async function limpiarRestos(context: BrowserContext, companyId: string): Promise<void> {
  const response = await context.request.get(`/api/companies/${companyId}/warehouses?limit=100`)
  if (!response.ok()) return

  const { items } = (await response.json()) as { items: { id: string; name: string }[] }

  for (const warehouse of items.filter((row) => row.name.startsWith(PREFIJO))) {
    const path = `/api/companies/${companyId}/warehouses/${warehouse.id}`
    const quotes = await context.request.get(`${path}/quotes?limit=100`)

    if (quotes.ok()) {
      const { items: abiertas } = (await quotes.json()) as { items: { id: string }[] }
      for (const quote of abiertas) await context.request.delete(`${path}/quotes/${quote.id}`)
    }

    await context.request.delete(path)
  }
}

test("de la nave vacía a la cotización, sin tocar nada sembrado", async ({ as, companies }) => {
  // Son seis pantallas encadenadas y un asistente de cinco pasos: es lenta a propósito.
  test.setTimeout(180_000)

  const context = await as("owner")
  const page = await context.newPage()
  const companyId = companies[WAREHOUSE_COMPANY] as string

  // Marca de la pasada. Sin ella, dos ejecuciones seguidas chocan en el identificador legible.
  const marca = Date.now().toString(36).slice(-5)
  const nave = `${PREFIJO}${marca}`
  const producto = `Cámara ${marca}`

  const creado: { warehouseId?: string | undefined; quoteId?: string | undefined } = {}

  // Lo que dejó una pasada que se cayó a mitad. La recogida del `finally` no corre si la prueba
  // agota su tiempo —se lleva por delante el navegador y su contexto—, así que la limpieza de
  // verdad es ésta: empezar retirando lo que lleve la marca.
  await limpiarRestos(context, companyId)

  try {
    // ─── 1 · El almacén ──────────────────────────────────────────────────────
    await page.goto(`/c/${companyId}/warehouses`)
    await page.getByRole("button", { name: "Nuevo almacén" }).click()
    await page.getByRole("dialog").getByLabel("Nombre").fill(nave)
    await page.getByRole("dialog").getByRole("button", { name: "Crear" }).click()

    await page.getByRole("link", { name: nave }).click()
    await page.waitForURL(/\/warehouses\/[^/]+$/)
    creado.warehouseId = new URL(page.url()).pathname.split("/").at(-1)
    const base = `/c/${companyId}/warehouses/${creado.warehouseId}`

    // Nace vacío: es lo que hace que el resto del recorrido signifique algo.
    await expect(page.getByText(/sin productos|no hay productos/i).first()).toBeVisible()

    // ─── 2 · La categoría ────────────────────────────────────────────────────
    await page.goto(`${base}/categories`)
    await page.getByRole("button", { name: "Nueva categoría" }).click()
    await page.getByRole("dialog").getByLabel("Nombre").fill("Cámaras")
    await page.getByRole("dialog").getByRole("button", { name: "Crear" }).click()
    await expect(page.getByText("Cámaras").first()).toBeVisible()

    // ─── 3 · La ubicación ────────────────────────────────────────────────────
    await page.goto(`${base}/storages`)
    await page.getByRole("button", { name: "Nueva ubicación" }).click()
    const ubicacion = page.getByRole("dialog")
    await ubicacion.getByLabel("Nombre").fill("Estante 1")
    await ubicacion.getByRole("button", { name: "Crear" }).click()
    await expect(page.getByText("Estante 1").first()).toBeVisible()

    // ─── 4 · El producto, por el asistente de cinco pasos ────────────────────
    await page.goto(`${base}/products/new`)

    // El primer paso no deja pasar vacío, y lo dice en el campo.
    await page.getByRole("button", { name: "Siguiente" }).click()
    await expect(page.getByRole("alert").first()).toBeVisible()

    await page.getByRole("textbox", { name: "Nombre" }).fill(producto)
    await page.getByRole("button", { name: "Siguiente" }).click()

    // Clasificación: la categoría que acaba de crearse, en el selector con búsqueda.
    await page.getByRole("combobox").first().click()
    await page.getByRole("option", { name: "Cámaras" }).click()
    await page.getByRole("button", { name: "Siguiente" }).click()

    // Precio: se cotiza a la venta, así que hace falta que esté disponible para venta.
    await page.getByRole("switch", { name: "Disponible para venta" }).click()
    await page.getByRole("textbox", { name: /precio base/i }).fill("2500")
    await page.getByRole("button", { name: "Siguiente" }).click()

    // Medidas: la cantidad inicial es la que materializa unidades.
    await page.getByRole("textbox", { name: "Nombre" }).first().fill("Cuerpo")
    await page.getByRole("textbox", { name: /cantidad inicial/i }).fill("3")
    await page.getByRole("button", { name: "Siguiente" }).click()

    await expect(page.getByText(/3 unidades físicas/)).toBeVisible()
    await page.getByRole("button", { name: "Crear producto" }).click()

    await page.waitForURL(/\/products\/(?!new)[^/]+$/)
    await expect(page.getByRole("heading", { name: producto })).toBeVisible()
    // Las tres unidades existen de verdad: son filas, no un contador.
    await expect(page.getByText(/3 disponibles/).first()).toBeVisible()

    // ─── 5 · La lista de precios ─────────────────────────────────────────────
    await page.goto(`${base}/price-lists`)
    await page.getByRole("button", { name: "Crear lista" }).click()
    await page.getByRole("dialog").getByLabel("Nombre").fill(`Tarifas ${marca}`)
    await page.getByRole("dialog").getByRole("button", { name: "Crear" }).click()

    await page.getByRole("link", { name: `Tarifas ${marca}` }).click()
    await page.waitForURL(/\/price-lists\/[^/]+$/)

    await page.getByRole("button", { name: "Asignar productos" }).click()
    const asignacion = page.getByRole("dialog")
    await asignacion.getByRole("checkbox", { name: producto }).click()
    await asignacion.getByRole("button", { name: /guardar el conjunto/i }).click()
    await expect(page.getByText(producto).first()).toBeVisible()

    // ─── 6 · La cotización ───────────────────────────────────────────────────
    await page.goto(`${base}/quotes`)
    // Hay dos: la de la cabecera y la del estado vacío, que es lo que hace usable una bandeja recién
    // creada. Sirve cualquiera.
    await page.getByRole("button", { name: "Nueva cotización" }).first().click()

    const alta = page.getByRole("dialog")
    await alta.getByLabel("Tipo").selectOption("sale")
    await alta.getByRole("button", { name: "Crear" }).click()

    await page.waitForURL(/\/quotes\/[^/]+$/)
    creado.quoteId = new URL(page.url()).pathname.split("/").at(-1)

    await page.getByLabel("Añadir equipo").fill(producto.slice(0, 8))
    await page.getByRole("button", { name: new RegExp(producto) }).first().click()

    const lineas = page.getByRole("listitem").filter({ has: page.getByLabel("Cantidad") })
    await expect(lineas).toHaveCount(1)

    await page.getByRole("button", { name: "Guardar líneas" }).click()

    // El importe que sale es el precio que escribió el paso tres del asistente, por una unidad.
    // El separador de millar es optativo a propósito: la línea lo escribe sin agrupar y el panel de
    // importes con su idioma, y lo que esta prueba comprueba es la cifra, no su presentación —que
    // tiene sus propias pruebas, y su decisión pendiente en H-25—.
    await expect(page.getByText(/2[.,\s]?500[.,]00/).first()).toBeVisible()
  } finally {
    // Se recoge por el camino inverso: el almacén no se da de baja con trabajo en curso.
    const warehouse = `/api/companies/${companyId}/warehouses/${creado.warehouseId}`
    if (creado.quoteId) await context.request.delete(`${warehouse}/quotes/${creado.quoteId}`)
    if (creado.warehouseId) await context.request.delete(warehouse)
  }
})
