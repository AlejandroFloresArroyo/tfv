/**
 * Las colecciones de la pila anterior, declaradas.
 *
 * Derivado a mano de los esquemas de Mongoose reales de `tfv-leg/tfv-backend/src/services/…`
 * (cada entrada cita su archivo). Es la única descripción del origen que el paquete usa: el
 * comprobador recorre estas referencias para encontrar las rotas de verdad, y los accesorios de
 * prueba se construyen con esta misma forma para no inventar un origen que no existe.
 *
 * `dueño: true` marca la referencia que hace **alcanzable** al documento: la membresía es de su
 * empresa, la dirección es de su usuario. Un documento cuyo dueño no existe no es una referencia
 * rota más: es una fila huérfana, y el informe las separa porque la decisión de negocio sobre
 * ellas es distinta.
 */

export interface Referencia {
  /** Campo del documento. Para arreglos de identificadores, el campo del arreglo. */
  readonly campo: string
  /** Colección a la que apunta. */
  readonly destino: string
  /** El esquema viejo la declaraba `required`. */
  readonly requerida: boolean
  /** La rotura deja al documento inalcanzable, no sólo incompleto. */
  readonly dueño?: boolean
  /** El campo es un arreglo de identificadores. */
  readonly multiple?: boolean
}

export interface ColeccionVieja {
  readonly nombre: string
  /** Ruta del modelo en el árbol viejo, como cita. */
  readonly modelo: string
  readonly referencias: readonly Referencia[]
}

export const COLECCIONES: readonly ColeccionVieja[] = [
  {
    nombre: "core_user",
    modelo: "src/services/core/user/model.ts",
    referencias: [{ campo: "imageId", destino: "core_upload", requerida: true }],
  },
  {
    nombre: "core_companies",
    modelo: "src/services/core/company/model.ts",
    referencias: [
      { campo: "imageId", destino: "core_upload", requerida: true },
      { campo: "ownerId", destino: "core_user", requerida: true },
      {
        campo: "companyAddressesIds",
        destino: "core_companies_address",
        requerida: false,
        multiple: true,
      },
      {
        campo: "companyServicesIds",
        destino: "core_companies_service",
        requerida: false,
        multiple: true,
      },
      { campo: "companySubscriptionId", destino: "core_companies_subscription", requerida: false },
      { campo: "sectorsIds", destino: "core_categories", requerida: false, multiple: true },
    ],
  },
  {
    nombre: "core_companies_user",
    modelo: "src/services/core/company_user/model.ts",
    referencias: [
      { campo: "companyId", destino: "core_companies", requerida: true, dueño: true },
      { campo: "userId", destino: "core_user", requerida: true, dueño: true },
      { campo: "roleId", destino: "core_role", requerida: false },
    ],
  },
  {
    nombre: "core_role",
    modelo: "src/services/core/role/model.ts",
    referencias: [{ campo: "companyId", destino: "core_companies", requerida: true, dueño: true }],
  },
  {
    nombre: "core_addresses",
    modelo: "src/services/core/address/model.ts",
    referencias: [{ campo: "userId", destino: "core_user", requerida: true, dueño: true }],
  },
  {
    nombre: "core_companies_address",
    modelo: "src/services/core/company_address/model.ts",
    referencias: [{ campo: "companyId", destino: "core_companies", requerida: true, dueño: true }],
  },
  {
    nombre: "core_client",
    modelo: "src/services/core/client/model.ts",
    referencias: [
      { campo: "companyId", destino: "core_companies", requerida: false, dueño: true },
      { campo: "userId", destino: "core_user", requerida: false },
      { campo: "userCompanyId", destino: "core_companies", requerida: false },
      { campo: "imageId", destino: "core_upload", requerida: false },
    ],
  },
  {
    nombre: "core_provider",
    modelo: "src/services/core/provider/model.ts",
    referencias: [
      { campo: "companyId", destino: "core_companies", requerida: false, dueño: true },
      { campo: "userId", destino: "core_user", requerida: false },
      { campo: "userCompanyId", destino: "core_companies", requerida: false },
      { campo: "imageId", destino: "core_upload", requerida: false },
    ],
  },
  {
    nombre: "core_categories",
    modelo: "src/services/core/categories/model.ts",
    referencias: [
      { campo: "parentId", destino: "core_categories", requerida: false },
      { campo: "childsIds", destino: "core_categories", requerida: false, multiple: true },
      { campo: "serviceId", destino: "core_service", requerida: false },
      { campo: "imageId", destino: "core_upload", requerida: false },
    ],
  },
  {
    nombre: "core_service",
    modelo: "src/services/core/service/model.ts",
    referencias: [{ campo: "imageId", destino: "core_upload", requerida: true }],
  },
  {
    nombre: "core_companies_service",
    modelo: "src/services/core/company_service/model.ts",
    referencias: [
      { campo: "companyId", destino: "core_companies", requerida: true, dueño: true },
      { campo: "serviceId", destino: "core_service", requerida: true },
    ],
  },
  {
    nombre: "core_upload",
    modelo: "src/services/core/upload/model.ts",
    referencias: [{ campo: "metaId", destino: "core_meta", requerida: false }],
  },
  {
    nombre: "core_meta",
    modelo: "src/services/core/meta/model.ts",
    referencias: [],
  },
  {
    nombre: "core_subscription",
    modelo: "src/services/core/subscription/model.ts",
    referencias: [],
  },
  {
    nombre: "core_companies_subscription",
    modelo: "src/services/core/company_subscription/model.ts",
    referencias: [
      { campo: "companyId", destino: "core_companies", requerida: true, dueño: true },
      { campo: "userId", destino: "core_user", requerida: false },
      { campo: "subscriptionId", destino: "core_subscription", requerida: true },
    ],
  },
  {
    nombre: "core_companies_subscriptions_payment",
    modelo: "src/services/core/company_subscription_payment/model.ts",
    referencias: [
      { campo: "companyId", destino: "core_companies", requerida: true, dueño: true },
      // `DEFECTS.md` M-08: un pago fallido eliminaba la suscripción, así que en el volcado real
      // hay pagos cuya suscripción ya no existe. Rota esperada, no sorpresa.
      { campo: "companySubscriptionId", destino: "core_companies_subscription", requerida: false },
    ],
  },
]

export function coleccion(nombre: string): ColeccionVieja | undefined {
  return COLECCIONES.find((entrada) => entrada.nombre === nombre)
}

export const NOMBRES_CONOCIDOS: readonly string[] = COLECCIONES.map((entrada) => entrada.nombre)
