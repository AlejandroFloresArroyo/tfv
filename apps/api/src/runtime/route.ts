/**
 * Registro explícito de rutas.
 *
 * Ver `openspec/changes/add-hono-api-runtime/proposal.md`.
 *
 * La implementación anterior descubría sus rutas **recorriendo el sistema de archivos**: cada valor
 * exportado por el índice de cada carpeta de servicio se registraba como ruta. No existía tabla de
 * rutas en ninguna parte, así que no había forma de saber qué exponía la API sin ejecutarla, y
 * exportar por error un objeto publicaba un endpoint.
 *
 * Aquí las rutas se declaran una a una y se reúnen en una tabla que se puede leer.
 *
 * ## Denegación por defecto
 *
 * El régimen de acceso es **obligatorio** en el tipo: no se puede definir una ruta sin declararlo.
 * Y abrir una al público exige escribir el motivo, de modo que no se pueda hacer por descuido.
 *
 * Así fue como sesenta y nueve de noventa y un módulos acabaron sin autenticación
 * (`DEFECTS.md` S-05): olvidarse del gancho dejaba la ruta abierta y nada lo señalaba.
 */

import type { RouteConfig, RouteHandler } from "@hono/zod-openapi"
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi"
import type { PermissionKey } from "@tfv/contracts"
import type { MiddlewareHandler } from "hono"

/**
 * Quién puede llamar a una ruta.
 *
 * `public` lleva un motivo obligatorio porque abrir una ruta al mundo es una decisión que alguien
 * tiene que poder revisar más tarde. El motivo aparece en la tabla de rutas.
 */
export type AccessRegime =
  | { readonly kind: "public"; readonly reason: string }
  | { readonly kind: "authenticated" }
  | { readonly kind: "permission"; readonly permission: PermissionKey }

export const PUBLIC = (reason: string): AccessRegime => ({ kind: "public", reason })
export const AUTHENTICATED: AccessRegime = { kind: "authenticated" }

/**
 * Exige un permiso del catálogo.
 *
 * El tipo es `PermissionKey`, no `string`: una clave que no exista **no compila**. Es lo que hace
 * que el catálogo sea la autoridad de verdad y no una lista paralela que se va desincronizando —
 * escribir `warehouses.products.aprobar` es un error de compilación, no un permiso que nunca se
 * concede a nadie y que nadie descubre.
 */
export const REQUIRES = (permission: PermissionKey): AccessRegime => ({
  kind: "permission",
  permission,
})

// biome-ignore lint/suspicious/noExplicitAny: el registro almacena rutas de formas heterogéneas.
type AnyRouteConfig = RouteConfig & { responses: any }

/** Una ruta con su contrato concreto. Es lo que devuelve `defineRoute`. */
export interface RouteDefinition<C extends AnyRouteConfig = AnyRouteConfig> {
  /** Régimen de acceso. Obligatorio: sin él la ruta no compila. */
  readonly access: AccessRegime
  /** Contrato de la ruta, del que se derivan la validación y la descripción publicada. */
  readonly config: C
  readonly handler: RouteHandler<C>
}

/**
 * Una ruta vista desde el registro, sin su contrato concreto.
 *
 * El manejador se pierde de vista a propósito: cada ruta tiene el suyo, con tipos distintos, y el
 * registro sólo necesita poder montarlo y describirlo. Conservar el tipo exacto aquí obligaría a
 * parametrizar la tabla entera con una unión que crece con cada ruta.
 */
export interface RegisteredRoute {
  readonly access: AccessRegime
  readonly config: AnyRouteConfig
  // biome-ignore lint/suspicious/noExplicitAny: el manejador concreto es distinto en cada ruta.
  readonly handler: any
}

const registry: RegisteredRoute[] = []

/**
 * Declara una ruta y la añade al registro.
 *
 * La validación de entrada, la serialización de salida y la publicación del contrato salen del
 * mismo `config`, así que no pueden quedar desfasadas entre sí.
 */
export function defineRoute<C extends AnyRouteConfig>(definition: {
  access: AccessRegime
  config: C
  handler: RouteHandler<C>
}): RouteDefinition<C> {
  assertScopedByCompany(definition.access, definition.config.path)

  const route: RouteDefinition<C> = {
    access: definition.access,
    config: createRoute(definition.config) as C,
    handler: definition.handler,
  }
  registry.push(route)
  return route
}

