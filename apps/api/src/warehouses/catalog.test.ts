/**
 * Catálogo de almacén, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/warehouse-catalog/spec.md`.
 *
 * La que más importa es la de atomicidad: es el cambio de fondo de la rebanada, y el defecto que
 * corrige no se ve mirando la pantalla — se ve semanas después, cuando alguien cotiza y las cuentas
 * no salen.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db } from "@tfv/db"
import {
  companies,
  companyMembers,
  companyServices,
  globalCategories,
  loginAttempts,
  notificationDeliveries,
  roles,
  services,
  sessions,
  uploads,
  users,
  warehouseCategories,
  warehouseMeasurements,
  warehouseProducts,
  warehouseStockUnits,
  warehouseStorages,
  warehouses,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companyServices}, ${warehouseStockUnits}, ${warehouseMeasurements}, ${warehouseProducts}, ${warehouseCategories}, ${warehouseStorages}, ${warehouses}, ${globalCategories}, ${services}, ${companies} cascade`,
  )
}

function request(method: string, path: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

interface Product {
  id: string
  name: string
  code: string
  slug: string | null
  parentId: string | null
  storageId: string | null
  categoryId: string | null
  globalCategoryId: string | null
  responsibleId: string | null
}

interface Measurement {
  id: string
  name: string
  kind: string
  priceDifference: string
  units: Record<string, number>
  dimensions: { height?: number; weight?: number }
  lengthUnit: string
  massUnit: string
  clothing: { garment?: string; measurements?: Record<string, number> } | null
}

interface Image {
  uploadId: string
  url: string
  thumbnailUrl: string | null
  position: number
  isCover: boolean
}

interface Detail extends Product {
  measurements: Measurement[]
  variants: Product[]
  accessories: Product[]
  images: Image[]
}

let cookie = ""
let userId = ""
let companyId = ""
let warehouseId = ""
/** Camino base del catálogo, que se repite en cada prueba. */
let base = ""

