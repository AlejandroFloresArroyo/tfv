/**
 * Firma de peticiones a S3, versión 4.
 *
 * ## Por qué a mano y no con el cliente oficial
 *
 * De todo lo que hace `@aws-sdk/client-s3` aquí se usan tres cosas: una dirección prefirmada para
 * un `PUT`, un listado por prefijo y un borrado por clave. El paquete —con su cadena de
 * proveedores de credenciales, su reintentador, sus middlewares y su analizador de XML— pesa
 * varios megabytes instalados y añade una superficie de actualización permanente a cambio de
 * ahorrar las ciento y pico líneas de aquí abajo, que son **aritmética con vectores de prueba
 * publicados**: no envejecen, porque el protocolo está congelado desde 2012.
 *
 * El intercambio se invierte el día que haga falta subida multiparte, credenciales temporales por
 * rol o reintento con reloj del servidor. Ninguna de las tres hace falta: los bytes no pasan por el
 * servicio —los escribe el navegador con la dirección prefirmada— y por eso este módulo no necesita
 * saber transferir nada.
 *
 * ## Lo que está fijado por vectores publicados
 *
 * `s3-signature.test.ts` comprueba las dos mitades contra los ejemplos de la documentación de AWS:
 * el resumen de la petición canónica del ejemplo de `GET Object` prefirmado, y la derivación de la
 * clave de firma. Lo demás es componerlas. La comprobación de que el resultado **sirve** la hace la
 * prueba de contrato, escribiendo contra un almacenamiento de verdad.
 */

import { createHash, createHmac } from "node:crypto"

export const ALGORITHM = "AWS4-HMAC-SHA256"
const SERVICE = "s3"
const TERMINATOR = "aws4_request"

/**
 * Carga sin resumir.
 *
 * Quien escribe es el navegador, y el resumen de lo que va a escribir no se conoce al firmar. Con
 * la firma en la consulta, S3 admite declararlo así; a cambio, la firma acota **la clave y el
 * verbo**, que es exactamente lo que la spec pide de una autorización de escritura.
 */
export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD"

/** Resumen de una carga vacía, que es la de un `GET` y la de un `DELETE`. */
export const EMPTY_PAYLOAD_HASH = createHash("sha256").update("").digest("hex")

export interface S3Credentials {
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly region: string
}

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex")

const hmac = (key: string | Uint8Array, value: string): Buffer =>
  createHmac("sha256", key).update(value).digest()

/**
 * Codificación RFC 3986.
 *
 * `encodeURIComponent` deja sin codificar siete caracteres que la norma sí codifica. Se ven poco y
 * se notan mucho: un nombre con un apóstrofo firmaría distinto de como se pide, y el fallo llega
 * como «la firma no coincide» sin decir por cuál de los dos caracteres.
 */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** El camino, codificado segmento a segmento: las barras separan y no se codifican. */
function canonicalUri(pathname: string): string {
  return pathname.split("/").map(encodeRfc3986).join("/")
}

/** Los parámetros, codificados y **ordenados por su forma codificada**, que es la que se firma. */
function canonicalQuery(query: readonly (readonly [string, string])[]): string {
  return query
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")
}

/** `20260819T063209Z` y `20260819`. Sin guiones ni dos puntos, que es como se firma. */
export function amzDate(now: Date): { readonly stamp: string; readonly day: string } {
  const stamp = `${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`
  return { stamp, day: stamp.slice(0, 8) }
}

/**
 * La petición canónica: lo que de verdad se firma.
 *
 * Es donde se equivocan todas las implementaciones —el orden, la codificación, el salto de línea
 * que va detrás de las cabeceras— y por eso es lo que la prueba fija contra el vector publicado.
 */
export function canonicalRequest(request: {
  readonly method: string
  readonly pathname: string
  readonly query: readonly (readonly [string, string])[]
  readonly headers: Readonly<Record<string, string>>
  readonly payloadHash: string
}): string {
  const names = Object.keys(request.headers)
    .map((name) => name.toLowerCase())
    .sort()

  const headers = names.map((name) => `${name}:${(request.headers[name] ?? "").trim()}\n`).join("")

  return [
    request.method,
    canonicalUri(request.pathname),
    canonicalQuery(request.query),
    headers,
    names.join(";"),
    request.payloadHash,
  ].join("\n")
}

