/**
 * Registro de archivos y autorización de su escritura.
 *
 * Ver `openspec/specs/media-storage/spec.md`. Rebanada 08.
 *
 * El modelo es **subida directa**: la API registra el archivo y firma permiso para escribirlo, y
 * el navegador escribe contra el almacenamiento. Ningún endpoint de este servicio acepta bytes, y
 * por eso ninguno necesita límites de carga ni tiempos de espera largos.
 *
 * ## Un archivo son cinco objetos, no uno
 *
 * Una imagen se guarda con sus cuatro derivados y un video con sus cuatro portadas, y **los produce
 * el navegador antes de subirlos**: el almacenamiento recibe cada tamaño ya redimensionado. De ahí
 * que la autorización se emita para los cinco de una vez — pedir permiso cinco veces sería cinco
 * viajes para una operación que quien sube vive como una.
 *
 * ## Sin original no hay archivo
 *
 * La confirmación dice **qué variantes se escribieron de verdad**, no si todo fue bien. Un
 * navegador que no sabe descodificar `heic` sube el original y ningún derivado, y eso no es un
 * fallo: es lo que ese navegador podía hacer. Lo que sí es un fallo es que falte el original —un
 * registro que apunta a una miniatura cuyo original no existe es peor que ningún registro—, y
 * entonces el archivo queda en erróneo aunque hayan entrado tres derivados.
 */

import { ConflictError, NotFoundError, newId, ValidationError } from "@tfv/contracts"
import {
  classify,
  isCoherent,
  plannedVariants,
  splitFileName,
  type UploadFailure,
  type UploadKind,
  type UploadVariant,
} from "@tfv/contracts/media"
import { type Transaction, withRequester } from "@tfv/db"
import { companies, type UploadVariants, uploads } from "@tfv/db/schema"
import { and, eq, isNull, lt } from "drizzle-orm"
import type { Actor } from "../companies/companies.ts"
import { authorizeWrite, publicUrl, removeObjects, type WriteAuthorization } from "./storage.ts"

/** Lo que admite el almacenamiento por objeto. Más allá, el navegador recibiría un error opaco. */
const MAX_BYTES = 50 * 1024 * 1024

/** Los derivados los produce el navegador, y salen en este formato salvo que declare otro. */
const DEFAULT_DERIVATIVE = "image/jpeg"

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export interface AuthorizeInput {
  readonly fileName: string
  readonly contentType: string
  readonly byteSize: number
  readonly kind?: UploadKind | undefined
  readonly derivativeContentType?: string | undefined
}

export interface UploadTarget extends WriteAuthorization {
  readonly variant: UploadVariant
}

export interface UploadRecord {
  readonly id: string
  readonly kind: UploadKind
  readonly status: "pending" | "uploaded" | "error"
  readonly url: string
  readonly variants: UploadVariants | null
  readonly fileName: string
  readonly extension: string
  readonly contentType: string
  readonly byteSize: number
  readonly storagePath: string
}

export interface Authorization {
  readonly upload: UploadRecord
  readonly targets: readonly UploadTarget[]
}

/**
 * La empresa existe y quien pide es de ella.
 *
 * La fila de un archivo **no lleva empresa** —la referencian entidades que sí—, así que el
 * aislamiento del registro no lo puede hacer el motor. Lo que sí lleva empresa es la clave del
 * objeto, y por ahí se comprueba: ver `load`.
 */
async function assertCompany(tx: Transaction, companyId: string): Promise<void> {
  const [company] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1)

  if (!company) throw new NotFoundError("La empresa no existe")
}

/** La clave del objeto sale del identificador del archivo, bajo el prefijo de su arrendatario. */
function objectPath(
  companyId: string,
  uploadId: string,
  variant: UploadVariant,
  extension: string,
): string {
  return `${companyId}/${uploadId}/${variant}.${extension}`
}

function extensionFor(contentType: string): string {
  return EXTENSION_BY_TYPE[contentType.toLowerCase()] ?? "jpg"
}