beforeAll(async () => {
  await reset()

  const email = "catalogo@ejemplo.mx"
  await request("POST", "/auth/register", { email, password: PASSWORD, name: "Catálogo" })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const login = await request("POST", "/auth/login", { email, password: PASSWORD })
  cookie =
    login.headers
      .getSetCookie()
      .find((raw) => raw.startsWith("tfv_session="))
      ?.split(";")[0] ?? ""

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  userId = user?.id ?? ""

  const company = await json<{ id: string }>(
    await request("POST", "/companies", { name: "Casa de Renta" }, cookie),
  )
  companyId = company.id

  const serviceId = newId()
  await db.insert(services).values({ id: serviceId, keycode: "warehouses", name: "Almacenes" })
  await db.insert(companyServices).values({ id: newId(), companyId, serviceId })

  const warehouse = await json<{ id: string }>(
    await request("POST", `/companies/${companyId}/warehouses`, { name: "Nave" }, cookie),
  )
  warehouseId = warehouse.id
  base = `/companies/${companyId}/warehouses/${warehouseId}`
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

/** Cada prueba parte de un catálogo vacío, sin rehacer la sesión ni el almacén. */
async function clearCatalog() {
  await db.execute(
    sql`truncate table ${warehouseStockUnits}, ${warehouseMeasurements}, ${warehouseProducts}, ${warehouseCategories}, ${warehouseStorages} cascade`,
  )
}

async function newProduct(body: Record<string, unknown>): Promise<Detail> {
  const response = await request("POST", `${base}/products`, body, cookie)
  expect(response.status).toBe(201)
  return json<Detail>(response)
}

// ─── Producto ────────────────────────────────────────────────────────────────

describe("datos de un producto", () => {
  it("se crea con lo mínimo, con código propio y con responsable", async () => {
    // Escenario: «Se crea un producto con lo mínimo».
    await clearCatalog()
    const product = await newProduct({ name: "Cámara Sony FX6" })

    expect(product.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/)
    expect(product.slug).toBe("camara-sony-fx6")
    expect(product.responsibleId).toBe(userId)
  })

  it("el código no cambia al editar", async () => {
    // Escenario: «El código no cambia al editar». Está impreso en la etiqueta.
    await clearCatalog()
    const product = await newProduct({ name: "Tripié" })

    const updated = await json<Detail>(
      await request("PATCH", `${base}/products/${product.id}`, { name: "Tripié grande" }, cookie),
    )

    expect(updated.code).toBe(product.code)
    expect(updated.name).toBe("Tripié grande")
  })

  it("dos productos reciben códigos distintos", async () => {
    await clearCatalog()
    const uno = await newProduct({ name: "Uno" })
    const dos = await newProduct({ name: "Dos" })

    expect(uno.code).not.toBe(dos.code)
  })
})

describe("variantes y accesorios como productos hijos", () => {
  it("un hijo hereda clasificación, ubicación y responsable", async () => {
    // Escenario: «Un hijo hereda la clasificación».
    await clearCatalog()

    const storage = await json<{ id: string }>(
      await request("POST", `${base}/storages`, { name: "Caja", kind: "box" }, cookie),
    )
    const category = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Ópticas" }, cookie),
    )

    const product = await newProduct({
      name: "Cámara",
      storageId: storage.id,
      categoryId: category.id,
      variants: [{ name: "Cámara negra" }],
      accessories: [{ name: "Correa" }],
    })

    const variant = product.variants[0]
    const accessory = product.accessories[0]

    expect(variant?.storageId).toBe(storage.id)
    expect(variant?.categoryId).toBe(category.id)
    expect(variant?.responsibleId).toBe(userId)
    expect(accessory?.categoryId).toBe(category.id)

    // Escenario: «Los hijos se distinguen por su código».
    expect(variant?.code).not.toBe(accessory?.code)
    expect(variant?.code).not.toBe(product.code)
  })

  it("las variantes no aparecen sueltas en el listado", async () => {
    // Escenario: «Las variantes no aparecen sueltas». Un producto con tres variantes es un
    // elemento del catálogo, no cuatro.
    await clearCatalog()
    await newProduct({
      name: "Cámara",
      variants: [{ name: "Negra" }, { name: "Gris" }, { name: "Blanca" }],
    })

    const page = await json<{ items: Product[]; totalItems: number }>(
      await request("GET", `${base}/products`, undefined, cookie),
    )

    expect(page.totalItems).toBe(1)
    expect(page.items).toHaveLength(1)
  })
})

describe("creación con toda su estructura", () => {
  it("un fallo en la segunda variante no deja producto a medias", async () => {
    /**
     * Escenario: «Un fallo no deja producto a medias». Es el criterio de aceptación de la rebanada.
     *
     * El fallo tiene que ocurrir **durante** la escritura y no antes, o no se estaría comprobando
     * nada: un cuerpo que el esquema rechaza falla sin haber tocado la base. Aquí la segunda
     * variante lleva una medida cuyo ajuste de precio no cabe en la columna —catorce dígitos, dos
     * de ellos decimales—, así que el motor la rechaza cuando ya están escritos el producto, sus
     * tres medidas y la primera variante entera.
     *
     * Sin transacción, eso es exactamente lo que quedaría en la base: un producto existente,
     * listable, y con la mitad de su estructura. No se ve mirando la pantalla.
     */
    await clearCatalog()

    const response = await request(
      "POST",
      `${base}/products`,
      {
        name: "Cámara con estructura",
        measurements: [{ name: "Cuerpo" }, { name: "Kit" }, { name: "Maleta" }],
        variants: [
          { name: "Negra", measurements: [{ name: "Cuerpo" }] },
          {
            name: "Gris",
            measurements: [{ name: "Cuerpo", priceDifference: "99999999999999.99" }],
          },
        ],
      },
      cookie,
    )

    /**
     * `500` y no `400`, y la distinción es la prueba.
     *
     * Un `400` significaría que el esquema lo rechazó **antes** de tocar la base, y entonces la
     * transacción no se habría ejercitado: la base estaría vacía por no haber escrito nunca, no por
     * haber revertido. Un `500` es el motor rechazando una escritura ya empezada.
     */
    expect(response.status).toBe(500)

    expect(await db.select().from(warehouseProducts)).toHaveLength(0)
    expect(await db.select().from(warehouseMeasurements)).toHaveLength(0)
    expect(await db.select().from(warehouseStockUnits)).toHaveLength(0)
  })

  it("la cantidad inicial materializa unidades", async () => {
    // Escenarios: «Se crean las existencias iniciales» y «La cantidad inicial materializa
    // unidades». Una unidad es un objeto físico: sin fila no hay nada que etiquetar ni reservar.
    await clearCatalog()

    const product = await newProduct({
      name: "Cámara",
      measurements: [
        { name: "Cuerpo", initialQuantity: 5 },
        { name: "Kit", initialQuantity: 8 },
      ],
    })

    const cuerpo = product.measurements.find((row) => row.name === "Cuerpo")
    const kit = product.measurements.find((row) => row.name === "Kit")

    expect(cuerpo?.units).toEqual({ available: 5 })
    expect(kit?.units).toEqual({ available: 8 })

    const unidades = await db.select().from(warehouseStockUnits)
    expect(unidades).toHaveLength(13)
    expect(new Set(unidades.map((row) => row.code)).size).toBe(13)
  })

  it("sin cantidad no se crean unidades", async () => {
    // Escenario: «Sin cantidad no se crean unidades».
    await clearCatalog()
    const product = await newProduct({ name: "Cámara", measurements: [{ name: "Cuerpo" }] })

    expect(product.measurements[0]?.units).toEqual({})
  })

  it("una medida conserva sus dimensiones con sus unidades", async () => {
    // Escenario: «Se registran dimensiones con sus unidades».
    await clearCatalog()
    const product = await newProduct({
      name: "Maleta",
      measurements: [
        {
          name: "Grande",
          dimensions: { height: 24, width: 18, length: 10, weight: 32 },
          lengthUnit: "in",
          massUnit: "lb",
        },
      ],
    })

    const medida = product.measurements[0]
    expect(medida?.dimensions.height).toBe(24)
    expect(medida?.lengthUnit).toBe("in")
    expect(medida?.massUnit).toBe("lb")
  })

  it("la ficha de sastrería guarda sólo lo pertinente", async () => {
    // Escenario: «Se registra sólo lo pertinente». Todas las medidas corporales son opcionales.
    await clearCatalog()
    const product = await newProduct({
      name: "Traje de época",
      measurements: [
        {
          name: "Talla 40",
          kind: "clothing",
          clothing: {
            garment: "pantalón",
            size: "40",
            measurements: { cintura: 82, cadera: 98, largo: 104 },
          },
        },
      ],
    })

    const medida = product.measurements[0]
    expect(medida?.clothing?.garment).toBe("pantalón")
    expect(medida?.clothing?.measurements).toEqual({ cintura: 82, cadera: 98, largo: 104 })
  })
})

describe("la reclasificación se propaga a los hijos", () => {
  it("cambiar la ubicación del padre mueve las variantes", async () => {
    // Escenario: «Cambiar la ubicación mueve las variantes». Es lo que la herencia existe para
    // ahorrar: reclasificar veinte variantes a mano.
    await clearCatalog()

    const origen = await json<{ id: string }>(
      await request("POST", `${base}/storages`, { name: "Caja A", kind: "box" }, cookie),
    )
    const destino = await json<{ id: string }>(
      await request("POST", `${base}/storages`, { name: "Caja B", kind: "box" }, cookie),
    )

    const product = await newProduct({
      name: "Cámara",
      storageId: origen.id,
      variants: [{ name: "Negra" }, { name: "Gris" }, { name: "Blanca" }, { name: "Roja" }],
    })

    const updated = await json<Detail>(
      await request("PATCH", `${base}/products/${product.id}`, { storageId: destino.id }, cookie),
    )

    expect(updated.storageId).toBe(destino.id)
    expect(updated.variants.map((row) => row.storageId)).toEqual([
      destino.id,
      destino.id,
      destino.id,
      destino.id,
    ])
  })

  it("el nombre y el precio no se propagan", async () => {
    // Lo que hace que una variante sea una variante es poder divergir. Propagar el nombre la
    // convertiría en una vista del padre.
    await clearCatalog()
    const product = await newProduct({ name: "Cámara", variants: [{ name: "Negra" }] })

    const updated = await json<Detail>(
      await request("PATCH", `${base}/products/${product.id}`, { name: "Cámara nueva" }, cookie),
    )

    expect(updated.variants[0]?.name).toBe("Negra")
  })
})

describe("eliminar un producto arrastra su estructura", () => {
  it("la baja alcanza a los hijos, a las medidas y a las unidades", async () => {
    // Escenario: «La eliminación alcanza a los hijos».
    await clearCatalog()

    const product = await newProduct({
      name: "Cámara",
      measurements: [{ name: "Cuerpo", initialQuantity: 3 }],
      variants: [{ name: "Negra", measurements: [{ name: "Cuerpo", initialQuantity: 2 }] }],
      accessories: [{ name: "Correa" }],
    })

    const scope = await json<{ products: number; measurements: number; units: number }>(
      await request("GET", `${base}/products/${product.id}/scope`, undefined, cookie),
    )
    expect(scope).toEqual({ products: 3, measurements: 2, units: 5 })

    const deleted = await request("DELETE", `${base}/products/${product.id}`, undefined, cookie)
    expect(deleted.status).toBe(204)

    const page = await json<{ totalItems: number }>(
      await request("GET", `${base}/products`, undefined, cookie),
    )
    expect(page.totalItems).toBe(0)

    // El borrado es lógico en las tres tablas: las filas aparecen en documentos ya emitidos.
    const productos = await db.select().from(warehouseProducts)
    expect(productos).toHaveLength(3)
    expect(productos.every((row) => row.deletedAt !== null)).toBe(true)

    const unidades = await db.select().from(warehouseStockUnits)
    expect(unidades.every((row) => row.deletedAt !== null)).toBe(true)
  })

  it("eliminar una medida se lleva sus unidades y deja las demás", async () => {
    await clearCatalog()
    const product = await newProduct({
      name: "Cámara",
      measurements: [
        { name: "Cuerpo", initialQuantity: 2 },
        { name: "Kit", initialQuantity: 4 },
      ],
    })

    const cuerpo = product.measurements.find((row) => row.name === "Cuerpo")

    const deleted = await request(
      "DELETE",
      `${base}/products/${product.id}/measurements/${cuerpo?.id}`,
      undefined,
      cookie,
    )
    expect(deleted.status).toBe(204)

    const detail = await json<Detail>(
      await request("GET", `${base}/products/${product.id}`, undefined, cookie),
    )

    expect(detail.measurements.map((row) => row.name)).toEqual(["Kit"])
    expect(detail.measurements[0]?.units).toEqual({ available: 4 })
  })
})

describe("añadir un hijo a un producto que ya existe", () => {
  it("hereda del padre lo que se hereda, y trae código propio", async () => {
    // Escenario: «Un hijo hereda la clasificación». La spec lo dice de crear una variante a un
    // producto, sin exigir que sea en el mismo acto que el padre.
    await clearCatalog()
    const caja = await json<{ id: string }>(
      await request("POST", `${base}/storages`, { name: "Caja 7", kind: "box" }, cookie),
    )
    const categoria = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Cámaras" }, cookie),
    )

    const padre = await newProduct({
      name: "Cámara",
      storageId: caja.id,
      categoryId: categoria.id,
    })

    const response = await request(
      "POST",
      `${base}/products/${padre.id}/children`,
      { relation: "variant", name: "Cámara negra" },
      cookie,
    )
    expect(response.status).toBe(201)

    const hija = await json<Product>(response)
    expect(hija.parentId).toBe(padre.id)
    expect(hija.storageId).toBe(caja.id)
    expect(hija.categoryId).toBe(categoria.id)
    expect(hija.code).not.toBe(padre.code)
  })

  it("distingue la variante del accesorio", async () => {
    await clearCatalog()
    const padre = await newProduct({ name: "Cámara" })

    await request(
      "POST",
      `${base}/products/${padre.id}/children`,
      { relation: "variant", name: "Negra" },
      cookie,
    )
    await request(
      "POST",
      `${base}/products/${padre.id}/children`,
      { relation: "accessory", name: "Trípode" },
      cookie,
    )

    const detail = await json<Detail>(
      await request("GET", `${base}/products/${padre.id}`, undefined, cookie),
    )

    expect(detail.variants.map((row) => row.name)).toEqual(["Negra"])
    expect(detail.accessories.map((row) => row.name)).toEqual(["Trípode"])
  })

  it("nace con sus medidas y sus unidades", async () => {
    await clearCatalog()
    const padre = await newProduct({ name: "Cámara" })

    const response = await request(
      "POST",
      `${base}/products/${padre.id}/children`,
      {
        relation: "variant",
        name: "Negra",
        measurements: [{ name: "Cuerpo", initialQuantity: 2 }],
      },
      cookie,
    )
    expect(response.status).toBe(201)

    const hija = await json<Product>(response)
    const detail = await json<Detail>(
      await request("GET", `${base}/products/${hija.id}`, undefined, cookie),
    )

    expect(detail.measurements[0]?.units).toEqual({ available: 2 })
  })
})

