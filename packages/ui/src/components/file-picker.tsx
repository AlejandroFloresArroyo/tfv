"use client"

import { Check, FileText, Film, ImageOff, RotateCcw, Upload, X } from "lucide-react"
import type { DragEvent } from "react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { coverFrame } from "../lib/browser-media.ts"
import { cn } from "../lib/cn.ts"
import {
  acceptAttribute,
  type FileKind,
  previewability,
  type Rejection,
  review,
  type SelectionPolicy,
} from "../lib/file-kinds.ts"
import {
  type FileUpload,
  fileOf,
  missing,
  summarize,
  type UploadState,
} from "../lib/file-upload.ts"
import { Button } from "./button.tsx"
import { Callout } from "./callout.tsx"

/**
 * Selector de archivos con vista previa y reintento por archivo.
 *
 * Ver `openspec/specs/forms-and-wizards/spec.md` § «Selector de archivos con vista previa» y
 * `openspec/specs/media-storage/spec.md`. Rebanada 28e.
 *
 * Todo lo que decide algo vive fuera: qué se admite en `lib/file-kinds.ts`, qué tamaño tiene cada
 * derivado en `lib/file-derivatives.ts`, y qué se ha subido y qué se reintenta en
 * `lib/file-upload.ts`. Aquí sólo se conectan a los eventos del navegador — que es el reparto de
 * `AmountInput` y del asistente, y por el que la parte difícil tiene pruebas.
 *
 * **Este componente no sube nada.** Recibe el estado de la subida y avisa de que hay que
 * reintentar; quien la lanza es el formulario, y la lanza **después de crear la entidad**, porque
 * la escritura va directa al almacenamiento y puede fallar por su cuenta. Al revés —subir primero
 * y crear después— una foto caída se lleva por delante los treinta campos que el usuario escribió.
 *
 * La vista previa **dice lo que no puede enseñar**. Un `heic` de iPhone no lo pinta ningún
 * navegador de escritorio, y dejar el hueco gris se lee como «esta foto no se subió». Ver `H-51`.
 */

export interface PickedFile {
  /** Estable mientras el archivo esté en la lista: es la clave del progreso y del reintento. */
  readonly id: string
  readonly file: File
  readonly kind: FileKind
  /** El que se declara a la API, deducido de la extensión. */
  readonly contentType: string
}

export interface FilePickerLabels {
  /** Nombre accesible del campo. El icono no es un nombre. */
  label: string
  browse: string
  /** Lo que explica que también se puede arrastrar, y qué se admite. */
  hint: string
  remove: (fileName: string) => string
  retry: (fileName: string) => string
  /** «3 de 7 subidos» — se compone fuera: el orden de las palabras cambia con el idioma. */
  progress: (done: number, total: number) => string
  /** El motivo del rechazo, por su clave: `name`, `kind`, `size` o `count`. */
  rejected: (rejection: Rejection) => string
  dismiss: string
  /** El peso del archivo, con las unidades del idioma. */
  size: (bytes: number) => string
  /** Se dice en lugar de dejar el hueco: esta imagen no se puede previsualizar aquí. */
  noPreview: string
  /** Se subió el archivo pero el navegador no pudo producir sus derivados o sus portadas. */
  noDerivatives: string
  /** El estado de cada archivo, para quien no ve el color. */
  waiting: string
  working: string
  done: string
  failed: string
}

export interface FilePickerProps {
  files: readonly PickedFile[]
  onFilesChange: (files: readonly PickedFile[]) => void
  labels: FilePickerLabels
  /** Qué se admite. Sin ella no se rechaza nada por tipo ni por tamaño. */
  policy?: SelectionPolicy | undefined
  /** El progreso, si ya se está subiendo. Ausente mientras el formulario no ha enviado. */
  uploads?: UploadState | undefined
  onRetry?: ((id: string) => void) | undefined
  /**
   * Se llama al quitar un archivo que ya tenía registro y no llegó a terminar, con su `uploadId`.
   *
   * Quien lo reciba lo confirma con `{ failed: true }`: es lo que deja el registro marcado como
   * erróneo en vez de pendiente hasta que la recolección lo barra.
   */
  onAbandon?: ((uploadId: string) => void) | undefined
  disabled?: boolean | undefined
  className?: string | undefined
  /** De dónde salen los identificadores. Se puede fijar en una prueba. */
  newId?: (() => string) | undefined
}

type Preview =
  | { readonly kind: "pending" }
  | { readonly kind: "picture"; readonly url: string }
  | { readonly kind: "unsupported" }
  | { readonly kind: "none" }

function randomId(): string {
  return crypto.randomUUID()
}

