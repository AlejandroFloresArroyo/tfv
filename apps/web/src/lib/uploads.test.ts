import { describe, expect, it } from "vitest"
import { authorizationOf, imagePatch, unfinished, uploadedIds } from "./uploads.ts"

const target = (variant: string, expiresAt: string) => ({
  variant: variant as "original",
  method: "PUT",
  url: `http://almacen/${variant}`,
  headers: { "Content-Type": "image/jpeg" },
  expiresAt,
})

describe("la autorización que llega de la API", () => {
  it("se queda con la caducidad más próxima de sus objetos", () => {
    // La máquina lleva **una** caducidad por archivo y cinco firmas. Quedarse con la más lejana
    // daría por buenas las que ya vencieron, y volver a pedirlas tarde pierde la subida entera.
    const authorization = authorizationOf({
      upload: { id: "u1", kind: "image" },
      targets: [
        target("original", "2026-08-18T12:00:00.000Z"),
        target("thumbnail", "2026-08-18T11:30:00.000Z"),
      ],
    })

    expect(authorization.expiresAt).toBe("2026-08-18T11:30:00.000Z")
    expect(authorization.uploadId).toBe("u1")
    expect(authorization.targets).toHaveLength(2)
  })

  it("una caducidad ilegible no deja el archivo autorizado para siempre", () => {
    const authorization = authorizationOf({
      upload: { id: "u2", kind: "image" },
      targets: [target("original", "mañana")],
    })

    expect(Number.isNaN(Date.parse(authorization.expiresAt))).toBe(false)
  })
})

describe("lo que terminó", () => {
  const file = (id: string, phase: string, uploadId?: string) => ({
    id,
    kind: "image" as const,
    variants: [],
    produced: [],
    sent: [],
    targets: [],
    phase: phase as "done",
    uploadId,
    expiresAt: undefined,
    failure: undefined,
  })

  it("son los subidos y con registro", () => {
    const state = {
      files: [file("a", "done", "u1"), file("b", "failed", "u2"), file("c", "waiting")],
    }

    expect(uploadedIds(state)).toEqual(["u1"])
    expect(unfinished(state)).toBe(true)
  })

  it("con todo subido no queda nada por hacer", () => {
    expect(unfinished({ files: [file("a", "done", "u1")] })).toBe(false)
  })
})

describe("la imagen única de una entidad", () => {
  it("con una foto nueva, se asigna", () => {
    expect(imagePatch(["u1"], false, true)).toEqual({ imageUploadId: "u1" })
  })

  it("quitada y sin sustituta, se retira", () => {
    expect(imagePatch([], true, true)).toEqual({ imageUploadId: null })
  })

  it("sin tocarla, no se manda el campo", () => {
    // Es la respuesta que importa: mandar `null` aquí borraría la foto al guardar el nombre, y
    // nadie relacionaría lo uno con lo otro.
    expect(imagePatch([], false, true)).toBeUndefined()
  })

  it("quitar la que no había tampoco manda nada", () => {
    expect(imagePatch([], true, false)).toBeUndefined()
  })
})