async function targetsFor(
  companyId: string,
  upload: UploadRecord,
  derivativeContentType: string,
): Promise<readonly UploadTarget[]> {
  const derivative = extensionFor(derivativeContentType)

  const planned = plannedVariants(upload.kind).map((variant) => ({
    variant,
    path: objectPath(
      companyId,
      upload.id,
      variant,
      variant === "original" ? upload.extension : derivative,
    ),
    // Las portadas de un video son imágenes, con independencia del formato del video.
    contentType: variant === "original" ? upload.contentType : derivativeContentType,
  }))

  const authorized: UploadTarget[] = []

  for (const target of planned) {
    authorized.push({
      variant: target.variant,
      ...(await authorizeWrite(target.path, target.contentType)),
    })
  }

  return authorized
}

export async function authorizeUpload(
  actor: Actor,
  companyId: string,
  input: AuthorizeInput,
): Promise<Authorization> {
  const parts = splitFileName(input.fileName)

  if (parts === undefined) {
    throw new ValidationError([
      { key: "fileName", message: "El nombre del archivo necesita nombre y extensión" },
    ])
  }

  if (!isCoherent(input.contentType, parts.extension)) {
    throw new ValidationError([
      {
        key: "contentType",
        message: `El tipo declarado «${input.contentType}» no corresponde a un archivo «.${parts.extension}»`,
      },
    ])
  }

  if (input.byteSize <= 0 || input.byteSize > MAX_BYTES) {
    throw new ValidationError([
      {
        key: "byteSize",
        message: `El archivo debe pesar entre 1 byte y ${MAX_BYTES / 1024 / 1024} MB`,
      },
    ])
  }

  const kind = input.kind ?? classify(parts.extension)
  const id = newId()
  const derivative = input.derivativeContentType ?? DEFAULT_DERIVATIVE

  const record = await withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)

    const [created] = await tx
      .insert(uploads)
      .values({
        id,
        kind,
        status: "pending",
        url: publicUrl(objectPath(companyId, id, "original", parts.extension)),
        fileName: input.fileName.trim(),
        extension: parts.extension,
        contentType: input.contentType,
        byteSize: input.byteSize,
        storagePath: `${companyId}/${id}`,
      })
      .returning()

    if (!created) throw new Error("la inserción del archivo no devolvió fila")
    return created as UploadRecord
  })

  return { upload: record, targets: await targetsFor(companyId, record, derivative) }
}

/**
 * Vuelve a firmar las escrituras del **mismo** registro.
 *
 * Existe porque una autorización caduca y un archivo grande no puede volver a subirse por eso. Sin
 * esto, caducar obliga a registrar otro archivo y a repetir la subida entera, que es justo lo que
 * el reintento por objeto evita.
 */
export async function reissueTargets(
  actor: Actor,
  companyId: string,
  uploadId: string,
  derivativeContentType?: string,
): Promise<Authorization> {
  const record = await load(actor, companyId, uploadId)

  if (record.status !== "pending") {
    throw new ConflictError("Este archivo ya no está pendiente: no hay nada que volver a autorizar")
  }

  return {
    upload: record,
    targets: await targetsFor(companyId, record, derivativeContentType ?? DEFAULT_DERIVATIVE),
  }
}

export type Confirmation =
  | { readonly written: readonly UploadVariant[] }
  | { readonly failed: true; readonly reason?: UploadFailure | undefined }