export function FilePicker({
  files,
  onFilesChange,
  labels,
  policy,
  uploads,
  onRetry,
  onAbandon,
  disabled = false,
  className,
  newId = randomId,
}: FilePickerProps) {
  const inputId = useId()
  const [over, setOver] = useState(false)
  const [rejected, setRejected] = useState<readonly Rejection[]>([])
  const previews = usePreviews(files)

  const add = useCallback(
    (chosen: readonly File[]) => {
      const accepted: PickedFile[] = []
      const refused: Rejection[] = []

      // De uno en uno para no perder de vista **cuál** es cada archivo aceptado: la revisión
      // devuelve nombres, y dos fotos de un teléfono se llaman igual más veces de las que parece.
      for (const file of chosen) {
        const result = review(
          [{ fileName: file.name, byteSize: file.size, contentType: file.type }],
          policy,
          files.length + accepted.length,
        )
        for (const one of result.accepted) {
          accepted.push({ id: newId(), file, kind: one.kind, contentType: one.contentType })
        }
        refused.push(...result.rejected)
      }

      setRejected(refused)
      if (accepted.length > 0) onFilesChange([...files, ...accepted])
    },
    [files, newId, onFilesChange, policy],
  )

  function remove(picked: PickedFile) {
    const upload = uploads === undefined ? undefined : fileOf(uploads, picked.id)
    if (upload !== undefined && upload.phase !== "done" && upload.uploadId !== undefined) {
      onAbandon?.(upload.uploadId)
    }
    onFilesChange(files.filter((one) => one.id !== picked.id))
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setOver(false)
    if (disabled) return
    add([...event.dataTransfer.files])
  }

  const counts = uploads === undefined ? undefined : summarize(uploads)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* La zona entera es la etiqueta del campo: se puede soltar encima, y pulsar en cualquier
          punto abre el diálogo. Lo que recibe el foco es el propio campo —oculto a la vista, no al
          teclado—, así que hay **un** objetivo y no dos, y el recuadro se ilumina cuando lo tiene. */}
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-sm border border-dashed px-4 py-6 text-center",
          "transition-colors duration-150",
          "focus-within:border-focus focus-within:outline-2 focus-within:outline-focus/40",
          over ? "border-accent bg-panel-hover" : "border-line-strong bg-panel-sunken",
          disabled ? "opacity-50" : "cursor-pointer",
        )}
      >
        <Upload aria-hidden="true" className="size-5 text-content-faint" />

        <input
          id={inputId}
          type="file"
          multiple
          aria-label={labels.label}
          accept={acceptAttribute(policy?.accept)}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            add([...(event.target.files ?? [])])
            // Se limpia para que elegir dos veces el mismo archivo vuelva a avisar: sin esto, el
            // campo no cambia de valor y el segundo intento no dispara nada.
            event.target.value = ""
          }}
        />

        {/* Con aspecto de botón pero sin serlo: un botón dentro de la etiqueta abriría el diálogo
            dos veces —el suyo y el de la etiqueta— y se llevaría un segundo alto en el tabulador. */}
        <Button asChild variant="secondary" size="sm">
          <span aria-hidden="true">{labels.browse}</span>
        </Button>

        <p className="text-body3 text-content-faint">{labels.hint}</p>
      </label>

      {rejected.length > 0 ? (
        <Callout tone="warning" live>
          <div className="flex items-start gap-2">
            <ul className="min-w-0 flex-1 list-none">
              {rejected.map((one) => (
                <li key={`${one.fileName}-${one.reason}`}>{labels.rejected(one)}</li>
              ))}
            </ul>
            <button
              type="button"
              aria-label={labels.dismiss}
              onClick={() => setRejected([])}
              className="grid size-5 shrink-0 place-items-center rounded-xs hover:bg-panel-hover"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        </Callout>
      ) : null}

      {counts !== undefined && counts.total > 0 ? (
        <p className="text-body3 text-content-muted tabular-nums" aria-live="polite">
          {labels.progress(counts.done, counts.total)}
        </p>
      ) : null}

      {files.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {files.map((picked) => (
            <Row
              key={picked.id}
              picked={picked}
              preview={previews.get(picked.id) ?? { kind: "pending" }}
              upload={uploads === undefined ? undefined : fileOf(uploads, picked.id)}
              labels={labels}
              onRemove={() => remove(picked)}
              onRetry={onRetry === undefined ? undefined : () => onRetry(picked.id)}
              disabled={disabled}
            />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Row({
  picked,
  preview,
  upload,
  labels,
  onRemove,
  onRetry,
  disabled,
}: {
  picked: PickedFile
  preview: Preview
  upload: FileUpload | undefined
  labels: FilePickerLabels
  onRemove: () => void
  onRetry: (() => void) | undefined
  disabled: boolean
}) {
  const phase = upload?.phase
  const failed = phase === "failed"
  const done = phase === "done"
  const written = upload === undefined ? 0 : upload.sent.length
  const total = upload === undefined ? 0 : upload.variants.length
  const incomplete = upload !== undefined && done && missing(upload).length > 0

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-sm border bg-panel p-2",
        failed ? "border-red-3 dark:border-red-8" : "border-line",
      )}
    >
      <Thumbnail picked={picked} preview={preview} label={labels.noPreview} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-body3 font-semibold text-content">{picked.file.name}</p>

        <p className="text-body3 text-content-faint tabular-nums">
          {labels.size(picked.file.size)}
          {phase === undefined ? null : (
            <>
              {" · "}
              <span className={cn(failed ? "text-danger" : "")}>
                {done
                  ? labels.done
                  : failed
                    ? labels.failed
                    : phase === "waiting"
                      ? labels.waiting
                      : labels.working}
              </span>
            </>
          )}
        </p>

        {incomplete ? (
          <p className="text-body3 text-content-muted">{labels.noDerivatives}</p>
        ) : null}

        {total > 0 && !done && !failed ? (
          <div
            role="progressbar"
            aria-label={labels.progress(written, total)}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={written}
            className="h-1 overflow-hidden rounded-xl bg-line"
          >
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${Math.round((written / total) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      {done ? <Check aria-hidden="true" className="size-4 shrink-0 text-content-faint" /> : null}

      {failed && onRetry !== undefined ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRetry}
          aria-label={labels.retry(picked.file.name)}
        >
          <RotateCcw aria-hidden="true" className="size-3.5" />
        </Button>
      ) : null}

      <button
        type="button"
        aria-label={labels.remove(picked.file.name)}
        onClick={onRemove}
        disabled={disabled}
        className="grid size-7 shrink-0 place-items-center rounded-xs text-content-faint hover:bg-panel-hover hover:text-content disabled:pointer-events-none disabled:opacity-50"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </li>
  )
}

function Thumbnail({
  picked,
  preview,
  label,
}: {
  picked: PickedFile
  preview: Preview
  label: string
}) {
  const box = "grid size-12 shrink-0 place-items-center overflow-hidden rounded-xs bg-panel-sunken"

  if (preview.kind === "picture") {
    return (
      <div className={box}>
        {/* El nombre ya está a la derecha, en texto: repetirlo aquí lo hace sonar dos veces. */}
        <img src={preview.url} alt="" className="size-full object-cover" />
      </div>
    )
  }

  if (preview.kind === "unsupported") {
    return (
      <div className={cn(box, "text-content-faint")} title={label}>
        <ImageOff aria-hidden="true" className="size-4" />
        <span className="sr-only">{label}</span>
      </div>
    )
  }

  const Icon = picked.kind === "video" ? Film : picked.kind === "image" ? ImageOff : FileText

  return (
    <div className={cn(box, "text-content-faint")}>
      <Icon aria-hidden="true" className="size-4" />
    </div>
  )
}

/**
 * Las vistas previas, y su limpieza.
 *
 * Cada dirección de objeto retiene el archivo entero en memoria hasta que se suelta. Con doce fotos
 * de teléfono eso son cien megas que no se recuperan mientras la pestaña siga abierta, así que se
 * revoca lo de los archivos que se quitaron y todo lo demás al desmontar.
 *
 * De un video se saca un fotograma —el mismo trabajo que hará la portada—; si el navegador no lo
 * descodifica, se queda sin vista previa y con su icono, que es la verdad.
 */
function usePreviews(files: readonly PickedFile[]): ReadonlyMap<string, Preview> {
  const [previews, setPreviews] = useState<ReadonlyMap<string, Preview>>(new Map())
  const made = useRef(new Map<string, string>())
  const started = useRef(new Set<string>())

  useEffect(() => {
    const present = new Set(files.map((one) => one.id))

    for (const [id, url] of made.current) {
      if (present.has(id)) continue
      URL.revokeObjectURL(url)
      made.current.delete(id)
      started.current.delete(id)
    }

    let alive = true

    function put(id: string, preview: Preview) {
      if (!alive) return
      setPreviews((current) => new Map(current).set(id, preview))
    }

    for (const picked of files) {
      if (started.current.has(picked.id)) continue
      started.current.add(picked.id)

      const how = previewability(picked.file.name)

      if (how === "image") {
        const url = URL.createObjectURL(picked.file)
        made.current.set(picked.id, url)
        put(picked.id, { kind: "picture", url })
        continue
      }

      if (how === "video") {
        void coverFrame(picked.file).then((frame) => {
          if (frame === undefined) {
            put(picked.id, { kind: "none" })
            return
          }
          const url = URL.createObjectURL(frame)
          made.current.set(picked.id, url)
          put(picked.id, { kind: "picture", url })
        })
        continue
      }

      put(picked.id, { kind: how === "unsupported" ? "unsupported" : "none" })
    }

    setPreviews((current) => {
      const kept = new Map<string, Preview>()
      for (const [id, preview] of current) if (present.has(id)) kept.set(id, preview)
      return kept.size === current.size ? current : kept
    })

    return () => {
      alive = false
    }
  }, [files])

  useEffect(() => {
    const urls = made.current
    const seen = started.current
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
      // Y la marca de «de éste ya me ocupé». El ciclo de comprobación de React monta, limpia y
      // vuelve a montar; sin borrarla, la segunda pasada se salta la creación y el `<img>` se queda
      // apuntando a una dirección que esta misma limpieza acaba de revocar — un hueco gris que se
      // lee como «esta foto no se subió». Sólo se ve en desarrollo, que es donde se mira. Ver H-63.
      seen.clear()
    }
  }, [])

  return previews
}
