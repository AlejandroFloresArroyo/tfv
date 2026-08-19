/**
 * Almacenamiento por el protocolo de S3.
 *
 * Ver `openspec/specs/media-storage/spec.md` y `../provider.ts`. Habla S3 y no la API de nadie, así
 * que sirve para AWS y para cualquier almacenamiento compatible — **incluida la pila local**, que
 * expone su punto S3 y es contra el que está ejercido este proveedor. Que se pueda probar sin
 * credenciales de AWS es lo que separa «debería funcionar» de «lo vi funcionar».
 *
 * ## Las tres operaciones, y cómo se resuelven
 *
 * | Operación | Cómo |
 * |---|---|
 * | Autorizar la escritura | Dirección prefirmada de `PUT`, con la firma en la consulta |
 * | Dirección de lectura | Compuesta, sin firma: el depósito sirve lectura pública |
 * | Retirar objetos | `ListObjectsV2` por prefijo y un `DELETE` por clave |
 *
 * La credencial firma; **no viaja**. Lo que recibe el navegador es una dirección con una firma
 * dentro que sólo vale para esa clave, ese verbo y ese rato.
 *
 * ## Por qué la lectura no va firmada
 *
 * Porque la spec pide direcciones **estables**: se persisten en la fila del archivo y acaban
 * incrustadas en documentos generados y en enlaces repartidos. Una dirección firmada caduca, así
 * que un documento emitido hace un mes enseñaría un hueco. El depósito sirve lectura pública y el
 * secreto de lo que no debe verse no está en la dirección — es la misma decisión que ya tomó el
 * proveedor de hoy, no una nueva.
 *
 * ## Por qué un `DELETE` por clave y no el borrado en lote
 *
 * `DeleteObjects` mete las claves en un XML que hay que resumir y firmar aparte. Un archivo son
 * cinco objetos: cinco peticiones en paralelo cuestan lo mismo que una y ahorran el único trozo de
 * este módulo que tendría que **construir** un cuerpo firmado. Se cambia el día que haya que
 * retirar miles de una vez, que hoy no ocurre en ninguna vía.
 */

import { InternalError } from "@tfv/contracts"
import type { StorageProvider, WriteAuthorization } from "../provider.ts"
import {
  presignedUrl,
  type S3Credentials,
  signedRequestHeaders,
  withQuery,
} from "./s3-signature.ts"

export interface S3StorageConfig {
  readonly bucket: string
  readonly region: string
  readonly accessKeyId: string | undefined
  readonly secretAccessKey: string | undefined
  /**
   * Punto de acceso de un almacenamiento compatible, cuando no es AWS.
   *
   * Puesto, las direcciones van **con el depósito en el camino** —`{punto}/{depósito}/{clave}`—,
   * que es lo que entienden los compatibles. Sin él se usa la forma de AWS, con el depósito en el
   * nombre de máquina.
   */
  readonly endpoint: string | undefined
  /**
   * Raíz de las direcciones públicas de lectura, sin barra final.
   *
   * Se declara porque **no se puede deducir**: en AWS puede ser el depósito, una distribución de
   * CDN o un dominio propio, y en un compatible casi nunca coincide con el punto de escritura. Sin
   * ella se compone la de AWS, que es la única que sí se deduce.
   */
  readonly publicUrl: string | undefined
  readonly expiresInSeconds: number
}

/** Cuántas claves pide cada página del listado. El tope del protocolo es mil. */
const PAGE_SIZE = 1000

export function createS3Provider(config: S3StorageConfig): StorageProvider {
  function credentials(): S3Credentials {
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new InternalError(
        "No hay credencial de S3 configurada: ninguna subida se puede autorizar. " +
          "Faltan STORAGE_S3_ACCESS_KEY_ID y STORAGE_S3_SECRET_ACCESS_KEY.",
      )
    }
    return {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
    }
  }

  /** La raíz del depósito: con el depósito en el camino si hay punto propio, y si no en la máquina. */
  function bucketUrl(): string {
    if (config.endpoint) return `${config.endpoint.replace(/\/$/, "")}/${config.bucket}`
    return `https://${config.bucket}.s3.${config.region}.amazonaws.com`
  }

  function objectUrl(path: string): string {
    return `${bucketUrl()}/${path.replace(/^\//, "")}`
  }

  /**
   * Una página del listado por prefijo.
   *
   * Se pregunta qué hay en lugar de deducirlo: las extensiones de los cinco objetos de un archivo
   * no se pueden dar por sabidas, y de una subida interrumpida puede haber cualquier subconjunto.
   */
  async function listPage(
    prefix: string,
    token: string | undefined,
  ): Promise<{ keys: string[]; next: string | undefined }> {
    const query: (readonly [string, string])[] = [
      ["list-type", "2"],
      ["prefix", `${prefix}/`],
      ["max-keys", String(PAGE_SIZE)],
      ...(token === undefined ? [] : [["continuation-token", token] as const]),
    ]

    const url = bucketUrl()
    const response = await fetch(withQuery(url, query), {
      method: "GET",
      headers: signedRequestHeaders({ method: "GET", url, query, credentials: credentials() }),
    })

    // Un prefijo sin nada no es un fallo: es el caso normal del recolector de abandonadas.
    if (!response.ok) return { keys: [], next: undefined }

    const xml = await response.text()
    const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) =>
      unescapeXml(match[1] ?? ""),
    )

    const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/.test(xml)
    const next = truncated
      ? unescapeXml(
          /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "",
        )
      : ""

    return { keys, next: next === "" ? undefined : next }
  }

  function unescapeXml(value: string): string {
    return value
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'")
      .replaceAll("&amp;", "&")
  }

  async function objectsUnder(prefix: string): Promise<string[]> {
    const keys: string[] = []
    let token: string | undefined

    do {
      const page = await listPage(prefix, token)
      keys.push(...page.keys)
      token = page.next
      // Sin esta salida, un listado que se declarara truncado sin dar continuación giraría sin fin.
    } while (token !== undefined)

    return keys
  }

  return {
    name: "s3",

    authorizeWrite(path: string, contentType: string): Promise<WriteAuthorization> {
      const expiresAt = new Date(Date.now() + config.expiresInSeconds * 1000).toISOString()

      return Promise.resolve({
        url: presignedUrl({
          method: "PUT",
          url: objectUrl(path),
          credentials: credentials(),
          expiresInSeconds: config.expiresInSeconds,
        }),
        method: "PUT",
        // Se firma sólo `host`, así que declarar el tipo no invalida la firma — y sin declararlo el
        // objeto se guardaría como binario y el navegador se lo descargaría en vez de pintarlo.
        headers: { "Content-Type": contentType },
        expiresAt,
      })
    },

    publicUrl(path: string): string {
      const base = config.publicUrl?.replace(/\/$/, "")
      if (base) return `${base}/${path.replace(/^\//, "")}`
      return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${path.replace(/^\//, "")}`
    },

    async removeObjects(prefixes: readonly string[]): Promise<void> {
      if (prefixes.length === 0) return

      const keys = (await Promise.all(prefixes.map(objectsUnder))).flat()
      if (keys.length === 0) return

      await Promise.all(
        keys.map(async (key) => {
          const url = objectUrl(key)
          await fetch(url, {
            method: "DELETE",
            headers: signedRequestHeaders({
              method: "DELETE",
              url,
              query: [],
              credentials: credentials(),
            }),
          })
        }),
      )
    },
  }
}
