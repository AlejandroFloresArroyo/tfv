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
import type { ItemsEnvelope, ProductionCategoryRow, RoleRow } from "../../production.ts"

/**
 * Las cuatro escrituras del árbol de categorías de una producción.
 *
 * Es el mismo árbol que los dos del almacén y las mismas cuatro operaciones. Lo propio de ésta es
 * **el equipo**: cada categoría puede apuntar a un rol de la empresa, y ése es el mecanismo por el
 * que el trabajo clasificado llega al departamento que le toca. El desplegable se llena con los
 * roles de la empresa —los mismos que se administran en Configuración—, no con una lista aparte.
 *
 * ## El alcance lo cuenta el servidor
 *
 * A diferencia de la taxonomía del almacén, que tiene que componerlo desde el catálogo (H-38), aquí
 * hay una consulta de alcance: devuelve cuántas categorías se van y cuánto de lo clasificado queda
 * sin categoría. Se pide entera y se enumera lo que no sea cero.
 *
 * El identificador legible no es un campo: lo deriva el servidor del nombre y lo hace único
 * **dentro de la producción**. Ofrecerlo aquí sería ofrecer algo que no se puede cumplir.
 */

interface CategoryScope {
  categories: number
  items: number
  videos: number
  tasks: number
}

function basePath(companyId: string, productionId: string) {
  return `/companies/${companyId}/productions/${productionId}/categories`
}

/** Baja el árbol entero, aplanado, para poder elegir padre. */
function loadTree(companyId: string, productionId: string) {
  const base = basePath(companyId, productionId)

  return flattenTree<ProductionCategoryRow>(
    async (parentId) => {
      const url = parentId === null ? base : `${base}?parentId=${encodeURIComponent(parentId)}`
      return (await api<ItemsEnvelope<ProductionCategoryRow>>(url)).items
    },
    (node) => node.name,
  )
}

