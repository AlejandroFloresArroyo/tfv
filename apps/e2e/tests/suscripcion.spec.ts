/**
 * El plan, los perfiles de facturación y los cobros.
 *
 * ## Qué cambió aquí, y por qué
 *
 * Este archivo afirmaba lo contrario de lo que afirma ahora: que **no había nada que contratar**.
 * Se escribió cuando la siembra no dejaba ningún plan, y desde que deja tres la prueba pasó de
 * describir una ausencia a mentir sobre una presencia (`HALLAZGOS.md` H-158). Es el modo de fallo
 * de toda prueba escrita contra un hueco: cuando el hueco se llena, no se pone verde, se vuelve
 * falsa.
 *
 * Lo que cubre ahora es el recorrido entero, que hasta el 2026-08-19 no existía: contratar no
 * cerraba el círculo porque nada activaba la suscripción (`H-163`). Ahora el suplente del procesador
 * tiene su propia página de cobro y, al pagarla, firma el evento y lo entrega al mismo endpoint que
 * atenderá al procesador de verdad. Esta prueba conduce ese camino como lo conduce una persona.
 *
 * ## Sobre qué empresa, y por qué no sobre la sembrada
 *
 * Sobre **una que la prueba crea y borra**. Contratar cambia el estado de una empresa entera —y con
 * él lo que ven sus tiendas públicas—, así que hacerlo sobre una de las sembradas dejaría a otras
 * pruebas mirando una empresa distinta de la que esperan según en qué orden les toque correr.
 *
 * La cuenta es la que no tiene membresías: crear una empresa la convierte en su propietaria, y al
 * borrarla vuelve a quedarse sin ninguna. Ninguna otra prueba la usa.
 *
 * Lo que **no** se puede encadenar aquí es la tienda pública, que es el efecto más visible de tener
 * suscripción: una empresa recién creada no tiene el servicio de sitios y **no hay ninguna ruta que
 * se lo conceda**. Ese encadenamiento se fija en `apps/api/src/payments/local-processor.test.ts`,
 * donde el servicio se puede poner, y el motivo está en `HALLAZGOS.md` H-168.
 */

import { expect, test, WAREHOUSE_COMPANY } from "../setup/fixtures.ts"
import { apartarLaPizarra } from "../setup/pizarra.ts"

/** Marca de lo que crea este recorrido, para reconocerlo y retirarlo. */
const PREFIJO = "Contratación e2e "

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

