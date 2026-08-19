/**
 * El constructor: las personalizaciones de un sitio y su contenido.
 *
 * Ver `openspec/specs/site-builder/spec.md`. Rebanada 19.
 *
 * Una personalización es **un tema completo**: un color, un banner y una lista ordenada de
 * secciones. Un sitio tiene varias; una es la primaria y las demás pueden programarse por fechas,
 * de modo que la campaña de diciembre sustituye al tema habitual mientras dura y **se retira sola**
 * en enero, sin que nadie tenga que acordarse de desactivarla.
 *
 * ## Lo que este archivo no decide
 *
 * Qué secciones se pintan, en qué orden y cuál de las personalizaciones manda hoy. Eso vive en
 * `@tfv/contracts/sections`, y el motivo es la exigencia de la spec de que la vista previa use el
 * mismo renderizado que el sitio público: dos implementaciones de la misma regla coinciden hasta
 * que dejan de hacerlo, y el desacuerdo se manifiesta como un constructor que miente.
 *
 * ## Una lista, no una página
 *
 * Las secciones se guardan y se escriben **enteras**, como un documento: la petición trae el
 * arreglo en el orden que se quiere y el servidor lo numera. Es lo que hace que reordenar no
 * necesite ni identificadores de sección ni un endpoint aparte —el modelo guarda un `jsonb` sin
 * identidad por elemento— y que insertar en medio no deje dos secciones peleándose por la
 * posición 3.
 *
 * ## Un tipo desconocido se guarda
 *
 * La spec dice qué hacer con él **al renderizar**: omitirlo, sin romper la página. Rechazarlo al
 * escribir sería lo contrario de eso: dejaría un sitio trasvasado de la pila anterior —o uno cuyo
 * tipo se retiró del catálogo— sin poder guardar ni una corrección de una errata hasta que alguien
 * borrara a mano la sección que estorba.
 */

import { NotFoundError, newId, UnprocessableError, type WebsiteVertical } from "@tfv/contracts"
import {
  activeCustomization,
  initialSections,
  normalizeSections,
  type Section,
  unresolvedScrollTargets,
} from "@tfv/contracts/sections"
import { verticalOf } from "@tfv/contracts/storefront"
import { type Transaction, withRequester } from "@tfv/db"
import { globalCategories, websiteCustomizations } from "@tfv/db/schema"
import { and, asc, eq, isNull, ne } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import {
  assertUsableImages,
  diffSingle,
  type ImageRef,
  imageRefs,
  releaseUploads,
  sweepObjects,
} from "../media/collections.ts"
import { loadWebsite } from "./sites.ts"

