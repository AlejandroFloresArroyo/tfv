/**
 * La forma de los identificadores que llegan en el camino.
 *
 * Ver `openspec/specs/api-conventions/spec.md` y `HALLAZGOS.md` H-144.
 *
 * ## Qué defecto corrige
 *
 * Un identificador con la forma equivocada **respondía `500`**. La cadena `undefined` —la que deja
 * una plantilla que interpola una variable que no existe— llegaba hasta la consulta, el motor la
 * rechazaba por no ser un UUID, y el error salía como fallo no previsto. Alcanzaba a las noventa y
 * tantas rutas con parámetro de identificador: **713 combinaciones de ruta y valor** respondían
 * `5xx` antes de esto.
 *
 * El síntoma no se parece a la causa —un enlace roto se presenta como «el servidor se cayó»—, que
 * es exactamente lo que pasó con `H-30`, y por eso la corrección va **en la capa y no en un
 * manejador**: arreglarlo en un módulo dejaría el mismo error respondiendo distinto según quién lo
 * sirviera.
 *
 * ## Por qué `400` y no `404`
 *
 * Es la fila que le corresponde en la tabla de códigos de `api-conventions`: «Cuerpo, ruta o
 * consulta que **no cumple el esquema** → `400`». Un `404` diría «no lo encontré», que manda a
 * buscar un recurso que nunca se pidió: lo que hay que arreglar es el enlace.
 *
 * **Y no abre ninguna vía para sondear.** La propiedad que esta casa protege es que un recurso
 * ajeno responda `404` igual que uno inexistente, para no revelar que existe. Esta comprobación no
 * la toca: lo que rechaza depende **sólo de la cadena que envió quien llama** —de su forma, que él
 * ya conocía antes de mandarla— y nunca de lo que haya en la base. Ninguna cadena con forma de
 * identificador llega aquí a un `400`, así que ningún recurso real cambia de respuesta.
 *
 * ## Antes del guardián
 *
 * Se monta antes que la comprobación de permiso, y hace falta que sea así: el guardián resuelve la
 * membresía **contra la empresa del camino**, así que con `companyId` inválido el `500` ocurría en
 * el propio guardián, antes de que ningún manejador corriera.
 */

import { isId, isLegacyId, ValidationError } from "@tfv/contracts"
import type { MiddlewareHandler } from "hono"
import type { RegisteredRoute } from "./route.ts"

/** Los parámetros que declara un camino, en el orden en que aparecen. */
export function pathParamsOf(path: string): string[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string)
}

/**
 * ¿Este parámetro es un identificador?
 *
 * Se decide **por el nombre**, y la convención la cumple la tabla de rutas entera: los treinta y
 * tantos parámetros que nombran una entidad terminan en `Id` —`companyId`, `warehouseId`,
 * `measurementId`—, y los que no la nombran no —`slug`, `handle`, `reference`, `space`, `segment`,
 * `label`, `field`, `permission`, `code`—. Esa separación no es casual: los segundos son
 * precisamente los que `api-conventions` deja que sean identificador **o** identificador legible,
 * así que exigirles forma de identificador rompería las lecturas públicas.
 */
export function isIdentifierParam(name: string): boolean {
  return name.endsWith("Id")
}

/**
 * ¿Tiene forma de identificador?
 *
 * Se admiten los dos: el propio y el de veinticuatro hexadecimales de la pila anterior, que sigue
 * incrustado en URLs compartidas con clientes y tiene su columna en el esquema. Rechazarlo aquí
 * cerraría esa puerta antes de abrirla.
 */
export function hasIdentifierShape(value: string): boolean {
  return isId(value) || isLegacyId(value)
}

/**
 * La capa que rechaza un identificador mal formado antes de que llegue a la base.
 *
 * Devuelve nada para las rutas sin parámetros de identificador, que no tienen qué comprobar.
 *
 * Se señalan **todos** los que vengan mal y no sólo el primero: es la misma regla que el resto de
 * la validación de entrada, y quien recibe la respuesta suele tener los dos rotos por la misma
 * causa. El valor recibido **no vuelve en el mensaje** — lo que llega en el camino es de quien
 * llama, y devolverlo tal cual es como una respuesta de error acaba sirviendo de espejo.
 */
export function identifierShapeFor(route: RegisteredRoute): MiddlewareHandler | null {
  const names = pathParamsOf(route.config.path).filter(isIdentifierParam)
  if (names.length === 0) return null

  return async (c, next) => {
    const issues = names
      .filter((name) => {
        const value = c.req.param(name)
        return value !== undefined && !hasIdentifierShape(value)
      })
      .map((name) => ({ key: name, message: "No tiene forma de identificador" }))

    if (issues.length > 0) throw new ValidationError(issues)

    await next()
  }
}