describe("corregir una medida", () => {
  it("conserva las unidades que ya existían", async () => {
    // El motivo de que exista este endpoint. Sin él, corregir una errata en el nombre obliga a
    // borrar la medida y volver a crearla, y eso destruye las unidades: objetos físicos con su
    // código impreso en una etiqueta pegada.
    await clearCatalog()
    const product = await newProduct({
      name: "Cámara",
      measurements: [{ name: "Cuepro", initialQuantity: 3 }],
    })
    const medida = product.measurements[0]

    const response = await request(
      "PATCH",
      `${base}/products/${product.id}/measurements/${medida?.id}`,
      { name: "Cuerpo", dimensions: { height: 12 }, lengthUnit: "cm" },
      cookie,
    )
    expect(response.status).toBe(200)

    const updated = await json<Measurement>(response)
    expect(updated.name).toBe("Cuerpo")
    expect(updated.dimensions.height).toBe(12)
    expect(updated.units).toEqual({ available: 3 })
  })

  it("cambia sólo lo que se manda", async () => {
    await clearCatalog()
    const product = await newProduct({
      name: "Maleta",
      measurements: [{ name: "Grande", kind: "box", priceDifference: "150.00" }],
    })
    const medida = product.measurements[0]

    const response = await request(
      "PATCH",
      `${base}/products/${product.id}/measurements/${medida?.id}`,
      { priceDifference: "-75.50" },
      cookie,
    )
    expect(response.status).toBe(200)

    const updated = await json<Measurement>(response)
    expect(updated.name).toBe("Grande")
    expect(updated.kind).toBe("box")
    expect(updated.priceDifference).toBe("-75.50")
  })

  it("no alcanza a la medida de otro producto", async () => {
    await clearCatalog()
    const uno = await newProduct({ name: "Cámara", measurements: [{ name: "Cuerpo" }] })
    const otro = await newProduct({ name: "Maleta", measurements: [{ name: "Grande" }] })

    const response = await request(
      "PATCH",
      `${base}/products/${uno.id}/measurements/${otro.measurements[0]?.id}`,
      { name: "Robada" },
      cookie,
    )
    expect(response.status).toBe(404)
  })
})

