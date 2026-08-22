"use client"

import { Button, DialogTrigger, Field, Input } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import type { ScriptRow } from "../../production.ts"
import { SingleDocumentField, useSingleDocument } from "./script-document-field.tsx"

/**
 * Alta, edición y baja de un guion.
 *
 * El nombre y el índice comparten formulario con el archivo, pero **no comparten momento de
 * guardado**: primero se registra el guion —el servidor lo marca `not_extracted` sin que nadie se
 * lo pida—, y sólo después se sube el archivo y se le asigna. Es la regla de `forms-and-wizards` y
 * aquí importa doblemente: un guion sin archivo es válido —el catálogo lo admite—, así que no hay
 * razón para esperar la subida antes de dejar existir el registro.
 *
 * **El disparador va envuelto en `DialogTrigger`.** `Dialog` es el primitivo de Radix sin adornar
 * (`packages/ui/src/components/dialog.tsx`): sin `DialogTrigger`, el botón se pinta pero no abre
 * nada, porque nada lo conecta al contexto que alterna `open`. `CreateAnchor` y `DeleteAnchor`
 * (`budget/anchors/anchor-actions.tsx`) comparten disparador con `open` propio y **tampoco lo
 * llevan** — verificado en el navegador: su botón no abre el diálogo. Ver H-240.
 *
 * **Editar y dar de baja van agrupados en `ItemActions`**, no como dos botones de texto sueltos:
 * verificado en el navegador a 375 px, «Editar» y «Dar de baja» escritos junto a la insignia de
 * estado no caben en la tarjeta de la lista y el título de guion se queda a cero de ancho —
 * `ItemCard` no baja a columna por debajo de cierto ancho en la vista de lista, y el lado de las
 * acciones no cede—. Un único punto de acceso, como en `ChapterActions`/`SceneActions`, resuelve lo
 * mismo que resolvió agrupar las acciones de una fila de colección en su día.
 */

function scriptsPath(companyId: string, productionId: string): string {
  return `/companies/${companyId}/productions/${productionId}/scripts`
}

export function CreateScript({
  companyId,
  productionId,
}: {
  companyId: string
  productionId: string
}) {
  const t = useTranslations("productions.script")
  const document = useSingleDocument(companyId, null)
  const { restore } = document
  const [open, setOpen] = useState(false)

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            {t("newScript")}
          </Button>
        </DialogTrigger>
      }
      title={t("newScriptTitle")}
      submitLabel={t("newScript")}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) restore()
      }}
      action={async (data) => {
        const created = await api<ScriptRow>(scriptsPath(companyId, productionId), {
          method: "POST",
          body: {
            name: text(data, "name"),
            index: Number(text(data, "index") || "0"),
          },
        })

        const outcome = await document.run()
        const patch = document.patch(outcome.uploaded)
        if (patch !== undefined) {
          await api(`${scriptsPath(companyId, productionId)}/${created.id}`, {
            method: "PATCH",
            body: patch,
          })
        }
      }}
    >
      {(state) => (
        <>
          <Field label={t("name")} error={state.fieldErrors.get("name")} required>
            {(ids) => <Input {...ids} name="name" autoComplete="off" maxLength={250} />}
          </Field>

          <Field label={t("index")} hint={t("indexHint")} error={state.fieldErrors.get("index")}>
            {(ids) => (
              <Input
                {...ids}
                name="index"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={0}
              />
            )}
          </Field>

          <SingleDocumentField document={document} />
        </>
      )}
    </FormDialog>
  )
}

function EditScript({
  companyId,
  productionId,
  script,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  script: ScriptRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.script")
  const document = useSingleDocument(companyId, script.documentFileName)
  const { restore } = document

  return (
    <FormDialog
      title={t("editScriptTitle")}
      submitLabel={t("save")}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) restore()
      }}
      action={async (data) => {
        await api(`${scriptsPath(companyId, productionId)}/${script.id}`, {
          method: "PATCH",
          body: {
            name: text(data, "name"),
            index: Number(text(data, "index") || "0"),
          },
        })

        const outcome = await document.run()
        const patch = document.patch(outcome.uploaded)
        if (patch !== undefined) {
          await api(`${scriptsPath(companyId, productionId)}/${script.id}`, {
            method: "PATCH",
            body: patch,
          })
        }
      }}
    >
      {(state) => (
        <>
          <Field label={t("name")} error={state.fieldErrors.get("name")} required>
            {(ids) => (
              <Input
                {...ids}
                name="name"
                autoComplete="off"
                maxLength={250}
                defaultValue={script.name}
              />
            )}
          </Field>

          <Field label={t("index")} hint={t("indexHint")} error={state.fieldErrors.get("index")}>
            {(ids) => (
              <Input
                {...ids}
                name="index"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={script.index}
              />
            )}
          </Field>

          <SingleDocumentField document={document} />
        </>
      )}
    </FormDialog>
  )
}

/**
 * Dar de baja un guion.
 *
 * La confirmación enumera los capítulos que se quedan sin guion — no se borran, `script-breakdown`
 * lo dice con esas palabras: «sus capítulos se quedan, sin guion»—. El recuento sale de la propia
 * fila, igual que `DeleteAnchor` cuenta sus comprobantes sin volver a preguntar: `chapterCount` es
 * exactamente lo que la ruta de alcance del guion contaría, así que pedirla aparte sería una
 * petición más para el mismo número.
 */
function DeleteScript({
  companyId,
  productionId,
  script,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  script: ScriptRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.script")

  return (
    <ConfirmDestructive
      title={t("deleteScriptTitle")}
      entity={script.name}
      cascade={
        script.chapterCount > 0 ? [t("deleteScriptChapters", { count: script.chapterCount })] : []
      }
      confirmLabel={t("delete")}
      open={open}
      onOpenChange={onOpenChange}
      action={async () => {
        await api(`${scriptsPath(companyId, productionId)}/${script.id}`, { method: "DELETE" })
      }}
    />
  )
}

/** Editar y dar de baja, agrupados en un único punto de acceso — ver la nota de arriba del todo. */
export function ScriptActions({
  companyId,
  productionId,
  script,
  canEdit,
  canDelete,
}: {
  companyId: string
  productionId: string
  script: ScriptRow
  canEdit: boolean
  canDelete: boolean
}) {
  const t = useTranslations("productions.script")
  const common = useTranslations("common")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: common("edit"),
      dialog: (control) => (
        <EditScript
          key="edit"
          companyId={companyId}
          productionId={productionId}
          script={script}
          {...control}
        />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: t("delete"),
      danger: true,
      dialog: (control) => (
        <DeleteScript
          key="delete"
          companyId={companyId}
          productionId={productionId}
          script={script}
          {...control}
        />
      ),
    })
  }

  return <ItemActions label={common("actions")} actions={actions} />
}
