/**
 * El plan, los perfiles de facturación y los cobros.
 *
 * ## Lo que no se puede recorrer, y por qué
 *
 * **Contratar un plan no se puede.** La siembra no deja ninguno y la API no tiene alta de planes —
 * sólo `GET /plans`—, así que el catálogo llega vacío y no hay nada que pulsar. Con él se quedan
 * fuera todos los recorridos que cuelgan de tener suscripción: cambiar de plan, cancelar al
 * vencimiento, reactivar, la sesión de pago, y —encadenado— la tienda pública, que exige
 * suscripción vigente antes de servir nada.
 *
 * Está anotado en `HALLAZGOS.md`. Escribir un plan directamente en la base para poder contratar
 * dejaría media docena de pruebas verdes sobre un camino que nadie puede recorrer.
 *
 * ## Lo que sí
 *
 * Que las tres pantallas **existan, se alcancen desde la navegación y digan la verdad cuando no hay
 * nada**. No es poco: una pantalla terminada a la que nadie enlaza es un defecto que sólo aparece
 * intentando usarla, y ya pasó una vez esta semana con el alta de producto (H-70).
 *
 * Y el alta de un perfil de facturación, que es lo único de esta rebanada que se recorre entero.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

test("las tres pantallas de facturación se alcanzan desde la navegación", async ({
  as,
  companies,
}) => {
  const context = await as("owner")
  const page = await context.newPage()
  const companyId = companies[WAREHOUSE_COMPANY] as string
  const nav = page.getByRole("navigation", { name: WAREHOUSE_COMPANY })

  await page.goto(`/c/${companyId}`)

  await nav.getByRole("link", { name: "Plan" }).click()
  await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible()

  await nav.getByRole("link", { name: "Facturación" }).click()
  await expect(page.getByRole("heading", { name: "Perfiles de facturación" })).toBeVisible()

  await nav.getByRole("link", { name: "Cobros" }).click()
  await expect(page.getByRole("heading", { name: "Historial de cobros" })).toBeVisible()
})

test("sin plan contratado se dice, y sin catálogo no hay nada que contratar", async ({
  as,
  companies,
}) => {
  /**
   * Escrita contra **lo que hay**, no contra lo que debería haber.
   *
   * El día que la siembra deje planes, esta prueba fallará — y eso es lo que se quiere: que alguien
   * venga aquí y escriba el recorrido de contratar, que hoy no existe. Dejarla fuera haría que la
   * ausencia siguiera sin que nadie la viera.
   */
  const context = await as("owner")
  const page = await context.newPage()
  const companyId = companies[WAREHOUSE_COMPANY] as string

  await page.goto(`/c/${companyId}/settings/plan`)

  await expect(page.getByText("Esta empresa no tiene ningún plan contratado")).toBeVisible()
  // Ni un plan que elegir: el catálogo está vacío porque nada lo llena.
  await expect(page.getByRole("button", { name: "Contratar" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Cancelar suscripción" })).toHaveCount(0)
})

test("un perfil de facturación se da de alta desde su listado y aparece en él", async ({
  as,
  companies,
}) => {
  // Es el único recorrido de esta rebanada que se puede hacer entero. Y tiene su peso: sin un
  // perfil primario habilitado, la tienda pública de la empresa no puede cobrar.
  test.setTimeout(90_000)

  const context = await as("owner")
  const page = await context.newPage()
  const companyId = companies[WAREHOUSE_COMPANY] as string
  const listado = `/c/${companyId}/settings/billing`

  // Al principio: los perfiles de pasadas anteriores, retirados por su alias.
  const alias = `Perfil e2e ${Date.now().toString(36).slice(-5)}`
  const api = `/api/companies/${companyId}/billing-profiles`
  const previos = await context.request.get(`${api}?limit=50`)
  if (previos.ok()) {
    const { items } = (await previos.json()) as { items: { id: string; alias: string | null }[] }
    for (const item of items.filter((row) => (row.alias ?? "").startsWith("Perfil e2e "))) {
      await context.request.delete(`${api}/${item.id}`)
    }
  }

  await page.goto(listado)
  await page.getByRole("link", { name: "Añadir perfil" }).click()
  await page.waitForURL(/\/billing\/new$/)

  // ─── 1 · Negocio ───────────────────────────────────────────────────────────
  // El primer paso no deja pasar vacío, y lo dice en el campo que falta.
  await page.getByRole("button", { name: "Siguiente" }).click()
  await expect(page.getByRole("alert").first()).toBeVisible()

  await page.getByLabel("Alias").fill(alias)
  await page.getByLabel("Razón social").fill("Renta Fílmica del Norte SA de CV")
  await page.getByLabel("Registro fiscal (RFC)").fill("RFN200101AB1")
  await page.getByLabel("Correo de facturación").fill("facturacion@ejemplo.mx")
  await page.getByRole("button", { name: "Siguiente" }).click()

  // ─── 2 · Banco ─────────────────────────────────────────────────────────────
  await page.getByLabel("Banco").fill("Banco de prueba")
  await page.getByLabel("Titular de la cuenta").fill("Renta Fílmica del Norte SA de CV")
  await page.getByLabel("CLABE").fill("012345678901234567")
  await page.getByRole("button", { name: "Siguiente" }).click()

  await expect(page.getByText("Paso 3 de 4")).toBeVisible()

  // ─── 3 · Representante ─────────────────────────────────────────────────────
  // El procesador de pagos exige una persona física detrás de la cuenta de comercio, con su
  // domicilio: son los datos con los que se responde de un contracargo, y por eso no hay ninguno
  // que se pueda dejar vacío.
  // Sin `exact`: un campo obligatorio lleva un asterisco pegado a su etiqueta, así que su texto
  // no es «Nombre» sino «Nombre *». Con `exact` no encaja ninguno y la espera se agota lejos de la
  // causa.
  await page.getByLabel("Nombre").fill("Rosa")
  await page.getByLabel("Apellidos").fill("Iturbide")
  await page.getByLabel("Fecha de nacimiento").fill("14")
  await page.getByLabel("Mes").fill("3")
  await page.getByLabel("Año").fill("1985")
  await page.getByLabel("Calle y número").fill("Río Nazas 88")
  await page.getByLabel("Ciudad").fill("Monterrey")
  await page.getByLabel("Estado").fill("Nuevo León")
  await page.getByLabel("Código postal").fill("64000")
  await page.getByRole("button", { name: "Siguiente" }).click()

  // ─── 4 · Revisión ──────────────────────────────────────────────────────────
  await expect(page.getByText(alias).first()).toBeVisible()
  await page.getByRole("button", { name: "Dar de alta el perfil" }).click()

  await page.waitForURL(/\/settings\/billing$/, { timeout: 30_000 })
  await expect(page.getByText(alias).first()).toBeVisible()

  await context.request.delete(`${api}/${(await nuevoPerfil(context, api, alias)) ?? "ninguno"}`)
})

/** El identificador del perfil recién creado, para retirarlo sin navegar. */
async function nuevoPerfil(
  context: import("@playwright/test").BrowserContext,
  api: string,
  alias: string,
): Promise<string | undefined> {
  const response = await context.request.get(`${api}?limit=50`)
  if (!response.ok()) return undefined
  const { items } = (await response.json()) as { items: { id: string; alias: string | null }[] }
  return items.find((row) => row.alias === alias)?.id
}