export interface CustomizationRecord {
  readonly id: string
  readonly websiteId: string
  readonly name: string
  readonly color: string
  readonly bannerUploadId: string | null
  readonly bannerUrl: string | null
  readonly isPrimary: boolean
  /**
   * Si **ésta** es la que el sitio está sirviendo ahora mismo.
   *
   * Campo calculado, no columna: se resuelve con la misma función que la portada pública. Sin él,
   * el constructor tendría que deducirlo comparando fechas por su cuenta —otra implementación de la
   * misma regla— y quien tuviera tres campañas solapadas no sabría cuál está viendo el visitante.
   */
  readonly isActive: boolean
  readonly startsAt: Date | null
  readonly endsAt: Date | null
  readonly sections: readonly Section[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function listCustomizations(
  actor: Actor,
  companyId: string,
  websiteId: string,
): Promise<readonly CustomizationRecord[]> {
  return withRequester(actor, async (tx) => {
    await loadWebsite(tx, companyId, websiteId)
    return decorate(tx, await customizationsOf(tx, websiteId))
  })
}

export async function getCustomization(
  actor: Actor,
  companyId: string,
  websiteId: string,
  customizationId: string,
): Promise<CustomizationRecord> {
  return withRequester(actor, async (tx) => {
    await loadWebsite(tx, companyId, websiteId)
    const rows = await customizationsOf(tx, websiteId)
    const records = await decorate(tx, rows)
    const record = records.find((entry) => entry.id === customizationId)

    if (!record) throw new NotFoundError("La personalización no existe")
    return record
  })
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface CreateCustomizationInput {
  readonly name: string
  readonly color?: string | undefined
  readonly bannerUploadId?: string | null | undefined
  readonly isPrimary?: boolean | undefined
  readonly startsAt?: Date | null | undefined
  readonly endsAt?: Date | null | undefined
  readonly sections?: readonly Section[] | undefined
}

export async function createCustomization(
  actor: Actor,
  companyId: string,
  websiteId: string,
  input: CreateCustomizationInput,
): Promise<CustomizationRecord> {
  return withRequester(actor, async (tx) => {
    const site = await loadWebsite(tx, companyId, websiteId)
    const existing = await customizationsOf(tx, websiteId)

    const startsAt = input.startsAt ?? null
    const endsAt = input.endsAt ?? null
    assertWindow(startsAt, endsAt)

    // «La primera personalización de un sitio SHALL quedar marcada como primaria»: un sitio con
    // temas y ninguno primario no serviría nada, y nadie pidió que no se sirviera.
    const isPrimary = existing.length === 0 || input.isPrimary === true

    const sections = normalizeSections(
      assertSections(input.sections ?? initialSections(await verticalOfSite(tx, site.categoryId))),
    )

    if (input.bannerUploadId) await assertUsableImages(tx, companyId, [input.bannerUploadId])
    if (isPrimary) await unsetPrimary(tx, websiteId, null)

    const [created] = await tx
      .insert(websiteCustomizations)
      .values({
        id: newId(),
        websiteId,
        name: input.name.trim(),
        ...(input.color === undefined ? {} : { color: input.color }),
        bannerUploadId: input.bannerUploadId ?? null,
        isPrimary,
        startsAt,
        endsAt,
        sections: [...sections],
      })
      .returning()

    if (!created) throw new Error("la inserción de la personalización no devolvió fila")

    const records = await decorate(tx, await customizationsOf(tx, websiteId))
    const record = records.find((entry) => entry.id === created.id)
    if (!record) throw new Error("la personalización recién creada no se pudo releer")
    return record
  })
}

export interface UpdateCustomizationInput {
  readonly name?: string | undefined
  readonly color?: string | undefined
  readonly bannerUploadId?: string | null | undefined
  readonly isPrimary?: boolean | undefined
  readonly startsAt?: Date | null | undefined
  readonly endsAt?: Date | null | undefined
  readonly sections?: readonly Section[] | undefined
}

export async function updateCustomization(
  actor: Actor,
  companyId: string,
  websiteId: string,
  customizationId: string,
  input: UpdateCustomizationInput,
): Promise<CustomizationRecord> {
  const { record, released } = await withRequester(actor, async (tx) => {
    await loadWebsite(tx, companyId, websiteId)
    const current = await loadCustomization(tx, websiteId, customizationId)

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.color !== undefined) patch.color = input.color

    if (input.startsAt !== undefined || input.endsAt !== undefined) {
      const startsAt = input.startsAt === undefined ? current.startsAt : input.startsAt
      const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt
      assertWindow(startsAt, endsAt)
      patch.startsAt = startsAt
      patch.endsAt = endsAt
    }

    if (input.sections !== undefined) {
      patch.sections = [...normalizeSections(assertSections(input.sections))]
    }

    if (input.isPrimary === true && !current.isPrimary) {
      await unsetPrimary(tx, websiteId, customizationId)
      patch.isPrimary = true
    }

    // «Marcar una desmarca la anterior» dice cómo se cambia de primaria, y no hay ninguna operación
    // que deje un sitio sin ella. Desmarcar la única a mano sería justo eso, así que se rechaza
    // diciendo cómo se hace lo que se pretendía: marcar otra.
    if (input.isPrimary === false && current.isPrimary) {
      throw new UnprocessableError(
        "Un sitio necesita una personalización primaria. Marca otra como primaria en su lugar",
      )
    }

    const banner =
      input.bannerUploadId === undefined
        ? undefined
        : diffSingle(current.bannerUploadId, input.bannerUploadId)

    if (banner !== undefined) {
      await assertUsableImages(tx, companyId, banner.added)
      patch.bannerUploadId = input.bannerUploadId
    }

    if (Object.keys(patch).length > 0) {
      await tx
        .update(websiteCustomizations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(websiteCustomizations.id, customizationId))
    }

    const records = await decorate(tx, await customizationsOf(tx, websiteId))
    const record = records.find((entry) => entry.id === customizationId)
    if (!record) throw new Error("la personalización modificada no se pudo releer")

    return { record, released: await releaseUploads(tx, banner?.removed ?? []) }
  })

  await sweepObjects(released)
  return record
}

/**
 * Baja lógica de una personalización.
 *
 * **De la personalización, no del sitio.** La implementación anterior borraba de la colección de
 * sitios (`DEFECTS.md` C-09): quien quería retirar la campaña de diciembre se quedaba sin tienda.
 * La prueba que lo cubre comprueba que el sitio sigue respondiendo después.
 *
 * Si la que se va era la primaria y quedan otras, **se promueve una**: la más antigua de las que
 * quedan. Determinista, como pide la spec, y con un motivo que se puede decir en voz alta —la que
 * lleva más tiempo en el sitio es la que más se parece a su tema de siempre—; el desempate por
 * identificador no significa nada y no pretende significarlo.
 *
 * El banner **no se libera**, igual que en la baja de un sitio: es una baja lógica y la fila sigue
 * apuntando al archivo. Llamar a `releaseUploads` aquí sería además un gesto vacío —el motor lo ve
 * referenciado y no lo borraría—, y un gesto vacío que parece hacer algo es peor que no hacerlo.
 */
export async function deleteCustomization(
  actor: Actor,
  companyId: string,
  websiteId: string,
  customizationId: string,
): Promise<void> {
  await withRequester(actor, async (tx) => {
    await loadWebsite(tx, companyId, websiteId)
    const current = await loadCustomization(tx, websiteId, customizationId)

    await tx
      .update(websiteCustomizations)
      .set({ deletedAt: new Date(), updatedAt: new Date(), isPrimary: false })
      .where(eq(websiteCustomizations.id, customizationId))

    if (!current.isPrimary) return

    const [heir] = await customizationsOf(tx, websiteId)
    if (heir) {
      await tx
        .update(websiteCustomizations)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(eq(websiteCustomizations.id, heir.id))
    }
  })
}

// ─── Ayudas ──────────────────────────────────────────────────────────────────

/**
 * Las personalizaciones vivas de un sitio, **de la más antigua a la más nueva**.
 *
 * El orden importa fuera de la lectura: es el que decide a quién se promueve al eliminar la
 * primaria, y por eso se fija aquí y no en cada consulta.
 */
export async function customizationsOf(
  tx: Transaction,
  websiteId: string,
): Promise<readonly (typeof websiteCustomizations.$inferSelect)[]> {
  return tx
    .select()
    .from(websiteCustomizations)
    .where(
      and(eq(websiteCustomizations.websiteId, websiteId), isNull(websiteCustomizations.deletedAt)),
    )
    .orderBy(asc(websiteCustomizations.createdAt), asc(websiteCustomizations.id))
}

async function loadCustomization(tx: Transaction, websiteId: string, customizationId: string) {
  const [row] = await tx
    .select()
    .from(websiteCustomizations)
    .where(
      and(
        eq(websiteCustomizations.id, customizationId),
        eq(websiteCustomizations.websiteId, websiteId),
        isNull(websiteCustomizations.deletedAt),
      ),
    )
    .limit(1)

  if (!row) throw new NotFoundError("La personalización no existe")
  return row
}

/**
 * Deja el sitio sin primaria antes de poner la nueva.
 *
 * En dos sentencias y en este orden porque el índice único parcial —una primaria viva por sitio— se
 * comprueba al terminar cada una: marcar primero la nueva rechazaría la transacción entera con un
 * `500` que no dice nada.
 */
async function unsetPrimary(
  tx: Transaction,
  websiteId: string,
  exceptId: string | null,
): Promise<void> {
  await tx
    .update(websiteCustomizations)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(websiteCustomizations.websiteId, websiteId),
        eq(websiteCustomizations.isPrimary, true),
        isNull(websiteCustomizations.deletedAt),
        ...(exceptId === null ? [] : [ne(websiteCustomizations.id, exceptId)]),
      ),
    )
}

