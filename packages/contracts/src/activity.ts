/**
 * Qué dice un asiento de bitácora, y a qué pantalla lleva.
 *
 * Ver `openspec/specs/activity-and-notifications/spec.md` y la rebanada 09.
 *
 * ## Se guarda una clave, no una frase
 *
 * El asiento guardaba prosa —«Editó los datos de la empresa»— y el aviso se redactaba al escribirlo,
 * pegando el nombre de quien actuó delante de esa frase con la primera letra en minúscula. Eso hacía
 * de la bitácora y la bandeja las dos únicas pantallas del sistema que no cambian de idioma
 * (`HALLAZGOS.md` H-153, y es H-67 repetido), y además la concatenación no sobrevive a la
 * traducción: «Ana creó la empresa» se compone bajando la primera letra, «Ana created the company»
 * no — el verbo cambia de sitio y de forma.
 *
 * Así que lo que se guarda es **una clave del catálogo de abajo y sus parámetros**, y la frase la
 * arma quien la enseña, con el idioma de quien la lee delante. El catálogo vive aquí y no en cada
 * lado porque el servidor lo **escribe** y el navegador lo **lee**: con dos copias, el día que una
 * cambie el asiento guarda una clave que la pantalla no sabe traducir, y el usuario ve la clave
 * cruda en mitad de la bitácora.
 *
 * ## Y la referencia navegable sale de una sola función
 *
 * `activityTarget` es la única traducción de entidad a pantalla. Escrita a mano en cada llamada
 * daba tres direcciones que no existían —`/{companyId}`, `/{companyId}/miembros`— y por tanto una
 * bandeja donde pulsar cualquier aviso caía en un `404` (H-154). Aquí es una función pura, con sus
 * pruebas, y `web` comprueba además que cada destino resuelve contra su árbol de rutas.
 */

/**
 * El catálogo cerrado de mensajes, con los parámetros que cada uno pide.
 *
 * `[]` no es un descuido: son los mensajes cuyo único dato variable ya viaja aparte —quién lo hizo,
 * y sobre qué entidad—, así que la frase no necesita nada más.
 *
 * Toda clave se lee `<dominio>.<hecho>`. Añadir una obliga a traducirla en los dos idiomas: hay una
 * prueba que lo comprueba, y sin ella la pantalla enseñaría la clave.
 */
export const ACTIVITY_MESSAGES = {
  "company.created": [],
  "company.updated": [],
  "company.deleted": [],
  "member.invited": ["email"],
  "member.changed": ["email"],
  "member.removed": ["email"],
  /** No nace de una mutación de nadie: lo escribe la verificación periódica de existencias. */
  "stock.incoherent": ["count"],
} as const satisfies Record<string, readonly string[]>

export type ActivityMessageKey = keyof typeof ACTIVITY_MESSAGES

/** Los parámetros que una clave concreta exige, para que falten en tiempo de compilación. */
export type ActivityMessageParams<K extends ActivityMessageKey> = {
  readonly [P in (typeof ACTIVITY_MESSAGES)[K][number]]: string | number
}

/**
 * Una clave con exactamente los parámetros que declara.
 *
 * La unión por clave es lo que hace que `{ key: "member.invited", params: {} }` no compile. Con un
 * `Record<string, unknown>` suelto, olvidarse del correo sería un aviso que dice «incorporó a » y
 * nadie lo sabría hasta verlo en pantalla.
 */
export type ActivityMessage = {
  [K in ActivityMessageKey]: { readonly key: K; readonly params: ActivityMessageParams<K> }
}[ActivityMessageKey]

export function isActivityMessageKey(value: unknown): value is ActivityMessageKey {
  return typeof value === "string" && value in ACTIVITY_MESSAGES
}

// ─── La referencia navegable ─────────────────────────────────────────────────

export interface ActivityTarget {
  readonly companyId: string
  /** La tabla afectada, tal y como la guarda el asiento. */
  readonly entity: string
  readonly entityId?: string | null | undefined
}

/**
 * Dónde vive el panel de una empresa. Todo destino cuelga de aquí.
 *
 * Es la raíz que faltaba: los asientos guardaban `/{companyId}` a secas, que no es ninguna pantalla.
 */
function panelOf(companyId: string): string {
  return `/c/${companyId}`
}

/**
 * De entidad a pantalla.
 *
 * Sólo están las entidades que hoy dejan asiento. Lo que no esté cae al panel de la empresa **a
 * propósito**: es una pantalla que existe siempre y desde la que se llega a todo. Inventar la
 * dirección probable de una entidad sin pantalla devolvería otra vez un `404`, que es el defecto
 * que esta función existe para no repetir.
 *
 * Sin identificador tampoco se adivina: interpolar `undefined` en el camino es lo que respondía
 * `500` hasta H-144.
 */
export function activityTarget(target: ActivityTarget): string {
  const panel = panelOf(target.companyId)
  const id = target.entityId ?? null

  switch (target.entity) {
    case "companies":
      return panel
    case "company_members":
      return `${panel}/settings/members`
    case "warehouses":
      return id ? `${panel}/warehouses/${id}` : panel
    default:
      return panel
  }
}

/**
 * El nombre de la pestaña a la que pertenece un aviso.
 *
 * «Si ya estaba abierta en otra pestaña, se enfoca esa.» Enfocar es cosa del navegador y no se
 * prueba con una función pura; lo que sí es decisión nuestra —y lo único que hay que acertar— es
 * **qué pestaña es la misma pestaña**. Dos avisos de la misma entidad comparten nombre, y el
 * navegador reutiliza y enfoca la que ya tenga ese nombre en lugar de abrir otra.
 *
 * Un nombre de ventana no admite espacios ni comillas, así que se aplana. La barra se traduce a un
 * separador distinto del que puede aparecer dentro de un segmento: si las dos fueran `-`, `/c/a/b`
 * y `/c/a-b` acabarían siendo la misma pestaña.
 */
export function noticeWindowName(url: string): string {
  const plano = url
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[^A-Za-z0-9]+/g, "-"))
    .join("_")

  return `tfv_${plano || "panel"}`
}
