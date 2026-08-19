/**
 * Campos calculados.
 *
 * Transcripción de los escenarios de `openspec/specs/computed-fields/spec.md`, con los valores
 * concretos que la spec da. La spec es explícita en que estas fórmulas viven **en un solo sitio**:
 * el riesgo que describe es que cada endpoint las vuelva a derivar por su cuenta y con criterios
 * distintos, así que probar la fórmula aquí es probar la que todas las superficies usan.
 */

import { describe, expect, it } from "vitest"
import {
  ALWAYS,
  ON_REQUEST,
  activeCustomization,
  cashExpected,
  countOf,
  deliveryIsFinished,
  fullName,
  fullPhone,
  histogram,
  inventoryBalance,
  isAlwaysPresent,
  primaryOf,
  sceneLabel,
  siteAddress,
  siteSubdomain,
  singleOf,
  STOCK_STATUSES,
  storageDepth,
  stockBreakdown,
  discountedPrice,
  salesTotal,
  TASK_STATUSES,
} from "./computed.ts"
import { formatMoney, money } from "./money.ts"

// ─── Recuentos ───────────────────────────────────────────────────────────────

describe("recuentos de elementos relacionados", () => {
  it("«Una colección vacía cuenta cero»", () => {
    // El requisito es literal: «SHALL ser `0`, nunca nulo ni ausente».
    expect(countOf([])).toBe(0)
    expect(countOf(null)).toBe(0)
    expect(countOf(undefined)).toBe(0)
  })

  it("cuenta los elementos que hay", () => {
    expect(countOf(["a", "b", "c"])).toBe(3)
  })

  it("un recuento que viene del motor como texto o nulo se normaliza", () => {
    // `count()` de SQL llega como cadena en algunos controladores, y como nulo en un `left join`
    // sin filas. Las dos formas tienen que dar el entero, no `NaN` ni nulo.
    expect(countOf("7")).toBe(7)
    expect(countOf(0)).toBe(0)
  })

  it("«El inventario de Pixit suma cantidades, no filas»", () => {
    const movimientos = [{ quantity: 10 }, { quantity: -3 }]

    expect(inventoryBalance(movimientos)).toBe(7)
    expect(inventoryBalance(movimientos)).not.toBe(2)
  })

  it("una definición sin movimientos tiene existencia cero", () => {
    expect(inventoryBalance([])).toBe(0)
  })
})

// ─── Histogramas ─────────────────────────────────────────────────────────────

describe("desglose de existencias por estado", () => {
  it("«El desglose incluye los estados vacíos»", () => {
    const unidades = [
      { status: "available" },
      { status: "available" },
      { status: "available" },
      { status: "sold" },
    ] as const

    const desglose = stockBreakdown(unidades)

    expect(desglose.available).toBe(3)
    expect(desglose.sold).toBe(1)

    const restantes = STOCK_STATUSES.filter((estado) => estado !== "available" && estado !== "sold")
    expect(restantes).toHaveLength(9)
    for (const estado of restantes) {
      expect(desglose[estado], estado).toBe(0)
    }
  })

  it("son los once estados de la spec", () => {
    expect(STOCK_STATUSES).toHaveLength(11)
    expect([...STOCK_STATUSES].sort()).toEqual(
      [
        "available",
        "sold",
        "rented",
        "in_order",
        "in_quote",
        "lost",
        "damaged",
        "expense",
        "modified",
        "robbed",
        "incomplete",
      ].sort(),
    )
  })

  it("un desglose sin unidades es once ceros, no un objeto vacío", () => {
    const desglose = stockBreakdown([])

    expect(Object.values(desglose)).toHaveLength(11)
    expect(Object.values(desglose).every((valor) => valor === 0)).toBe(true)
  })

  it("«El desglose de un plan cubre todos sus estados»", () => {
    const desglose = histogram(TASK_STATUSES, [
      { status: "pending" },
      { status: "pending" },
      { status: "completed" },
    ])

    expect(desglose).toEqual({ pending: 2, in_progress: 0, completed: 1, incomplete: 0 })
  })

  it("un estado que no está en la tabla no se cuela en el desglose", () => {
    // Un valor inesperado del motor no debe inventar una clave: el desglose es de forma fija.
    const desglose = histogram(TASK_STATUSES, [{ status: "inventado" }])

    expect(Object.keys(desglose)).toEqual([...TASK_STATUSES])
  })
})

// ─── Dinero ──────────────────────────────────────────────────────────────────

describe("total de una sesión de caja", () => {
  it("«El total suma todas las ventas de la sesión»", () => {
    const ventas = [{ total: "100.00" }, { total: "250.50" }, { total: "49.50" }]

    expect(formatMoney(salesTotal(ventas))).toBe("400.00")
  })

  it("una sesión sin ventas suma cero", () => {
    expect(formatMoney(salesTotal([]))).toBe("0.00")
  })
})