function CategoryFields({
  category,
  roles,
  fieldErrors,
}: {
  category?: ProductionCategoryRow
  roles: readonly RoleRow[]
  fieldErrors: ReadonlyMap<string, string>
}) {
  const t = useTranslations("productions.categories")
  const common = useTranslations("common")

  return (
    <>
      <Field label={common("name")} error={fieldErrors.get("name")} required>
        {(ids) => <Input {...ids} name="name" defaultValue={category?.name} autoFocus />}
      </Field>

      <Field
        label={t("descriptionLabel")}
        hint={t("descriptionHint")}
        error={fieldErrors.get("description")}
      >
        {(ids) => <Input {...ids} name="description" defaultValue={category?.description} />}
      </Field>

      {/*
        Sin roles no se ofrece el campo apagado: se dice por qué está vacío. Un desplegable con una
        sola opción que no elige nada se lee como un fallo de la pantalla.
      */}
      {roles.length > 0 ? (
        <Field label={t("role")} hint={t("roleHint")} error={fieldErrors.get("roleId")}>
          {(ids) => (
            <Select {...ids} name="roleId" defaultValue={category?.roleId ?? ""}>
              <option value="">{t("roleNone")}</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <p className="text-body3 text-content-faint">{t("roleEmpty")}</p>
      )}
    </>
  )
}

export function CreateCategory({
  companyId,
  productionId,
  roles,
  parentId = null,
  parentName,
}: {
  companyId: string
  productionId: string
  roles: readonly RoleRow[]
  parentId?: string | null
  parentName?: string
}) {
  const t = useTranslations("productions.categories")
  const common = useTranslations("common")

  return (
    <FormDialog
      title={parentName ? t("createInTitle", { parent: parentName }) : t("createTitle")}
      submitLabel={common("create")}
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            {parentId === null ? t("createRoot") : t("createChild")}
          </Button>
        </DialogTrigger>
      }
      action={(data) =>
        api(basePath(companyId, productionId), {
          method: "POST",
          body: {
            name: text(data, "name"),
            description: optional(data, "description"),
            // Vacío es «sin equipo», y viaja como nulo: la cadena vacía no es un identificador.
            roleId: optional(data, "roleId") ?? null,
            parentId,
          },
        })
      }
    >
      {(state) => <CategoryFields roles={roles} fieldErrors={state.fieldErrors} />}
    </FormDialog>
  )
}

export function EditCategory({
  companyId,
  productionId,
  category,
  roles,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  category: ProductionCategoryRow
  roles: readonly RoleRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.categories")
  const common = useTranslations("common")

  return (
    <FormDialog
      title={t("editTitle", { name: category.name })}
      submitLabel={common("save")}
      open={open}
      onOpenChange={onOpenChange}
      action={(data) =>
        api(`${basePath(companyId, productionId)}/${category.id}`, {
          method: "PATCH",
          // La descripción y el equipo se mandan siempre, también vacíos: es cómo se retiran.
          body: {
            name: text(data, "name"),
            description: text(data, "description"),
            roleId: optional(data, "roleId") ?? null,
          },
        })
      }
    >
      {(state) => (
        <CategoryFields category={category} roles={roles} fieldErrors={state.fieldErrors} />
      )}
    </FormDialog>
  )
}

export function MoveCategory({
  companyId,
  productionId,
  category,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  category: ProductionCategoryRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.categories")
  const common = useTranslations("common")

  return (
    <TreeMoveDialog
      title={t("moveTitle", { name: category.name })}
      submitLabel={common("save")}
      fieldLabel={t("moveField")}
      hint={t("moveHint")}
      rootLabel={t("moveRoot")}
      loadingLabel={t("moveLoading")}
      cycleMessage={t("cycle")}
      node={category}
      load={() => loadTree(companyId, productionId)}
      move={(parentId) =>
        api(`${basePath(companyId, productionId)}/${category.id}`, {
          method: "PATCH",
          body: { parentId },
        })
      }
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

export function DeleteCategory({
  companyId,
  productionId,
  category,
  after,
  open,
  onOpenChange,
}: {
  companyId: string
  productionId: string
  category: ProductionCategoryRow
  after?: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.categories")
  const common = useTranslations("common")

  return (
    <TreeDeleteDialog
      title={t("deleteTitle")}
      entity={category.name}
      confirmLabel={common("delete")}
      countingLabel={t("counting")}
      countFailedLabel={t("countFailed")}
      load={async () => {
        const scope = await api<CategoryScope>(
          `${basePath(companyId, productionId)}/${category.id}/scope`,
        )

        return (
          [
            ["deleteCascade", scope.categories],
            ["deleteItems", scope.items],
            ["deleteVideos", scope.videos],
            ["deleteTasks", scope.tasks],
          ] as const
        )
          .filter(([, count]) => count > 0)
          .map(([key, count]) => t(key, { count }))
      }}
      remove={() =>
        api(`${basePath(companyId, productionId)}/${category.id}`, { method: "DELETE" })
      }
      after={after}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

export function CategoryActions({
  companyId,
  productionId,
  category,
  roles,
  canEdit,
  canDelete,
  after,
}: {
  companyId: string
  productionId: string
  category: ProductionCategoryRow
  roles: readonly RoleRow[]
  canEdit: boolean
  canDelete: boolean
  /** A dónde ir tras borrar, cuando ésta es la categoría que la pantalla está enseñando. */
  after?: string | undefined
}) {
  const t = useTranslations("productions.categories")
  const common = useTranslations("common")
  const actions: ItemAction[] = []

  if (canEdit) {
    actions.push({
      key: "edit",
      label: common("edit"),
      dialog: (control) => (
        <EditCategory
          key="edit"
          companyId={companyId}
          productionId={productionId}
          category={category}
          roles={roles}
          {...control}
        />
      ),
    })

    actions.push({
      key: "move",
      label: t("move"),
      dialog: (control) => (
        <MoveCategory
          key="move"
          companyId={companyId}
          productionId={productionId}
          category={category}
          {...control}
        />
      ),
    })
  }

  if (canDelete) {
    actions.push({
      key: "delete",
      label: common("delete"),
      danger: true,
      dialog: (control) => (
        <DeleteCategory
          key="delete"
          companyId={companyId}
          productionId={productionId}
          category={category}
          after={after}
          {...control}
        />
      ),
    })
  }

  return <ItemActions label={common("actions")} actions={actions} />
}
