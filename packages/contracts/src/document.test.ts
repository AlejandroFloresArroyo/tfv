/**
 * Documentos generados.
 *
 * Transcritas de los escenarios de `openspec/specs/pdf-documents/spec.md`: el nombre del archivo,
 * el orden de las líneas, y que **lo que se ve sumado cuadre con el total que se enseña**.
 */

import { describe, expect, it } from "vitest"
import {
  composeQuoteDocument,
  documentFileName,
  type QuoteDocumentInput,
  type QuoteDocumentLine,
} from "./document.ts"
import type { QuotationBreakdown, QuotationLineBreakdown } from "./quotation.ts"

// ─── Andamiaje ───────────────────────────────────────────────────────────────

function lineBreakdown(
  lineId: string,
  productId: string,
  total: string,
  extra: Partial<QuotationLineBreakdown> = {},
): QuotationLineBreakdown {
  return {
    lineId,
    productId,
    measurementId: `${lineId}-medida`,
    quantity: 1,
    frequency: "weekly",
    appliedDays: "1.00",
    unitCost: total,
    cost: total,
    discount: "0.00",
    total,
    penalty: "0.00",
    fee: "0.00",
    unitFee: "0.00",
    totalWithFee: total,
    unpriced: false,
    ...extra,
  }
}

function line(id: string, productId: string, extra: Partial<QuoteDocumentLine> = {}) {
  return {
    id,
    productId,
    productName: `Producto ${productId}`,
    productCode: `P-${productId}`,
    measurementName: "Estándar",
    frequency: "weekly" as const,
    quantity: 1,
    position: 0,
    positionProduct: 0,
    ...extra,
  }
}

function breakdown(
  lines: readonly QuotationLineBreakdown[],
  extra: Partial<QuotationBreakdown> = {},
): QuotationBreakdown {
  const total = lines.reduce((acc, row) => acc + Number(row.total), 0).toFixed(2)

  return {
    version: 1,
    days: 7,
    lines,
    groups: [],
    linesTotal: total,
    additionals: "0.00",
    subtotal: total,
    discount: "0.00",
    base: total,
    taxes: [],
    taxTotal: "0.00",
    net: total,
    fees: "0.00",
    feesSpread: false,
    gross: total,
    advance: "0.00",
    total,
    collected: "0.00",
    balance: total,
    penalty: "0.00",
    deposit: "0.00",
    ...extra,
  }
}

function input(overrides: Partial<QuoteDocumentInput> = {}): QuoteDocumentInput {
  const lines = [line("l1", "p1")]

  return {
    identity: {
      folio: "COT-0001",
      code: "7QK3M2X9ABCD",
      name: "Renta de cámara",
      description: "",
      status: "in_progress",
      issuedOn: "2026-08-10T18:00:00.000Z",
      generatedAt: "2026-08-18T20:32:00.000Z",
    },
    issuer: { name: "Renta del Norte", contacts: [] },
    client: { name: "Producciones Sol", contacts: [] },
    type: "sale",
    startsOn: null,
    endsOn: null,
    lines,
    breakdown: breakdown([lineBreakdown("l1", "p1", "100.00")]),
    payment: null,
    taxes: null,
    terms: null,
    observations: null,
    message: null,
    ...overrides,
  }
}

// ─── Nombre del archivo ──────────────────────────────────────────────────────

describe("nombre del archivo descargado", () => {
  it("identifica el documento y el instante de generación", () => {
    const name = documentFileName({
      label: "Cotización",
      reference: "COT-0001",
      at: new Date(2026, 7, 18, 14, 32),
    })

    expect(name).toBe("cotizacion-cot-0001-20260818-1432.pdf")
  })

  it("dos generaciones del mismo documento se distinguen por el instante", () => {
    const at = (minute: number) => new Date(2026, 7, 18, 14, minute)
    const of = (minute: number) =>
      documentFileName({ label: "Cotización", reference: "COT-0001", at: at(minute) })

    expect(of(32)).not.toBe(of(33))
  })

  it("un documento sin referencia legible sigue teniendo nombre", () => {
    const name = documentFileName({
      label: "Cotización",
      reference: "",
      at: new Date(2026, 7, 18, 14, 32),
    })

    expect(name).toBe("cotizacion-20260818-1432.pdf")
  })
})

// ─── Contenido de la cotización ──────────────────────────────────────────────

