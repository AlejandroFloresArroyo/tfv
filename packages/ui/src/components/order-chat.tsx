"use client"

import { AlertCircle, Check, CheckCheck, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "../lib/cn.ts"
import { Button } from "./button.tsx"
import { Spinner } from "./spinner.tsx"
import { Badge, Panel } from "./surfaces.tsx"

/**
 * La conversación de un pedido.
 *
 * Ver `openspec/specs/order-chat/spec.md`.
 *
 * **No sabe de red ni de idioma.** Recibe lo que hay que pintar, los textos ya traducidos y las
 * funciones que hay que llamar. Lo que decide qué se pinta —la reconciliación de lo optimista, el
 * cursor, los reintentos— vive fuera, en una función que se prueba sin navegador.
 *
 * Tres cosas que un chat tiene que hacer bien y casi nunca hace:
 *
 * - **Bajar solo, pero sólo si estabas abajo.** Bajar mientras alguien lee hacia arriba es
 *   arrancarle la página de las manos.
 * - **Distinguir lo que aún no ha llegado.** Un mensaje pintado igual que los confirmados promete
 *   que se envió.
 * - **Conservar lo que falló.** El texto se queda, marcado, con su reintento al lado.
 */

export type ChatEntrySide = "client" | "provider" | "system"

export interface ChatEntry {
  readonly id: string
  readonly side: ChatEntrySide
  readonly body: string
  readonly authorName: string | null
  readonly createdAt: string
  readonly editedAt: string | null
  /** El otro lado ya lo leyó. Sólo tiene sentido en los propios. */
  readonly read: boolean
  readonly pending: boolean
  readonly failed: boolean
  readonly mine: boolean
  readonly canEdit: boolean
  readonly canDelete: boolean
}

export interface OrderChatLabels {
  readonly title: string
  readonly placeholder: string
  readonly send: string
  readonly empty: string
  readonly older: string
  readonly system: string
  readonly otherSide: string
  readonly mySide: string
  readonly edited: string
  readonly read: string
  readonly sending: string
  readonly failed: string
  readonly retry: string
  readonly edit: string
  readonly save: string
  readonly cancel: string
  readonly remove: string
  readonly reconnecting: string
  readonly readOnly: string
}

export interface OrderChatProps {
  readonly entries: readonly ChatEntry[]
  readonly status: "loading" | "live" | "retrying"
  readonly hasOlder: boolean
  readonly loadingOlder: boolean
  readonly canWrite: boolean
  readonly labels: OrderChatLabels
  /** El idioma lo pone la aplicación: aquí sólo se pinta lo que devuelva. */
  readonly formatTime: (instant: string) => string
  readonly onSend: (body: string) => void
  readonly onRetry: (id: string) => void
  readonly onEdit: (id: string, body: string) => void
  readonly onDelete: (id: string) => void
  readonly onOlder: () => void
  readonly className?: string
}

export function OrderChat({
  entries,
  status,
  hasOlder,
  loadingOlder,
  canWrite,
  labels,
  formatTime,
  onSend,
  onRetry,
  onEdit,
  onDelete,
  onOlder,
  className,
}: OrderChatProps) {
  const [draft, setDraft] = useState("")
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)

  const list = useRef<HTMLDivElement | null>(null)
  const atBottom = useRef(true)
  const count = entries.length

  // Bajar sólo si ya se estaba abajo: arrastrar la vista mientras alguien lee hacia arriba es
  // quitarle lo que estaba mirando.
  useEffect(() => {
    const node = list.current
    if (!node || count === 0 || !atBottom.current) return
    node.scrollTop = node.scrollHeight
  }, [count])

  function submit() {
    const text = draft.trim()
    if (text === "") return
    onSend(text)
    setDraft("")
    atBottom.current = true
  }

  return (
    <Panel className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-body2 font-bold text-content">{labels.title}</h2>
        {status === "retrying" ? (
          <span className="flex items-center gap-1.5 text-body3 text-content-faint">
            <Spinner className="size-3.5" />
            {labels.reconnecting}
          </span>
        ) : null}
      </div>

      <div
        ref={list}
        onScroll={(event) => {
          const node = event.currentTarget
          atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48
        }}
        // `log` y no `alert`: se anuncia lo que va llegando sin interrumpir lo que se esté leyendo.
        role="log"
        aria-live="polite"
        aria-label={labels.title}
        className="flex max-h-[26rem] min-h-[12rem] flex-col gap-2 overflow-y-auto px-4 py-4"
      >
        {hasOlder ? (
          <div className="flex justify-center pb-2">
            <Button variant="ghost" size="sm" loading={loadingOlder} onClick={onOlder}>
              {labels.older}
            </Button>
          </div>
        ) : null}

        {status === "loading" && entries.length === 0 ? (
          <p className="m-auto text-body3 text-content-faint">
            <Spinner className="size-4" />
          </p>
        ) : null}

        {status !== "loading" && entries.length === 0 ? (
          <p className="m-auto max-w-xs text-center text-body3 text-content-faint">
            {labels.empty}
          </p>
        ) : null}

        {entries.map((entry) =>
          entry.side === "system" ? (
            <SystemLine key={entry.id} entry={entry} labels={labels} formatTime={formatTime} />
          ) : (
            <Bubble
              key={entry.id}
              entry={entry}
              labels={labels}
              formatTime={formatTime}
              editing={editing?.id === entry.id ? editing.body : null}
              onStartEdit={() => setEditing({ id: entry.id, body: entry.body })}
              onChangeEdit={(body) => setEditing({ id: entry.id, body })}
              onCancelEdit={() => setEditing(null)}
              onSaveEdit={() => {
                if (editing && editing.body.trim() !== "") onEdit(entry.id, editing.body.trim())
                setEditing(null)
              }}
              onRetry={() => onRetry(entry.id)}
              onDelete={() => onDelete(entry.id)}
            />
          ),
        )}
      </div>

      {canWrite ? (
        <div className="flex items-end gap-2 border-t border-line px-4 py-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter envía y Mayús+Enter parte la línea: es lo que hacen los dedos que ya saben
              // escribir en un chat.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            className={cn(
              "max-h-32 min-h-10 flex-1 resize-y rounded-sm border border-field bg-panel px-3 py-2",
              "text-body2 text-content placeholder:text-content-faint",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus/40",
            )}
          />
          <Button onClick={submit} disabled={draft.trim() === ""} aria-label={labels.send}>
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <p className="border-t border-line px-4 py-3 text-body3 text-content-faint">
          {labels.readOnly}
        </p>
      )}
    </Panel>
  )
}

