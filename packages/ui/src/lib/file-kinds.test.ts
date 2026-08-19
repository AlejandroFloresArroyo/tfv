import { describe, expect, it } from "vitest"
import {
  acceptAttribute,
  classify,
  contentTypeFor,
  extensionOf,
  previewability,
  review,
} from "./file-kinds.ts"

describe("la clasificación por extensión", () => {
  it("reparte cada extensión de la tabla en su tipo", () => {
    expect(classify("foto.jpg")).toBe("image")
    expect(classify("foto.heic")).toBe("image")
    expect(classify("clip.mov")).toBe("video")
    expect(classify("clip.3gp")).toBe("video")
    expect(classify("manual.pdf")).toBe("document")
    expect(classify("hoja.xlsx")).toBe("file")
  })

  it("no distingue mayúsculas: lo que sale de una cámara viene gritado", () => {
    expect(classify("IMG_0042.JPG")).toBe("image")
    expect(classify("VID_0042.MOV")).toBe("video")
  })

  it("trata como archivo genérico lo que no reconoce", () => {
    expect(classify("instalador.exe")).toBe("file")
    expect(classify("respaldo.tar.gz")).toBe("file")
  })

  it("lee la última extensión, no la primera", () => {
    expect(classify("factura.2026.pdf")).toBe("document")
  })
})

describe("el nombre del archivo", () => {
  it("necesita nombre y extensión, que es lo que la API exige", () => {
    expect(extensionOf("documento")).toBeUndefined()
    // Un archivo oculto tiene extensión pero no nombre: `.gitignore` no es «gitignore».
    expect(extensionOf(".gitignore")).toBeUndefined()
    expect(extensionOf("documento.")).toBeUndefined()
  })

  it("devuelve la extensión en minúsculas y sin el punto", () => {
    expect(extensionOf("IMG_0042.JPG")).toBe("jpg")
  })
})

describe("el tipo de contenido que se declara", () => {
  it("sale de la extensión y no de lo que diga el navegador", () => {
    // Windows declara un `.csv` como hoja de cálculo de Excel. Declarar eso a la API es pedir un
    // `400` por tipo incoherente con la extensión, en un archivo perfectamente válido.
    expect(contentTypeFor("padron.csv", "application/vnd.ms-excel")).toBe("text/csv")
    expect(contentTypeFor("foto.jpg", "")).toBe("image/jpeg")
    expect(contentTypeFor("foto.heic", "")).toBe("image/heic")
  })

  it("recae en lo que declara el navegador sólo cuando la extensión no dice nada", () => {
    expect(contentTypeFor("respaldo.dmg", "application/x-apple-diskimage")).toBe(
      "application/x-apple-diskimage",
    )
    expect(contentTypeFor("respaldo.dmg")).toBe("application/octet-stream")
  })
})

describe("qué se puede previsualizar aquí", () => {
  it("las imágenes que el navegador pinta, sí", () => {
    expect(previewability("foto.jpg")).toBe("image")
    expect(previewability("dibujo.svg")).toBe("image")
  })

  it("los formatos de cámara de teléfono, no: hay que decirlo en vez de enseñar un hueco", () => {
    expect(previewability("IMG_0042.HEIC")).toBe("unsupported")
    expect(previewability("IMG_0042.heif")).toBe("unsupported")
  })

  it("un video se previsualiza extrayéndole un fotograma", () => {
    expect(previewability("clip.mp4")).toBe("video")
  })

  it("un documento no tiene vista previa, y no es un fallo", () => {
    expect(previewability("manual.pdf")).toBe("none")
    expect(previewability("hoja.xlsx")).toBe("none")
  })
})

describe("la revisión de lo seleccionado", () => {
  const foto = { fileName: "foto.jpg", byteSize: 1_000 }

  it("acepta lo admitido y lo devuelve con su tipo ya resuelto", () => {
    const { accepted, rejected } = review([foto], { accept: ["image"] })

    expect(rejected).toEqual([])
    expect(accepted).toEqual([
      { fileName: "foto.jpg", byteSize: 1_000, contentType: "image/jpeg", kind: "image" },
    ])
  })

  it("rechaza en el acto lo que no es del tipo admitido", () => {
    const { accepted, rejected } = review([foto, { fileName: "manual.pdf", byteSize: 10 }], {
      accept: ["image"],
    })

    expect(accepted.map((file) => file.fileName)).toEqual(["foto.jpg"])
    expect(rejected).toEqual([{ fileName: "manual.pdf", reason: "kind" }])
  })

  it("rechaza lo que excede el tamaño admitido", () => {
    const { rejected } = review([{ fileName: "foto.jpg", byteSize: 5_000_001 }], {
      maxBytes: 5_000_000,
    })

    expect(rejected).toEqual([{ fileName: "foto.jpg", reason: "size" }])
  })

  it("rechaza el nombre que la API rechazaría, antes de gastar una petición", () => {
    const { rejected } = review([{ fileName: "documento", byteSize: 10 }])

    expect(rejected).toEqual([{ fileName: "documento", reason: "name" }])
  })

  it("acepta hasta el límite y rechaza el resto, contando lo ya elegido", () => {
    const tres = [
      { fileName: "a.jpg", byteSize: 1 },
      { fileName: "b.jpg", byteSize: 1 },
      { fileName: "c.jpg", byteSize: 1 },
    ]

    const { accepted, rejected } = review(tres, { maxFiles: 4 }, 2)

    expect(accepted.map((file) => file.fileName)).toEqual(["a.jpg", "b.jpg"])
    expect(rejected).toEqual([{ fileName: "c.jpg", reason: "count" }])
  })

  it("sin política no rechaza nada por tamaño ni por tipo", () => {
    const { accepted } = review([{ fileName: "instalador.exe", byteSize: 9_000_000_000 }])

    expect(accepted.map((file) => file.kind)).toEqual(["file"])
  })
})

describe("lo que se le dice al selector del sistema", () => {
  it("enumera las extensiones de los tipos admitidos, no un comodín", () => {
    // `image/*` deja pasar formatos que la API rechaza, y el rechazo llega después de elegir.
    expect(acceptAttribute(["document"])).toBe(".pdf")
    expect(acceptAttribute(["image"])).toBe(".jpg,.jpeg,.png,.gif,.svg,.heic,.heif,.webp")
  })

  it("sin tipos admitidos no restringe nada", () => {
    expect(acceptAttribute()).toBeUndefined()
    expect(acceptAttribute([])).toBeUndefined()
  })
})