export async function confirmUpload(
  actor: Actor,
  companyId: string,
  uploadId: string,
  confirmation: Confirmation,
): Promise<UploadRecord> {
  const record = await load(actor, companyId, uploadId)

  const failed = "failed" in confirmation || !confirmation.written.includes("original")
  const written = "written" in confirmation ? confirmation.written : []

  const variants: UploadVariants | null = failed
    ? null
    : {
        thumbnail: variantUrl(companyId, record, written, "thumbnail"),
        small: variantUrl(companyId, record, written, "small"),
        medium: variantUrl(companyId, record, written, "medium"),
        large: variantUrl(companyId, record, written, "large"),
      }

  return withRequester(actor, async (tx) => {
    const [updated] = await tx
      .update(uploads)
      .set({ status: failed ? "error" : "uploaded", variants, updatedAt: new Date() })
      .where(eq(uploads.id, uploadId))
      .returning()

    if (!updated) throw new NotFoundError("El archivo no existe")
    return updated as UploadRecord
  })
}

function variantUrl(
  companyId: string,
  record: UploadRecord,
  written: readonly UploadVariant[],
  variant: UploadVariant,
): string | null {
  if (!written.includes(variant)) return null
  return publicUrl(objectPath(companyId, record.id, variant, "jpg"))
}

async function load(actor: Actor, companyId: string, uploadId: string): Promise<UploadRecord> {
  return withRequester(actor, async (tx) => {
    await assertCompany(tx, companyId)

    const [record] = await tx.select().from(uploads).where(eq(uploads.id, uploadId)).limit(1)

    if (!record) throw new NotFoundError("El archivo no existe")

    // El archivo no lleva empresa —lo referencian entidades que sí—, pero su objeto vive bajo el
    // prefijo de una. Pedirlo desde otra es pedir un archivo que no es suyo.
    if (!record.storagePath.startsWith(`${companyId}/`)) {
      throw new NotFoundError("El archivo no existe")
    }

    return record as UploadRecord
  })
}

/**
 * Retira las subidas que nadie confirmó.
 *
 * Sin esto, una subida interrumpida deja un registro huérfano para siempre (`DEFECTS.md` O-05). No
 * toca los marcadores de posición, que se usan cuando una entidad exige archivo y no se subió
 * ninguno, y **nunca se eliminan** aunque dejen de estar referenciados.
 *
 * ## Primero la fila, después los objetos
 *
 * Y no al revés, que es como estaba. Quien decide si una fila se borra es el motor: la guarda de la
 * migración `0017` **omite** el borrado de un archivo que siga referenciado, y un archivo pendiente
 * puede estarlo —la entidad se guardó antes de que llegara la confirmación, o la confirmación se
 * perdió—. Retirando los objetos primero, esa fila sobrevivía apuntando a bytes que ya no existían:
 * la imagen rota que la guarda existe para evitar, servida por el propio mecanismo que la protege.
 * Así que se borra, se mira **qué se borró de verdad**, y sólo de eso se retiran los objetos
 * (`HALLAZGOS.md` H-160).
 *
 * Devuelve cuántas se **eligieron**, no cuántas se llevaron: quien la llama resta las que el motor
 * protegió para informar de las dos cifras, y ese número es información de operación —uno que crece
 * dice que alguien deja entidades apuntando a subidas que nunca se confirman—.
 */
export async function collectAbandoned(actor: Actor, olderThanHours = 24): Promise<number> {
  const limit = new Date(Date.now() - olderThanHours * 3_600_000)

  const abandoned = await withRequester(actor, async (tx) =>
    tx
      .select({ id: uploads.id })
      .from(uploads)
      .where(
        and(
          eq(uploads.status, "pending"),
          eq(uploads.isPlaceholder, false),
          lt(uploads.createdAt, limit),
        ),
      ),
  )

  if (abandoned.length === 0) return 0

  const deleted = await withRequester(actor, async (tx) => {
    const paths: string[] = []

    for (const row of abandoned) {
      // Lo que devuelve el borrado son las filas que **el motor dejó borrar**: la que la guarda
      // omite no sale aquí, y por eso sus objetos no se tocan.
      const [gone] = await tx
        .delete(uploads)
        .where(eq(uploads.id, row.id))
        .returning({ storagePath: uploads.storagePath })

      if (gone) paths.push(gone.storagePath)
    }

    return paths
  })

  await removeObjects(deleted)

  return abandoned.length
}