/** La ventana de una campaña. Una que termina antes de empezar no estaría vigente nunca. */
function assertWindow(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt !== null && endsAt !== null && endsAt.getTime() < startsAt.getTime()) {
    throw new UnprocessableError("La fecha de fin no puede ser anterior a la de inicio")
  }
}

/**
 * Comprueba lo único que una sección no puede traer mal: un botón que no lleva a ninguna parte.
 *
 * «Un botón de desplazamiento SHALL referenciar una sección existente en la misma
 * personalización», y el rechazo **dice cuál** falla: uno que sólo dijera «hay un botón mal»
 * dejaría a quien edita buscándolo entre ocho secciones.
 */
function assertSections(sections: readonly Section[]): readonly Section[] {
  const unresolved = unresolvedScrollTargets(sections)

  if (unresolved.length > 0) {
    throw new UnprocessableError(
      `Un botón se desplaza a una sección que no está en esta personalización: ${unresolved.join(", ")}`,
    )
  }

  return sections
}

/**
 * La vertical del sitio, para saber con qué secciones nace su primera personalización.
 *
 * Sale de la **clave estable** de la categoría y no de su nombre, igual que en `sites.ts`: renombrar
 * «Tienda de almacén» no puede cambiar con qué nace un sitio nuevo.
 */
