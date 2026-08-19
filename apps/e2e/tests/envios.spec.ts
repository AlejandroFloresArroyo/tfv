/**
 * Las tarifas de envío, y lo que cobran.
 *
 * El cuadro y el simulador están en la misma pantalla a propósito, y por eso vale la pena
 * recorrerlos juntos: lo que se guarda arriba es lo que cobra abajo. El defecto que la rebanada
 * cierra era justo el contrario —el algoritmo copiado en el navegador, así que un cambio en una
 * copia dejaba a la otra enseñando un importe que ya no se cobraba—, y la única forma de comprobar
 * que ya no ocurre es **guardar una cifra y ver salir esa cifra**.
 *
 * Se comprueba además la regla que la spec no decidía hasta H-100: la recolección en tienda cuesta
 * cero y **no lleva recargo por cantidad**. Los dos requisitos se contradecían y una recolección de
 * quince piezas cumplía los dos costando cincuenta pesos.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"

const ENVIOS = (companyId: string) => `/c/${companyId}/settings/shipping`

/** El importe que la pantalla pinta, leído como número. */
function asNumber(text: string): number {
  const digits = text.replace(/[^\d.,]/g, "")
  const separator = digits.lastIndexOf(",") > digits.lastIndexOf(".") ? "," : "."
  const [whole = "", fraction = ""] = digits.split(separator)
  return Number(`${whole.replace(/[^\d]/g, "")}.${fraction.replace(/[^\d]/g, "") || "0"}`)
}

/** Lo que el simulador acabe informando como total. */
async function total(page: import("@playwright/test").Page): Promise<number> {
  const value = await page
    .getByRole("term")
    .filter({ hasText: "Total" })
    .locator("xpath=following-sibling::dd[1]")
    .textContent()
  return asNumber(value ?? "")
}

test.describe("las tarifas de envío", () => {
  test("lo que se guarda en el cuadro es lo que cobra el simulador", async ({ as, companies }) => {
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(ENVIOS(companyId))
    await expect(page.getByRole("heading", { name: "Cuadro de tarifas" })).toBeVisible()

    // Se fija un cuadro conocido **al empezar**, en lugar de partir de lo que dejó la pasada
    // anterior. Es la misma idea que la limpieza de entrada: la prueba no depende de en qué estado
    // se encontró la empresa, y por eso aguanta dos vueltas seguidas.
    // `exact`, siempre: sin él «Nacional» encaja también con «Internacional» y «Artículos» con
    // «Más de (artículos)». Una prueba que escribe en el campo de al lado pasa hasta el día que
    // deja de pasar por un motivo que no tiene nada que ver.
    await page.getByLabel("Nacional", { exact: true }).fill("100")
    await page.getByLabel("Por kilogramo").nth(1).fill("20")
    await page.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText("Los envíos que se calculen a partir de ahora")).toBeVisible()

    // Un bulto de un kilo real; el volumétrico de 10×10×10 no llega, así que el facturable es 1.
    await page.getByLabel("Modalidad").selectOption("national")
    await page.getByLabel("Artículos", { exact: true }).fill("1")
    await page.getByLabel("Peso por artículo (kg)").fill("1")
    await page.getByRole("button", { name: "Calcular" }).click()

    // 100 de base más 20 por el kilo. La aritmética tiene sus pruebas donde es una función pura;
    // lo que se comprueba aquí es que **el número que sale es el que se acaba de escribir arriba**.
    await expect.poll(async () => await total(page), { timeout: 10_000 }).toBe(120)
  })

  test("la recolección en tienda cuesta cero, y sigue costando cero con quince piezas", async ({
    as,
    companies,
  }) => {
    // Es H-100: la spec decía las dos cosas y no decidía. Una recolección de quince piezas cumplía
    // los dos requisitos y costaba cincuenta pesos — el recargo por cantidad, aplicado a algo que
    // nadie transporta.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(ENVIOS(companyId))

    await page.getByLabel("Modalidad").selectOption("pickup")
    await page.getByLabel("Artículos", { exact: true }).fill("15")
    await page.getByLabel("Peso por artículo (kg)").fill("8")
    await page.getByRole("button", { name: "Calcular" }).click()

    await expect.poll(async () => await total(page), { timeout: 10_000 }).toBe(0)
    // Y no se le cuela ningún recargo por el camino, que es la mitad del hallazgo.
    await expect(page.getByText(/Recargo por más de \d+ artículos/)).toHaveCount(0)
  })

  test("la recolección no aparece en el cuadro: no hay tarifa que fijarle", async ({
    as,
    companies,
  }) => {
    // Ofrecer una casilla para una modalidad que cuesta cero invita a escribir un número que no se
    // va a cobrar, y quien lo escriba creerá que sí. La pantalla lo dice en lugar de callarlo.
    const context = await as("owner")
    const page = await context.newPage()
    const companyId = companies[WAREHOUSE_COMPANY] as string

    await page.goto(ENVIOS(companyId))

    await expect(page.getByLabel("Local", { exact: true })).toBeVisible()
    await expect(page.getByLabel("Recolección en tienda", { exact: true })).toHaveCount(0)
    await expect(page.getByText("La recolección en tienda cuesta cero")).toBeVisible()
  })
})