/**
 * La clave de firma: cuatro `HMAC` encadenados desde el secreto.
 *
 * Depende del día, de la región y del servicio, de modo que una clave derivada sirve para un día en
 * una región y nada más. Es la propiedad por la que la firma se puede calcular donde haga falta sin
 * que el secreto viaje.
 *
 * El servicio es un argumento y no una constante **para poder comprobarla**: el vector publicado
 * por AWS deriva la clave para `iam`, y una prueba que sólo pudiera pedir `s3` estaría comparando
 * esta función consigo misma.
 */
export function signingKey(
  secretAccessKey: string,
  day: string,
  region: string,
  service: string = SERVICE,
): Buffer {
  const date = hmac(`AWS4${secretAccessKey}`, day)
  const scoped = hmac(date, region)
  const scopedToService = hmac(scoped, service)
  return hmac(scopedToService, TERMINATOR)
}

function credentialScope(day: string, region: string): string {
  return `${day}/${region}/${SERVICE}/${TERMINATOR}`
}

function sign(canonical: string, stamp: string, day: string, credentials: S3Credentials): string {
  const toSign = [
    ALGORITHM,
    stamp,
    credentialScope(day, credentials.region),
    sha256(canonical),
  ].join("\n")

  return createHmac("sha256", signingKey(credentials.secretAccessKey, day, credentials.region))
    .update(toSign)
    .digest("hex")
}

/**
 * Una dirección con la firma dentro, que sirve **para ese objeto y ese verbo** hasta que caduca.
 *
 * Es la forma que puede viajar al navegador: no lleva la credencial, lleva una firma de ella. Se
 * firma sólo `host`, así que las cabeceras que el navegador añada por su cuenta —el tipo de
 * contenido, entre otras— no invalidan nada.
 */
export function presignedUrl(options: {
  readonly method: string
  readonly url: string
  readonly credentials: S3Credentials
  readonly expiresInSeconds: number
  readonly now?: Date
}): string {
  const url = new URL(options.url)
  const { stamp, day } = amzDate(options.now ?? new Date())

  const query: (readonly [string, string])[] = [
    ["X-Amz-Algorithm", ALGORITHM],
    [
      "X-Amz-Credential",
      `${options.credentials.accessKeyId}/${credentialScope(day, options.credentials.region)}`,
    ],
    ["X-Amz-Date", stamp],
    ["X-Amz-Expires", String(options.expiresInSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ]

  const canonical = canonicalRequest({
    method: options.method,
    pathname: url.pathname,
    query,
    headers: { host: url.host },
    payloadHash: UNSIGNED_PAYLOAD,
  })

  const signature = sign(canonical, stamp, day, options.credentials)

  return `${url.origin}${canonicalUri(url.pathname)}?${canonicalQuery(query)}&X-Amz-Signature=${signature}`
}

/**
 * Las cabeceras de una petición firmada, para lo que hace **el servicio** y no el navegador.
 *
 * Listar y borrar los hace la API con su credencial, así que aquí la firma va en la cabecera:
 * dejarla en la dirección no aporta nada y la deja escrita en cualquier registro de acceso.
 */
export function signedRequestHeaders(options: {
  readonly method: string
  readonly url: string
  readonly query: readonly (readonly [string, string])[]
  readonly credentials: S3Credentials
  readonly payloadHash?: string
  readonly now?: Date
}): Record<string, string> {
  const url = new URL(options.url)
  const { stamp, day } = amzDate(options.now ?? new Date())
  const payloadHash = options.payloadHash ?? EMPTY_PAYLOAD_HASH

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp,
  }

  const canonical = canonicalRequest({
    method: options.method,
    pathname: url.pathname,
    query: options.query,
    headers,
    payloadHash,
  })

  const signature = sign(canonical, stamp, day, options.credentials)
  const signedHeaders = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort()
    .join(";")

  return {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp,
    Authorization:
      `${ALGORITHM} ` +
      `Credential=${options.credentials.accessKeyId}/${credentialScope(day, options.credentials.region)}, ` +
      `SignedHeaders=${signedHeaders}, ` +
      `Signature=${signature}`,
  }
}

/** La dirección con sus parámetros, tal y como se firmaron. */
export function withQuery(url: string, query: readonly (readonly [string, string])[]): string {
  const canonical = canonicalQuery(query)
  return canonical === "" ? url : `${url}?${canonical}`
}
