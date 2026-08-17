/**
 * Publicación del catálogo de permisos.
 *
 * Ver `openspec/specs/access-control/spec.md`: «El catálogo de permisos es la fuente de autoridad»
 * y «La interfaz construye la matriz desde el catálogo».
 *
 * Esta ruta existe para que el navegador **deje de tener su propia lista**. En la implementación
 * anterior el catálogo vivía en el frontend, así que la autoridad de qué se puede autorizar estaba
 * del lado que no autoriza nada. Aquí la lista sale del mismo módulo que hace cumplir el permiso,
 * y no hay dos sitios donde pueda estar desalineada.
 *
 * Autenticada, no pública: el catálogo describe la superficie completa del sistema y no hay motivo
 * para regalársela a quien no ha entrado.
 */

import { z } from "@hono/zod-openapi"
import { PERMISSION_CATALOG, PERMISSION_KEYS } from "@tfv/contracts"
import { AUTHENTICATED, defineRoute } from "../runtime/route.ts"

const catalogResponse = z.object({
  /** Cuántas claves hay. Lo consume la prueba que fija el tamaño del catálogo. */
  total: z.number().int(),
  /** Agrupadas `servicio → recurso → acciones`, que es como se dibuja la matriz. */
  services: z.record(z.string(), z.record(z.string(), z.array(z.string()))),
  /** Planas, para comprobar pertenencia sin recorrer el árbol. */
  keys: z.array(z.string()),
})

export const permissionCatalogRoute = defineRoute({
  access: AUTHENTICATED,
  config: {
    method: "get",
    path: "/permissions",
    summary: "Catálogo de claves de permiso",
    tags: ["Acceso"],
    responses: {
      200: {
        description: "Las claves que el servidor reconoce",
        content: { "application/json": { schema: catalogResponse } },
      },
      401: { description: "No hay sesión" },
    },
  },
  handler: (c) =>
    c.json(
      {
        total: PERMISSION_KEYS.length,
        services: PERMISSION_CATALOG as Record<string, Record<string, readonly string[]>>,
        keys: PERMISSION_KEYS,
      },
      200,
    ),
})