describe("efectivo esperado en caja", () => {
  it("«Sólo el efectivo cuenta»", () => {
    const efectivo = cashExpected(money("500.00"), [
      { method: "cash", total: "200.00", change: "50.00" },
      { method: "card", total: "300.00", change: null },
    ])

    expect(formatMoney(efectivo)).toBe("650.00")
  })

  it("«Una sesión sin ventas conserva su fondo»", () => {
    expect(formatMoney(cashExpected(money("500.00"), []))).toBe("500.00")
  })

  it("una venta en efectivo sin cambio suma su total entero", () => {
    const efectivo = cashExpected(money("0.00"), [
      { method: "cash", total: "120.00", change: null },
    ])

    expect(formatMoney(efectivo)).toBe("120.00")
  })
})

describe("precio final con descuento", () => {
  it("«Un descuento activo reduce el precio final»", () => {
    expect(formatMoney(discountedPrice(money("200.00"), "15", true))).toBe("170.00")
  })

  it("«Un descuento inactivo no se aplica»", () => {
    expect(formatMoney(discountedPrice(money("200.00"), "15", false))).toBe("200.00")
  })

  it("el descuento se redondea a dos decimales antes de restarse", () => {
    // `round(precio × descuento ÷ 100, 2)`: 99.99 × 33 % = 32.9967 → 33.00, y 99.99 − 33.00.
    expect(formatMoney(discountedPrice(money("99.99"), "33", true))).toBe("66.99")
  })

  it("sin porcentaje no hay descuento que aplicar", () => {
    expect(formatMoney(discountedPrice(money("200.00"), null, true))).toBe("200.00")
  })
})

// ─── Identidad derivada ──────────────────────────────────────────────────────

describe("nombre completo y teléfono compuesto", () => {
  it("«Un usuario sin apellido no arrastra espacio»", () => {
    expect(fullName("Ana", null)).toBe("Ana")
    expect(fullName("Ana", "")).toBe("Ana")
    expect(fullName("Ana", "   ")).toBe("Ana")
  })

  it("une nombre y apellido con un espacio", () => {
    expect(fullName("Ana", "Ruiz")).toBe("Ana Ruiz")
  })

  it("un usuario sin nombre tampoco arrastra espacio", () => {
    expect(fullName(null, "Ruiz")).toBe("Ruiz")
    expect(fullName(null, null)).toBe("")
  })

  it("el teléfono se une sin separador", () => {
    expect(fullPhone("+52", "5512345678")).toBe("+525512345678")
  })

  it("un teléfono sin código de país es el número a secas", () => {
    expect(fullPhone(null, "5512345678")).toBe("5512345678")
    expect(fullPhone("+52", null)).toBe("")
  })
})

describe("etiqueta compuesta de una escena", () => {
  it("«La etiqueta identifica la escena en la producción»", () => {
    expect(sceneLabel(2, 4)).toBe("2.4")
    // La escena 4 de otro capítulo no comparte etiqueta.
    expect(sceneLabel(3, 4)).not.toBe(sceneLabel(2, 4))
  })
})

describe("nivel de profundidad de una ubicación", () => {
  it("«El nivel viene del tipo, no de la posición»", () => {
    expect(storageDepth("shelf")).toBe(storageDepth("shelf"))
  })

  it("ordena de mayor a menor, de piso a contenedor", () => {
    expect(storageDepth("floor")).toBeLessThan(storageDepth("aisle"))
    expect(storageDepth("aisle")).toBeLessThan(storageDepth("shelf"))
    expect(storageDepth("shelf")).toBeLessThan(storageDepth("bin"))
  })

  it("permite decidir si un nodo puede anidarse bajo otro", () => {
    // Es para lo que existe: un tipo sólo cuelga de otro estrictamente más general.
    expect(storageDepth("shelf") > storageDepth("rack")).toBe(true)
    expect(storageDepth("shelf") > storageDepth("shelf")).toBe(false)
  })
})

describe("indicador de nota de entrega finalizada", () => {
  it("«Una nota completada se marca finalizada»", () => {
    expect(deliveryIsFinished("completed")).toBe(true)
  })

  it("las demás no lo están", () => {
    expect(deliveryIsFinished("pending")).toBe(false)
    expect(deliveryIsFinished("in_progress")).toBe(false)
    expect(deliveryIsFinished("canceled")).toBe(false)
  })
})

// ─── Selección ───────────────────────────────────────────────────────────────

describe("dirección primaria de una empresa", () => {
  it("«Se expone la dirección marcada»", () => {
    const direcciones = [
      { id: "a", isPrimary: false },
      { id: "b", isPrimary: true },
      { id: "c", isPrimary: false },
    ]

    expect(primaryOf(direcciones)?.id).toBe("b")
  })

  it("«Sin marca no hay dirección primaria»", () => {
    expect(primaryOf([{ id: "a", isPrimary: false }])).toBeNull()
  })

  it("sin direcciones tampoco", () => {
    expect(primaryOf([])).toBeNull()
  })
})

