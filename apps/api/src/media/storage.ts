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

/**
 * Autoriza a escribir **ese** objeto y ninguno más.
 *
 * ## Por qué se pide poder sobrescribir
 *
 * El proveedor, por omisión, se **niega a firmar** una clave que ya existe: responde `409
 * KeyAlreadyExists` en la firma, no en la escritura. Eso rompía el reintento por objeto, que es la
 * razón de ser de la máquina de subida: escrito el original y caída la miniatura, volver a
 * autorizar firma los cinco objetos —no sabe pedir cuatro— y el original ya ocupado hacía fallar
 * la petición entera con un `500`. Ver `HALLAZGOS.md` H-132.
 *
 * Permitirlo no ensancha nada: la autorización sigue acotada a **una** clave, y esa clave la
 * inventa la API a partir del identificador del archivo. Quien la recibe podía escribir ahí de
 * todos modos; ahora además puede escribir ahí **dos veces**. Comprobado contra el almacenamiento:
 * con el permiso de sobrescritura puesto, escribir en otra clave sigue respondiendo que la firma
 * no vale.
 */
export async function authorizeWrite(
  path: string,
  contentType: string,
): Promise<WriteAuthorization> {
  const response = await fetch(
    `${env.STORAGE_URL}/object/upload/sign/${env.STORAGE_BUCKET}/${path}`,
    { method: "POST", headers: { Authorization: `Bearer ${serviceKey()}`, "x-upsert": "true" } },
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
 * Los objetos que cuelgan de un prefijo.
 *
 * Se pregunta en lugar de deducirse. Un archivo de imagen son cinco objetos con extensiones que no
 * se pueden dar por sabidas —el original conserva la suya y los derivados llevan la del formato que
 * el navegador supo escribir—, y de una subida interrumpida puede haber cualquier subconjunto.
 * Adivinar la lista borra de menos y deja basura, que es exactamente el defecto que esto corrige.
 */
async function objectsUnder(prefix: string): Promise<string[]> {
  const response = await fetch(`${env.STORAGE_URL}/object/list/${env.STORAGE_BUCKET}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 100 }),
  })

  if (!response.ok) return []

  const entries = (await response.json()) as { name?: string; id?: string | null }[]

  return (
    entries
      // Sin `id` es una carpeta, no un objeto: borrarla por su nombre no borra nada.
      .filter((entry) => typeof entry.name === "string" && entry.id != null)
      .map((entry) => `${prefix}/${entry.name}`)
  )
}

/**
 * Borra del almacenamiento todo lo que cuelga de esos prefijos.
 *
 * La usan la sustitución de archivos y el recolector de subidas abandonadas.
 *
 * **El nombre del parámetro del proveedor engaña**: su endpoint de borrado recibe `prefixes` y no
 * borra por prefijo, sino por clave exacta. Pasarle `empresa/archivo` no toca
 * `empresa/archivo/original.jpg`, y la operación responde `200` sin haber borrado nada — así que el
 * registro desaparecía de la base y sus cinco objetos se quedaban ocupando almacenamiento para
 * siempre. Se ve subiendo una foto y quitándola; leyendo el código, no. Ver `HALLAZGOS.md` H-71.
 *
 * Por eso primero se pregunta qué hay y luego se borra por clave. No falla si no hay nada: una
 * subida que se interrumpió antes de escribir deja registro y ningún objeto, y ése es el caso
 * normal del recolector.
 */
export async function removeObjects(prefixes: readonly string[]): Promise<void> {
  if (prefixes.length === 0) return

  const keys = (await Promise.all(prefixes.map(objectsUnder))).flat()
  if (keys.length === 0) return

  await fetch(`${env.STORAGE_URL}/object/${env.STORAGE_BUCKET}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: keys }),
  })
}
