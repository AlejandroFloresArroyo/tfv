/**
 * La categoría que declara la vertical «tienda de almacén».
 *
 * ## Por qué hace falta pedirla y no basta con la siembra
 *
 * Porque **la siembra no la deja**. `verticalOf` lee la clave `warehouse-store` de la taxonomía
 * global, y `seed.ts` no escribe una sola fila en `global_categories`: sin ella, todo sitio que se
 * dé de alta —por la pantalla o por la API— nace con vertical `under-construction`, su tienda
 * pública contesta «estamos preparando esta tienda» para siempre y su constructor abre con la
 * plantilla mínima en lugar de la de almacén. Está anotado en `HALLAZGOS.md` como **H-301**, y no se
 * corrige desde aquí: la siembra es de `apps/api`.
 *
 * ## Por qué esto no es fabricar estado
 *
 * Porque la taxonomía global **la administra la plataforma**, y tiene ruta:
 * `POST /companies/{companyId}/categories` crea una categoría global y la guarda `assertPlatform`.
 * Lo que hace esta función es exactamente lo que haría quien administra la plataforma el primer día:
 * dar de alta la categoría que declara la vertical. Con la cuenta que lleva la marca, por HTTP, y
 * sin tocar la base.
 *
 * Es idempotente: la clave es única en la tabla, así que se busca antes y sólo se crea si falta.
 */

import { type BrowserContext, expect } from "@playwright/test"

/** La clave estable que el código reconoce. No es un nombre: es contrato con `VERTICAL_KEYNAMES`. */
export const CLAVE_ALMACEN = "warehouse-store"

/**
 * Devuelve el identificador de la categoría de vertical de almacén, creándola si no está.
 *
 * @param plataforma contexto de una cuenta con la marca de administración de plataforma.
 * @param companyId cualquiera de sus empresas: el camino la pide y la categoría es global.
 */
export async function verticalDeAlmacen(
  plataforma: BrowserContext,
  companyId: string,
): Promise<string> {
  const listado = await plataforma.request.get("/api/categories?limit=200")
  if (listado.ok()) {
    const { items } = (await listado.json()) as { items: { id: string; keyname: string | null }[] }
    const existente = items.find((entry) => entry.keyname === CLAVE_ALMACEN)
    if (existente) return existente.id
  }

  const creada = await plataforma.request.post(`/api/companies/${companyId}/categories`, {
    data: { name: "Tienda de almacén", keyname: CLAVE_ALMACEN, service: "websites" },
  })

  // Una carrera con otro trabajador que la creó primero termina en el mismo sitio: se vuelve a
  // leer, porque la clave es única y sólo una de las dos altas puede ganar.
  if (!creada.ok()) {
    const segundo = await plataforma.request.get("/api/categories?limit=200")
    const { items } = (await segundo.json()) as { items: { id: string; keyname: string | null }[] }
    const existente = items.find((entry) => entry.keyname === CLAVE_ALMACEN)
    expect(
      existente,
      `no se pudo dar de alta la vertical de almacén: ${await creada.text()}`,
    ).toBeTruthy()
    return (existente as { id: string }).id
  }

  const { id } = (await creada.json()) as { id: string }
  return id
}
