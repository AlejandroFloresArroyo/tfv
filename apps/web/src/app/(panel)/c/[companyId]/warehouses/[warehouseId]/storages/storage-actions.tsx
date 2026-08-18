"use client"

import { Button, DialogTrigger, Field, Input, Select } from "@tfv/ui"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { flattenTree } from "~/components/tree/tree.ts"
import { TreeDeleteDialog } from "~/components/tree/tree-delete-dialog.tsx"
import { TreeMoveDialog } from "~/components/tree/tree-move-dialog.tsx"
import { optional, text } from "~/components/use-submit.ts"
import { api } from "~/lib/api.client.ts"
import {
  type ItemsEnvelope,
  STORAGE_KINDS,
  type StorageRow,
  type StorageScope,
} from "../../warehouse.ts"

/**
 * Las cuatro escrituras del árbol de ubicaciones.
 *
 * Dos reglas del servicio se explican aquí, en la pantalla, porque quien las descubre después ya ha
 * hecho el daño:
 *
 * - **El código no se regenera al renombrar, sólo al cambiar de tipo.** Está impreso en etiquetas
 *   pegadas a los estantes. Corregir una falta de ortografía no puede dejar la nave llena de
 *   etiquetas mintiendo, y cambiar el tipo sí lo hace — así que el formulario lo avisa antes.
 * - **Eliminar es recursivo y deja los productos sin ubicación.** No los borra. La confirmación lo
 *   dice con el recuento real, que viene de la consulta de alcance del servidor.
 *
 * Nada de esto se pinta apagado por falta de permiso: la pantalla no pasa las acciones que la
 * persona no puede hacer.
 */

function basePath(companyId: string, warehouseId: string) {
  return `/companies/${companyId}/warehouses/${warehouseId}/storages`
}