async function verticalOfSite(
  tx: Transaction,
  categoryId: string | null,
): Promise<WebsiteVertical> {
  if (categoryId === null) return verticalOf(null)

  const [row] = await tx
    .select({ keyname: globalCategories.keyname })
    .from(globalCategories)
    .where(eq(globalCategories.id, categoryId))
    .limit(1)

  return verticalOf(row?.keyname ?? null)
}

async function decorate(
  tx: Transaction,
  rows: readonly (typeof websiteCustomizations.$inferSelect)[],
): Promise<readonly CustomizationRecord[]> {
  if (rows.length === 0) return []

  const images = await imageRefs(
    tx,
    rows.map((row) => row.bannerUploadId),
  )
  const active = activeIdOf(rows)

  return rows.map((row) => toRecord(row, active, images))
}

/** Cuál se está sirviendo ahora, con la misma función que resuelve la portada pública. */
function activeIdOf(rows: readonly (typeof websiteCustomizations.$inferSelect)[]): string | null {
  return activeCustomization(rows, new Date())?.id ?? null
}

function toRecord(
  row: typeof websiteCustomizations.$inferSelect,
  activeId: string | null,
  images: ReadonlyMap<string, ImageRef>,
): CustomizationRecord {
  return {
    id: row.id,
    websiteId: row.websiteId,
    name: row.name,
    color: row.color,
    bannerUploadId: row.bannerUploadId,
    bannerUrl: row.bannerUploadId === null ? null : (images.get(row.bannerUploadId)?.url ?? null),
    isPrimary: row.isPrimary,
    isActive: row.id === activeId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    sections: row.sections,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
