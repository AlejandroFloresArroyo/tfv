import { describe, expect, it } from "vitest"
import type { UploadVariant } from "./file-derivatives.ts"
import type { FileUpload, UploadAuthorization, UploadPorts, UploadState } from "./file-upload.ts"
import {
  abandoned,
  enqueue,
  fileOf,
  idle,
  missing,
  needsAuthorization,
  pending,
  reduce,
  runUploads,
  summarize,
} from "./file-upload.ts"

const FIVE: readonly UploadVariant[] = ["original", "large", "medium", "small", "thumbnail"]

const FUTURE = "2026-12-31T00:00:00.000Z"
const PAST = "2020-01-01T00:00:00.000Z"
const NOW = Date.parse("2026-08-17T12:00:00.000Z")

function authorization(
  uploadId: string,
  variants: readonly UploadVariant[] = FIVE,
  expiresAt = FUTURE,
): UploadAuthorization {
  return {
    uploadId,
    kind: "image",
    expiresAt,
    targets: variants.map((variant) => ({
      variant,
      method: "PUT",
      url: `https://almacen.example/${uploadId}/${variant}`,
      headers: { "content-type": "image/jpeg" },
    })),
  }
}

/** El archivo `id`, ya desenvuelto: en las pruebas nunca es el que falta. */
function at(state: UploadState, id: string): FileUpload {
  const file = fileOf(state, id)
  if (file === undefined) throw new Error(`no hay archivo ${id}`)
  return file
}

function photos(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `f${index + 1}`,
    kind: "image" as const,
  }))
}

describe("la cola", () => {
  it("planea cinco objetos por imagen y uno por documento", () => {
    const state = enqueue(idle, [
      { id: "a", kind: "image" },
      { id: "b", kind: "document" },
    ])

    expect(at(state, "a").variants).toEqual(FIVE)
    expect(at(state, "b").variants).toEqual(["original"])
    expect(state.files.map((file) => file.phase)).toEqual(["waiting", "waiting"])
  })

  it("conserva lo andado de los que ya estaban y suelta los que se quitaron", () => {
    let state = enqueue(idle, photos(2))
    state = reduce(state, { type: "authorized", id: "f1", authorization: authorization("u1") })
    state = reduce(state, { type: "sent", id: "f1", variant: "original" })

    const again = enqueue(state, [
      { id: "f1", kind: "image" },
      { id: "f3", kind: "image" },
    ])

    expect(at(again, "f1").sent).toEqual(["original"])
    expect(at(again, "f1").uploadId).toBe("u1")
    expect(fileOf(again, "f2")).toBeUndefined()
    expect(at(again, "f3").phase).toBe("waiting")
  })
})

describe("lo que queda por escribir", () => {
  it("es lo planeado menos lo ya escrito", () => {
    let state = enqueue(idle, photos(1))
    state = reduce(state, { type: "prepared", id: "f1", produced: FIVE })
    state = reduce(state, { type: "sent", id: "f1", variant: "original" })
    state = reduce(state, { type: "sent", id: "f1", variant: "large" })

    expect(pending(at(state, "f1"))).toEqual(["medium", "small", "thumbnail"])
  })

  it("no cuenta dos veces lo escrito dos veces", () => {
    let state = enqueue(idle, photos(1))
    state = reduce(state, { type: "prepared", id: "f1", produced: FIVE })
    state = reduce(state, { type: "sent", id: "f1", variant: "original" })
    state = reduce(state, { type: "sent", id: "f1", variant: "original" })

    expect(at(state, "f1").sent).toEqual(["original"])
  })

  it("deja fuera lo que el navegador no pudo producir, y dice cuál falta", () => {
    // Un `.avi` que el navegador no descodifica: se sube el video y no se inventa una portada en
    // negro para rellenar los otros cuatro objetos.
    let state = enqueue(idle, [{ id: "v", kind: "video" }])
    state = reduce(state, { type: "prepared", id: "v", produced: ["original"] })

    expect(pending(at(state, "v"))).toEqual(["original"])
    expect(missing(at(state, "v"))).toEqual(["large", "medium", "small", "thumbnail"])
  })
})

