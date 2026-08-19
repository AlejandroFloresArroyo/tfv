/**
 * Campos calculados.
 *
 * Ver `openspec/specs/computed-fields/spec.md`.
 *
 * ## Por qué existe este módulo
 *
 * Un conjunto de campos de este sistema **no se almacenan: se derivan**. En la implementación
 * anterior eran campos virtuales del modelo de datos, siempre presentes en toda lectura. Al cambiar
 * de motor desaparecen de forma automática, y el riesgo real —el que la spec nombra— es que **cada
 * endpoint los vuelva a derivar por su cuenta y con criterios distintos**: la disponibilidad que ve
 * la tienda pública dejaría de ser la que comprueba la reserva, y el efectivo esperado en caja
 * dejaría de cuadrar con lo que se le pide al cajero al cerrar el turno.
 *
 * Aquí están las fórmulas, **una sola vez y sin acceso a datos**. Son funciones puras por el mismo
 * motivo que el cálculo de dinero: servidor y navegador tienen que usar exactamente la misma, y una
 * función que consulta no se puede llamar desde los dos lados.
 *
 * ## Lo que este módulo no hace
 *
 * No lee. Cada superficie trae sus filas —o sus agregados, si el motor los calculó mejor— y aplica
 * la fórmula. Eso deja fuera a propósito la parte cara: **qué** consulta hace falta para juntar las
 * unidades de una medida es decisión de quien la sirve, y meterla aquí ataría los contratos a la
 * forma del esquema.
 */

import { add, type Money, money, type Percent, applyPercent, percent, ZERO } from "./money.ts"

// ─── Recuentos ───────────────────────────────────────────────────────────────

/**
 * Recuento de elementos relacionados.
 *
 * «SHALL ser `0`, nunca nulo ni ausente, cuando no haya elementos». Suena obvio hasta que se mira
 * de dónde vienen estos números: un `left join` sin filas devuelve nulo, y el `count()` de algunos
 * controladores llega como cadena. Los dos casos acaban en la respuesta como `null` o como `NaN` si
 * nadie los normaliza, y la interfaz pinta «—» donde debería poner «0».
 */
