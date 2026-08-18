import { can } from "~/lib/can.ts"
import type { ProfileCompany } from "~/lib/session.ts"

/**
 * ¿Hay panel que enseñar?
 *
 * El catálogo de permisos está **cerrado en 255 claves** y ninguna dice «panel del almacén». No se
 * inventa una: el panel no es un recurso, es un resumen de tres que sí lo son —el catálogo, las
 * cotizaciones y los pedidos—, y cada bloque se pinta sólo con la clave de lo que resume.
 *
 * De ahí sale la regla de la pestaña: aparece cuando hay **al menos un bloque** detrás. Ofrecerla a
 * quien no puede ver ninguno sería una pestaña que lleva a una página vacía, que es peor que no
 * ofrecerla; y esconderla a quien puede ver dos de los tres le quitaría el resumen que sí tiene.
 *
 * Vive aquí, junto al panel, y no repartida por las catorce pantallas que pintan la barra: el día
 * que el panel aprenda a resumir una cuarta cosa, la regla cambia en un sitio.
 */
export function canViewPanel(company: ProfileCompany): boolean {
  return (
    can(company, "warehouses.products.view") ||
    can(company, "warehouses.quotes.view") ||
    can(company, "warehouses.orders.view")
  )
}