describe("clasificación y búsqueda", () => {
  it("se clasifica en las dos taxonomías, y son independientes", async () => {
    // Escenario: «Se clasifica en ambas taxonomías».
    await clearCatalog()

    const propia = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Ópticas" }, cookie),
    )
    const globalId = newId()
    await db.insert(globalCategories).values({ id: globalId, name: "Equipo de cine" })

    const product = await newProduct({
      name: "Lente 50mm",
      categoryId: propia.id,
      globalCategoryId: globalId,
    })

    expect(product.categoryId).toBe(propia.id)
    expect(product.globalCategoryId).toBe(globalId)
  })

  it("filtrar por una categoría raíz incluye las de sus descendientes", async () => {
    /**
     * Escenario de `query-and-pagination`: «Filtrar por una categoría raíz incluye las hojas».
     *
     * La gramática genérica no puede hacerlo porque no sabe qué campos son jerárquicos. Se resuelve
     * en el catálogo, expandiendo el filtro al subárbol antes de construir la condición.
     */
    await clearCatalog()

    const iluminacion = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Iluminación" }, cookie),
    )
    const led = await json<{ id: string }>(
      await request(
        "POST",
        `${base}/categories`,
        { name: "LED", parentId: iluminacion.id },
        cookie,
      ),
    )
    const paneles = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Paneles", parentId: led.id }, cookie),
    )

    await newProduct({ name: "Panel Aputure", categoryId: paneles.id })
    await newProduct({ name: "Tripié", categoryId: null })

    const page = await json<{ items: Product[]; totalItems: number }>(
      await request("GET", `${base}/products?categoryId=${iluminacion.id}`, undefined, cookie),
    )

    expect(page.totalItems).toBe(1)
    expect(page.items[0]?.name).toBe("Panel Aputure")
  })

  it("se busca por código identificativo", async () => {
    // Escenario: «Se busca por código identificativo».
    await clearCatalog()
    const product = await newProduct({ name: "Cámara" })
    await newProduct({ name: "Tripié" })

    const page = await json<{ items: Product[] }>(
      await request("GET", `${base}/products?search=${product.code}`, undefined, cookie),
    )

    expect(page.items.map((row) => row.id)).toEqual([product.id])
  })

  it("la búsqueda ignora acentos, también en el catálogo", async () => {
    await clearCatalog()
    await newProduct({ name: "Cámara Réflex" })

    const page = await json<{ items: Product[] }>(
      await request("GET", `${base}/products?search=camara reflex`, undefined, cookie),
    )

    expect(page.items).toHaveLength(1)
  })

  it("se filtra por disponibilidad de forma independiente", async () => {
    await clearCatalog()
    await newProduct({ name: "Sólo renta", availableForRent: true })
    await newProduct({ name: "Sólo venta", availableForSale: true })

    const renta = await json<{ items: Product[] }>(
      await request("GET", `${base}/products?availableForRent=true`, undefined, cookie),
    )
    const venta = await json<{ items: Product[] }>(
      await request("GET", `${base}/products?availableForSale=true`, undefined, cookie),
    )

    expect(renta.items.map((row) => row.name)).toEqual(["Sólo renta"])
    expect(venta.items.map((row) => row.name)).toEqual(["Sólo venta"])
  })
})