test("el ciclo entero: contratar, pagar, cambiar, cancelar y reactivar", async ({ as }) => {
  /**
   * Un solo recorrido y no cinco pruebas: los cinco pasos son **estados sucesivos de la misma
   * suscripción**, y cada uno sólo existe si el anterior ocurrió. Partirlos obligaría a fabricar el
   * estado de entrada de cada uno por fuera, que es exactamente lo que esta suite existe para no
   * hacer.
   */
  test.setTimeout(120_000)

  const context = await as("outsider")

  // Al principio, no en un `finally`: un tiempo agotado se lleva por delante el navegador antes de
  // que el `finally` corra, así que la limpieza que de verdad funciona es la de la entrada.
  const previas = await context.request.get("/api/companies?limit=50")
  if (previas.ok()) {
    const { items } = (await previas.json()) as { items: { id: string; name: string }[] }
    for (const item of items.filter((row) => row.name.startsWith(PREFIJO))) {
      await context.request.delete(`/api/companies/${item.id}`)
    }
  }

  const creada = await context.request.post("/api/companies", {
    data: { name: `${PREFIJO}${Date.now().toString(36).slice(-5)}` },
  })
  expect(creada.ok(), `no se pudo crear la empresa: ${await creada.text()}`).toBe(true)
  const { id: companyId } = (await creada.json()) as { id: string }

  const page = await context.newPage()
  const plan = `/c/${companyId}/settings/plan`

  // ─── 1 · El catálogo se ofrece ─────────────────────────────────────────────
  await page.goto(plan)
  // Con la pizarra abierta el contenido se desplaza y su borde derecho queda recortado: los botones
  // de esta pantalla caen fuera del lienzo. Ver `setup/pizarra.ts` y `HALLAZGOS.md` H-300.
  await apartarLaPizarra(page)
  await expect(page.getByText("Esta empresa no tiene ningún plan contratado")).toBeVisible()
  // Los tres que siembra la instalación, cada uno con su botón. Es lo contrario de lo que esta
  // prueba afirmaba antes.
  await expect(page.getByRole("button", { name: "Contratar" })).toHaveCount(3)

  const casaDeRenta = page.locator("li").filter({ hasText: "Casa de renta" }).first()

  // ─── 2 · Abandonar el pago no deja suscripción ─────────────────────────────
  // Escenario de la spec, con sus palabras: «puede volver a intentarlo». Sólo se puede recorrer
  // porque el suplente tiene página propia: si emitiera el evento al abrir la sesión, no habría
  // ningún momento en el que abandonar signifique algo.
  await casaDeRenta.getByRole("button", { name: "Contratar" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Ir al pago" }).click()

  await page.waitForURL(/\/payments\/local\/checkouts\//)
  await page.getByRole("link", { name: "Cancelar y volver" }).click()

  await page.waitForURL(/\/settings\/plan/)
  await expect(page.getByText("Esta empresa no tiene ningún plan contratado")).toBeVisible()

  // ─── 3 · Contratar de verdad ───────────────────────────────────────────────
  await casaDeRenta.getByRole("button", { name: "Contratar" }).click()
  const contratar = page.getByRole("dialog")
  await contratar.getByLabel("Asientos").fill("5")
  await contratar.getByRole("button", { name: "Ir al pago" }).click()

  await page.waitForURL(/\/payments\/local\/checkouts\//)
  // La página del procesador, que no es una del producto: lo dice ella misma, y el importe que
  // enseña es el del plan por los asientos pedidos —349,00 × 5—, no un cero de relleno.
  await expect(page.getByRole("heading", { name: "Procesador de pagos suplente" })).toBeVisible()
  await expect(page.getByText("Casa de renta")).toBeVisible()
  await expect(page.getByRole("button", { name: "Pagar 1745.00 MXN" })).toBeVisible()

  await page.getByRole("button", { name: /^Pagar/ }).click()

  // ─── 4 · La vuelta, con la suscripción ya activa ───────────────────────────
  // Y activa **sin que la pantalla haya hecho nada**: lo único que hizo el navegador fue volver.
  // Quien la activó fue el evento firmado que el suplente entregó a `/payments/events`.
  await page.waitForURL(/\/settings\/plan/)
  const actual = page.getByText("Plan actual").locator("xpath=ancestor::div[1]")
  await expect(actual.getByText("Casa de renta")).toBeVisible()
  await expect(actual.getByText("Activa")).toBeVisible()
  await expect(page.getByText("5 asientos")).toBeVisible()
  // La fecha de renovación sale del cobro del primer periodo, que es el segundo evento. Sin él la
  // suscripción existiría sin periodo y aquí no habría fecha ninguna.
  await expect(page.getByText(/Se renueva el/)).toBeVisible()

  // ─── 5 · El cobro queda registrado ─────────────────────────────────────────
  await page.goto(`/c/${companyId}/settings/payments`)
  await expect(page.getByText("1745,00 MXN")).toBeVisible()
  await expect(page.getByText("5 asientos")).toBeVisible()

  // ─── 6 · Cambiar de plan conserva los asientos ─────────────────────────────
  await page.goto(plan)
  const productora = page.locator("li").filter({ hasText: "Productora" }).first()
  await productora.getByRole("button", { name: "Cambiar a este plan" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Cambiar de plan" }).click()

  await expect(actual.getByText("Productora")).toBeVisible()
  // Los cinco siguen ahí: el diálogo de cambio no los pide porque no se tocan.
  await expect(page.getByText("5 asientos")).toBeVisible()

  // ─── 7 · Cancelar surte efecto al vencimiento ──────────────────────────────
  await page.getByRole("button", { name: "Cancelar suscripción" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar al vencimiento" }).click()

  // «Se le informa de la fecha en que terminará», con esas palabras en la spec.
  await expect(page.getByText(/Cancelada\. Termina el /)).toBeVisible()
  // Y sigue operando: el estado no pasa a cancelado, porque el periodo pagado sigue vivo.
  await expect(actual.getByText("Activa")).toBeVisible()

  // ─── 8 · Reactivar deshace la cancelación ──────────────────────────────────
  await page.getByRole("button", { name: "Reactivar", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Reactivar" }).click()

  await expect(page.getByText(/Cancelada\. Termina el /)).toHaveCount(0)
  await expect(page.getByText(/Se renueva el/)).toBeVisible()

  await context.request.delete(`/api/companies/${companyId}`)
})

test("el alta de un perfil de facturación se recorre entera y resume lo escrito", async ({
  as,
  companies,
}) => {
  /**
   * Cuatro pasos, y se para **antes de pulsar el último botón**. No es pereza: dar de alta un
   * segundo perfil en la misma empresa responde `500`, así que una prueba que lo pulsara pasaría
   * la primera vez y fallaría todas las siguientes — exactamente lo que descubrió este archivo al
   * correr la suite dos veces seguidas. El defecto está anotado y no se arregla desde aquí.
   *
   * Lo que queda cubierto es donde vive la lógica del asistente: que no deja pasar vacío, que el
   * paso siguiente no aparece hasta que el anterior valida, y que la revisión resume lo escrito
   * **con la CLABE enmascarada** — que es lo que impide que una cuenta bancaria quede a la vista
   * de quien pase por detrás.
   */
  test.setTimeout(90_000)

  const context = await as("owner")
  const page = await context.newPage()
  const companyId = companies[WAREHOUSE_COMPANY] as string
  const listado = `/c/${companyId}/settings/billing`
  const alias = `Perfil e2e ${Date.now().toString(36).slice(-5)}`

  await page.goto(listado)
  await apartarLaPizarra(page)
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
  await expect(page.getByText("Paso 4 de 4")).toBeVisible()
  await expect(page.getByText(alias).first()).toBeVisible()
  await expect(page.getByText("Renta Fílmica del Norte SA de CV").first()).toBeVisible()

  // La cuenta bancaria no se repite entera en la revisión: se enseñan los cuatro últimos dígitos,
  // que bastan para reconocerla y no para usarla.
  await expect(page.getByText(/•+ 4567/)).toBeVisible()
  await expect(page.getByText("012345678901234567")).toHaveCount(0)

  // Los cuatro pasos quedan marcados, que es lo que dice que ninguno pasó sin validar.
  await expect(page.getByRole("button", { name: "Negocio completado" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Banco completado" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Representante completado" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Dar de alta el perfil" })).toBeEnabled()

  // Se sale por donde se entró, sin dejar nada escrito.
  await page.getByRole("button", { name: "Cancelar" }).click()
  await page.getByRole("button", { name: "Descartar" }).click()
  await page.waitForURL(/\/settings\/billing$/)
})