/**
 * Una ruta con permiso declara la empresa en su camino.
 *
 * Un permiso sólo significa algo dentro de una empresa: «puede editar productos» no es una
 * afirmación completa hasta decir de quién. Si el camino no la lleva, el guardián no tendría contra
 * qué resolver la membresía y sólo le quedarían dos salidas malas: dejar pasar, o sacar la empresa
 * del cuerpo de la petición — que es pedirle al solicitante que declare su propio alcance.
 *
 * Falla al **cargar el módulo**, no al atender la petición: así una ruta mal declarada rompe el
 * arranque y las pruebas, en lugar de esperar a que alguien la llame.
 */
function assertScopedByCompany(access: AccessRegime, path: string): void {
  if (access.kind !== "permission") return
  // Se admiten las dos formas: la del contrato publicado y la del enrutador.
  if (path.includes("{companyId}") || path.includes(":companyId")) return

  throw new Error(
    `La ruta ${path} exige el permiso «${access.permission}» pero su camino no declara ` +
      `:companyId. Un permiso sin empresa contra la que resolverlo no se puede comprobar.`,
  )
}

/** Todas las rutas declaradas hasta ahora. */
export function allRoutes(): readonly RegisteredRoute[] {
  return registry
}

/**
 * Monta el registro sobre la aplicación.
 *
 * Cada ruta recibe el guardián que corresponde a su régimen **sin excepción**: no hay una vía por
 * la que una ruta llegue a montarse sin pasar por aquí. El guardián se inyecta desde fuera para que
 * este módulo no dependa de la autenticación y siga siendo comprobable por su cuenta.
 */
export function mountRoutes(
  app: OpenAPIHono,
  routes: readonly RegisteredRoute[],
  guardFor: (access: AccessRegime) => MiddlewareHandler | null,
): void {
  for (const route of routes) {
    const guard = guardFor(route.access)
    if (guard) app.use(toHonoPath(route.config.path), guard)
    app.openapi(route.config, route.handler)
  }
}

/**
 * Traduce el camino de la forma del contrato publicado a la del enrutador.
 *
 * El contrato nombra sus parámetros `{companyId}`; el enrutador los espera `:companyId`. La función
 * que registra el manejador hace esta conversión por dentro, pero el middleware se monta aparte y
 * **no la heredaba**.
 *
 * Sin esto, el camino del guardián no coincide con ninguna petición y el guardián sencillamente no
 * corre: la ruta responde con normalidad, sin autenticar y sin comprobar permiso. No falla, no
 * avisa, y sólo se nota si alguien la prueba sin credencial.
 *
 * Es la misma forma del defecto que este módulo existe para impedir —olvidar el gancho deja la ruta
 * abierta (`DEFECTS.md` S-05)—, sólo que aquí el olvido lo cometía el propio andamiaje. No había
 * ninguna ruta con parámetros cuando apareció; la primera lo habría heredado.
 */
function toHonoPath(path: string): string {
  return path.replace(/\{(\w+)\}/g, ":$1")
}

// ─── Tabla legible ───────────────────────────────────────────────────────────

export interface RouteSummary {
  readonly method: string
  readonly path: string
  readonly access: string
  readonly summary: string
}

/**
 * La tabla de rutas, para leerla sin ejecutar el servicio.
 *
 * La consume el comando que emite el inventario y la prueba que comprueba que ninguna ruta quedó
 * abierta sin declararlo.
 */
export function describeRoutes(routes: readonly RegisteredRoute[] = allRoutes()): RouteSummary[] {
  return routes
    .map((route) => ({
      method: route.config.method.toUpperCase(),
      path: route.config.path,
      access: describeAccess(route.access),
      summary: route.config.summary ?? "",
    }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
}

export function describeAccess(access: AccessRegime): string {
  switch (access.kind) {
    case "public":
      return `público (${access.reason})`
    case "authenticated":
      return "autenticado"
    case "permission":
      return `permiso: ${access.permission}`
  }
}

/** Las rutas abiertas al público. Debe ser una lista corta y revisable. */
export function publicRoutes(routes: readonly RegisteredRoute[] = allRoutes()): RouteSummary[] {
  return describeRoutes(routes.filter((route) => route.access.kind === "public"))
}