describe("taxonomía del almacén", () => {
  it("el identificador legible es único dentro de su almacén, no del mundo", async () => {
    await clearCatalog()

    const uno = await json<{ slug: string }>(
      await request("POST", `${base}/categories`, { name: "Ópticas" }, cookie),
    )
    const dos = await json<{ slug: string }>(
      await request("POST", `${base}/categories`, { name: "Ópticas" }, cookie),
    )

    expect(uno.slug).toBe("opticas")
    expect(dos.slug).toBe("opticas-2")
  })

  it("eliminar una categoría deja los productos sin clasificar, no los borra", async () => {
    await clearCatalog()

    const category = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Temporal" }, cookie),
    )
    const product = await newProduct({ name: "Cámara", categoryId: category.id })

    await request("DELETE", `${base}/categories/${category.id}`, undefined, cookie)

    const detail = await json<Detail>(
      await request("GET", `${base}/products/${product.id}`, undefined, cookie),
    )

    expect(detail.categoryId).toBeNull()
  })

  it("una categoría no puede colgar de su propia hija", async () => {
    await clearCatalog()

    const padre = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Padre" }, cookie),
    )
    const hija = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Hija", parentId: padre.id }, cookie),
    )

    const response = await request(
      "PATCH",
      `${base}/categories/${padre.id}`,
      { parentId: hija.id },
      cookie,
    )

    expect(response.status).toBe(422)
  })
})

