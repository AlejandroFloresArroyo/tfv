"use client"

import { Button, DialogTrigger, Field, Input, Switch } from "@tfv/ui"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"

/**
 * Alta, edición y baja de un almacén.
 *
 * ## El identificador legible se escribe en un sitio y en el otro no
 *
 * Es la regla del modelo (`warehouses-and-storage`, «Baja y edición de un almacén») y la pantalla
 * tiene que respetarla, porque las dos mitades se comportan distinto ante una colisión:
 *
 * - **Al crear no hay campo.** El servicio lo deriva del nombre y le añade un sufijo si ya está
 *   ocupado. Ofrecer el campo aquí prometería que se respeta lo escrito, y no es así.
 * - **Al editar sí lo hay, y se rechaza si está ocupado.** Alguien escribió uno concreto; darle
 *   otro en silencio sería no hacer lo que pidió. El `409` llega al campo por su clave.
 *
 * El identificador es único en **toda la plataforma**, no por empresa: es lo que va en la dirección
 * de la tienda pública, donde no hay empresa que lo acote. Por eso puede chocar con el de otra
 * empresa que quien edita no ve.
 */

export interface WarehouseSummary {
  id: string
  name: string
  description: string
  slug: string | null
  isPublished: boolean
}

/**
 * Lo que se lleva por delante la baja, tal como lo cuenta el servidor.
 *
 * `quotes` y `orders` son **todas** —lo que deja de estar accesible—, y `openQuotes`/`openOrders`
 * las que además la impiden. Son cifras distintas a propósito: la primera es lo que hay que
 * enumerar, la segunda lo que hay que advertir.
 */
interface DeletionScope {
  storages: number
  categories: number
  products: number
  priceLists: number
  quotes: number
  orders: number
  openQuotes: number
  openOrders: number
}

export function CreateWarehouse({ companyId }: { companyId: string }) {
  const t = useTranslations("warehouses.warehouses")
  const common = useTranslations("common")
  const [open, setOpen] = useState(false)
  const [isPublished, setIsPublished] = useState(false)

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
      // Gobernado desde aquí sólo para poder devolver el interruptor a su sitio al reabrirlo: los
      // campos de texto se reinician porque el diálogo los desmonta, y su estado no.
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setIsPublished(false)
      }}
      action={(data) =>
        api(`/companies/${companyId}/warehouses`, {
          method: "POST",
          body: {
            name: text(data, "name"),
            ...(optional(data, "description") ? { description: text(data, "description") } : {}),
            isPublished,
          },
        })
      }
    >
      {(state) => (
        <Fields state={state} isPublished={isPublished} onPublishedChange={setIsPublished} />
      )}
    </FormDialog>
  )
}