describe("documento de cotización", () => {
  it("agrupa las líneas por producto y respeta el orden establecido", () => {
    const lines = [
      line("l3", "p2", { positionProduct: 1, position: 0 }),
      line("l2", "p1", { positionProduct: 0, position: 1 }),
      line("l1", "p1", { positionProduct: 0, position: 0 }),
    ]

    const document = composeQuoteDocument(
      input({
        lines,
        breakdown: breakdown([
          lineBreakdown("l1", "p1", "100.00"),
          lineBreakdown("l2", "p1", "50.00"),
          lineBreakdown("l3", "p2", "25.00"),
        ]),
      }),
    )

    expect(document.groups.map((group) => group.productId)).toEqual(["p1", "p2"])
    expect(document.groups[0]?.lines.map((row) => row.lineId)).toEqual(["l1", "l2"])
    expect(document.groups[0]?.subtotal).toBe("150.00")
    expect(document.groups[1]?.subtotal).toBe("25.00")
  })

  it("la suma de las líneas visibles cuadra con el total de líneas", () => {
    const document = composeQuoteDocument(
      input({
        lines: [line("l1", "p1"), line("l2", "p2", { positionProduct: 1 })],
        breakdown: breakdown([
          lineBreakdown("l1", "p1", "1234.56"),
          lineBreakdown("l2", "p2", "765.44"),
        ]),
      }),
    )

    expect(document.linesTotal).toBe("2000.00")
    expect(document.reconciles).toBe(true)
  })

  it("señala el descuadre en lugar de esconderlo", () => {
    // Un desglose cuyo total de líneas no es lo que suman las líneas: el documento no puede
    // callarlo, porque es la cifra con la que el cliente discute.
    const document = composeQuoteDocument(
      input({
        breakdown: breakdown([lineBreakdown("l1", "p1", "100.00")], { linesTotal: "120.00" }),
      }),
    )

    expect(document.reconciles).toBe(false)
  })

  it("con precio por paquete no enseña importes por línea", () => {
    // Los importes de línea no rigen: lo pactado es el paquete. Enseñarlos invitaría a sumarlos y
    // a discutir una cifra que no se cobra. Ver `quotation-pricing`, corrección H-19.
    const document = composeQuoteDocument(
      input({
        breakdown: breakdown([lineBreakdown("l1", "p1", "100.00")], { packagePrice: "900.00" }),
      }),
    )

    expect(document.showsLineAmounts).toBe(false)
    expect(document.groups[0]?.lines[0]?.total).toBeUndefined()
    expect(document.reconciles).toBe(true)
  })

  it("una línea sin precio se distingue de una gratuita", () => {
    const document = composeQuoteDocument(
      input({
        breakdown: breakdown([
          lineBreakdown("l1", "p1", "0.00", { unpriced: true, unitCost: undefined }),
        ]),
      }),
    )

    const row = document.groups[0]?.lines[0]
    expect(row?.unpriced).toBe(true)
    expect(row?.unitCost).toBeUndefined()
  })

  it("una línea que el desglose no menciona no inventa importes", () => {
    // Pasa mientras se edita: la línea existe y todavía no tiene unidades apartadas.
    const document = composeQuoteDocument(input({ breakdown: breakdown([]) }))

    expect(document.groups[0]?.lines[0]?.total).toBeUndefined()
    expect(document.linesTotal).toBe("0.00")
  })

  it("una cotización de renta muestra su ventana y sus frecuencias", () => {
    const document = composeQuoteDocument(
      input({
        type: "rent",
        startsOn: "2026-09-01T06:00:00.000Z",
        endsOn: "2026-09-15T06:00:00.000Z",
        lines: [
          line("l1", "p1", { frequency: "weekly" }),
          line("l2", "p2", { frequency: "daily", positionProduct: 1 }),
        ],
        breakdown: breakdown([
          lineBreakdown("l1", "p1", "100.00", { appliedDays: "2.00" }),
          lineBreakdown("l2", "p2", "70.00", { frequency: "daily", appliedDays: "14.00" }),
        ]),
      }),
    )

    expect(document.period).toEqual({
      startsOn: "2026-09-01T06:00:00.000Z",
      endsOn: "2026-09-15T06:00:00.000Z",
      days: 7,
      frequencies: ["daily", "weekly"],
    })
  })

  it("una venta no tiene ventana que mostrar", () => {
    expect(composeQuoteDocument(input()).period).toBeNull()
  })

  it("conserva la identidad, las partes y sus contactos", () => {
    const document = composeQuoteDocument(
      input({
        issuer: {
          name: "Renta del Norte",
          taxId: "RNO260101AAA",
          contacts: [{ name: "Ana", position: "Ventas" }],
        },
        client: {
          name: "Producciones Sol",
          address: "Av. Reforma 1",
          contacts: [{ name: "Beto", phone: "555" }],
        },
      }),
    )

    expect(document.identity.folio).toBe("COT-0001")
    expect(document.issuer.taxId).toBe("RNO260101AAA")
    expect(document.client?.contacts[0]?.name).toBe("Beto")
    expect(document.kind).toBe("quote")
  })
})