describe("el reintento", () => {
  it("no vuelve a subir lo que ya subió", () => {
    // Es la razón de ser de todo esto: que falle la miniatura no puede obligar a resubir el
    // original de doce megas.
    let state = enqueue(idle, photos(1))
    state = reduce(state, { type: "prepared", id: "f1", produced: FIVE })
    state = reduce(state, { type: "authorized", id: "f1", authorization: authorization("u1") })
    state = reduce(state, { type: "sent", id: "f1", variant: "original" })
    state = reduce(state, { type: "sent", id: "f1", variant: "large" })
    state = reduce(state, { type: "failed", id: "f1", at: "send" })

    const retried = reduce(state, { type: "retry", id: "f1" })

    expect(at(retried, "f1").phase).toBe("waiting")
    expect(at(retried, "f1").failure).toBeUndefined()
    expect(at(retried, "f1").sent).toEqual(["original", "large"])
    expect(at(retried, "f1").uploadId).toBe("u1")
    expect(pending(at(retried, "f1"))).toEqual(["medium", "small", "thumbnail"])
  })

  it("no toca un archivo que ya terminó", () => {
    let state = enqueue(idle, photos(1))
    state = reduce(state, { type: "confirmed", id: "f1" })

    expect(reduce(state, { type: "retry", id: "f1" })).toBe(state)
  })
})

describe("la autorización", () => {
  it("hace falta mientras no haya destinos", () => {
    const state = enqueue(idle, photos(1))
    expect(needsAuthorization(at(state, "f1"), NOW)).toBe(true)
  })

  it("no hace falta mientras siga vigente", () => {
    const state = reduce(enqueue(idle, photos(1)), {
      type: "authorized",
      id: "f1",
      authorization: authorization("u1"),
    })

    expect(needsAuthorization(at(state, "f1"), NOW)).toBe(false)
  })

  it("vuelve a hacer falta cuando caducó", () => {
    const state = reduce(enqueue(idle, photos(1)), {
      type: "authorized",
      id: "f1",
      authorization: authorization("u1", FIVE, PAST),
    })

    expect(needsAuthorization(at(state, "f1"), NOW)).toBe(true)
  })

  it("una autorización nueva descarta lo ya escrito", () => {
    // Un `uploadId` distinto es **otro archivo registrado**: los objetos de la autorización
    // anterior pertenecen al anterior, que la recolección se llevará por pendiente. Darlos por
    // escritos dejaría un archivo con la mitad de sus objetos y nadie mirando.
    let state = enqueue(idle, photos(1))
    state = reduce(state, { type: "authorized", id: "f1", authorization: authorization("u1") })
    state = reduce(state, { type: "sent", id: "f1", variant: "original" })
    state = reduce(state, { type: "authorized", id: "f1", authorization: authorization("u2") })

    expect(at(state, "f1").sent).toEqual([])
  })

  it("repetir la misma autorización no descarta nada", () => {
    let state = enqueue(idle, photos(1))
    state = reduce(state, { type: "authorized", id: "f1", authorization: authorization("u1") })
    state = reduce(state, { type: "sent", id: "f1", variant: "original" })
    state = reduce(state, { type: "authorized", id: "f1", authorization: authorization("u1") })

    expect(at(state, "f1").sent).toEqual(["original"])
  })

  it("el servidor manda sobre cuántos objetos tiene el archivo", () => {
    let state = enqueue(idle, [{ id: "v", kind: "video" }])
    state = reduce(state, {
      type: "authorized",
      id: "v",
      authorization: authorization("u1", ["original"]),
    })

    expect(at(state, "v").variants).toEqual(["original"])
  })
})

describe("el recuento que ve el formulario", () => {
  it("dice cuántos van completados y cuántos fallaron", () => {
    let state = enqueue(idle, photos(3))
    state = reduce(state, { type: "confirmed", id: "f1" })
    state = reduce(state, { type: "failed", id: "f2", at: "send" })

    expect(summarize(state)).toEqual({ total: 3, done: 1, failed: 1, working: 0, waiting: 1 })
  })

  it("cuenta como en curso lo que está en cualquiera de sus cuatro pasos", () => {
    const state = reduce(enqueue(idle, photos(1)), { type: "begin", id: "f1", stage: "send" })
    expect(summarize(state).working).toBe(1)
  })
})

