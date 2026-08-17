/**
 * Catálogo de claves de permiso.
 *
 * Ver `openspec/specs/access-control/spec.md`, requisito «El catálogo de permisos es la fuente de
 * autoridad», y la rebanada 05.
 *
 * ## Qué es esto y de dónde sale
 *
 * Las **255** claves que la implementación anterior reconoce, extraídas de su propio catálogo
 * (`tfv-frontend/src/auth/permission/services/`) reproduciendo su función de derivación letra por
 * letra. No están transcritas a mano: los roles que hoy existen en producción guardan exactamente
 * estas cadenas, y una sola diferencia de tecleo dejaría un rol sin el permiso que tenía el día
 * del corte.
 *
 * Toda clave se lee `<servicio>.<recurso>.<acción>`, siempre tres niveles.
 *
 * ## Por qué es una constante y no una tabla
 *
 * La spec pide «dato del servidor, versionado y consultable», y ésas son las tres propiedades que
 * importan: **del servidor**, porque antes la lista vivía en el navegador y el navegador no puede
 * ser la autoridad de lo que autoriza; **versionado**, que aquí lo da el control de versiones;
 * y **consultable**, que lo da el endpoint que la publica.
 *
 * En una tabla, el catálogo y el código que lo hace cumplir podrían separarse: alguien añade una
 * comprobación de `warehouses.products.split` y la clave no existe en la base, o al revés. Aquí la
 * comprobación no compila si la clave no está en la lista. Es la propiedad que se buscaba, y una
 * tabla la perdería a cambio de poder editar permisos sin desplegar — que no es algo que queramos
 * poder hacer.
 *
 * ## Lo que este catálogo NO trae
 *
 * **Etiquetas.** La matriz de permisos que las necesita es pantalla de la rebanada 29, y la
 * interfaz se construye en español e inglés: fijar aquí un solo idioma obligaría a deshacerlo.
 * Los textos originales están en el catálogo anterior y se recuperan con la misma extracción.
 */

/**
 * Las claves, agrupadas por servicio y recurso.
 *
 * El primer nivel coincide con `services.keycode`, salvo `companies`, que es el núcleo común y no
 * un servicio contratable.
 */
