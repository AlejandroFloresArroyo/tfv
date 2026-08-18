/**
 * La máquina de subida: progreso por archivo y reintento de lo que falló.
 *
 * Es la pieza que `openspec/specs/forms-and-wizards/spec.md` subraya —«si la subida falla, el
 * formulario SHALL ofrecer reintentar **únicamente** los archivos fallidos»— y la que decide si
 * subir siete fotos y que una se caiga cuesta una foto o siete.
 *
 * El modelo es el de la spec de almacenamiento, y no es «un archivo, un intento»:
 *
 * 1. Se **producen** los objetos en el navegador. Una imagen son cinco —el original y cuatro
 *    derivados ya redimensionados—; un video, el video y cuatro portadas; lo demás, uno.
 * 2. Se **autoriza**: la API registra el archivo y devuelve una escritura temporal por objeto.
 * 3. Se **escribe** cada objeto directamente en el almacenamiento. Los bytes no pasan por la API.
 * 4. Se **confirma**, y el archivo pasa a subido.
 *
 * De ahí que el reintento sea por objeto y no por archivo: que falle la miniatura no puede obligar
 * a resubir el original de doce megas. `sent` es la lista de lo ya escrito y **sobrevive al
 * reintento**; lo único que se repite es lo que falta.
 *
 * Tres decisiones que no se ven en el contrato:
 *
 * - **Un fallo no se confirma.** La spec dice que confirmar el fallo marca el archivo erróneo, y
 *   un archivo erróneo «no se muestra como imagen válida en ninguna superficie»: hacerlo antes de
 *   que el usuario decida si reintenta es dar por perdido lo que está a un botón de arreglarse. El
 *   fallo se confirma cuando el usuario quita el archivo — para eso está `abandoned`.
 * - **Una autorización nueva descarta lo escrito con la anterior.** Un `uploadId` distinto es otro
 *   archivo registrado, y los objetos anteriores son suyos; contarlos dejaría un archivo con la
 *   mitad de sus objetos y nadie mirando. Es el precio de que el contrato no tenga forma de
 *   renovar las direcciones de un registro que ya existe.
 * - **El servidor manda sobre cuántos objetos hay.** El plan local es una previsión hasta que
 *   llega la autorización; a partir de ahí, los objetos son los que ella trae.
 *
 * Nada de esto toca el DOM: los tres puertos —producir, autorizar, escribir— entran como
 * dependencias, así que el recorrido entero se prueba sin servidor y sin navegador.
 */

import { plannedVariants, type UploadVariant } from "./file-derivatives.ts"
import type { FileKind } from "./file-kinds.ts"

/** Una autorización de escritura para **un** objeto. No sirve para otro ni para otro archivo. */
export interface UploadTarget {
  readonly variant: UploadVariant
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
}

/** La respuesta de `POST /companies/{companyId}/uploads`. */
export interface UploadAuthorization {
  readonly uploadId: string
  readonly kind: FileKind
  /** Instante en que las escrituras dejan de valer, en ISO. */
  readonly expiresAt: string
  /** Cinco para imagen y video; sólo el original para lo demás. */
  readonly targets: readonly UploadTarget[]
}

/** Los cuatro pasos de una subida. El fallo dice en cuál se quedó. */
export type UploadStage = "prepare" | "authorize" | "send" | "confirm"

export type UploadPhase = "waiting" | UploadStage | "done" | "failed"

export interface FileUpload {
  readonly id: string
  readonly kind: FileKind
  /** Los objetos que este archivo tiene. Previsión hasta que la autorización lo dice. */
  readonly variants: readonly UploadVariant[]
  /** Los que el navegador pudo producir. Vacío hasta prepararlo. */
  readonly produced: readonly UploadVariant[]
  /** Los ya escritos. **Sobrevive al reintento**: es la razón de ser de esta máquina. */
  readonly sent: readonly UploadVariant[]
  readonly targets: readonly UploadTarget[]
  readonly phase: UploadPhase
  readonly uploadId: string | undefined
  readonly expiresAt: string | undefined
  readonly failure: UploadStage | undefined
}

export interface UploadState {
  readonly files: readonly FileUpload[]
}

/** Nada en cola. */
export const idle: UploadState = { files: [] }

export type UploadEvent =
  | { readonly type: "begin"; readonly id: string; readonly stage: UploadStage }
  | { readonly type: "prepared"; readonly id: string; readonly produced: readonly UploadVariant[] }
  | {
      readonly type: "authorized"
      readonly id: string
      readonly authorization: UploadAuthorization
    }
  | { readonly type: "sent"; readonly id: string; readonly variant: UploadVariant }
  | { readonly type: "confirmed"; readonly id: string }
  | { readonly type: "failed"; readonly id: string; readonly at: UploadStage }
  | { readonly type: "retry"; readonly id: string }

