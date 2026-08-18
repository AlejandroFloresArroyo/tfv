import { FolderTree } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { TreeBrowser } from "~/components/tree/tree-browser.tsx"
import type { WarehouseCategoryRow } from "../../warehouse.ts"
import { CategoryActions, CreateCategory } from "./category-actions.tsx"

/**
 * El árbol de categorías del almacén.
 *
 * El mismo árbol que el de ubicaciones, con lo que sólo tienen las categorías: el **identificador
 * legible**, que el servidor deriva del nombre y hace único dentro de este almacén —dos naves
 * pueden tener «vestuario» y son categorías distintas—, y la descripción.
 *
 * Aquí la ruta de migas sí lleva el nombre: una categoría no tiene código, se la llama por como se
 * llama.
 */
export async function CategoryBrowser({
  companyId,
  warehouseId,
  roots,
  path = [],
  directChildren = [],
  canCreate,
  canEdit,
  canDelete,
  canCountProducts,
}: {
  companyId: string
  warehouseId: string
  roots: readonly WarehouseCategoryRow[]
  path?: readonly WarehouseCategoryRow[]
  directChildren?: readonly WarehouseCategoryRow[]
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  /** Si la confirmación de borrado puede preguntar cuántos productos quedan sin clasificar. */
  canCountProducts: boolean
}) {
  const t = await getTranslations()
  const selected = path.at(-1)
  const canAct = canEdit || canDelete

  const actionsFor = (category: WarehouseCategoryRow) => (
    <CategoryActions
      companyId={companyId}
      warehouseId={warehouseId}
      category={category}
      canEdit={canEdit}
      canDelete={canDelete}
      canCountProducts={canCountProducts}
    />
  )

  return (
    <TreeBrowser<WarehouseCategoryRow>
      base={`/c/${companyId}/warehouses/${warehouseId}/categories`}
      icon={FolderTree}
      labels={{
        roots: t("warehouses.categories.roots"),
        empty: t("warehouses.categories.empty"),
        path: t("warehouses.categories.path"),
        home: t("warehouses.categories.title"),
        inside: t("warehouses.categories.inside"),
        noChildren: t("warehouses.categories.noChildren"),
        selectTitle: t("warehouses.categories.select"),
        selectBody: t("warehouses.categories.selectBody"),
      }}
      roots={roots}
      path={path}
      childNodes={directChildren}
      meta={(node) => (
        <span className="font-mono">{node.slug ?? t("warehouses.categories.none")}</span>
      )}
      facts={
        selected ? (
          <>
            <div>
              <dt className="text-content-faint">{t("warehouses.categories.children")}</dt>
              <dd className="font-semibold text-content">{selected.childCount}</dd>
            </div>
            {selected.description ? (
              <div className="min-w-0 basis-full">
                <dt className="text-content-faint">
                  {t("warehouses.categories.descriptionLabel")}
                </dt>
                <dd className="text-content">{selected.description}</dd>
              </div>
            ) : null}
          </>
        ) : undefined
      }
      rootsToolbar={
        canCreate ? <CreateCategory companyId={companyId} warehouseId={warehouseId} /> : undefined
      }
      insideToolbar={
        canCreate && selected ? (
          <CreateCategory
            companyId={companyId}
            warehouseId={warehouseId}
            parentId={selected.id}
            parentName={selected.name}
          />
        ) : undefined
      }
      actions={canAct && selected ? actionsFor(selected) : undefined}
      nodeActions={canAct ? actionsFor : undefined}
    />
  )
}
