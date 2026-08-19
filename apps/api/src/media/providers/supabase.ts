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
import type { BucketSetup, StorageProvider, WriteAuthorization } from "../provider.ts"

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

    /**
     * El depósito, con su lectura pública y su tope de tamaño.
     *
     * Aquí las dos cosas son **propiedades del depósito** y se declaran en la misma llamada, así que
     * esta operación puede dejarlo todo puesto. Lo que no puede declarar es CORS: lo resuelve el
     * servicio de almacenamiento para todos sus depósitos a la vez —responde a cualquier origen— y
     * no hay nada por depósito que poner. Eso es justo lo que hace peligrosa la mudanza a S3, donde
     * un depósito recién creado no responde a ninguno; por eso la comprobación de `bucket.ts`
     * pregunta con un preflight en lugar de fiarse de esto.
     */
    async ensureBucket({ maxObjectBytes }): Promise<BucketSetup> {
      const current = await fetch(`${config.url}/bucket/${config.bucket}`, {
        headers: { Authorization: `Bearer ${serviceKey()}` },
      })

      // **El estado de la respuesta no dice que no está**: preguntar por un depósito inexistente
      // responde `400` con un cuerpo que dice `404`. Mirar el estado y sólo el estado convertiría
      // «no está» en «no se pudo consultar», que es el mensaje que manda a revisar la credencial
      // cuando lo que hay que hacer es crear el depósito.
      const body = (await current.json().catch(() => ({}))) as {
        public?: boolean
        file_size_limit?: number | null
        code?: string
        statusCode?: string
      }

      if (!current.ok && (body.code === "NoSuchBucket" || body.statusCode === "404")) {
        const created = await fetch(`${config.url}/bucket`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            id: config.bucket,
            name: config.bucket,
            public: true,
            file_size_limit: maxObjectBytes,
          }),
        })

        if (!created.ok) {
          throw new InternalError(
            `No se pudo crear el depósito «${config.bucket}» (${created.status}): ${await created.text()}`,
          )
        }

        return {
          bucket: config.bucket,
          created: true,
          notes: [`creado de lectura pública, con tope de ${maxObjectBytes} bytes por objeto`],
        }
      }

      if (!current.ok) {
        throw new InternalError(
          `No se pudo consultar el depósito «${config.bucket}» (${current.status}). ` +
            "Revisa STORAGE_URL y la credencial de servicio.",
        )
      }

      const notes: string[] = []

      // Reparar, no sólo comprobar: un depósito privado sirve para escribir y no para leer, y el
      // síntoma es una galería entera de recuadros rotos sin nada en los registros del servicio.
      if (body.public !== true) notes.push("estaba privado: pasa a ser de lectura pública")
      if ((body.file_size_limit ?? null) !== maxObjectBytes) {
        notes.push(`tope de tamaño puesto en ${maxObjectBytes} bytes por objeto`)
      }

      if (notes.length > 0) {
        const updated = await fetch(`${config.url}/bucket/${config.bucket}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ public: true, file_size_limit: maxObjectBytes }),
        })

        if (!updated.ok) {
          throw new InternalError(
            `No se pudo corregir el depósito «${config.bucket}» (${updated.status}): ${await updated.text()}`,
          )
        }
      }

      return { bucket: config.bucket, created: false, notes }
    },

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