function EditWarehouse({
  companyId,
  warehouse,
  open,
  onOpenChange,
}: {
  companyId: string
  warehouse: WarehouseSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("warehouses.warehouses")
  const common = useTranslations("common")
  const [isPublished, setIsPublished] = useState(warehouse.isPublished)

  // Al reabrirlo tiene que volver a enseñar lo guardado, no lo que se dejó a medias la vez
  // anterior. Los campos de texto se reinician solos porque el diálogo los desmonta; el
  // interruptor no, porque su estado vive aquí fuera.
  useEffect(() => {
    if (open) setIsPublished(warehouse.isPublished)
  }, [open, warehouse.isPublished])

  return (
    <FormDialog
      title={t("editTitle", { name: warehouse.name })}
      submitLabel={common("save")}
      size="sm"
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`/companies/${companyId}/warehouses/${warehouse.id}`, {
          method: "PATCH",
          body: {
            name: text(data, "name"),
            description: text(data, "description"),
            slug: text(data, "slug"),
            isPublished,
          },
        })
      }
    >
      {(state) => (
        <Fields
          state={state}
          warehouse={warehouse}
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
 * El recuento se pide **al abrir** y no con el listado: es una consulta por almacén, y pedirla para
 * los veinticuatro de una página costaría veinticuatro para enseñar como mucho una.
 *
 * ## El trabajo en curso se dice antes, no al confirmar
 *
 * El servicio impide la baja de un almacén con cotizaciones o pedidos en curso, y responde `409`.
 * Ese `409` sigue haciendo falta —alguien puede abrir una cotización entre que se abre el diálogo y
 * se pulsa—, pero llegar hasta el botón para que lo rechacen es enterarse tarde y a golpes. El
 * alcance trae las abiertas aparte precisamente para poder decirlo al abrir.
 *
 * Y las cuenta **la misma función que decide la baja**, así que el número que se enseña no puede
 * discrepar del que se aplica.
 *
 * ## Los ceros no se enumeran
 *
 * Seis recuentos, casi todos en cero en un almacén recién creado. «Ninguna categoría» ocupa una
 * línea y no informa de nada, que es la misma razón por la que este diálogo omite la lista entera
 * cuando no hay cascada.
 *
 * Si el recuento no llega, se dice y se deja seguir. Es una comodidad para decidir, no una
 * autorización: la autoridad sobre si la baja procede sigue siendo del servidor, que la comprueba
 * igual.
 */
function DeleteWarehouse({
  companyId,
  warehouse,
  open,
  onOpenChange,
}: {
  companyId: string
  warehouse: WarehouseSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("warehouses.warehouses")
  const common = useTranslations("common")
  const format = useFormatter()
  const [scope, setScope] = useState<DeletionScope | "failed" | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setScope(null)

    api<DeletionScope>(`/companies/${companyId}/warehouses/${warehouse.id}/scope`)
      .then((value) => {
        if (!cancelled) setScope(value)
      })
      .catch(() => {
        if (!cancelled) setScope("failed")
      })

    return () => {
      cancelled = true
    }
  }, [open, companyId, warehouse.id])

  const settled = scope !== null && scope !== "failed" ? scope : null

  const pending = settled
    ? [
        settled.openQuotes > 0 ? t("scopeOpenQuotes", { count: settled.openQuotes }) : null,
        settled.openOrders > 0 ? t("scopeOpenOrders", { count: settled.openOrders }) : null,
      ].filter((part) => part !== null)
    : []

  /** Por qué todavía no se puede confirmar: se está contando, o hay trabajo que lo impide. */
  const blockedReason =
    scope === null
      ? t("scopeCounting")
      : pending.length > 0
        ? t("scopeBlocked", { what: format.list(pending, { type: "conjunction" }) })
        : undefined

  const cascade =
    scope === "failed"
      ? [t("scopeFailed")]
      : settled
        ? (
            [
              ["scopeStorages", settled.storages],
              ["scopeCategories", settled.categories],
              ["scopeProducts", settled.products],
              ["scopePriceLists", settled.priceLists],
              // El total, no las abiertas: es lo que deja de estar accesible.
              ["scopeQuotes", settled.quotes],
              ["scopeOrders", settled.orders],
            ] as const
          )
            .filter(([, count]) => count > 0)
            .map(([key, count]) => t(key, { count }))
        : []

  return (
    <ConfirmDestructive
      title={t("deleteTitle")}
      entity={warehouse.name}
      cascade={cascade}
      {...(blockedReason === undefined ? {} : { blockedReason })}
      confirmLabel={common("delete")}
      open={open}
      onOpenChange={onOpenChange}
      action={() => api(`/companies/${companyId}/warehouses/${warehouse.id}`, { method: "DELETE" })}
    />
  )
}

export function WarehouseActions({
  companyId,
  warehouse,
  canEdit,
  canDelete,
}: {
  companyId: string
  warehouse: WarehouseSummary
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
        <EditWarehouse key="edit" companyId={companyId} warehouse={warehouse} {...control} />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: common("delete"),
      danger: true,
      dialog: (control) => (
        <DeleteWarehouse key="delete" companyId={companyId} warehouse={warehouse} {...control} />
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
  warehouse,
  isPublished,
  onPublishedChange,
}: {
  state: { fieldErrors: ReadonlyMap<string, string> }
  /** Ausente al crear. Su presencia es lo que distingue las dos mitades. */
  warehouse?: WarehouseSummary
  isPublished: boolean
  onPublishedChange: (value: boolean) => void
}) {
  const t = useTranslations("warehouses.warehouses")
  const common = useTranslations("common")

  return (
    <>
      <Field label={common("name")} error={state.fieldErrors.get("name")} required>
        {(ids) => (
          <Input
            {...ids}
            name="name"
            autoFocus
            maxLength={200}
            defaultValue={warehouse?.name ?? ""}
            placeholder={t("namePlaceholder")}
          />
        )}
      </Field>

      <Field label={t("description")} error={state.fieldErrors.get("description")}>
        {(ids) => (
          <Input
            {...ids}
            name="description"
            maxLength={4000}
            defaultValue={warehouse?.description ?? ""}
          />
        )}
      </Field>

      {warehouse ? (
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
              defaultValue={warehouse.slug ?? ""}
            />
          )}
        </Field>
      ) : null}

      <div className="flex flex-col gap-3 rounded-sm border border-line bg-panel-sunken p-3">
        <Switch checked={isPublished} onCheckedChange={onPublishedChange} label={t("publish")} />
        <p className="text-body3 text-content-faint">
          {warehouse ? t("publishHint") : t("publishHintNew")}
        </p>
      </div>
    </>
  )
}
