"use client"

import { Button, Callout, DialogTrigger, Field, Panel, Textarea } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { FormDialog } from "~/components/form-dialog.tsx"
import { text } from "~/components/use-submit.ts"
import { ApiError, apiTyped } from "~/lib/api.client.ts"
import type { RecordingNoteRow } from "../../../production.ts"

/**
 * El cuaderno del script.
 *
 * Texto libre porque en el set se anota rápido: la luz que cambió, un raccord que hay que repetir.
 * Las tres operaciones comparten una sola clave —`productions.recordings.notes`—, y es correcto: el
 * catálogo cerrado la trae así, quien puede anotar puede corregir lo que anotó
 * (`routes/continuity.ts`, la cabecera de «Las tres notas comparten clave»).
 */
export function RecordingNotes({
  companyId,
  productionId,
  recordingId,
  notes,
  canWrite,
}: {
  companyId: string
  productionId: string
  recordingId: string
  notes: readonly RecordingNoteRow[]
  canWrite: boolean
}) {
  const t = useTranslations("productions.rodaje")
  const format = useFormatter()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(noteId: string) {
    setBusy(noteId)
    setError(null)
    try {
      await apiTyped(
        "DELETE /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/notes/{noteId}",
        { params: { companyId, productionId, recordingId, noteId } },
      )
      router.refresh()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : t("noteDeleteFailed"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="notas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="notas" className="text-h4 font-semibold text-content">
          {t("notes")}
        </h2>

        {canWrite ? (
          <AddNote companyId={companyId} productionId={productionId} recordingId={recordingId} />
        ) : null}
      </div>

      {error ? (
        <Callout tone="danger" live>
          {error}
        </Callout>
      ) : null}

      {notes.length === 0 ? (
        <Panel className="p-6 text-body1 text-content-muted">{t("notesEmpty")}</Panel>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id}>
              <Panel className="flex flex-col gap-1.5 p-4">
                <p className="whitespace-pre-wrap text-body2 text-content">{note.body}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-body3 text-content-faint">
                    {note.authorName ?? t("someone")} ·{" "}
                    {format.dateTime(new Date(note.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>

                  {canWrite ? (
                    <div className="flex items-center gap-1">
                      <EditNote
                        companyId={companyId}
                        productionId={productionId}
                        recordingId={recordingId}
                        note={note}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-tinta-alto"
                        loading={busy === note.id}
                        onClick={() => remove(note.id)}
                      >
                        {t("deleteNote")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddNote({
  companyId,
  productionId,
  recordingId,
}: {
  companyId: string
  productionId: string
  recordingId: string
}) {
  const t = useTranslations("productions.rodaje")

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm">
            <Plus className="size-4" aria-hidden="true" />
            {t("addNote")}
          </Button>
        </DialogTrigger>
      }
      title={t("addNoteTitle")}
      submitLabel={t("addNoteConfirm")}
      action={async (data) => {
        await apiTyped(
          "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/notes",
          { params: { companyId, productionId, recordingId }, body: { body: text(data, "body") } },
        )
      }}
    >
      {(state) => (
        <Field label={t("noteBody")} error={state.fieldErrors.get("body")} required>
          {(ids) => <Textarea {...ids} name="body" rows={4} maxLength={10_000} autoFocus />}
        </Field>
      )}
    </FormDialog>
  )
}

function EditNote({
  companyId,
  productionId,
  recordingId,
  note,
}: {
  companyId: string
  productionId: string
  recordingId: string
  note: RecordingNoteRow
}) {
  const t = useTranslations("productions.rodaje")

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            {t("editNote")}
          </Button>
        </DialogTrigger>
      }
      title={t("editNoteTitle")}
      submitLabel={t("save")}
      action={async (data) => {
        await apiTyped(
          "PATCH /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/notes/{noteId}",
          {
            params: { companyId, productionId, recordingId, noteId: note.id },
            body: { body: text(data, "body") },
          },
        )
      }}
    >
      {(state) => (
        <Field label={t("noteBody")} error={state.fieldErrors.get("body")} required>
          {(ids) => (
            <Textarea {...ids} name="body" rows={4} maxLength={10_000} defaultValue={note.body} />
          )}
        </Field>
      )}
    </FormDialog>
  )
}