describe("camino y alcance de una categoría", () => {
  it("una categoría se pide suelta y trae su camino desde la raíz", async () => {
    // H-38: situar una categoría obligaba a bajar desde las raíces con una petición por rama. Es
    // lo mismo que las ubicaciones resuelven con `/path`, en el otro árbol del almacén.
    await clearCatalog()

    const raiz = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Cámara" }, cookie),
    )
    const media = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Ópticas", parentId: raiz.id }, cookie),
    )
    const hoja = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Zoom", parentId: media.id }, cookie),
    )

    const suelta = await request("GET", `${base}/categories/${hoja.id}`, undefined, cookie)
    expect(suelta.status).toBe(200)
    expect(await json<{ name: string; parentId: string }>(suelta)).toMatchObject({
      name: "Zoom",
      parentId: media.id,
    })

    const path = await json<{ items: { name: string }[] }>(
      await request("GET", `${base}/categories/${hoja.id}/path`, undefined, cookie),
    )
    expect(path.items.map((row) => row.name)).toEqual(["Cámara", "Ópticas", "Zoom"])
  })

  it("el alcance dice cuántas categorías y cuántas entidades se lleva la baja", async () => {
    // Escenario: «Se advierte del alcance antes de eliminar», de `category-trees`. Sin esta cifra
    // la confirmación destructiva no puede decir qué se lleva por delante.
    await clearCatalog()

    const raiz = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Grip" }, cookie),
    )
    const hija = await json<{ id: string }>(
      await request("POST", `${base}/categories`, { name: "Tripiés", parentId: raiz.id }, cookie),
    )
    await request("POST", `${base}/categories`, { name: "Bases", parentId: hija.id }, cookie)

    // Un producto con variantes: las variantes heredan la categoría del padre y no se cuentan
    // aparte, igual que en el alcance de una ubicación.
    await newProduct({ name: "Tripié", categoryId: hija.id, variants: [{ name: "Alto" }] })
    await newProduct({ name: "Base", categoryId: raiz.id })

    const scope = await json<{ categories: number; products: number }>(
      await request("GET", `${base}/categories/${raiz.id}/scope`, undefined, cookie),
    )

    expect(scope).toEqual({ categories: 3, products: 2 })
  })

  it("una categoría de otro almacén no existe para éste", async () => {
    await clearCatalog()

    const otro = await json<{ id: string }>(
      await request("POST", `/companies/${companyId}/warehouses`, { name: "Otra nave" }, cookie),
    )
    const ajena = await json<{ id: string }>(
      await request(
        "POST",
        `/companies/${companyId}/warehouses/${otro.id}/categories`,
        { name: "Ajena" },
        cookie,
      ),
    )

    const response = await request("GET", `${base}/categories/${ajena.id}`, undefined, cookie)
    expect(response.status).toBe(404)
  })
})