export function fileOf(state: UploadState, id: string): FileUpload | undefined {
  return state.files.find((file) => file.id === id)
}

/** Lo que falta por escribir: lo que el archivo tiene, se pudo producir, y no está escrito. */
export function pending(file: FileUpload): readonly UploadVariant[] {
  return file.variants.filter(
    (variant) => file.produced.includes(variant) && !file.sent.includes(variant),
  )
}

/**
 * Los objetos que el navegador no pudo producir.
 *
 * Un `.avi` o un `.mkv` que ningún navegador descodifica se sube entero y **sin portadas**: se dice
 * cuáles faltan en vez de escribir cuatro fotogramas en negro, que es lo que acabaría enseñando la
 * ficha del video.
 */
export function missing(file: FileUpload): readonly UploadVariant[] {
  if (file.produced.length === 0) return []
  return file.variants.filter((variant) => !file.produced.includes(variant))
}

/** Hace falta autorizar cuando no hay destinos, o cuando los que hay ya caducaron. */
export function needsAuthorization(file: FileUpload, now: number): boolean {
  if (file.targets.length === 0 || file.expiresAt === undefined) return true
  const expires = Date.parse(file.expiresAt)
  return Number.isNaN(expires) || expires <= now
}

/**
 * El registro que hay que dar por fallido si se quita un archivo a medias.
 *
 * Sin esto, quitar un archivo que falló deja el registro pendiente hasta que la recolección lo
 * barra. Con esto queda marcado como erróneo, que es lo que la spec pide del cliente.
 */
export function abandoned(state: UploadState, id: string): string | undefined {
  const file = fileOf(state, id)
  if (file === undefined || file.phase === "done") return undefined
  return file.uploadId
}

export interface UploadSummary {
  readonly total: number
  readonly done: number
  readonly failed: number
  /** En alguno de los cuatro pasos ahora mismo. */
  readonly working: number
  readonly waiting: number
}

/** El recuento que enseña el formulario: «cuántos van completados». */
export function summarize(state: UploadState): UploadSummary {
  let done = 0
  let failed = 0
  let working = 0
  let waiting = 0

  for (const file of state.files) {
    if (file.phase === "done") done += 1
    else if (file.phase === "failed") failed += 1
    else if (file.phase === "waiting") waiting += 1
    else working += 1
  }

  return { total: state.files.length, done, failed, working, waiting }
}

function blank(entry: { readonly id: string; readonly kind: FileKind }): FileUpload {
  return {
    id: entry.id,
    kind: entry.kind,
    variants: plannedVariants(entry.kind),
    produced: [],
    sent: [],
    targets: [],
    phase: "waiting",
    uploadId: undefined,
    expiresAt: undefined,
    failure: undefined,
  }
}

/**
 * Pone en cola la selección actual.
 *
 * Conserva lo andado de los archivos que siguen ahí y suelta los que se quitaron: la selección la
 * gobierna el componente, y añadir una foto más no puede reiniciar el progreso de las otras seis.
 */
export function enqueue(
  state: UploadState,
  entries: readonly { readonly id: string; readonly kind: FileKind }[],
): UploadState {
  return {
    files: entries.map((entry) => fileOf(state, entry.id) ?? blank(entry)),
  }
}

function patch(
  state: UploadState,
  id: string,
  change: (file: FileUpload) => FileUpload,
): UploadState {
  let touched = false

  const files = state.files.map((file) => {
    if (file.id !== id) return file
    const next = change(file)
    if (next !== file) touched = true
    return next
  })

  return touched ? { files } : state
}

export function reduce(state: UploadState, event: UploadEvent): UploadState {
  switch (event.type) {
    case "begin":
      return patch(state, event.id, (file) => ({
        ...file,
        phase: event.stage,
        failure: undefined,
      }))

    case "prepared":
      return patch(state, event.id, (file) => ({ ...file, produced: event.produced }))

    case "authorized":
      return patch(state, event.id, (file) => {
        const fresh = file.uploadId !== undefined && file.uploadId !== event.authorization.uploadId
        return {
          ...file,
          uploadId: event.authorization.uploadId,
          expiresAt: event.authorization.expiresAt,
          targets: event.authorization.targets,
          variants: event.authorization.targets.map((target) => target.variant),
          sent: fresh ? [] : file.sent,
        }
      })

    case "sent":
      return patch(state, event.id, (file) =>
        file.sent.includes(event.variant) ? file : { ...file, sent: [...file.sent, event.variant] },
      )

    case "confirmed":
      return patch(state, event.id, (file) => ({ ...file, phase: "done", failure: undefined }))

    case "failed":
      return patch(state, event.id, (file) => ({ ...file, phase: "failed", failure: event.at }))

    case "retry":
      // Lo único que se limpia es el fallo. `sent`, `uploadId` y los destinos se quedan: son
      // exactamente lo que evita repetir la subida entera.
      return patch(state, event.id, (file) =>
        file.phase === "failed" ? { ...file, phase: "waiting", failure: undefined } : file,
      )
  }
}

