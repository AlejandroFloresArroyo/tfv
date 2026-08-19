import { describe, expect, it } from "vitest"
import { add, coverAfter, type Gallery, move, remove, setCover, toBody } from "./gallery.ts"

function photo(uploadId: string) {
  return { uploadId, url: `http://almacen/${uploadId}.jpg`, thumbnailUrl: null }
}

function galleryOf(ids: readonly string[], cover: string | null = null): Gallery {
  return { photos: ids.map(photo), cover }
}

const ids = (gallery: Gallery) => gallery.photos.map((one) => one.uploadId)

describe("ordenar la galería", () => {
  it("mueve una foto un puesto", () => {
    expect(ids(move(galleryOf(["a", "b", "c"]), "c", -1))).toEqual(["a", "c", "b"])
    expect(ids(move(galleryOf(["a", "b", "c"]), "a", 1))).toEqual(["b", "a", "c"])
  })

  it("en el extremo no hace nada", () => {
    const gallery = galleryOf(["a", "b"])
    expect(move(gallery, "a", -1)).toBe(gallery)
    expect(move(gallery, "b", 1)).toBe(gallery)
  })

  it("reordenar no cambia la portada", () => {
    // Son dos decisiones distintas: «ésta va antes» y «ésta es la que se enseña».
    const moved = move(galleryOf(["a", "b", "c"], "b"), "c", -1)
    expect(moved.cover).toBe("b")
  })
})

describe("quitar y añadir", () => {
  it("quitar deja las demás intactas", () => {
    expect(ids(remove(galleryOf(["a", "b", "c"]), "b"))).toEqual(["a", "c"])
  })

  it("quitar la portada se la pasa a la primera que queda", () => {
    expect(remove(galleryOf(["a", "b", "c"], "a"), "a").cover).toBe("b")
  })

  it("quitar la última deja la galería sin portada", () => {
    expect(remove(galleryOf(["a"], "a"), "a")).toEqual({ photos: [], cover: null })
  })

  it("añadir pone al final y no repite", () => {
    const grown = add(galleryOf(["a"], "a"), [photo("b"), photo("a")])

    expect(ids(grown)).toEqual(["a", "b"])
    expect(grown.cover).toBe("a")
  })

  it("la primera foto de una galería vacía se lleva la portada", () => {
    expect(add(galleryOf([]), [photo("a"), photo("b")]).cover).toBe("a")
  })
})

describe("la portada", () => {
  it("se elige", () => {
    expect(setCover(galleryOf(["a", "b"], "a"), "b").cover).toBe("b")
  })

  it("elegir una que no está no cambia nada", () => {
    const gallery = galleryOf(["a", "b"], "a")
    expect(setCover(gallery, "z")).toBe(gallery)
  })

  it("sin fotos no hay portada", () => {
    expect(coverAfter([], "a")).toBeNull()
  })
})

describe("el cuerpo que se envía", () => {
  it("es la colección entera, en su orden", () => {
    // La API diferencia sobre esto: lo que no venga, deja de estar. Ver `media/collections.ts`.
    expect(toBody(galleryOf(["c", "a"], "a"))).toEqual({
      uploadIds: ["c", "a"],
      coverUploadId: "a",
    })
  })
})