describe("quitar un archivo a medias", () => {
  it("devuelve el registro que hay que dar por fallido", () => {
    let state = enqueue(idle, photos(1))
    state = reduce(state, { type: "authorized", id: "f1", authorization: authorization("u1") })
    state = reduce(state, { type: "failed", id: "f1", at: "send" })

    expect(abandoned(state, "f1")).toBe("u1")
  })

  it("no devuelve nada de uno que terminó bien ni de uno que nunca se registró", () => {
    let state = enqueue(idle, photos(2))
    state = reduce(state, { type: "authorized", id: "f1", authorization: authorization("u1") })
    state = reduce(state, { type: "confirmed", id: "f1" })

    expect(abandoned(state, "f1")).toBeUndefined()
    expect(abandoned(state, "f2")).toBeUndefined()
  })
})

// ─── El recorrido completo, con los tres puertos fingidos ─────────────────────

interface Recorder {
  readonly ports: UploadPorts
  readonly prepared: string[]
  readonly authorized: string[]
  readonly written: string[]
  readonly confirmed: { uploadId: string; ok: boolean }[]
}

function recorder(
  options: { fail?: (what: string) => boolean; produce?: () => UploadVariant[] } = {},
): Recorder {
  const prepared: string[] = []
  const authorized: string[] = []
  const written: string[] = []
  const confirmed: { uploadId: string; ok: boolean }[] = []
  const fails = options.fail ?? (() => false)

  const ports: UploadPorts = {
    async prepare(id) {
      prepared.push(id)
      if (fails(`prepare:${id}`)) throw new Error("no se pudo producir")
      const variants = options.produce?.() ?? [...FIVE]
      return new Map(variants.map((variant) => [variant, new Blob([variant])]))
    },
    async authorize(id) {
      authorized.push(id)
      if (fails(`authorize:${id}`)) throw new Error("no autorizado")
      return authorization(`u-${id}`)
    },
    async send(target) {
      const step = `${target.url}`
      if (fails(step)) throw new Error("no se pudo escribir")
      written.push(step)
    },
    async confirm(uploadId, ok) {
      if (fails(`confirm:${uploadId}`)) throw new Error("no se pudo confirmar")
      confirmed.push({ uploadId, ok })
    },
  }

  return { ports, prepared, authorized, written, confirmed }
}