export function countOf(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (Array.isArray(value)) return value.length

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Existencia de una definición de inventario de Pixit.
 *
 * **Suma las cantidades de sus movimientos, no cuenta los movimientos.** La spec lo dice con un
 * escenario propio —una entrada de `10` y una salida de `-3` dan `7`, no `2`— porque es el error
 * que se comete: el campo se llama «existencias» y la consulta natural es `count(*)`.
 */
export function inventoryBalance(movements: readonly { quantity: number }[]): number {
  return movements.reduce((total, movement) => total + movement.quantity, 0)
}

// ─── Histogramas ─────────────────────────────────────────────────────────────

/**
 * Desglose por estado, con **todos** los estados presentes.
 *
 * Los estados vacíos van con valor cero y no ausentes. Es lo que permite que quien lo consume no
 * tenga que saber qué estados existen: recorrer las claves del desglose es recorrer la tabla de
 * estados. Con los vacíos ausentes, cada pantalla acabaría con su propia lista de estados escrita a
 * mano, y quedaría desfasada el día que se añada uno.
 *
 * Un valor que no esté en la tabla **no crea clave**: el desglose es de forma fija, y un estado
 * inesperado del motor no debe cambiarle la forma a la respuesta.
 */
export function histogram<S extends string>(
  states: readonly S[],
  rows: readonly { status: string }[],
): Record<S, number> {
  const breakdown = Object.fromEntries(states.map((state) => [state, 0])) as Record<S, number>

  for (const row of rows) {
    if (row.status in breakdown) breakdown[row.status as S] += 1
  }

  return breakdown
}

/**
 * Los once estados en los que puede estar una unidad física.
 *
 * Este desglose es **la primitiva de disponibilidad de toda la plataforma**: la venta pública, la
 * reserva por cotización y la aceptación de pedidos lo consultan para decidir si hay existencia. Por
 * eso la lista vive aquí y no en cada consumidor.
 */
export const STOCK_STATUSES = [
  "available",
  "in_quote",
  "in_order",
  "rented",
  "sold",
  "lost",
  "damaged",
  "robbed",
  "incomplete",
  "modified",
  "expense",
] as const

export type StockStatus = (typeof STOCK_STATUSES)[number]

/** Desglose de existencias de una medida de producto. */
export function stockBreakdown(
  units: readonly { status: string }[],
): Record<StockStatus, number> {
  return histogram(STOCK_STATUSES, units)
}

/** Estados de una tarea de plan de trabajo. */
export const TASK_STATUSES = ["pending", "in_progress", "completed", "incomplete"] as const

/** Estados de una actividad de tarea. */
export const ACTIVITY_STATUSES = ["incomplete", "completed"] as const

// ─── Agregados monetarios ────────────────────────────────────────────────────

/**
 * Total de una sesión de caja: la suma de los totales de sus ventas de mostrador.
 *
 * Se suma con la aritmética exacta de `money.ts`, no con coma flotante. Es la misma regla que rige
 * el resto del sistema y aquí importa el doble: este número se contrasta contra un conteo físico.
 */
export function salesTotal(sales: readonly { total: string }[]): Money {
  return sales.reduce((total, sale) => add(total, money(sale.total)), ZERO)
}

/**
 * Efectivo que debería haber al cerrar una sesión de caja.
 *
 * ```
 * efectivo esperado = fondo inicial + Σ (total − cambio)   sólo de las ventas cobradas en efectivo
 * ```
 *
 * Las cobradas por cualquier otro medio quedan fuera. **Un error aquí se traduce en un descuadre
 * atribuido al cajero**, que es la razón por la que la spec transcribe la fórmula en lugar de
 * describirla: incluir las ventas con tarjeta parece razonable —también son ventas— y deja a quien
 * cierra el turno debiendo un dinero que nunca pasó por el cajón.
 */
export function cashExpected(
  openingFloat: Money,
  sales: readonly { method: string; total: string; change: string | null }[],
): Money {
  return sales
    .filter((sale) => sale.method === "cash")
    .reduce((total, sale) => {
      const received = money(sale.total)
      const change = sale.change === null ? ZERO : money(sale.change)
      return add(total, (received - change) as Money)
    }, openingFloat)
}

/**
 * Precio final de un producto con descuento.
 *
 * ```
 * precio final = precio − round(precio × descuento ÷ 100, 2)   si el descuento está activo
 * precio final = precio                                        en caso contrario
 * ```
 *
 * El redondeo va **sobre el descuento**, antes de restarlo, y no sobre el resultado: son dos
 * fórmulas distintas que difieren en un centavo con la frecuencia suficiente para que alguien lo
 * note. `applyPercent` redondea así.
 */
export function discountedPrice(
  price: Money,
  discountPercent: string | Percent | null,
  active: boolean,
): Money {
  if (!active || discountPercent === null) return price

  const rate = typeof discountPercent === "string" ? percent(discountPercent) : discountPercent
  return (price - applyPercent(price, rate)) as Money
}

// ─── Identidad derivada ──────────────────────────────────────────────────────

/**
 * Nombre completo: nombre y apellido separados por un espacio.
 *
 * «SHALL quedar sin espacios sobrantes cuando alguna de las partes falte». No es cosmética: el
 * nombre completo es lo que se busca, lo que se ordena y lo que se imprime en un documento
 * comercial, y `"Ana "` no ordena ni se busca igual que `"Ana"`.
 */
export function fullName(first: string | null, last: string | null): string {
  return [first, last]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ")
}

/**
 * Teléfono completo: código de país y número, **sin separador**.
 *
 * Sin número no hay teléfono, aunque haya código de país: `"+52"` no es un teléfono al que se pueda
 * llamar.
 */
export function fullPhone(countryCode: string | null, number: string | null): string {
  const digits = number?.trim() ?? ""
  if (digits === "") return ""

  return `${countryCode?.trim() ?? ""}${digits}`
}

/**
 * Etiqueta compuesta de una escena.
 *
 * Identifica la escena **dentro de la producción completa** y no sólo dentro de su capítulo: la
 * escena 4 del capítulo 2 y la escena 4 del capítulo 3 son escenas distintas, y en un plan de
 * trabajo aparecen juntas.
 */
export function sceneLabel(chapterIndex: number, sceneIndex: number): string {
  return `${chapterIndex}.${sceneIndex}`
}

// ─── Tablas fijas ────────────────────────────────────────────────────────────

/**
 * Profundidad de cada tipo de ubicación, **de mayor a menor**: de piso a contenedor.
 *
 * Deriva del **tipo**, no de la posición en el árbol. Es lo que permite validar que un nodo no se
 * anide bajo otro de tipo igual o más específico: un estante no cuelga de una caja, y dos estantes
 * no se anidan entre sí, con independencia de a qué altura del árbol estén.
 */
const STORAGE_DEPTH = {
  floor: 0,
  area: 1,
  aisle: 2,
  section: 3,
  bay: 4,
  rack: 5,
  shelf: 6,
  pallet: 7,
  box: 8,
  bin: 9,
} as const

export type StorageKind = keyof typeof STORAGE_DEPTH

export function storageDepth(kind: StorageKind): number {
  return STORAGE_DEPTH[kind]
}

/**
 * Una nota de entrega está finalizada cuando su estado es «completada».
 *
 * Derivado del estado y **no almacenado por separado**: dos fuentes para el mismo hecho divergen en
 * cuanto alguien actualice una y olvide la otra.
 */
export function deliveryIsFinished(status: string): boolean {
  return status === "completed"
}

// ─── Selección ───────────────────────────────────────────────────────────────

/**
 * El único elemento marcado como primario, o nulo.
 *
 * Devuelve nulo y no `undefined` porque lo que sale al transporte es un campo con valor nulo, no un
 * campo ausente: la spec lo pide explícito.
 */
export function primaryOf<T extends { isPrimary: boolean }>(items: readonly T[]): T | null {
  return items.find((item) => item.isPrimary) ?? null
}

/**
 * Un elemento, no una lista.
 *
 * El pago de una cotización es un `has one` que el motor devuelve como colección de cero o un
 * elemento. Exponerlo como lista obligaría a cada consumidor a hacer este mismo `[0]`, y el día que
 * hubiera dos filas —que es un defecto, no un caso— cada uno elegiría una distinta.
 */
export function singleOf<T>(items: readonly T[]): T | null {
  return items[0] ?? null
}

/** Una personalización de sitio, tal y como esta fórmula necesita verla. */
export interface Customization {
  readonly isPrimary: boolean
  readonly startsAt: Date | null
  readonly endsAt: Date | null
}

/**
 * La única personalización que debe renderizarse ahora.
 *
 * 1. Si alguna programada tiene una ventana que incluye el instante actual, se elige esa.
 * 2. En caso contrario, la marcada como primaria.
 * 3. Si no hay ninguna, nulo.
 *
 * **El desempate es lo que la spec exige y no dice cuál es.** Cuando dos campañas solapan, gana la
 * que empieza más tarde: es la más específica —una promoción de fin de semana dentro de la campaña
 * de diciembre—, y sobre todo el resultado deja de depender del orden en que el motor devolvió las
 * filas. Sin desempate declarado, dos peticiones seguidas pueden pintar temas distintos.
 *
 * Una ventana abierta por un lado sigue siendo una ventana: sin inicio es «desde siempre», sin fin
 * es «para siempre».
 */
export function activeCustomization<T extends Customization>(
  customizations: readonly T[],
  now: Date,
): T | null {
  const current = customizations
    .filter((item) => !item.isPrimary && includes(item, now))
    .sort(byMostSpecific)

  return current[0] ?? customizations.find((item) => item.isPrimary) ?? null
}

function includes(window: Customization, moment: Date): boolean {
  if (window.startsAt === null && window.endsAt === null) return false
  if (window.startsAt !== null && moment < window.startsAt) return false
  if (window.endsAt !== null && moment > window.endsAt) return false

  return true
}

/** La que empieza más tarde primero; a igual inicio, la que termina antes. */
function byMostSpecific(a: Customization, b: Customization): number {
  const start = (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0)
  if (start !== 0) return start

  return (a.endsAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
    (b.endsAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
}

// ─── Sitio ───────────────────────────────────────────────────────────────────

/** Lo que hace falta de un sitio para derivar dónde se sirve. */
export interface SiteIdentity {
  readonly slug: string | null
  readonly id: string
}

/**
 * Subdominio en el que se sirve un sitio.
 *
 * ```
 * subdominio = <identificador legible, o el identificador si no tiene> + "." + <dominio de sitios>
 * ```
 *
 * El dominio de la plataforma es **de la instalación**, no del sitio: cambia entre desarrollo, la
 * máquina de alguien y producción. Guardarlo junto a cada sitio dejaría mil filas apuntando a un
 * dominio que ya no existe el día que se mueva.
 */
export function siteSubdomain(site: SiteIdentity, sitesDomain: string): string {
  return `${site.slug ?? site.id}.${sitesDomain}`
}

/**
 * Dirección completa de un sitio.
 *
 * «El esquema SHALL ser seguro en entornos productivos». Fuera de producción no lo es, y hace falta
 * que no lo sea: en local no hay certificado para `tienda.localhost:3000`.
 */
export function siteAddress(
  site: SiteIdentity,
  sitesDomain: string,
  secure: boolean,
): string {
  return `${secure ? "https" : "http"}://${siteSubdomain(site, sitesDomain)}`
}

// ─── Presencia declarada ─────────────────────────────────────────────────────

/**
 * Cuándo se incluye un campo calculado.
 *
 * «Los campos costosos —los que agregan sobre colecciones grandes— SHOULD ser opcionales y omitirse
 * por defecto en las lecturas de colección». La distinción no es de estilo: el escenario de la spec
 * pide que, sin solicitarlos, **la consulta no recorra las tareas de cada plan**. Un campo marcado
 * `ON_REQUEST` es una promesa sobre lo que la consulta hace, no sólo sobre lo que la respuesta trae.
 */
export const ALWAYS = "always" as const
export const ON_REQUEST = "on_request" as const

export type Presence = typeof ALWAYS | typeof ON_REQUEST

/**
 * Qué campo calculado lleva cada recurso, y si va siempre o sólo cuando se pide.
 *
 * Está aquí, en un solo sitio, por la misma razón que las fórmulas: la spec exige que **cada
 * recurso declare** qué incluye, y una declaración repartida por veinte manejadores no se puede
 * leer entera ni comprobar.
 *
 * Los recursos cuyos dominios aún no existen figuran igualmente: la declaración es el contrato que
 * tendrán que cumplir, y tenerla escrita antes es lo que evita que cada uno la invente al llegar.
 */
export const COMPUTED_FIELDS = {
  user: { fullName: ALWAYS, fullPhone: ALWAYS },
  company: { memberCount: ALWAYS, primaryAddress: ALWAYS },
  warehouseMeasurement: { stockCount: ALWAYS, stockBreakdown: ALWAYS },
  warehouseStorage: { depth: ALWAYS },
  warehouseOrder: { unreadCount: ALWAYS },
  warehouseQuoteLine: { unitCount: ALWAYS },
  warehouseQuote: { payment: ALWAYS },
  productionChapter: { sceneCount: ALWAYS },
  productionScene: { chapterIndex: ALWAYS, label: ALWAYS, workflowCount: ALWAYS },
  productionWorkflow: { taskCount: ALWAYS, taskBreakdown: ON_REQUEST },
  productionTask: { activityCount: ALWAYS, activityBreakdown: ON_REQUEST },
  productionPurchaseOrder: { orderCount: ALWAYS },
  productionDelivery: { isFinished: ALWAYS },
  pixitInventoryDefinition: { stock: ALWAYS },
  pixitCashSession: { salesTotal: ON_REQUEST, expectedCash: ON_REQUEST },
  pixitProduct: { finalPrice: ALWAYS },
  website: { subdomain: ALWAYS, address: ALWAYS, activeCustomization: ALWAYS },
} as const satisfies Record<string, Record<string, Presence>>

export type ComputedResource = keyof typeof COMPUTED_FIELDS

/**
 * ¿Este campo va siempre en la respuesta?
 *
 * Preguntar por un campo no declarado **lanza**, y no devuelve «falso». Un falso dejaría que un
 * campo sin declarar se colara como opcional sin que nadie lo hubiera decidido, que es justo lo que
 * la declaración existe para impedir.
 */
export function isAlwaysPresent(resource: string, field: string): boolean {
  const declared = (COMPUTED_FIELDS as Record<string, Record<string, Presence>>)[resource]?.[field]

  if (!declared) {
    throw new Error(
      `El campo calculado «${field}» no está declarado en «${resource}». Añádelo a ` +
        "COMPUTED_FIELDS diciendo si va siempre o sólo cuando se pide.",
    )
  }

  return declared === ALWAYS
}