/**
 * Las tres operaciones del contrato, más la que produce los bytes.
 *
 * Entran como dependencias en vez de llamarse desde dentro: es lo que permite probar el recorrido
 * entero sin servidor y sin red, y lo que deja al sistema de diseño sin saber de `fetch`, de
 * direcciones ni de sesión.
 */
export interface UploadPorts {
  /**
   * Produce los objetos que hay que escribir, por variante.
   *
   * El reintento la vuelve a llamar, así que **conviene que memorice**: volver a reducir una foto
   * de doce megas para reescribir una miniatura es trabajo tirado.
   *
   * Lo que devuelva es lo que se sube: si no puede extraer las portadas de un video, devuelve sólo
   * el original y el archivo se completa sin ellas.
   */
  prepare(id: string): Promise<ReadonlyMap<UploadVariant, Blob>>
  /** `POST /companies/{companyId}/uploads`. Registra el archivo y autoriza sus objetos. */
  authorize(id: string): Promise<UploadAuthorization>
  /** La escritura directa en el almacenamiento, con el método y las cabeceras de la autorización. */
  send(target: UploadTarget, body: Blob): Promise<void>
  /** `POST /companies/{companyId}/uploads/{uploadId}/confirm`. */
  confirm(uploadId: string, ok: boolean): Promise<void>
}

export interface RunOptions {
  /** Se llama en cada cambio de estado: es de donde sale el progreso que ve el usuario. */
  readonly onChange?: ((state: UploadState) => void) | undefined
  readonly now?: (() => number) | undefined
}

/**
 * Recorre la cola y devuelve el estado final.
 *
 * Va archivo por archivo, en orden, y **salta los que ya terminaron**: llamarla otra vez después de
 * un fallo es lo que reintenta, y lo que ya se subió no se vuelve a tocar.
 *
 * Se llama **después** de crear la entidad, nunca antes: la subida va directa al almacenamiento y
 * puede fallar por su cuenta, y perder el formulario entero por una foto es justo lo que la spec
 * prohíbe.
 */
export async function runUploads(
  state: UploadState,
  ports: UploadPorts,
  options: RunOptions = {},
): Promise<UploadState> {
  const clock = options.now ?? Date.now
  let current = state

  function emit(event: UploadEvent): FileUpload | undefined {
    current = reduce(current, event)
    options.onChange?.(current)
    return fileOf(current, event.id)
  }

  for (const queued of state.files) {
    const id = queued.id
    if (queued.phase === "done") continue

    emit({ type: "begin", id, stage: "prepare" })

    let bodies: ReadonlyMap<UploadVariant, Blob>
    try {
      bodies = await ports.prepare(id)
    } catch {
      emit({ type: "failed", id, at: "prepare" })
      continue
    }
    let file = emit({ type: "prepared", id, produced: [...bodies.keys()] })
    if (file === undefined) continue

    if (needsAuthorization(file, clock())) {
      emit({ type: "begin", id, stage: "authorize" })
      try {
        const authorization = await ports.authorize(id)
        file = emit({ type: "authorized", id, authorization })
      } catch {
        emit({ type: "failed", id, at: "authorize" })
        continue
      }
      if (file === undefined) continue
    }

    emit({ type: "begin", id, stage: "send" })

    let broke = false
    for (const variant of pending(file)) {
      const target = file.targets.find((one) => one.variant === variant)
      const body = bodies.get(variant)
      // No hay destino para lo que el servidor no registró, ni bytes para lo que no se produjo.
      if (target === undefined || body === undefined) continue

      try {
        await ports.send(target, body)
      } catch {
        emit({ type: "failed", id, at: "send" })
        broke = true
        break
      }
      emit({ type: "sent", id, variant })
    }
    if (broke) continue

    const uploadId = file.uploadId
    if (uploadId === undefined) {
      emit({ type: "failed", id, at: "authorize" })
      continue
    }

    emit({ type: "begin", id, stage: "confirm" })
    try {
      await ports.confirm(uploadId, true)
    } catch {
      emit({ type: "failed", id, at: "confirm" })
      continue
    }
    emit({ type: "confirmed", id })
  }

  return current
}