// ─── Fotos ───────────────────────────────────────────────────────────────────

/**
 * La galería de un producto.
 *
 * Transcritas de `openspec/specs/media-storage/spec.md`, requisito «Sustituir una colección de
 * archivos». Es el defecto L-01 y el escenario está escrito con estas mismas letras: A, B, C → A, D.
 */
describe("fotos de un producto", () => {
  /** Un archivo subido de la empresa, que es lo que la galería admite. */
  async function seedPhoto(name: string, options: { company?: string } = {}): Promise<string> {
    const id = newId()
    const owner = options.company ?? companyId
    await db.insert(uploads).values({
      id,
      kind: "image",
      status: "uploaded",
      url: `http://almacen/${owner}/${id}/original.jpg`,
      fileName: `${name}.jpg`,
      extension: "jpg",
      contentType: "image/jpeg",
      byteSize: 2048,
      storagePath: `${owner}/${id}`,
    })
    return id
  }

  async function setImages(productId: string, body: Record<string, unknown>) {
    return request("PUT", `${base}/products/${productId}/images`, body, cookie)
  }

  async function stillThere(id: string): Promise<boolean> {
    const [row] = await db.select({ id: uploads.id }).from(uploads).where(eq(uploads.id, id))
    return row !== undefined
  }

  it("se eliminan las que dejaron de estar y se conservan las que siguen", async () => {
    // Escenario: «Sólo se elimina lo retirado». Un producto con A, B y C se actualiza a A y D.
    await clearCatalog()
    await db.delete(uploads)

    const product = await newProduct({ name: "Cámara" })
    const [a, b, c, d] = await Promise.all([
      seedPhoto("a"),
      seedPhoto("b"),
      seedPhoto("c"),
      seedPhoto("d"),
    ])

    expect((await setImages(product.id, { uploadIds: [a, b, c] })).status).toBe(200)

    const updated = await json<Detail>(await setImages(product.id, { uploadIds: [a, d] }))

    expect(updated.images.map((image) => image.uploadId)).toEqual([a, d])
    expect(await stillThere(a)).toBe(true)
    expect(await stillThere(d)).toBe(true)
    expect(await stillThere(b)).toBe(false)
    expect(await stillThere(c)).toBe(false)
  })

  it("una colección sin cambios no borra nada", async () => {
    // Escenario: «Una colección sin cambios no borra nada».
    await clearCatalog()
    await db.delete(uploads)

    const product = await newProduct({ name: "Tripié" })
    const [a, b] = await Promise.all([seedPhoto("a"), seedPhoto("b")])

    await setImages(product.id, { uploadIds: [a, b] })
    await setImages(product.id, { uploadIds: [a, b] })

    expect(await stillThere(a)).toBe(true)
    expect(await stillThere(b)).toBe(true)
  })

  it("la portada se elige, y sólo hay una", async () => {
    await clearCatalog()
    await db.delete(uploads)

    const product = await newProduct({ name: "Monitor" })
    const [a, b] = await Promise.all([seedPhoto("a"), seedPhoto("b")])

    // Sin elegir, la portada es la primera: un listado necesita algo que enseñar desde el principio.
    const first = await json<Detail>(await setImages(product.id, { uploadIds: [a, b] }))
    expect(first.images.filter((image) => image.isCover).map((image) => image.uploadId)).toEqual([
      a,
    ])

    const second = await json<Detail>(
      await setImages(product.id, { uploadIds: [a, b], coverUploadId: b }),
    )
    expect(second.images.filter((image) => image.isCover).map((image) => image.uploadId)).toEqual([
      b,
    ])
  })

  it("reordenar no retira ninguna foto", async () => {
    await clearCatalog()
    await db.delete(uploads)

    const product = await newProduct({ name: "Óptica" })
    const [a, b, c] = await Promise.all([seedPhoto("a"), seedPhoto("b"), seedPhoto("c")])

    await setImages(product.id, { uploadIds: [a, b, c] })
    const moved = await json<Detail>(await setImages(product.id, { uploadIds: [c, a, b] }))

    expect(moved.images.map((image) => image.uploadId)).toEqual([c, a, b])
    expect(moved.images.map((image) => image.position)).toEqual([0, 1, 2])
    expect(await stillThere(b)).toBe(true)
  })

  it("el borrado lógico conserva las fotos, y vuelven a verse al restaurar", async () => {
    // Escenario: «Un borrado lógico conserva los archivos».
    await clearCatalog()
    await db.delete(uploads)

    const product = await newProduct({ name: "Grúa" })
    const a = await seedPhoto("a")
    await setImages(product.id, { uploadIds: [a] })

    await request("DELETE", `${base}/products/${product.id}`, undefined, cookie)
    expect(await stillThere(a)).toBe(true)

    // Restaurar todavía no tiene ruta: la propiedad que se comprueba es que la foto sobrevive al
    // borrado y sigue enganchada al producto, no que exista un botón de deshacer.
    await db
      .update(warehouseProducts)
      .set({ deletedAt: null })
      .where(eq(warehouseProducts.id, product.id))

    const restored = await json<Detail>(
      await request("GET", `${base}/products/${product.id}`, undefined, cookie),
    )
    expect(restored.images.map((image) => image.uploadId)).toEqual([a])
  })

  it("no admite un archivo de otra empresa", async () => {
    await clearCatalog()
    await db.delete(uploads)

    const product = await newProduct({ name: "Foco" })
    const ajena = await seedPhoto("ajena", { company: newId() })

    const response = await setImages(product.id, { uploadIds: [ajena] })
    expect(response.status).toBe(404)
  })

  it("no admite un archivo que no llegó a subirse", async () => {
    // «No se muestra como una imagen válida en ninguna superficie»: tampoco se deja referenciar.
    await clearCatalog()
    await db.delete(uploads)

    const product = await newProduct({ name: "Cable" })
    const roto = await seedPhoto("roto")
    await db.update(uploads).set({ status: "error" }).where(eq(uploads.id, roto))

    const response = await setImages(product.id, { uploadIds: [roto] })
    expect(response.status).toBe(422)
  })

  it("la portada viaja con el producto en el listado", async () => {
    await clearCatalog()
    await db.delete(uploads)

    const product = await newProduct({ name: "Claqueta" })
    const a = await seedPhoto("a")
    await setImages(product.id, { uploadIds: [a] })

    const page = await json<{ items: { id: string; coverUrl: string | null }[] }>(
      await request("GET", `${base}/products`, undefined, cookie),
    )

    expect(page.items.find((item) => item.id === product.id)?.coverUrl).toContain(`${a}/`)
  })
})
