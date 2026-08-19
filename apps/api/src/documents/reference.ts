/**
 * La referencia de un enlace público.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`, requisito «Enlace público de sólo lectura», y
 * `openspec/changes/add-tenant-scoping/tasks.md`, que ya dejaba escrito lo que sigue: «los enlaces
 * compartidos no tienen identidad que propagar, así que no se resuelven con políticas sino en la
 * capa de aplicación».
 *
 * ## Qué es la referencia
 *
 * Un sobre **firmado** con lo que hace falta para localizar el documento: qué familia, de qué
 * empresa, de qué ámbito dentro de ella —el almacén, mañana la producción o la tienda— y cuál.
 * Nada más: no lleva permisos, ni caducidad, ni identidad de quien la abre.
 *
 * La firma es lo que la hace **impredecible y no enumerable**, que es lo que la spec exige. Sin
 * ella, quien conociera un identificador tendría el documento; con ella, alterar un solo carácter
 * produce un sobre que no verifica y la respuesta es `404`.
 *
 * ## Por qué no se guarda en la base
 *
 * Una columna nueva es una migración, y una tabla de enlaces es una tabla que alguien tiene que
 * limpiar. La firma da la misma propiedad —imposible de adivinar— sin estado que mantener, y
 * **hace estable el enlace**: el mismo documento produce siempre la misma referencia, de modo que
 * el enlace que se le mandó al cliente hace un mes sigue sirviendo.
 *
 * La contrapartida, y conviene decirla en voz alta: **no se puede revocar un enlace suelto**. Sólo
 * rotar el secreto, que los invalida todos. La spec no pide revocación; el día que la pida, esto
 * necesita una tabla y este comentario es la explicación de por qué no la tenía.
 *
 * ## El sobre, byte a byte
 *
 * ```
 * [0]        familia de documento
 * [1..49)    empresa · ámbito · documento, 16 bytes cada uno
 * [49..65)   firma HMAC-SHA256 truncada
 * ```
 *
 * Va en binario y no como JSON porque el enlace se copia y se pega a mano: 87 caracteres frente a
 * los casi doscientos que costaría el texto.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { DocumentKind } from "@tfv/contracts"
import { env, isProduction } from "../env.ts"

/**
 * El mismo mensaje para todos los caminos de fallo del enlace público.
 *
 * «No existe» y «existe pero tu enlace está mal» son la misma respuesta a propósito: la diferencia
 * le diría a quien prueba a ciegas que hay algo detrás de la puerta que acaba de tocar.
 */
export const DOCUMENT_NOT_FOUND = "El documento no existe"

/** A qué documento apunta una referencia. */
export interface DocumentReference {
  readonly kind: DocumentKind
  readonly companyId: string
  /** El ámbito dentro de la empresa: hoy el almacén; mañana la producción o la tienda. */
  readonly scopeId: string
  readonly documentId: string
}

/**
 * El código de familia que viaja en el sobre.
 *
 * Explícito y no derivado del orden del catálogo: reordenar una lista no puede invalidar los
 * enlaces que ya están en el correo de alguien.
 */
const KIND_CODE: Record<DocumentKind, number> = {
  quote: 1,
  "delivery-note": 2,
  budget: 3,
  "work-plan": 4,
  "sale-receipt": 5,
  "assembly-guide": 6,
}

const KIND_OF = new Map<number, DocumentKind>(
  Object.entries(KIND_CODE).map(([kind, code]) => [code, kind as DocumentKind]),
)

const ID_BYTES = 16
const PAYLOAD_BYTES = 1 + ID_BYTES * 3
const SIGNATURE_BYTES = 16
const REFERENCE_BYTES = PAYLOAD_BYTES + SIGNATURE_BYTES

/**
 * El secreto con el que se firman los enlaces.
 *
 * En producción es **obligatorio** y el servicio no arranca sin él. Fuera de producción, cuando
 * falta, se genera uno al azar por proceso: los enlaces funcionan mientras el servicio viva y dejan
 * de valer al reiniciarlo. Es incómodo a propósito, y es lo contrario de un valor por defecto — un
 * secreto con valor por defecto es un secreto público (`DEFECTS.md` S-13).
 */
const secret = env.DOCUMENTS_LINK_SECRET
  ? Buffer.from(env.DOCUMENTS_LINK_SECRET, "utf8")
  : ephemeralSecret()

function ephemeralSecret(): Buffer {
  if (isProduction) {
    // La configuración ya lo exige en producción; esto es el cinturón del tirante.
    throw new Error("DOCUMENTS_LINK_SECRET es obligatorio en producción")
  }
  return randomBytes(32)
}

function idToBytes(id: string): Buffer {
  return Buffer.from(id.replaceAll("-", ""), "hex")
}

function bytesToId(bytes: Buffer): string {
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function sign(payload: Buffer): Buffer {
  return createHmac("sha256", secret).update(payload).digest().subarray(0, SIGNATURE_BYTES)
}

/** Firma la referencia de un documento. El resultado es estable para el mismo documento. */
export function signReference(reference: DocumentReference): string {
  const payload = Buffer.concat([
    Buffer.of(KIND_CODE[reference.kind]),
    idToBytes(reference.companyId),
    idToBytes(reference.scopeId),
    idToBytes(reference.documentId),
  ])

  if (payload.length !== PAYLOAD_BYTES) {
    throw new Error("La referencia de un documento se compone de tres identificadores")
  }

  return Buffer.concat([payload, sign(payload)]).toString("base64url")
}

/**
 * Abre el sobre, o devuelve nulo.
 *
 * Nulo y no una excepción: quien llama responde `404` en los cuatro casos —referencia inventada,
 * truncada, alterada o firmada con otro secreto— y **la respuesta no distingue entre ellos**.
 * Distinguirlos le diría a quien prueba a ciegas cuál de sus intentos iba por buen camino.
 */
export function verifyReference(raw: string): DocumentReference | null {
  // Sin esto, una referencia con caracteres ajenos al alfabeto los descartaría en silencio y
  // acabaría verificando otra cosa distinta de la que se recibió.
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null

  const envelope = Buffer.from(raw, "base64url")
  if (envelope.length !== REFERENCE_BYTES) return null

  const payload = envelope.subarray(0, PAYLOAD_BYTES)
  const signature = envelope.subarray(PAYLOAD_BYTES)

  // Comparación de tiempo constante: `equals` termina en el primer byte distinto, y esa diferencia
  // se puede medir. Es la misma razón por la que la firma de los eventos de cobro se compara así.
  if (!timingSafeEqual(signature, sign(payload))) return null

  const kind = KIND_OF.get(payload[0] as number)
  if (!kind) return null

  return {
    kind,
    companyId: bytesToId(payload.subarray(1, 1 + ID_BYTES)),
    scopeId: bytesToId(payload.subarray(1 + ID_BYTES, 1 + ID_BYTES * 2)),
    documentId: bytesToId(payload.subarray(1 + ID_BYTES * 2)),
  }
}
