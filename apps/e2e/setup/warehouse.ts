/**
 * Lo que necesita cualquier recorrido que empiece en la nave.
 *
 * Estaba escrito dos veces —en `quotes.spec.ts` y en `orders.spec.ts`— y al escribir los recorridos
 * de documentos, conversación y fotos habría quedado escrito cinco. La recogida en particular es de
 * las que **no se pueden copiar bien dos veces**: el orden importa —retorno, cancelación, baja— y
 * una copia que se salte un paso deja unidades comprometidas sin dueño, que es H-26.
 */

import type { APIResponse, BrowserContext, Page } from "@playwright/test"
import { expect } from "./fixtures.ts"

/**
 * Reintentos de transporte para las peticiones de preparación.
 *
 * No es tapar un fallo: `maxRetries` sólo reintenta `ECONNRESET`, nunca un código de respuesta. La
 * primera ráfaga de peticiones contra una API recién arrancada se lleva alguna conexión por delante
 * —«socket hang up»— y eso tumba una prueba por algo que no tiene nada que ver con lo que viene a
 * comprobar. Lo que la prueba afirma sigue sin reintentarse.
 */
const TRANSPORTE = { maxRetries: 3 } as const

export const QUOTES = (companyId: string, warehouseId: string) =>
  `/c/${companyId}/warehouses/${warehouseId}/quotes`

export const ORDERS = (companyId: string, warehouseId: string) =>
  `/c/${companyId}/warehouses/${warehouseId}/orders`

/** Lo que una prueba creó y tiene que llevarse al terminar. */
export interface Created {
  companyId: string
  warehouseId: string
  quoteId: string
}

/** El primer almacén de la empresa, tal y como lo encuentra quien entra por la navegación. */
export async function firstWarehouse(page: Page, companyId: string): Promise<string> {
  await page.goto(`/c/${companyId}/warehouses`)
  await page.getByRole("link", { name: "Nave Monterrey" }).click()
  await page.waitForURL(/\/warehouses\/[^/]+$/)
  return page.url().split("/warehouses/")[1] as string
}

/**
 * Crea una cotización de renta **propia**, con equipo dentro si se le pide.
 *
 * Las pruebas que escriben no pueden compartir documento: el guardado de líneas y el de condiciones
 * de pago mandan **el conjunto completo**, así que dos que corran a la vez sobre el mismo se borran
 * lo que la otra acaba de escribir. Con `--repeat-each` la prueba compite además consigo misma.
 */
export async function ownQuote(
  context: BrowserContext,
  companyId: string,
  warehouseId: string,
  name: string,
  trash: Created[],
  units = 0,
): Promise<string> {
  const warehouse = `/api/companies/${companyId}/warehouses/${warehouseId}`
  const attempt = async (measurementId?: string) =>
    await context.request.post(`${warehouse}/quotes`, {
      ...TRANSPORTE,
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
    const rates = await context.request.get(
      `${warehouse}/rates?availableForRent=true&limit=30`,
      TRANSPORTE,
    )
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

  const quote = (await (created as APIResponse).json()) as { id: string }
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
export async function sweep(context: BrowserContext, trash: Created[]): Promise<void> {
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

/**
 * Crea un pedido con una línea que **cabe**, y lo deja apuntado para retirarlo.
 *
 * `orders.spec.ts` monta el suyo corto a propósito —una línea que no cabe, para ver la falta antes
 * de aceptar—. Éste es el contrario: un pedido normal, para los recorridos que vienen a mirar otra
 * cosa y sólo necesitan que exista uno.
 */
export async function ownOrder(
  context: BrowserContext,
  companyId: string,
  warehouseId: string,
  name: string,
  trash: { companyId: string; warehouseId: string; orderId: string }[],
): Promise<string> {
  const warehouse = `/api/companies/${companyId}/warehouses/${warehouseId}`
  const rates = await context.request.get(
    `${warehouse}/rates?availableForRent=true&limit=30`,
    TRANSPORTE,
  )
  expect(rates.ok(), "no se pudieron leer las tarifas").toBe(true)

  const { items } = (await rates.json()) as {
    items: { measurementId: string; available: number }[]
  }
  const roomy = items.find((item) => item.available >= 1)
  expect(roomy, "el almacén no tiene equipo libre que pedir").toBeTruthy()

  const created = await context.request.post(`${warehouse}/orders`, {
    ...TRANSPORTE,
    data: {
      origin: "production",
      type: "rent",
      name,
      lines: [{ measurementId: roomy?.measurementId, quantity: 1 }],
    },
  })
  expect(created.ok(), `no se pudo crear ${name}: ${await created.text()}`).toBe(true)

  const order = (await created.json()) as { id: string }
  trash.push({ companyId, warehouseId, orderId: order.id })
  return order.id
}

/**
 * Se lleva los pedidos que creó una prueba, y las cotizaciones que hayan salido de ellos.
 *
 * Dar de baja un pedido **desvincula** su cotización en vez de borrarla —es un documento con
 * importes—, así que quien no se lleve las dos deja rastro.
 */
export async function sweepOrders(
  context: BrowserContext,
  trash: { companyId: string; warehouseId: string; orderId: string }[],
): Promise<void> {
  for (const { companyId, warehouseId, orderId } of trash.splice(0)) {
    const warehouse = `/api/companies/${companyId}/warehouses/${warehouseId}`

    const read = await context.request.get(`${warehouse}/orders/${orderId}`)
    const quoteId = read.ok() ? ((await read.json()) as { quoteId: string | null }).quoteId : null

    await context.request.delete(`${warehouse}/orders/${orderId}`)
    if (quoteId) await context.request.delete(`${warehouse}/quotes/${quoteId}`)
  }
}