function SystemLine({
  entry,
  labels,
  formatTime,
}: {
  entry: ChatEntry
  labels: OrderChatLabels
  formatTime: (instant: string) => string
}) {
  return (
    <div className="my-1 flex flex-col items-center gap-1">
      <Badge>{labels.system}</Badge>
      <p className="max-w-md text-center text-body3 text-content-muted">{entry.body}</p>
      <span className="text-body3 text-content-faint">{formatTime(entry.createdAt)}</span>
    </div>
  )
}

function Bubble({
  entry,
  labels,
  formatTime,
  editing,
  onStartEdit,
  onChangeEdit,
  onCancelEdit,
  onSaveEdit,
  onRetry,
  onDelete,
}: {
  entry: ChatEntry
  labels: OrderChatLabels
  formatTime: (instant: string) => string
  editing: string | null
  onStartEdit: () => void
  onChangeEdit: (body: string) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  const author = entry.authorName ?? (entry.mine ? labels.mySide : labels.otherSide)

  return (
    <div className={cn("flex flex-col gap-1", entry.mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-md px-3 py-2 text-body2",
          entry.mine ? "bg-accent text-on-accent" : "bg-panel-hover text-content",
          // Lo que aún no ha llegado no se pinta como lo confirmado: pintarlo igual promete algo
          // que todavía no ha ocurrido.
          entry.pending && !entry.failed && "opacity-60",
          entry.failed && "border border-red-8",
        )}
      >
        {!entry.mine ? (
          <p className="mb-0.5 text-body3 font-semibold opacity-80">{author}</p>
        ) : null}

        {editing === null ? (
          <p className="whitespace-pre-wrap break-words">{entry.body}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              value={editing}
              onChange={(event) => onChangeEdit(event.target.value)}
              rows={2}
              aria-label={labels.edit}
              className="w-full resize-y rounded-xs border border-field bg-panel px-2 py-1 text-body2 text-content"
            />
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={onCancelEdit}>
                <X className="size-3.5" aria-hidden="true" />
                {labels.cancel}
              </Button>
              <Button size="sm" onClick={onSaveEdit}>
                {labels.save}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-body3 text-content-faint">
        <span>{formatTime(entry.createdAt)}</span>
        {entry.editedAt ? <span>· {labels.edited}</span> : null}

        {entry.pending && !entry.failed ? <span>· {labels.sending}</span> : null}

        {entry.failed ? (
          <>
            <span className="flex items-center gap-1 text-danger">
              <AlertCircle className="size-3.5" aria-hidden="true" />
              {labels.failed}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1 rounded-xs font-semibold text-content hover:underline focus-visible:outline-2 focus-visible:outline-focus/40"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {labels.retry}
            </button>
          </>
        ) : null}

        {/* El acuse es del lado, no de la persona: dice si «el almacén» lo vio. */}
        {entry.mine && !entry.pending ? (
          <span className="flex items-center gap-1" title={entry.read ? labels.read : undefined}>
            {entry.read ? (
              <CheckCheck className="size-3.5 text-accent" aria-label={labels.read} />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            )}
          </span>
        ) : null}

        {entry.canEdit && editing === null ? (
          <button
            type="button"
            onClick={onStartEdit}
            className="rounded-xs hover:text-content focus-visible:outline-2 focus-visible:outline-focus/40"
            aria-label={labels.edit}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}

        {entry.canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xs hover:text-danger focus-visible:outline-2 focus-visible:outline-focus/40"
            aria-label={labels.remove}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
