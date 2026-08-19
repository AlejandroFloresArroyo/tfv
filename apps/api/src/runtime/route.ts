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
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi"
import { IDEMPOTENCY_HEADER, idempotencyKeySchema, type PermissionKey } from "@tfv/contracts"
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
  /**
   * La ruta admite clave de idempotencia.
   *
   * Se declara aquí y no dentro del manejador porque es una propiedad del contrato: quien lee la
   * tabla de rutas tiene que poder ver cuáles se pueden reintentar sin miedo. Ver
   * `openspec/specs/api-conventions/spec.md`, «Las mutaciones de dinero son idempotentes».
   */
  readonly idempotent?: boolean | undefined
  /**
   * Cuánto cuerpo acepta esta ruta, en octetos.
   *
   * Ausente toma el límite general. Se declara por ruta porque el requisito lo pide «acorde a lo
   * que cada endpoint necesita»: la mayoría reciben un formulario y no hay motivo para que puedan
   * recibir un mega.
   */
  readonly maxBodyBytes?: number | undefined
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
  readonly idempotent?: boolean | undefined
  readonly maxBodyBytes?: number | undefined
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
  idempotent?: boolean | undefined
  maxBodyBytes?: number | undefined
}): RouteDefinition<C> {
  assertScopedByCompany(definition.access, definition.config.path)
  assertIdempotencyHasActor(definition.access, definition.config.path, definition.idempotent)

  const route: RouteDefinition<C> = {
    access: definition.access,
    config: createRoute(withIdempotencyHeader(definition.config, definition.idempotent)) as C,
    handler: definition.handler,
    ...(definition.idempotent === undefined ? {} : { idempotent: definition.idempotent }),
    ...(definition.maxBodyBytes === undefined ? {} : { maxBodyBytes: definition.maxBodyBytes }),
  }
  registry.push(route)
  return route
}

/**
 * Declara el encabezado de idempotencia en el contrato publicado.
 *
 * Se añade aquí y no ruta por ruta porque **la descripción publicada tiene que salir de los mismos
 * esquemas que validan en ejecución**: escribirlo a mano en cada ruta es la vía por la que una lo
 * acepta y no lo dice, o lo dice y no lo acepta. Quien declara `idempotent: true` obtiene las dos
 * cosas de una vez.
 *
 * Opcional en el esquema: el requisito es que la ruta **acepte** una clave, no que la exija. Exigirla
 * rompería a todo cliente que hoy llama sin ella.
 */
function withIdempotencyHeader<C extends AnyRouteConfig>(
  config: C,
  idempotent: boolean | undefined,
): C {
  if (!idempotent) return config

  const declared = z.object({
    [IDEMPOTENCY_HEADER]: idempotencyKeySchema
      .optional()
      .describe(
        "Clave de idempotencia: repetir la petición con la misma clave devuelve el resultado de la " +
          "primera en lugar de volver a ejecutarla.",
      ),
  })

  return { ...config, request: { ...config.request, headers: declared } }
}

/**
 * Una ruta idempotente tiene actor.
 *
 * La clave de idempotencia da acceso a **una respuesta ya calculada**, así que tiene que estar
 * acotada a quien la puso: en una ruta pública no hay a quién acotarla y la clave volvería a ser un
 * espacio de nombres global, donde acertar la de otro devuelve la respuesta de otro.
 *
 * Falla al **cargar el módulo**, como `assertScopedByCompany` y por lo mismo: una ruta mal declarada
 * rompe el arranque y las pruebas, en lugar de esperar a la petición en la que importe.
 *
 * Cuando llegue la compra pública (rebanada 18), que sí necesita reintentar sin sesión, el alcance
 * tendrá que salir de otra parte —la sesión de compra— y esta comprobación es el sitio donde se
 * verá que hace falta decidirlo.
 */
function assertIdempotencyHasActor(
  access: AccessRegime,
  path: string,
  idempotent: boolean | undefined,
): void {
  if (!idempotent || access.kind !== "public") return

  throw new Error(
    `La ruta ${path} declara idempotencia y es pública. La clave de idempotencia se acota al ` +
      `actor que la puso, y una ruta sin credencial no tiene actor contra el que acotarla.`,
  )
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
  layers: readonly RouteLayer[],
): void {
  for (const route of routes) {
    const method = route.config.method.toUpperCase()

    for (const layer of layers) {
      const middleware = layer(route)
      if (middleware) app.use(toHonoPath(route.config.path), onlyFor(method, middleware))
    }
    app.openapi(route.config, route.handler)
  }
}

/**
 * Acota una capa al verbo de su ruta.
 *
 * **El enrutador no sabe montar middleware por verbo**: `use` lo registra para todos los del mismo
 * camino. Y un camino con varios verbos es lo normal —hoy hay cuarenta y siete, y en cuarenta de
 * ellos los regímenes difieren: `GET` de lectura y `DELETE` de borrado sobre el mismo recurso—.
 *
 * Sin este filtro, cada ruta hereda las capas de sus hermanas. En una petición, el enrutador compone
 * lo que casó **en orden de registro**, así que la herencia depende de en qué orden estén declaradas
 * en la tabla: con la de lectura primero no se nota, y con la de borrado primero **la lectura exige
 * el permiso de borrar**. Comprobado: una ruta pública declarada después de una autenticada sobre el
 * mismo camino respondía `401`.
 *
 * El modo de fallo es cerrado —una ruta gana guardianes, nunca los pierde: el suyo se registra
 * siempre justo antes de su manejador—, así que no abre nada. Pero significa que **el permiso que
 * una ruta exige de verdad no es el que declara**, y que reordenar la tabla de rutas cambia la
 * autorización sin tocar ninguna declaración. Ver `HALLAZGOS.md` H-127.
 */
function onlyFor(method: string, middleware: MiddlewareHandler): MiddlewareHandler {
  return (c, next) => (c.req.method.toUpperCase() === method ? middleware(c, next) : next())
}

/**
 * Una capa que se monta delante de una ruta, si esa ruta la necesita.
 *
 * Se inyectan desde fuera y en orden para que este módulo no dependa ni de la autenticación ni de
 * la base de datos, y siga siendo comprobable por su cuenta. El orden es el de la lista: primero el
 * límite de cuerpo —rechazar pronto lo desproporcionado—, después el guardián, y sólo entonces la
 * idempotencia, que necesita saber quién es el actor.
 */
export type RouteLayer = (route: RegisteredRoute) => MiddlewareHandler | null

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
