/**
 * El almacenamiento del proveedor que ya sirve la base, por su API HTTP.
 *
 * Ver `openspec/specs/media-storage/spec.md`. Es el proveedor que se despliega hoy.
 *
 * ## Por qué aquí no se firma nada
 *
 * El servicio expone justo la operación que hace falta —una autorización acotada a una clave y con
 * caducidad— así que se le pide y ya. Calcular la firma a mano sería reimplementar un protocolo
 * ajeno para obtener lo mismo que un `POST` devuelve. Cuando el destino **sea** S3, la firma se
 * calcula: eso es `providers/s3.ts`, y por eso son dos proveedores y no uno con condicionales.
 *
 * Comprobado contra el almacenamiento: la autorización escribe su objeto sin credencial ninguna, y
 * sobre otro objeto responde `InvalidSignature`.
 */

import { InternalError } from "@tfv/contracts"
import type { StorageProvider, WriteAuthorization } from "../provider.ts"

export interface SupabaseStorageConfig {
  /** Raíz de la API de almacenamiento, hasta `/storage/v1` incluido. */
  readonly url: string
  readonly bucket: string
  /** **No sale del servidor.** Lo que viaja al navegador es la autorización, no esto. */
  readonly serviceKey: string | undefined
}

/** Vigencia de reserva cuando el permiso no la declare. */
const FALLBACK_TTL_MS = 3_600_000

/**
 * Cuándo caduca la autorización, según **el almacenamiento**.
 *
 * Se lee del propio permiso en lugar de calcularla aquí: si el servicio decide otra vigencia, el
 * cliente se enteraría tarde y a mitad de una subida. No se verifica la firma —no es nuestra— sólo
 * se lee lo que declara.
 */
function expiryOf(token: string): string {
  const payload = token.split(".")[1]
  if (payload === undefined) return new Date(Date.now() + FALLBACK_TTL_MS).toISOString()

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number
    }
    if (typeof claims.exp !== "number") {
      return new Date(Date.now() + FALLBACK_TTL_MS).toISOString()
    }
    return new Date(claims.exp * 1000).toISOString()
  } catch {
    return new Date(Date.now() + FALLBACK_TTL_MS).toISOString()
  }
}

export function createSupabaseProvider(config: SupabaseStorageConfig): StorageProvider {
  function serviceKey(): string {
    if (!config.serviceKey) {
      throw new InternalError(
        "No hay credencial del almacenamiento configurada: ninguna subida se puede autorizar.",
      )
    }
    return config.serviceKey
  }

  /**
   * Los objetos que cuelgan de un prefijo.
   *
   * Se pregunta en lugar de deducirse, por el motivo que explica `provider.ts`: las extensiones de
   * los cinco objetos de un archivo no se pueden dar por sabidas.
   */
  async function objectsUnder(prefix: string): Promise<string[]> {
    const response = await fetch(`${config.url}/object/list/${config.bucket}`, {
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

  return {
    name: "supabase",

    async authorizeWrite(path: string, contentType: string): Promise<WriteAuthorization> {
      const response = await fetch(
        `${config.url}/object/upload/sign/${config.bucket}/${path}`,
        // Sobre la sobrescritura, ver `provider.ts` y `HALLAZGOS.md` H-132: sin ella el reintento
        // por objeto se cierra en cuanto algo se escribe bien.
        {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey()}`, "x-upsert": "true" },
        },
      )

      if (!response.ok) {
        throw new InternalError(
          `El almacenamiento no autorizó la escritura (${response.status}). Revisa la configuración.`,
        )
      }

      const signed = (await response.json()) as { url?: string; token?: string }

      if (!signed.url || !signed.token) {
        throw new InternalError(
          "El almacenamiento devolvió una autorización sin dirección ni permiso.",
        )
      }

      return {
        url: `${config.url}${signed.url}`,
        method: "PUT",
        headers: { "Content-Type": contentType },
        expiresAt: expiryOf(signed.token),
      }
    },

    publicUrl(path: string): string {
      return `${config.url}/object/public/${config.bucket}/${path}`
    },

    /**
     * **El nombre del parámetro del proveedor engaña**: su endpoint de borrado recibe `prefixes` y
     * no borra por prefijo, sino por clave exacta. Pasarle `empresa/archivo` no toca
     * `empresa/archivo/original.jpg`, y la operación responde `200` sin haber borrado nada — así
     * que el registro desaparecía de la base y sus cinco objetos se quedaban ocupando
     * almacenamiento para siempre. Se ve subiendo una foto y quitándola; leyendo el código, no.
     * Ver `HALLAZGOS.md` H-71.
     */
    async removeObjects(prefixes: readonly string[]): Promise<void> {
      if (prefixes.length === 0) return

      const keys = (await Promise.all(prefixes.map(objectsUnder))).flat()
      if (keys.length === 0) return

      await fetch(`${config.url}/object/${config.bucket}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: keys }),
      })
    },
  }
}