/** Los campos que comparten el alta y la edición. El padre no está: para eso está mover. */
function StorageFields({
  storage,
  fieldErrors,
}: {
  storage?: StorageRow
  fieldErrors: ReadonlyMap<string, string>
}) {
  const t = useTranslations()

  return (
    <>
      <Field
        label={t("common.name")}
        error={fieldErrors.get("name")}
        {...(storage ? { hint: t("warehouses.storages.nameHint", { code: storage.code }) } : {})}
        required
      >
        {(ids) => <Input {...ids} name="name" defaultValue={storage?.name} autoFocus />}
      </Field>

      <Field
        label={t("warehouses.storages.kindLabel")}
        hint={storage ? t("warehouses.storages.kindHintEdit") : t("warehouses.storages.kindHint")}
        error={fieldErrors.get("kind")}
        required
      >
        {(ids) => (
          <Select {...ids} name="kind" defaultValue={storage?.kind ?? "box"}>
            {STORAGE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`warehouses.storages.kind.${kind}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </>
  )
}

/**
 * Alta.
 *
 * La misma para una raíz y para una hija: lo único que cambia es el padre, que viene decidido por
 * el sitio desde el que se abre y no por un campo más que rellenar.
 */
export function CreateStorage({
  companyId,
  warehouseId,
  parentId = null,
  parentName,
}: {
  companyId: string
  warehouseId: string
  parentId?: string | null
  /** Presente cuando se crea dentro de algo, para que el título diga dentro de qué. */
  parentName?: string
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={
        parentName
          ? t("warehouses.storages.createInTitle", { parent: parentName })
          : t("warehouses.storages.createTitle")
      }
      submitLabel={t("common.create")}
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            {parentId === null
              ? t("warehouses.storages.createRoot")
              : t("warehouses.storages.createChild")}
          </Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(basePath(companyId, warehouseId), {
          method: "POST",
          body: { name: text(data, "name"), kind: optional(data, "kind"), parentId },
        })
      }
    >
      {(state) => <StorageFields fieldErrors={state.fieldErrors} />}
    </FormDialog>
  )
}

export function EditStorage({
  companyId,
  warehouseId,
  storage,
  open,
  onOpenChange,
}: {
  companyId: string
  warehouseId: string
  storage: StorageRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()

  return (
    <FormDialog
      title={t("warehouses.storages.editTitle", { name: storage.name })}
      submitLabel={t("common.save")}
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`${basePath(companyId, warehouseId)}/${storage.id}`, {
          method: "PATCH",
          body: { name: text(data, "name"), kind: optional(data, "kind") },
        })
      }
    >
      {(state) => <StorageFields storage={storage} fieldErrors={state.fieldErrors} />}
    </FormDialog>
  )
}

export function MoveStorage({
  companyId,
  warehouseId,
  storage,
  open,
  onOpenChange,
}: {
  companyId: string
  warehouseId: string
  storage: StorageRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const base = basePath(companyId, warehouseId)

  return (
    <TreeMoveDialog
      title={t("warehouses.storages.moveTitle", { name: storage.name })}
      submitLabel={t("common.save")}
      fieldLabel={t("warehouses.storages.moveField")}
      hint={t("warehouses.storages.moveHint")}
      rootLabel={t("warehouses.storages.moveRoot")}
      loadingLabel={t("warehouses.storages.moveLoading")}
      cycleMessage={t("warehouses.storages.cycle")}
      node={storage}
      load={() =>
        flattenTree<StorageRow>(
          async (parentId) => {
            const url =
              parentId === null ? base : `${base}?parentId=${encodeURIComponent(parentId)}`
            return (await api<ItemsEnvelope<StorageRow>>(url)).items
          },
          // El código y no sólo el nombre: es como se nombran las ubicaciones en voz alta, y dos
          // estantes de dos racks distintos se llaman igual.
          (node) => `${node.code} · ${node.name}`,
        )
      }
      move={(parentId) => api(`${base}/${storage.id}`, { method: "PATCH", body: { parentId } })}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

export function DeleteStorage({
  companyId,
  warehouseId,
  storage,
  after,
  open,
  onOpenChange,
}: {
  companyId: string
  warehouseId: string
  storage: StorageRow
  after?: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const base = basePath(companyId, warehouseId)

  return (
    <TreeDeleteDialog
      title={t("warehouses.storages.deleteTitle")}
      entity={`${storage.code} · ${storage.name}`}
      confirmLabel={t("common.delete")}
      countingLabel={t("warehouses.storages.counting")}
      countFailedLabel={t("warehouses.storages.countFailed")}
      load={async () => {
        const scope = await api<StorageScope>(`${base}/${storage.id}/scope`)

        return [
          t("warehouses.storages.deleteCascade", { count: scope.storages }),
          t("warehouses.storages.deleteProducts", { count: scope.products }),
        ]
      }}
      remove={() => api(`${base}/${storage.id}`, { method: "DELETE" })}
      after={after}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

/**
 * Las acciones de una ubicación, agrupadas en un único punto de acceso.
 *
 * Mover tiene entrada propia y no es un campo del formulario de edición porque es la única que
 * puede formar un ciclo, y el rechazo del servidor tiene que leerse junto al destino elegido.
 */
export function StorageActions({
  companyId,
  warehouseId,
  storage,
  canEdit,
  canDelete,
  after,
}: {
  companyId: string
  warehouseId: string
  storage: StorageRow
  canEdit: boolean
  canDelete: boolean
  /** A dónde ir tras borrar, cuando ésta es la ubicación que la pantalla está enseñando. */
  after?: string | undefined
}) {
  const t = useTranslations()
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: t("common.edit"),
      dialog: (control) => (
        <EditStorage
          key="edit"
          companyId={companyId}
          warehouseId={warehouseId}
          storage={storage}
          {...control}
        />
      ),
    })

    actions.push({
      key: "move",
      label: t("warehouses.storages.move"),
      dialog: (control) => (
        <MoveStorage
          key="move"
          companyId={companyId}
          warehouseId={warehouseId}
          storage={storage}
          {...control}
        />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: t("common.delete"),
      danger: true,
      dialog: (control) => (
        <DeleteStorage
          key="delete"
          companyId={companyId}
          warehouseId={warehouseId}
          storage={storage}
          after={after}
          {...control}
        />
      ),
    })
  }

  return <ItemActions label={t("common.actions")} actions={actions} />
}
