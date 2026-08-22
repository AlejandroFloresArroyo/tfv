/**
 * La bitácora personal: lo que **yo** hice, en todas mis empresas.
 *
 * ## Por qué es una pantalla y no una pestaña de la de empresa
 *
 * Porque responde otra pregunta. La de empresa contesta «qué pasó aquí»; ésta contesta «qué hice
 * yo», y lo hace **atravesando empresas**: quien pertenece a dos no tiene ningún sitio donde ver su
 * propio rastro sin ir empresa por empresa. Por eso vive bajo `/account`, al lado de las sesiones y
 * de la bandeja, que son las otras dos cosas que son de la persona y no del arrendatario.
 *
 * ## Lo que esta prueba viene a fijar
 *
 * Lo único que la distingue de la de empresa, y que es también lo único que se puede hacer mal sin
 * que nada falle: **filtra por quien mira**. Dos personas dejan un asiento en la misma empresa con
 * un segundo de diferencia, y en la bitácora personal de una tiene que estar el suyo y no el de la
 * otra. Una pantalla que se equivoque aquí se ve perfecta y enseña el rastro ajeno.
 *
 * Los asientos se producen **desde la pantalla de la empresa**, no por la API: lo que se comprueba
 * es que el rastro de un trabajo real llega hasta aquí.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"
import { apartarLaPizarra } from "../setup/pizarra.ts"

/** Quién es cada quien en la siembra. La frase del asiento lleva el nombre delante. */
const DUENA = "Rosa"
const ADMINISTRACION = "Ale"

/** Deja un asiento de cambio sobre la empresa, conducido como lo conduce una persona. */
async function editarLaEmpresa(
  page: import("@playwright/test").Page,
  companyId: string,
): Promise<void> {
  await page.goto(`/c/${companyId}/settings/company`)
  // Con la pizarra abierta el contenido se desplaza y «Acciones» queda fuera del lienzo. Ver
  // `setup/pizarra.ts` y `HALLAZGOS.md` H-300.
  await apartarLaPizarra(page)
  await page.getByRole("button", { name: "Acciones" }).first().click()
  await page.getByRole("menuitem", { name: "Editar" }).click()

  const dialogo = page.getByRole("dialog")
  await dialogo.getByLabel("Descripción").fill(`Bitácora personal e2e ${Date.now().toString(36)}`)
  await dialogo.getByRole("button", { name: "Guardar" }).click()
  await expect(dialogo).toBeHidden()
}

test("la bitácora personal enseña lo mío y no lo del vecino, y se llega desde mi cuenta", async ({
  as,
  companies,
}) => {
  test.setTimeout(90_000)

  const companyId = companies[WAREHOUSE_COMPANY] as string

  const propietaria = await as("owner")
  const administracion = await as("admin")

  // Dos asientos sobre la misma empresa, de dos personas distintas. El de la otra es el que esta
  // pantalla **no** debe enseñar, y sin él la afirmación no valdría nada.
  const otra = await administracion.newPage()
  await editarLaEmpresa(otra, companyId)

  const mia = await propietaria.newPage()
  await editarLaEmpresa(mia, companyId)

  // ─── Se llega desde la cuenta, no escribiendo la dirección ─────────────────
  // Es lo único que no se ve leyendo el código: una pantalla terminada sin puerta ya pasó antes
  // (`HALLAZGOS.md` H-70).
  await mia.goto("/account")
  await mia.getByRole("link", { name: "Mi actividad" }).click()
  await mia.waitForURL(/\/account\/activity$/)

  await expect(mia.getByRole("heading", { name: "Mi actividad" })).toBeVisible()

  // ─── Sólo lo mío ───────────────────────────────────────────────────────────
  const asientos = mia.getByRole("list", { name: "Resultados" }).getByRole("listitem")
  await expect(asientos.first()).toBeVisible()

  const textos = await asientos.allTextContents()
  expect(textos.length, "la bitácora personal llegó vacía").toBeGreaterThan(0)
  for (const texto of textos) {
    expect(texto, `un asiento sin mi nombre: ${texto}`).toContain(DUENA)
    expect(texto, `se coló un asiento ajeno: ${texto}`).not.toContain(ADMINISTRACION)
  }

  // ─── Y dice de qué empresa es cada uno ─────────────────────────────────────
  // Es lo que la de empresa no necesita decir y ésta sí: atraviesa empresas, y un asiento sin
  // empresa al lado no se puede situar.
  await expect(asientos.filter({ hasText: WAREHOUSE_COMPANY }).first()).toBeVisible()

  // ─── Los asientos no se tocan ──────────────────────────────────────────────
  await expect(mia.getByRole("button", { name: "Acciones" })).toHaveCount(0)
})

test("el filtro por acción de la bitácora personal viaja en la dirección", async ({
  as,
  companies,
}) => {
  // La misma regla que el resto de colecciones: el estado vive en la dirección, así que un filtro
  // se comparte por enlace y recargar no lo pierde.
  const companyId = companies[WAREHOUSE_COMPANY] as string
  const context = await as("owner")
  const page = await context.newPage()

  await editarLaEmpresa(page, companyId)
  await page.goto("/account/activity?action=update")

  const asientos = page.getByRole("list", { name: "Resultados" }).getByRole("listitem")
  await expect(asientos.first()).toBeVisible()
  for (const texto of await asientos.allTextContents()) expect(texto).toContain("Cambio")
})
