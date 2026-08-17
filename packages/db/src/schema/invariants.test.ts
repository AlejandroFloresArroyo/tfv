/**
 * Invariantes que **el motor** garantiza por sí mismo.
 *
 * Son las propiedades que deben seguir en pie aunque la aplicación se equivoque: exactamente los
 * puntos donde la pila anterior fallaba porque dependían de código que alguien podía olvidar.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { closeConnection, db } from "../index.ts"
import { companies } from "./identity.ts"
import {
  pixitBoardSizes,
  pixitBoards,
  pixitCashSessions,
  pixitColors,
  pixitInventoryDefinitions,
  pixitInventoryMovements,
  pixitStores,
} from "./pixit.ts"
import {
  productionCharacters,
  productionContinuities,
  productionRecordings,
  productionScenes,
  productions,
} from "./productions.ts"
import { productionItems, productionProps } from "./productions-ops.ts"
import { warehouseOrders, warehouseStockReservations } from "./warehouse-commerce.ts"
import {
  warehouseMeasurements,
  warehouseProducts,
  warehouseStockUnits,
  warehouses,
} from "./warehouses.ts"

const TABLES = [
  "warehouse_stock_reservations",
  "warehouse_orders",
  "warehouse_stock_units",
  "warehouse_measurements",
  "warehouse_products",
  "warehouses",
  "pixit_inventory_movements",
  "pixit_inventory_definitions",
  "pixit_sales",
  "pixit_cash_sessions",
  "pixit_stores",
  "pixit_board_sizes",
  "pixit_boards",
  "pixit_colors",
  "production_props",
  "production_items",
  "production_continuities",
  "production_recordings",
  "production_scenes",
  "production_characters",
  "production_categories",
  "productions",
  "companies",
  "users",
]

async function reset() {
  await db.execute(sql.raw(`truncate table ${TABLES.join(", ")} cascade`))
}

/** Comprueba que una escritura choca contra una restricción concreta del motor. */
async function expectConstraint(work: Promise<unknown>, constraint: string) {
  let raised: unknown
  try {
    await work
  } catch (error) {
    raised = error
  }

  expect(raised, `se esperaba una violación de ${constraint}`).toBeDefined()
  const cause = (raised as { cause?: { constraint_name?: string } }).cause
  expect(cause?.constraint_name).toBe(constraint)
}

