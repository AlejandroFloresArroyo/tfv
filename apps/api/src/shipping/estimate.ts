/**
 * De una compra a su costo de envío.
 *
 * Ver `openspec/specs/shipping-rates/spec.md`. Rebanada 17.
 *
 * Como `quote-pricing.ts` con las cotizaciones, este módulo **no calcula nada**: reúne lo que el
 * motor necesita —las tarifas de la empresa, las coordenadas de los dos domicilios— y se lo entrega
 * a `computeShipping`, que es una función pura de `@tfv/contracts` y la misma que corre en el
 * navegador. Con dos implementaciones la estimación y el cobro podrían diferir, que es el defecto
 * M-11.
 *
 * ## Llamable desde fuera, y a propósito
 *
 * `estimateShipping` recibe la transacción en lugar de abrirla. Es lo que permite que la rebanada
 * 18 —la materialización del pedido de la compra en tienda— cobre el envío **dentro de su propia
 * transacción**, con las mismas tarifas con las que se estimó y sin volver a resolver nada. El
 * manejador de `checkout.session.completed` que la rebanada 07 dejó pendiente sólo tiene que
 * llamar aquí.
 *
 * El resultado es el desglose completo, que es lo que se guarda en `checkouts.shipping_breakdown`:
 * meses después sigue explicando el importe aunque las tarifas hayan cambiado.
 */

import {
  type Coordinates,
  computeShipping,
  outOfScope,
  type ShippingItem,
  type ShippingMode,
  type ShippingQuote,
} from "@tfv/contracts"
import type { Transaction } from "@tfv/db"
import { companyAddresses, userAddresses } from "@tfv/db/schema"
import { and, eq } from "drizzle-orm"
import { resolveConversion, resolveRates } from "./rates.ts"

export interface EstimateRequest {
  readonly companyId: string
  readonly mode: ShippingMode
  readonly items: readonly ShippingItem[]
  /**
   * Domicilio de entrega del comprador.
   *
   * Ausente en la recolección, y también admisible en las demás: sin él no hay recargo por
   * distancia, que es lo que la spec pide en lugar de suponer una distancia.
   */
  readonly toAddressId?: string | undefined
}

/**
 * Coordenadas de una fila de domicilio, o ninguna.
 *
 * Las dos columnas van juntas: media coordenada no sitúa nada, y tratarla como cero pondría el
 * domicilio en el golfo de Guinea — con el recargo de distancia máximo, que es la clase de error
 * que nadie revisa porque el importe parece plausible.
 */
function coordinatesOf(row: {
  latitude: string | null
  longitude: string | null
}): Coordinates | undefined {
  if (row.latitude === null || row.longitude === null) return undefined

  const latitude = Number(row.latitude)
  const longitude = Number(row.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined

  return { latitude, longitude }
}

/**
 * El domicilio del comercio: **el primario de su libreta**.
 *
 * Es el que la empresa declara como suyo, y el único del que se puede decir «de aquí sale el
 * paquete» sin preguntar. Ver `addresses`, la regla de la primaria.
 */
async function originOf(tx: Transaction, companyId: string): Promise<Coordinates | undefined> {
  const [row] = await tx
    .select({ latitude: companyAddresses.latitude, longitude: companyAddresses.longitude })
    .from(companyAddresses)
    .where(and(eq(companyAddresses.companyId, companyId), eq(companyAddresses.isPrimary, true)))

  return row ? coordinatesOf(row) : undefined
}

/**
 * El domicilio del comprador, por su identificador.
 *
 * **Un domicilio que no se alcanza no es un domicilio sin coordenadas.** La distinción es de
 * dinero: sin coordenadas la spec manda calcular sin recargo por distancia, pero si la fila
 * simplemente no se ve —porque el solicitante no la alcanza— tratarlo igual **cobra de menos y no
 * avisa**. Un envío nacional a mil doscientos kilómetros perdería sus ochenta pesos de recargo y el
 * importe seguiría pareciendo plausible.
 *
 * Costó encontrarlo: la lectura de `user_addresses` la concede el dueño **o un pago que apunte a
 * ella**, así que la estimación del panel la ve —es el propio comprador— y la materialización sólo
 * la ve a través de la compra. Sin este `404`, las dos vías daban totales distintos en silencio,
 * que es exactamente el defecto que esta rebanada existe para cerrar.
 */
async function destinationOf(tx: Transaction, addressId: string): Promise<Coordinates | undefined> {
  const [row] = await tx
    .select({ latitude: userAddresses.latitude, longitude: userAddresses.longitude })
    .from(userAddresses)
    .where(eq(userAddresses.id, addressId))

  if (!row) throw outOfScope("user_address", addressId)
  return coordinatesOf(row)
}

/**
 * Calcula el costo de envío de una compra.
 *
 * **Éste es el único punto por el que se cobra un envío.** La estimación que ve el comprador antes
 * de pagar y el importe que se le carga al materializar salen de esta misma llamada con la misma
 * instantánea, que es lo que el requisito «la estimación coincide con lo cobrado» significa.
 */
export async function estimateShipping(
  tx: Transaction,
  request: EstimateRequest,
): Promise<ShippingQuote> {
  const rates = await resolveRates(tx, request.companyId)
  const conversion = await resolveConversion(tx, request.companyId)

  // La recolección no se transporta: pedir domicilios para ella traería filas que nadie usa y
  // podría fallar por un domicilio que la compra no necesita declarar.
  const origin = request.mode === "pickup" ? undefined : await originOf(tx, request.companyId)
  const destination =
    request.mode === "pickup" || !request.toAddressId
      ? undefined
      : await destinationOf(tx, request.toAddressId)

  return computeShipping({
    mode: request.mode,
    items: request.items,
    rates,
    ...(origin ? { origin } : {}),
    ...(destination ? { destination } : {}),
    ...(conversion ? { conversion } : {}),
  })
}