export const PERMISSION_CATALOG = {
  /** 34 claves en 7 recursos. */
  companies: {
    companies: ["view", "edit", "delete"],
    clients: ["view", "create", "edit", "delete"],
    providers: ["view", "create", "edit", "delete"],
    addresses: ["view", "create", "edit", "primary", "delete"],
    roles: ["view", "create", "edit", "change_permissions", "delete"],
    users: [
      "view",
      "create",
      "invite",
      "uninvite",
      "change-role",
      "recover-password",
      "active",
      "desactive",
    ],
    billings: ["view", "create", "edit", "delete", "primary"],
  },
  /** 1 clave en 1 recurso. */
  locations: {
    locations: ["view"],
  },
  /** 50 claves en 10 recursos. */
  pixit: {
    stores: ["view", "create", "edit", "delete", "website"],
    colors: ["view", "create", "edit", "delete"],
    boards: ["view", "create", "edit", "delete", "size_create", "size_edit", "size_delete"],
    inventory: ["view", "create", "edit", "delete", "stock_create", "stock_edit", "stock_delete"],
    sessions: ["view", "create", "edit", "delete", "close", "change"],
    sales: ["view", "create", "edit", "delete"],
    sheets: ["view", "create", "edit", "delete"],
    rooms: ["view", "create", "edit", "delete"],
    terms: ["view", "create", "edit", "delete"],
    products: ["view", "create", "edit", "delete", "website"],
  },
  /** 109 claves en 18 recursos. */
  productions: {
    productions: ["view", "create", "edit", "website", "delete"],
    categories: ["view", "create", "edit", "delete"],
    products: ["view", "create", "edit", "status", "select_status", "select_category", "delete"],
    characters: ["view", "create", "edit", "delete"],
    pdfs: ["view", "create", "edit", "sync", "delete"],
    chapters: ["view", "create", "edit", "delete"],
    scenes: ["view", "create", "edit", "delete"],
    videos: ["view", "create", "select_category", "edit", "delete"],
    recordings: ["view", "create", "edit", "characters", "notes", "close", "open", "delete"],
    continuities: ["view", "create", "character", "products", "videos", "all_selectable", "delete"],
    deliveries: ["view", "create", "info", "products", "delete", "responsible", "finished"],
    delivery_products: ["view", "responsible", "find", "searching", "delete"],
    sets: ["view", "create", "edit", "products", "delete"],
    budgets: ["view"],
    anchors: ["view", "create", "edit", "delete"],
    shoppings: ["view", "create", "edit", "products", "select_category", "delete"],
    orders: ["view", "create", "edit", "quote_rented", "quote_finished", "reject", "delete"],
    workflows: [
      "view",
      "create",
      "edit",
      "status",
      "comments",
      "select_responsible",
      "delete",
      "task_create",
      "task_edit",
      "task_status",
      "task_comments",
      "task_select_responsible",
      "task_select_category",
      "task_delete",
      "task_activity_create",
      "task_activity_edit",
      "task_activity_responsible",
      "task_activity_status",
      "task_activity_select_status",
      "task_activity_comments",
      "task_activity_delete",
    ],
  },
  /** 53 claves en 7 recursos. */
  warehouses: {
    warehouses: ["view", "create", "edit", "website", "delete"],
    categories: ["view", "create", "edit", "delete"],
    prices: ["view", "create", "edit", "delete"],
    storages: ["view", "create", "edit", "products", "delete"],
    products: [
      "view",
      "create",
      "website",
      "edit_info",
      "edit_payment",
      "edit_location",
      "edit_measurement",
      "select_category",
      "delete",
      "measurement_create",
      "measurement_edit",
      "measurement_delete",
      "price_create",
      "price_edit",
      "price_delete",
      "stock_create",
      "stock_edit",
      "stock_delete",
    ],
    quotes: [
      "view",
      "create",
      "responsible",
      "edit_info",
      "edit_contacts",
      "edit_products",
      "edit_status",
      "edit_payment",
      "edit_tax",
      "rented",
      "finished",
      "delete",
    ],
    orders: ["view", "accept", "edit", "reject", "delete"],
  },
  /** 8 claves en 2 recursos. */
  websites: {
    websites: ["view", "create", "edit", "delete"],
    customizes: ["view", "create", "edit", "delete"],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>

/** Servicio al que pertenece una clave. `companies` es el núcleo, no un servicio contratable. */
export type PermissionService = keyof typeof PERMISSION_CATALOG

type Catalog = typeof PERMISSION_CATALOG

/** Toda clave del catálogo, como tipo. Un permiso que no exista no compila. */
export type PermissionKey = {
  [S in keyof Catalog]: {
    [R in keyof Catalog[S]]: Catalog[S][R] extends readonly (infer A)[]
      ? A extends string
        ? `${S & string}.${R & string}.${A}`
        : never
      : never
  }[keyof Catalog[S]]
}[keyof Catalog]

function buildKeys(): readonly PermissionKey[] {
  const keys: string[] = []
  for (const [service, resources] of Object.entries(PERMISSION_CATALOG)) {
    for (const [resource, actions] of Object.entries(resources)) {
      for (const action of actions) keys.push(`${service}.${resource}.${action}`)
    }
  }
  return keys as PermissionKey[]
}

/** Todas las claves, en el orden del catálogo. */
export const PERMISSION_KEYS: readonly PermissionKey[] = buildKeys()

const KEY_SET: ReadonlySet<string> = new Set(PERMISSION_KEYS)

/**
 * ¿Existe esta clave?
 *
 * Es lo que hace del catálogo la autoridad: guardar un rol con una clave ausente se rechaza, así
 * que un permiso mal escrito se descubre al asignarlo y no el día que alguien no puede trabajar.
 */
export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === "string" && KEY_SET.has(value)
}

/** Las claves que no figuran en el catálogo. Vacío significa que todas son buenas. */
export function unknownPermissions(keys: readonly string[]): string[] {
  return keys.filter((key) => !KEY_SET.has(key))
}

/** El servicio que encabeza una clave, sin recorrer el catálogo. */
export function serviceOf(key: PermissionKey): PermissionService {
  return key.split(".")[0] as PermissionService
}