describe("el recorrido", () => {
  it("prepara, autoriza, escribe los cinco y confirma", async () => {
    const { ports, prepared, authorized, written, confirmed } = recorder()

    const final = await runUploads(enqueue(idle, photos(1)), ports)

    expect(prepared).toEqual(["f1"])
    expect(authorized).toEqual(["f1"])
    expect(written).toEqual(FIVE.map((variant) => `https://almacen.example/u-f1/${variant}`))
    expect(confirmed).toEqual([{ uploadId: "u-f1", ok: true }])
    expect(at(final, "f1").phase).toBe("done")
    expect(at(final, "f1").sent).toEqual(FIVE)
  })

  it("los bytes no pasan por la API: se escriben en el destino que dio la autorización", async () => {
    const seen: { url: string; method: string; size: number }[] = []
    const { ports } = recorder()
    const spy: UploadPorts = {
      ...ports,
      async send(target, body) {
        seen.push({ url: target.url, method: target.method, size: body.size })
        await ports.send(target, body)
      },
    }

    await runUploads(enqueue(idle, photos(1)), spy)

    expect(seen).toHaveLength(5)
    expect(seen.every((one) => one.method === "PUT" && one.size > 0)).toBe(true)
  })

  it("siete fotos y una que falla no obligan a repetir las siete", async () => {
    const roto = "https://almacen.example/u-f4/medium"
    const { ports, written, confirmed } = recorder({ fail: (what) => what === roto })

    const failed = await runUploads(enqueue(idle, photos(7)), ports)

    expect(summarize(failed)).toEqual({ total: 7, done: 6, failed: 1, working: 0, waiting: 0 })
    expect(at(failed, "f4").failure).toBe("send")
    expect(at(failed, "f4").sent).toEqual(["original", "large"])
    // La subida fallida no se confirma: confirmarla la marcaría errónea y el reintento va a
    // escribir en esos mismos destinos.
    expect(confirmed.map((one) => one.uploadId)).not.toContain("u-f4")

    const before = written.length
    const sano = recorder()
    const retried = await runUploads(reduce(failed, { type: "retry", id: "f4" }), sano.ports)

    expect(sano.authorized).toEqual([]) // la autorización sigue vigente: no se registra otro archivo
    expect(sano.written).toEqual([
      "https://almacen.example/u-f4/medium",
      "https://almacen.example/u-f4/small",
      "https://almacen.example/u-f4/thumbnail",
    ])
    expect(before).toBe(6 * 5 + 2)
    expect(at(retried, "f4").phase).toBe("done")
    expect(sano.confirmed).toEqual([{ uploadId: "u-f4", ok: true }])
  })

  it("no vuelve a tocar lo que ya terminó", async () => {
    const first = await runUploads(enqueue(idle, photos(2)), recorder().ports)
    const again = recorder()

    await runUploads(first, again.ports)

    expect(again.prepared).toEqual([])
    expect(again.written).toEqual([])
    expect(again.confirmed).toEqual([])
  })

  it("un fallo al producir los objetos no llega a registrar el archivo", async () => {
    const { ports, authorized } = recorder({ fail: (what) => what === "prepare:f1" })

    const final = await runUploads(enqueue(idle, photos(1)), ports)

    expect(authorized).toEqual([])
    expect(at(final, "f1").phase).toBe("failed")
    expect(at(final, "f1").failure).toBe("prepare")
  })

  it("un fallo al autorizar no escribe nada", async () => {
    const { ports, written } = recorder({ fail: (what) => what === "authorize:f1" })

    const final = await runUploads(enqueue(idle, photos(1)), ports)

    expect(written).toEqual([])
    expect(at(final, "f1").failure).toBe("authorize")
  })

  it("un fallo al confirmar no obliga a volver a escribir los cinco", async () => {
    const { ports } = recorder({ fail: (what) => what === "confirm:u-f1" })
    const failed = await runUploads(enqueue(idle, photos(1)), ports)

    expect(at(failed, "f1").failure).toBe("confirm")
    expect(at(failed, "f1").sent).toEqual(FIVE)

    const again = recorder()
    const final = await runUploads(reduce(failed, { type: "retry", id: "f1" }), again.ports)

    expect(again.written).toEqual([])
    expect(again.confirmed).toEqual([{ uploadId: "u-f1", ok: true }])
    expect(at(final, "f1").phase).toBe("done")
  })

  it("una autorización caducada se renueva, y lo escrito con la anterior no cuenta", async () => {
    let state = enqueue(idle, photos(1))
    state = reduce(state, { type: "prepared", id: "f1", produced: FIVE })
    state = reduce(state, {
      type: "authorized",
      id: "f1",
      authorization: authorization("viejo", FIVE, PAST),
    })
    state = reduce(state, { type: "sent", id: "f1", variant: "original" })
    state = reduce(state, { type: "failed", id: "f1", at: "send" })

    const { ports, authorized, written } = recorder()
    const final = await runUploads(reduce(state, { type: "retry", id: "f1" }), ports, {
      now: () => NOW,
    })

    expect(authorized).toEqual(["f1"])
    expect(at(final, "f1").uploadId).toBe("u-f1")
    // El original se vuelve a escribir: los objetos de la autorización anterior son de otro
    // archivo registrado, y ése lo recogerá la limpieza de pendientes.
    expect(written).toEqual(FIVE.map((variant) => `https://almacen.example/u-f1/${variant}`))
  })

  it("sube lo que pudo producir y termina, sin inventar las portadas que faltan", async () => {
    const { ports, written, confirmed } = recorder({ produce: () => ["original"] })

    const final = await runUploads(enqueue(idle, [{ id: "v", kind: "video" }]), ports)

    expect(written).toEqual(["https://almacen.example/u-v/original"])
    expect(confirmed).toEqual([{ uploadId: "u-v", ok: true }])
    expect(at(final, "v").phase).toBe("done")
    expect(missing(at(final, "v"))).toEqual(["large", "medium", "small", "thumbnail"])
  })

  it("avisa de cada paso mientras trabaja, que es de donde sale el progreso", async () => {
    const seen: UploadState[] = []

    await runUploads(enqueue(idle, photos(2)), recorder().ports, {
      onChange: (state) => seen.push(state),
    })

    const phases = seen.map((state) => at(state, "f1").phase)
    expect(phases.slice(0, 4)).toEqual(["prepare", "prepare", "authorize", "authorize"])
    expect(phases.at(-1)).toBe("done")
  })
})
