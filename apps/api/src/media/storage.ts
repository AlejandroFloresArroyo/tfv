/**
 * El almacenamiento de objetos, visto desde el servicio.
 *
 * Ver `openspec/specs/media-storage/spec.md`. Lo único que hace este módulo es **pedir permiso**:
 * firma una autorización de escritura para un objeto concreto y se la da a quien va a escribirlo.
 * Los bytes no pasan por aquí.
 *
 * ## Por qué no hay cliente de S3
 *
 * El almacenamiento es el mismo servicio que ya sirve la base, y expone justo esta operación: una
 * autorización acotada a una clave y con caducidad. Firmarla a mano con el protocolo de S3 —cálculo
 * de firma, cabeceras canónicas, fecha— serían doscientas líneas y una dependencia grande para
 * obtener lo mismo. Comprobado contra el almacenamiento local: la autorización escribe su objeto
 * sin credencial ninguna, y sobre otro objeto responde `InvalidSignature`.
 */

import { InternalError } from "@tfv/contracts"
import { env } from "../env.ts"

export interface WriteAuthorization {
  /** Dirección absoluta a la que escribir. Lleva el permiso dentro. */
  readonly url: string
  readonly method: "PUT"
  readonly headers: Readonly<Record<string, string>>
  readonly expiresAt: string
}

function serviceKey(): string {
  if (!env.STORAGE_SERVICE_KEY) {
    throw new InternalError(
      "No hay credencial del almacenamiento configurada: ninguna subida se puede autorizar.",
    )
  }
  return env.STORAGE_SERVICE_KEY
}

/**
 * Cuándo caduca la autorización, según **el almacenamiento**.
 *
 * Se lee del propio permiso en lugar de calcularla aquí: si el servicio decide otra vigencia, el
 * cliente se enteraría tarde y a mitad de una subida. No se verifica la firma —no es nuestra— sólo
 * se lee lo que declara.
 */
function expiryOf(token: string): string {
  const payload = token.split(".")[1]
  if (payload === undefined) return new Date(Date.now() + 3_600_000).toISOString()

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number
    }
    if (typeof claims.exp !== "number") return new Date(Date.now() + 3_600_000).toISOString()
    return new Date(claims.exp * 1000).toISOString()
  } catch {
    return new Date(Date.now() + 3_600_000).toISOString()
  }
}

/** Autoriza a escribir **ese** objeto y ninguno más. */
export async function authorizeWrite(
  path: string,
  contentType: string,
): Promise<WriteAuthorization> {
  const response = await fetch(
    `${env.STORAGE_URL}/object/upload/sign/${env.STORAGE_BUCKET}/${path}`,
    { method: "POST", headers: { Authorization: `Bearer ${serviceKey()}` } },
  )

  if (!response.ok) {
    throw new InternalError(
      `El almacenamiento no autorizó la escritura (${response.status}). Revisa la configuración.`,
    )
  }

  const signed = (await response.json()) as { url?: string; token?: string }

  if (!signed.url || !signed.token) {
    throw new InternalError("El almacenamiento devolvió una autorización sin dirección ni permiso.")
  }

  return {
    url: `${env.STORAGE_URL}${signed.url}`,
    method: "PUT",
    headers: { "Content-Type": contentType },
    expiresAt: expiryOf(signed.token),
  }
}

/** Dirección pública de lectura de un objeto ya escrito. */
export function publicUrl(path: string): string {
  return `${env.STORAGE_URL}/object/public/${env.STORAGE_BUCKET}/${path}`
}

/**
 * Borra objetos del almacenamiento.
 *
 * La usa el recolector de subidas abandonadas. No falla si el objeto no existe: una subida que se
 * interrumpió antes de escribir nada deja registro y ningún objeto, y ése es justo el caso normal.
 */
export async function removeObjects(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return

  await fetch(`${env.STORAGE_URL}/object/${env.STORAGE_BUCKET}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [...paths] }),
  })
}
