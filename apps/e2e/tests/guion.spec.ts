/**
 * El desglose del guion: guiones con su archivo, y capítulos con sus escenas.
 *
 * Es el primer recorrido de extremo a extremo del dominio de producciones — hasta ahora sólo
 * comprobado a mano en un navegador, según deja anotado `openspec/changes/rebuild-ui-domain-
 * screens/tasks.md`. La siembra no deja ninguna producción creada en «Estudios Mariposa» —sólo el
 * servicio habilitado—, así que cada prueba crea la suya por la API antes de tocar la pantalla, y
 * la retira al terminar. Cada prueba limpia lo que crea: correrlas no debe dejar basura en la base
 * de la suite.
 */

import { expect, PRODUCTION_COMPANY, test } from "../setup/fixtures.ts"

function uniqueName(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 8)}`
}

/** Crea una producción vacía por la API, para tener dónde desglosar un guion. */
async function createProduction(
  context: import("@playwright/test").BrowserContext,
  companyId: string,
): Promise<{ id: string; name: string }> {
  const name = uniqueName("Producción de guion")
  const created = await context.request.post(`/api/companies/${companyId}/productions`, {
    data: { name },
  })
  expect(created.ok(), `no se pudo crear la producción: ${await created.text()}`).toBe(true)
  return (await created.json()) as { id: string; name: string }
}

async function deleteProduction(
  context: import("@playwright/test").BrowserContext,
  companyId: string,
  productionId: string,
): Promise<void> {
  await context.request.delete(`/api/companies/${companyId}/productions/${productionId}`)
}

test.describe("guiones", () => {
  test("se registra con su archivo, y aparece sin recargar", async ({ as, companies }) => {
    // Producir el archivo y confirmarlo cuesta unos segundos de más.
    test.setTimeout(60_000)

    const context = await as("admin")
    const page = await context.newPage()
    const companyId = companies[PRODUCTION_COMPANY] as string
    const production = await createProduction(context, companyId)

    await page.goto(`/c/${companyId}/productions/${production.id}/script`)

    await page.evaluate(() => {
      ;(window as unknown as { __marca: string }).__marca = "misma-carga"
    })

    await page.getByRole("button", { name: "Nuevo guion" }).first().click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Nombre").fill("Guion maestro")
    await dialog
      .locator('input[type="file"]')
      .setInputFiles([
        { name: "guion.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%e2e") },
      ])
    await dialog.getByRole("button", { name: "Nuevo guion", exact: true }).click()

    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 })
    await expect(page.getByRole("heading", { name: "Guion maestro" })).toBeVisible()
    // Sin extracción todavía —la rebanada 21 no existe—: el estado se enseña con su nombre.
    await expect(page.getByText("Sin extraer")).toBeVisible()
    await expect(page.getByRole("link", { name: "Ver documento" })).toBeVisible()

    const survived = await page.evaluate(
      () => (window as unknown as { __marca?: string }).__marca === "misma-carga",
    )
    expect(survived, "el listado se actualizó recargando la página entera").toBe(true)

    const listed = await context.request.get(
      `/api/companies/${companyId}/productions/${production.id}/scripts`,
    )
    const body = (await listed.json()) as {
      items: { id: string; name: string; syncStatus: string; documentUrl: string | null }[]
    }
    const saved = body.items.find((row) => row.name === "Guion maestro")
    expect(saved, "el guion no aparece en el listado del servidor").toBeTruthy()
    expect(saved?.syncStatus).toBe("not_extracted")
    expect(saved?.documentUrl).not.toBeNull()

    await deleteProduction(context, companyId, production.id)
  })

  test("sustituir el archivo, editar y dar de baja, agrupados en un único punto de acceso", async ({
    as,
    companies,
  }) => {
    const context = await as("admin")
    const page = await context.newPage()
    const companyId = companies[PRODUCTION_COMPANY] as string
    const production = await createProduction(context, companyId)

    await context.request.post(`/api/companies/${companyId}/productions/${production.id}/scripts`, {
      data: { name: "Provisional" },
    })

    await page.goto(`/c/${companyId}/productions/${production.id}/script`)
    await page.getByRole("button", { name: "Acciones" }).click()
    await page.getByRole("menuitem", { name: "Editar" }).click()

    const editDialog = page.getByRole("dialog")
    await editDialog.getByLabel("Nombre").fill("Guion definitivo")
    await editDialog.getByRole("button", { name: "Guardar" }).click()

    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByRole("heading", { name: "Guion definitivo" })).toBeVisible()

    await page.getByRole("button", { name: "Acciones" }).click()
    await page.getByRole("menuitem", { name: "Dar de baja" }).click()

    const deleteDialog = page.getByRole("dialog")
    await expect(deleteDialog).toContainText("Guion definitivo")
    await deleteDialog.getByRole("button", { name: "Dar de baja" }).click()

    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText("Todavía no hay guiones")).toBeVisible()

    await deleteProduction(context, companyId, production.id)
  })
})

test.describe("capítulos y escenas", () => {
  test("un capítulo con una escena dentro llega hasta su etiqueta compuesta", async ({
    as,
    companies,
  }) => {
    const context = await as("admin")
    const page = await context.newPage()
    const companyId = companies[PRODUCTION_COMPANY] as string
    const production = await createProduction(context, companyId)

    await page.goto(`/c/${companyId}/productions/${production.id}/script/chapters`)

    await page.getByRole("button", { name: "Nuevo capítulo" }).click()
    const chapterDialog = page.getByRole("dialog")
    await chapterDialog.getByLabel("Nombre").fill("Capítulo uno")
    await chapterDialog.getByRole("button", { name: "Crear", exact: true }).click()
    await expect(page.getByRole("dialog")).toBeHidden()

    await page.getByRole("link", { name: "Capítulo uno" }).click()
    await expect(page.getByRole("heading", { name: "Capítulo uno", level: 1 })).toBeVisible()

    await page.getByRole("button", { name: "Nueva escena" }).click()
    const sceneDialog = page.getByRole("dialog")
    await sceneDialog.getByLabel("Nombre").fill("Escena uno")
    await sceneDialog.getByRole("button", { name: "Crear", exact: true }).click()
    await expect(page.getByRole("dialog")).toBeHidden()

    // La etiqueta compuesta —capítulo.escena— la calcula el servidor, no la pantalla.
    await expect(page.getByText("1.1")).toBeVisible()

    await page.getByRole("link", { name: "Escena uno" }).click()
    await expect(page.getByRole("heading", { name: "1.1", level: 1 })).toBeVisible()
    await expect(page.getByRole("link", { name: "Capítulo uno" })).toBeVisible()

    await deleteProduction(context, companyId, production.id)
  })

  test("el panel de la producción enlaza los recuentos a la estructura", async ({
    as,
    companies,
  }) => {
    const context = await as("admin")
    const page = await context.newPage()
    const companyId = companies[PRODUCTION_COMPANY] as string
    const production = await createProduction(context, companyId)

    const chaptersBase = `/api/companies/${companyId}/productions/${production.id}/chapters`
    const chapter = await (
      await context.request.post(chaptersBase, { data: { name: "Capítulo único", index: 1 } })
    ).json()
    await context.request.post(`${chaptersBase}/${chapter.id}/scenes`, {
      data: { name: "Escena única", index: 1 },
    })

    await page.goto(`/c/${companyId}/productions/${production.id}`)

    const chaptersStat = page.getByRole("link").filter({ hasText: "Capítulos" })
    await expect(chaptersStat).toBeVisible()
    await expect(chaptersStat).toContainText("1")
    await chaptersStat.click()

    await expect(page).toHaveURL(new RegExp(`/productions/${production.id}/script/chapters$`))
    await expect(page.getByRole("link", { name: "Capítulo único" })).toBeVisible()

    await deleteProduction(context, companyId, production.id)
  })
})