async function seedCompany() {
  const company = { id: newId(), name: "Empresa" }
  await db.insert(companies).values(company)
  return company
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

describe("reserva de existencias", () => {
  async function seedStockUnit() {
    const company = await seedCompany()
    const warehouse = { id: newId(), companyId: company.id, name: "Bodega" }
    const product = { id: newId(), warehouseId: warehouse.id, name: "Cámara", code: newId() }
    const measurement = { id: newId(), productId: product.id, name: "Cuerpo" }
    const unit = { id: newId(), measurementId: measurement.id, code: newId() }

    await db.insert(warehouses).values(warehouse)
    await db.insert(warehouseProducts).values(product)
    await db.insert(warehouseMeasurements).values(measurement)
    await db.insert(warehouseStockUnits).values(unit)

    return unit
  }

  it("una unidad no se reserva dos veces", async () => {
    // Es la garantía estructural que impide prometer el mismo equipo a dos clientes.
    const unit = await seedStockUnit()

    await db.insert(warehouseStockReservations).values({ id: newId(), stockUnitId: unit.id })

    await expectConstraint(
      db.insert(warehouseStockReservations).values({ id: newId(), stockUnitId: unit.id }),
      "warehouse_stock_reservations_unit_unique",
    )
  })

  it("liberar la reserva permite volver a reservarla", async () => {
    const unit = await seedStockUnit()
    const first = { id: newId(), stockUnitId: unit.id }

    await db.insert(warehouseStockReservations).values(first)
    await db
      .update(warehouseStockReservations)
      .set({ releasedAt: new Date() })
      .where(eq(warehouseStockReservations.id, first.id))

    await db.insert(warehouseStockReservations).values({ id: newId(), stockUnitId: unit.id })

    const alive = await db.select().from(warehouseStockReservations).where(sql`released_at is null`)
    expect(alive).toHaveLength(1)
  })
})

describe("prioridad del pedido", () => {
  it("se deriva del estado, no la escribe la aplicación", async () => {
    const company = await seedCompany()
    const warehouse = { id: newId(), companyId: company.id, name: "Bodega" }
    await db.insert(warehouses).values(warehouse)

    const order = {
      id: newId(),
      warehouseId: warehouse.id,
      code: newId(),
      origin: "production" as const,
    }
    await db.insert(warehouseOrders).values(order)

    const [pending] = await db
      .select()
      .from(warehouseOrders)
      .where(eq(warehouseOrders.id, order.id))
    expect(pending?.priority).toBe("0.80")

    await db
      .update(warehouseOrders)
      .set({ status: "finished" })
      .where(eq(warehouseOrders.id, order.id))

    const [finished] = await db
      .select()
      .from(warehouseOrders)
      .where(eq(warehouseOrders.id, order.id))
    expect(finished?.priority).toBe("0.50")
  })
})

describe("utilería de continuidad", () => {
  async function seedContinuity() {
    const company = await seedCompany()
    const production = { id: newId(), companyId: company.id, name: "Serie" }
    const character = { id: newId(), productionId: production.id, name: "Protagonista" }
    const recording = { id: newId(), productionId: production.id, name: "Jornada 1" }
    const continuity = { id: newId(), recordingId: recording.id, characterId: character.id }

    await db.insert(productions).values(production)
    await db.insert(productionCharacters).values(character)
    await db.insert(productionRecordings).values(recording)
    await db.insert(productionContinuities).values(continuity)

    return { production, continuity }
  }

  it("rechaza una pieza sin artículo ni video", async () => {
    const { continuity } = await seedContinuity()

    await expectConstraint(
      db.insert(productionProps).values({ id: newId(), continuityId: continuity.id }),
      "production_props_item_xor_video",
    )
  })

  it("rechaza una pieza con artículo y video a la vez", async () => {
    const { production, continuity } = await seedContinuity()
    const item = { id: newId(), productionId: production.id, name: "Sombrero", code: newId() }
    await db.insert(productionItems).values(item)

    await expectConstraint(
      db.insert(productionProps).values({
        id: newId(),
        continuityId: continuity.id,
        itemId: item.id,
        videoId: newId(),
      }),
      "production_props_item_xor_video",
    )
  })

  it("admite una pieza que referencia sólo un artículo", async () => {
    const { production, continuity } = await seedContinuity()
    const item = { id: newId(), productionId: production.id, name: "Sombrero", code: newId() }
    await db.insert(productionItems).values(item)

    await db
      .insert(productionProps)
      .values({ id: newId(), continuityId: continuity.id, itemId: item.id })

    expect(await db.select().from(productionProps)).toHaveLength(1)
  })
})

describe("libro de inventario de Pixit", () => {
  async function seedDefinition() {
    const company = await seedCompany()
    const store = { id: newId(), companyId: company.id, name: "Tienda" }
    const color = { id: newId(), name: "Rojo", hex: "#FF0000" }

    await db.insert(pixitStores).values(store)
    await db.insert(pixitColors).values(color)

    const definition = {
      id: newId(),
      storeId: store.id,
      kind: "brick" as const,
      catalogRefId: color.id,
    }
    await db.insert(pixitInventoryDefinitions).values(definition)

    return { store, definition }
  }

  it("la existencia es la suma de los movimientos", async () => {
    const { definition } = await seedDefinition()

    await db.insert(pixitInventoryMovements).values([
      { id: newId(), definitionId: definition.id, quantity: 50, pieces: 300 },
      { id: newId(), definitionId: definition.id, quantity: -12, pieces: -72 },
      { id: newId(), definitionId: definition.id, quantity: 30, pieces: 180 },
    ])

    const [row] = await db
      .select({ total: sql<string>`sum(quantity)` })
      .from(pixitInventoryMovements)
      .where(eq(pixitInventoryMovements.definitionId, definition.id))

    expect(Number(row?.total)).toBe(68)
  })

  it("rechaza bolsas y piezas con signos incoherentes", async () => {
    const { definition } = await seedDefinition()

    await expectConstraint(
      db
        .insert(pixitInventoryMovements)
        .values({ id: newId(), definitionId: definition.id, quantity: 10, pieces: -60 }),
      "pixit_inventory_movements_signs",
    )
  })

  it("un movimiento no se compensa dos veces", async () => {
    // Anular dos veces la misma venta es imposible a nivel de base, no sólo improbable.
    const { definition } = await seedDefinition()
    const original = { id: newId(), definitionId: definition.id, quantity: -5, pieces: -30 }
    await db.insert(pixitInventoryMovements).values(original)

    await db.insert(pixitInventoryMovements).values({
      id: newId(),
      definitionId: definition.id,
      quantity: 5,
      pieces: 30,
      compensatesMovementId: original.id,
    })

    await expectConstraint(
      db.insert(pixitInventoryMovements).values({
        id: newId(),
        definitionId: definition.id,
        quantity: 5,
        pieces: 30,
        compensatesMovementId: original.id,
      }),
      "pixit_inventory_movements_compensates_unique",
    )
  })

  it("una tienda no maneja el mismo artículo dos veces", async () => {
    const { store, definition } = await seedDefinition()

    await expectConstraint(
      db.insert(pixitInventoryDefinitions).values({
        id: newId(),
        storeId: store.id,
        kind: "brick",
        catalogRefId: definition.catalogRefId,
      }),
      "pixit_inventory_definitions_unique",
    )
  })
})

describe("caja de Pixit", () => {
  it("una tienda no admite dos sesiones abiertas", async () => {
    const company = await seedCompany()
    const store = { id: newId(), companyId: company.id, name: "Tienda" }
    await db.insert(pixitStores).values(store)

    await db.insert(pixitCashSessions).values({ id: newId(), storeId: store.id })

    await expectConstraint(
      db.insert(pixitCashSessions).values({ id: newId(), storeId: store.id }),
      "pixit_cash_sessions_active_unique",
    )
  })

  it("cerrar la sesión permite abrir otra", async () => {
    const company = await seedCompany()
    const store = { id: newId(), companyId: company.id, name: "Tienda" }
    const first = { id: newId(), storeId: store.id }

    await db.insert(pixitStores).values(store)
    await db.insert(pixitCashSessions).values(first)
    await db
      .update(pixitCashSessions)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(pixitCashSessions.id, first.id))

    await db.insert(pixitCashSessions).values({ id: newId(), storeId: store.id })

    expect(await db.select().from(pixitCashSessions)).toHaveLength(2)
  })
})

