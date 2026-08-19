"use client"

import { Button, DialogTrigger, Field, Input, Switch, Textarea } from "@tfv/ui"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { type SinglePhoto, SinglePhotoField, useSinglePhoto } from "~/components/photo-picker.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import type { ProductionScope } from "./production.ts"

/**
 * Alta, edición y baja de una producción.
 *
 * ## Las fechas se escriben como día y viajan como instante
 *
 * El campo es un `date` porque nadie programa un rodaje a las 14:32; la API habla en instantes ISO
 * porque el resto del sistema lo hace. La conversión se fija a las 00:00 **locales**, que es lo que
 * hace que el día que se escribe sea el día que se guarda para quien lo escribió.
 *
 * ## El identificador legible se escribe al editar y no al crear
 *
 * La misma regla que en el almacén, y por el mismo motivo: al crear, el servicio lo deriva del
 * nombre y le añade un sufijo si está ocupado —ofrecer el campo prometería que se respeta lo
 * escrito—; al editar, alguien escribió uno concreto y se le responde `409` si choca.
 */

export interface ProductionSummary {
  id: string
  name: string
  description: string
  slug: string | null
  isPublished: boolean
  startsOn: string | null
  endsOn: string | null
  imageUrl: string | null
}

/** El día de un instante, en la zona de quien mira, como lo quiere un campo `date`. */
function toDayValue(instant: string | null): string {
  if (instant === null) return ""
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return ""

  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** El instante del comienzo de ese día, en la zona de quien escribe. Vacío es «sin fecha». */
function toInstant(day: string): string | null {
  if (day === "") return null
  const date = new Date(`${day}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function CreateProduction({ companyId }: { companyId: string }) {
  const t = useTranslations("productions")
  const common = useTranslations("common")
  const [open, setOpen] = useState(false)
  const [isPublished, setIsPublished] = useState(false)
  const photo = useSinglePhoto(companyId, null)
  const { restore } = photo

  return (
    <FormDialog
      title={t("createTitle")}
      description={t("createBody")}
      submitLabel={common("create")}
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">{t("create")}</Button>
        </DialogTrigger>
      }
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setIsPublished(false)
          restore()
        }
      }}
      // Se crea, **después** se sube, y sólo entonces se asigna la imagen. Al revés, una foto que
      // se cae por la red se llevaría por delante el formulario entero.
      action={async (data) => {
        const created = await api<{ id: string }>(`/companies/${companyId}/productions`, {
          method: "POST",
          body: {
            name: text(data, "name"),
            ...(optional(data, "description") ? { description: text(data, "description") } : {}),
            startsOn: toInstant(text(data, "startsOn")),
            endsOn: toInstant(text(data, "endsOn")),
            isPublished,
          },
        })

        const outcome = await photo.run()
        const patch = photo.patch(outcome.uploaded)
        if (patch !== undefined) {
          await api(`/companies/${companyId}/productions/${created.id}`, {
            method: "PATCH",
            body: patch,
          })
        }
      }}
    >
      {(state) => (
        <Fields
          state={state}
          photo={photo}
          isPublished={isPublished}
          onPublishedChange={setIsPublished}
        />
      )}
    </FormDialog>
  )
}

function EditProduction({
  companyId,
  production,
  open,
  onOpenChange,
}: {
  companyId: string
  production: ProductionSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions")
  const common = useTranslations("common")
  const [isPublished, setIsPublished] = useState(production.isPublished)
  const photo = useSinglePhoto(companyId, production.imageUrl)
  const { restore } = photo

  // Al reabrirlo tiene que volver a enseñar lo guardado, no lo que se dejó a medias la vez
  // anterior. Los campos de texto se reinician solos porque el diálogo los desmonta; el
  // interruptor y la imagen no, porque su estado vive aquí fuera.
  useEffect(() => {
    if (!open) return
    setIsPublished(production.isPublished)
    restore()
  }, [open, production.isPublished, restore])

  return (
    <FormDialog
      title={t("editTitle", { name: production.name })}
      submitLabel={common("save")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={async (data) => {
        await api(`/companies/${companyId}/productions/${production.id}`, {
          method: "PATCH",
          body: {
            name: text(data, "name"),
            description: text(data, "description"),
            slug: text(data, "slug"),
            startsOn: toInstant(text(data, "startsOn")),
            endsOn: toInstant(text(data, "endsOn")),
            isPublished,
          },
        })

        const outcome = await photo.run()
        const patch = photo.patch(outcome.uploaded)
        if (patch !== undefined) {
          await api(`/companies/${companyId}/productions/${production.id}`, {
            method: "PATCH",
            body: patch,
          })
        }
      }}
    >
      {(state) => (
        <Fields
          state={state}
          production={production}
          photo={photo}
          isPublished={isPublished}
          onPublishedChange={setIsPublished}
        />
      )}
    </FormDialog>
  )
}

/**
 * La baja, con su alcance contado antes de confirmar.
 *
 * El recuento se pide **al abrir** y no con el listado: es una consulta por producción, y pedirla
 * para las veinticuatro de una página costaría veinticuatro para enseñar como mucho una.
 *
 * ## Lo que impide la baja se dice antes, no al confirmar
 *
 * El servicio la rechaza con `409` si hay órdenes de compra en curso o equipo rentado sin devolver.
 * Ese `409` sigue haciendo falta —alguien puede abrir una orden entre que se abre el diálogo y se
 * pulsa—, pero llegar hasta el botón para que lo rechacen es enterarse tarde y a golpes.
 *
 * Y las cuenta **la misma función que decide la baja**, así que el número que se enseña no puede
 * discrepar del que se aplica.
 */
function DeleteProduction({
  companyId,
  production,
  open,
  onOpenChange,
}: {
  companyId: string
  production: ProductionSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions")
  const common = useTranslations("common")
  const format = useFormatter()
  const [scope, setScope] = useState<ProductionScope | "failed" | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setScope(null)

    api<ProductionScope>(`/companies/${companyId}/productions/${production.id}/scope`)
      .then((value) => {
        if (!cancelled) setScope(value)
      })
      .catch(() => {
        if (!cancelled) setScope("failed")
      })

    return () => {
      cancelled = true
    }
  }, [open, companyId, production.id])

  const settled = scope !== null && scope !== "failed" ? scope : null

  const pending = settled
    ? [
        settled.openPurchaseOrders > 0
          ? t("scopeOpenOrders", { count: settled.openPurchaseOrders })
          : null,
        settled.unreturnedOrders > 0
          ? t("scopeUnreturned", { count: settled.unreturnedOrders })
          : null,
      ].filter((part) => part !== null)
    : []

  /** Por qué todavía no se puede confirmar: se está contando, o hay algo que lo impide. */
  const blockedReason =
    scope === null
      ? t("scopeCounting")
      : pending.length > 0
        ? t("scopeBlocked", { what: format.list(pending, { type: "conjunction" }) })
        : undefined

  // Los ceros no se enumeran: «ningún capítulo» ocupa una línea y no informa de nada.
  const cascade =
    scope === "failed"
      ? [t("scopeFailed")]
      : settled
        ? (
            [
              ["scopeScripts", settled.scripts],
              ["scopeChapters", settled.chapters],
              ["scopeScenes", settled.scenes],
              ["scopeCharacters", settled.characters],
              ["scopeSets", settled.sets],
              ["scopeVideos", settled.videos],
              ["scopeItems", settled.items],
              ["scopeRecordings", settled.recordings],
              ["scopeWorkflows", settled.workflows],
              ["scopePurchaseOrders", settled.purchaseOrders],
            ] as const
          )
            .filter(([, count]) => count > 0)
            .map(([key, count]) => t(key, { count }))
        : []

  return (
    <ConfirmDestructive
      title={t("deleteTitle")}
      entity={production.name}
      cascade={cascade}
      {...(blockedReason === undefined ? {} : { blockedReason })}
      confirmLabel={common("delete")}
      open={open}
      onOpenChange={onOpenChange}
      action={() =>
        api(`/companies/${companyId}/productions/${production.id}`, { method: "DELETE" })
      }
    />
  )
}

export function ProductionActions({
  companyId,
  production,
  canEdit,
  canDelete,
}: {
  companyId: string
  production: ProductionSummary
  canEdit: boolean
  canDelete: boolean
}) {
  const common = useTranslations("common")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: common("edit"),
      dialog: (control) => (
        <EditProduction key="edit" companyId={companyId} production={production} {...control} />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: common("delete"),
      danger: true,
      dialog: (control) => (
        <DeleteProduction key="delete" companyId={companyId} production={production} {...control} />
      ),
    })
  }

  return <ItemActions label={common("actions")} actions={actions} />
}

// ─── Campos compartidos ──────────────────────────────────────────────────────

/**
 * Los mismos campos para el alta y para la edición, salvo el identificador legible.
 *
 * Duplicarlos deja dos formularios que se parecen y no coinciden: el primero que gane un campo lo
 * gana solo, y quien edite no puede tocar lo que sí pudo escribir al crear.
 */
function Fields({
  state,
  production,
  photo,
  isPublished,
  onPublishedChange,
}: {
  state: { fieldErrors: ReadonlyMap<string, string> }
  /** Ausente al crear. Su presencia es lo que distingue las dos mitades. */
  production?: ProductionSummary
  photo: SinglePhoto
  isPublished: boolean
  onPublishedChange: (value: boolean) => void
}) {
  const t = useTranslations("productions")
  const common = useTranslations("common")

  return (
    <>
      <Field label={common("name")} error={state.fieldErrors.get("name")} required>
        {(ids) => (
          <Input
            {...ids}
            name="name"
            autoFocus
            maxLength={250}
            defaultValue={production?.name ?? ""}
            placeholder={t("namePlaceholder")}
          />
        )}
      </Field>

      <Field label={t("description")} error={state.fieldErrors.get("description")}>
        {(ids) => (
          <Textarea
            {...ids}
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={production?.description ?? ""}
          />
        )}
      </Field>

      <div className="grid gap-4 tablet:grid-cols-2">
        <Field label={t("startsOn")} error={state.fieldErrors.get("startsOn")}>
          {(ids) => (
            <Input
              {...ids}
              type="date"
              name="startsOn"
              defaultValue={toDayValue(production?.startsOn ?? null)}
            />
          )}
        </Field>

        <Field label={t("endsOn")} error={state.fieldErrors.get("endsOn")}>
          {(ids) => (
            <Input
              {...ids}
              type="date"
              name="endsOn"
              defaultValue={toDayValue(production?.endsOn ?? null)}
            />
          )}
        </Field>
      </div>

      {production ? (
        <Field
          label={t("slug")}
          hint={t("slugHint")}
          error={state.fieldErrors.get("slug")}
          required
        >
          {(ids) => (
            <Input
              {...ids}
              name="slug"
              maxLength={220}
              className="font-mono"
              defaultValue={production.slug ?? ""}
            />
          )}
        </Field>
      ) : null}

      <SinglePhotoField photo={photo} label={t("image")} />

      <div className="flex flex-col gap-3 rounded-sm border border-edge bg-panel-sunken p-3">
        <Switch checked={isPublished} onCheckedChange={onPublishedChange} label={t("publish")} />
        <p className="text-body3 text-content-faint">
          {production ? t("publishHint") : t("publishHintNew")}
        </p>
      </div>
    </>
  )
}