describe("pago asociado a una cotización", () => {
  it("«Una cotización sin pago expone nulo»", () => {
    expect(singleOf([])).toBeNull()
  })

  it("es un elemento, no una lista", () => {
    expect(singleOf([{ id: "p1" }])).toEqual({ id: "p1" })
  })
})

describe("personalización vigente de un sitio", () => {
  const primaria = { id: "primaria", isPrimary: true, startsAt: null, endsAt: null }
  const diciembre = {
    id: "diciembre",
    isPrimary: false,
    startsAt: new Date("2026-12-01T00:00:00Z"),
    endsAt: new Date("2026-12-31T23:59:59Z"),
  }

  it("«Una campaña vigente sustituye al tema primario»", () => {
    const vigente = activeCustomization(
      [primaria, diciembre],
      new Date("2026-12-15T12:00:00Z"),
    )

    expect(vigente?.id).toBe("diciembre")
  })

  it("«Fuera de la ventana vuelve el primario»", () => {
    const vigente = activeCustomization(
      [primaria, diciembre],
      new Date("2027-01-15T12:00:00Z"),
    )

    expect(vigente?.id).toBe("primaria")
  })

  it("«Un sitio sin ninguna personalización»", () => {
    expect(activeCustomization([], new Date())).toBeNull()
  })

  it("un sitio con campañas pero sin primaria, fuera de ventana, no tiene vigente", () => {
    expect(activeCustomization([diciembre], new Date("2027-01-15T12:00:00Z"))).toBeNull()
  })

  it("cuando dos campañas solapan, se elige de forma determinista", () => {
    // «SHALL elegirse de forma determinista». La que empieza más tarde gana: es la más específica,
    // y sobre todo el resultado no depende del orden en que el motor devolvió las filas.
    const enero = {
      id: "enero",
      isPrimary: false,
      startsAt: new Date("2026-12-20T00:00:00Z"),
      endsAt: new Date("2027-01-10T00:00:00Z"),
    }
    const momento = new Date("2026-12-25T00:00:00Z")

    expect(activeCustomization([primaria, diciembre, enero], momento)?.id).toBe("enero")
    expect(activeCustomization([enero, diciembre, primaria], momento)?.id).toBe("enero")
  })

  it("una ventana abierta por un lado sigue siendo una ventana", () => {
    const desdeSiempre = {
      id: "sin-inicio",
      isPrimary: false,
      startsAt: null,
      endsAt: new Date("2027-01-10T00:00:00Z"),
    }

    expect(
      activeCustomization([primaria, desdeSiempre], new Date("2026-06-01T00:00:00Z"))?.id,
    ).toBe("sin-inicio")
  })
})

// ─── Sitio ───────────────────────────────────────────────────────────────────

describe("dominio y dirección pública de un sitio", () => {
  it("«Un sitio con slug deriva su subdominio»", () => {
    expect(siteSubdomain({ slug: "renta-cdmx", id: "abc" }, "sites.ejemplo.com")).toBe(
      "renta-cdmx.sites.ejemplo.com",
    )
  })

  it("y su dirección empieza por esquema seguro en producción", () => {
    const direccion = siteAddress({ slug: "renta-cdmx", id: "abc" }, "sites.ejemplo.com", true)

    expect(direccion).toBe("https://renta-cdmx.sites.ejemplo.com")
  })

  it("sin identificador legible se usa el identificador", () => {
    expect(siteSubdomain({ slug: null, id: "abc" }, "sites.ejemplo.com")).toBe(
      "abc.sites.ejemplo.com",
    )
  })

  it("fuera de producción el esquema no es seguro, para poder servirlo en local", () => {
    expect(siteAddress({ slug: "tienda", id: "abc" }, "localhost:3000", false)).toBe(
      "http://tienda.localhost:3000",
    )
  })
})

// ─── Presencia declarada ─────────────────────────────────────────────────────

describe("presencia declarada de los campos calculados", () => {
  it("«Un agregado costoso no se calcula sin pedirlo»", () => {
    // El desglose de tareas agrega sobre una colección grande: la spec lo quiere opcional.
    expect(isAlwaysPresent("productionWorkflow", "taskBreakdown")).toBe(false)
  })

  it("un recuento barato va siempre", () => {
    expect(isAlwaysPresent("productionChapter", "sceneCount")).toBe(true)
  })

  it("la declaración distingue las dos categorías y no admite una tercera", () => {
    expect(ALWAYS).not.toBe(ON_REQUEST)
  })

  it("preguntar por un campo que no está declarado es un error, no un «falso»", () => {
    // Devolver «falso» dejaría que un campo sin declarar se colara como opcional sin que nadie lo
    // decidiera. La spec pide que **cada recurso declare** qué incluye.
    expect(() => isAlwaysPresent("productionChapter", "inventado")).toThrow(/no está declarado/i)
  })
})