describe("catálogo de Pixit", () => {
  it("rechaza dimensiones no positivas", async () => {
    const board = { id: newId(), name: "Retrato" }
    await db.insert(pixitBoards).values(board)

    await expectConstraint(
      db
        .insert(pixitBoardSizes)
        .values({ id: newId(), boardId: board.id, name: "Nulo", sheetsX: 0, sheetsY: 2 }),
      "pixit_board_sizes_positive",
    )
  })

  it("rechaza un valor cromático mal formado", async () => {
    await expectConstraint(
      db.insert(pixitColors).values({ id: newId(), name: "Inválido", hex: "rojo" }),
      "pixit_colors_hex_format",
    )
  })
})

describe("índices de un solo elemento", () => {
  it("una escena no repite índice dentro de su capítulo", async () => {
    const company = await seedCompany()
    const production = { id: newId(), companyId: company.id, name: "Serie" }
    await db.insert(productions).values(production)

    const { productionChapters } = await import("./productions.ts")
    const chapter = { id: newId(), productionId: production.id, name: "Capítulo 1", index: 1 }
    await db.insert(productionChapters).values(chapter)

    await db
      .insert(productionScenes)
      .values({ id: newId(), chapterId: chapter.id, name: "Escena 1", index: 1 })

    await expectConstraint(
      db
        .insert(productionScenes)
        .values({ id: newId(), chapterId: chapter.id, name: "Otra", index: 1 }),
      "production_scenes_index_unique",
    )
  })
})
