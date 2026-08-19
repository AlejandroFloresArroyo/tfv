/**
 * Las tres acciones del documento, sin navegador.
 *
 * Lo que se comprueba es que **descargar es imprimir con el nombre puesto**: el navegador nombra el
 * PDF con el título del documento, así que ponerlo antes y devolverlo después es toda la mecánica.
 * Es el único trozo con estado de esta pantalla, y por eso está fuera del componente.
 */

import { describe, expect, it } from "vitest"
import { type PrintTarget, printDocument, publicDocumentUrl } from "./document.ts"

function fakeTarget(initial = "TFV") {
  const printed: string[] = []
  let afterPrint: (() => void) | null = null

  const target: PrintTarget = {
    get title() {
      return initial
    },
    set title(value: string) {
      initial = value
    },
    print() {
      printed.push(this.title)
    },
    onAfterPrint(handler) {
      afterPrint = handler
    },
  }

  return {
    target,
    printed,
    get title() {
      return target.title
    },
    finish: () => afterPrint?.(),
  }
}

describe("imprimir el documento", () => {
  it("imprime con el nombre del archivo como título", () => {
    const fake = fakeTarget("Ficha de cotización · TFV")

    printDocument(fake.target, "cotizacion-cot-0001-20260818-1432.pdf")

    expect(fake.printed).toEqual(["cotizacion-cot-0001-20260818-1432.pdf"])
  })

  it("devuelve el título al terminar", () => {
    // Sin esto, la pestaña se queda llamándose como el archivo y el siguiente documento hereda el
    // nombre del anterior.
    const fake = fakeTarget("Ficha de cotización · TFV")

    printDocument(fake.target, "cotizacion-cot-0001-20260818-1432.pdf")
    expect(fake.title).toBe("cotizacion-cot-0001-20260818-1432.pdf")

    fake.finish()
    expect(fake.title).toBe("Ficha de cotización · TFV")
  })

  it("dos impresiones seguidas no encadenan el nombre anterior", () => {
    const fake = fakeTarget("Ficha de cotización · TFV")

    printDocument(fake.target, "primero.pdf")
    fake.finish()
    printDocument(fake.target, "segundo.pdf")
    fake.finish()

    expect(fake.printed).toEqual(["primero.pdf", "segundo.pdf"])
    expect(fake.title).toBe("Ficha de cotización · TFV")
  })
})

describe("enlace público", () => {
  it("se compone sobre el origen desde el que se mira", () => {
    expect(publicDocumentUrl("https://app.tfv.mx", "abc-123")).toBe("https://app.tfv.mx/d/abc-123")
  })

  it("no duplica la barra del origen", () => {
    expect(publicDocumentUrl("https://app.tfv.mx/", "abc-123")).toBe("https://app.tfv.mx/d/abc-123")
  })
})
