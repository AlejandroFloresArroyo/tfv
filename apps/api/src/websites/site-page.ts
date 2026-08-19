/**
 * La página de un sitio: lo que se sirve, y lo que se previsualiza.
 *
 * Ver `openspec/specs/site-builder/spec.md`, requisito «Vista previa en el editor»: «La vista previa
 * SHALL usar el mismo renderizado que el sitio público, **de modo que lo que se ve sea lo que se
 * sirve**».
 *
 * ## Cómo se cumple eso aquí
 *
 * Con una sola función. `publicSitePage` y `previewSitePage` se diferencian **únicamente** en cómo
 * llegan hasta la fila del sitio —una atraviesa las tres compuertas sin credencial, la otra exige
 * permiso— y a partir de ahí las dos llaman a `compose`, que es quien decide qué personalización
 * manda y qué secciones se pintan. No hay una segunda respuesta posible, y la prueba lo comprueba
 * comparando las dos salidas en vez de leyendo las dos implementaciones.
 *
 * El navegador cierra la otra mitad del trato: la portada pública y la vista previa del constructor
 * pintan estas secciones con **el mismo componente**.
 *
 * ## Las dos diferencias, que son a propósito
 *
 * 1. La vista previa alcanza un sitio **sin publicar**. Es para lo que existe: nadie construye una
 *    página publicándola primero.
 * 2. La vista previa puede pedir **una personalización concreta**, no sólo la vigente. Editar la
 *    campaña de diciembre en noviembre es el caso normal, y sin esto habría que ponerla vigente
 *    —es decir, publicarla— para poder verla.
 *
 * Ninguna de las dos toca lo que se pinta: sólo *cuál* se pinta y *a quién* se le deja mirar.
 */

import { NotFoundError } from "@tfv/contracts"
import {
  activeCustomization,
  type RenderableSection,
  renderableSections,
} from "@tfv/contracts/sections"
import { type Transaction, withRequester, withSystem } from "@tfv/db"
import { uploads, websites } from "@tfv/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { customizationsOf } from "./customizations.ts"
import { loadWebsite } from "./sites.ts"
import { resolveStorefront } from "./storefront.ts"

/** Lo que hace falta para pintar la página de un sitio, y nada más. */
export interface SitePage {
  /** Nulo cuando el sitio todavía no tiene ninguna personalización. No es un error. */
  readonly customizationId: string | null
  readonly name: string | null
  readonly color: string
  readonly bannerUrl: string | null
  /** Ya filtradas y ordenadas: lo que hay aquí se pinta tal cual. */
  readonly sections: readonly RenderableSection[]
}

/** Una página que no tiene nada que enseñar todavía. El sitio sigue siendo legible. */
const EMPTY: SitePage = {
  customizationId: null,
  name: null,
  color: "#000000",
  bannerUrl: null,
  sections: [],
}

const OPERATION = "tienda_publica.pagina"

/**
 * La página que sirve un subdominio.
 *
 * Las tres compuertas las atraviesa `resolveStorefront`, que es quien las tiene escritas: una
 * compuerta cerrada aquí es un `404`, igual que para el catálogo y la ficha —una tienda que hoy no
 * se sirve no tiene página que enseñar, y devolver una vacía diría que la tienda funciona—.
 *
 * La empresa se vuelve a preguntar al motor en lugar de heredarla de la resolución: `storefront.ts`
 * es la mitad ya entregada de esta rebanada y este archivo no la modifica, así que la pregunta se
 * repite. Es una consulta a una función `security definer` que responde con un identificador; el
 * día que las dos mitades se junten, sobra.
 */
export async function publicSitePage(slug: string): Promise<SitePage> {
  const resolution = await resolveStorefront(slug)
  if (resolution.status !== "ready") throw new NotFoundError("La tienda no existe")

  const companyId = await publicWebsiteCompany(slug)
  if (companyId === null) throw new NotFoundError("La tienda no existe")

  return withSystem(OPERATION, [companyId], async (tx) => {
    const [site] = await tx
      .select({ id: websites.id })
      .from(websites)
      .where(
        and(eq(websites.slug, slug), eq(websites.isPublished, true), isNull(websites.deletedAt)),
      )
      .limit(1)

    if (!site) throw new NotFoundError("La tienda no existe")
    return compose(tx, site.id, null)
  })
}

/**
 * La página tal y como quedaría, para quien la está construyendo.
 *
 * Sin compuertas y sin exigir publicación **a propósito**: quien tiene permiso sobre el sitio de su
 * empresa ya puede ver lo que hay dentro, y las compuertas describen a quién se le sirve la tienda
 * en la calle, no quién puede editarla.
 */
export async function previewSitePage(
  actor: Actor,
  companyId: string,
  websiteId: string,
  customizationId?: string | undefined,
): Promise<SitePage> {
  return withRequester(actor, async (tx) => {
    await loadWebsite(tx, companyId, websiteId)
    return compose(tx, websiteId, customizationId ?? null)
  })
}

/**
 * Lo único que decide qué se ve.
 *
 * `activeCustomization` y `renderableSections` son las del contrato compartido: las mismas que usa
 * el navegador para previsualizar mientras se edita, sin haber guardado.
 */
async function compose(
  tx: Transaction,
  websiteId: string,
  customizationId: string | null,
): Promise<SitePage> {
  const rows = await customizationsOf(tx, websiteId)

  const chosen =
    customizationId === null
      ? activeCustomization(rows, new Date())
      : (rows.find((row) => row.id === customizationId) ?? null)

  if (chosen === null) {
    // Pedir una personalización que no está es distinto de que el sitio no tenga ninguna.
    if (customizationId !== null) throw new NotFoundError("La personalización no existe")
    return EMPTY
  }

  return {
    customizationId: chosen.id,
    name: chosen.name,
    color: chosen.color,
    bannerUrl: await bannerUrlOf(tx, chosen.bannerUploadId),
    sections: renderableSections(chosen.sections),
  }
}

async function bannerUrlOf(tx: Transaction, uploadId: string | null): Promise<string | null> {
  if (uploadId === null) return null

  const [row] = await tx
    .select({ url: uploads.url })
    .from(uploads)
    .where(eq(uploads.id, uploadId))
    .limit(1)

  return row?.url ?? null
}

/**
 * Qué empresa sirve este subdominio, preguntándoselo al motor.
 *
 * Fuera de cualquier alcance declarado, porque la empresa es justo lo que se averigua.
 * `app.public_website` —migración `0019`— es `security definer`, comprueba dentro la publicación, y
 * un sitio sin publicar y un subdominio libre son para ella el mismo nulo.
 */
async function publicWebsiteCompany(slug: string): Promise<string | null> {
  return withSystem(`${OPERATION}.resolver`, [], async (tx) => {
    const rows = await tx.execute<{ company_id: string | null }>(
      sql`select app.public_website(${slug}) as company_id`,
    )

    return rows[0]?.company_id ?? null
  })
}
