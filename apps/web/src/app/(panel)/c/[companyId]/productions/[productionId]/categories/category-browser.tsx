import { Badge } from "@tfv/ui"
import { FolderTree } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { TreeBrowser } from "~/components/tree/tree-browser.tsx"
import type { ProductionCategoryRow, RoleRow } from "../../production.ts"
import { CategoryActions, CreateCategory } from "./category-actions.tsx"

/**
 * El árbol de categorías de una producción.
 *
 * El mismo árbol que los del almacén, con lo único que de verdad lo distingue: **el equipo**. La
 * línea secundaria de cada nodo es el rol al que dirige el trabajo, no su identificador legible: en
 * un rodaje, lo que hay que saber de un vistazo al mirar «Vestuario» es a quién le toca, y el
 * identificador legible es lo que menos se consulta de una taxonomía interna.
 */
export async function CategoryBrowser({
  companyId,
  productionId,
  roots,
  roles,
  path = [],
  directChildren = [],
  canCreate,
  canEdit,
  canDelete,
}: {
  companyId: string
  productionId: string
  roots: readonly ProductionCategoryRow[]
  /** Los roles de la empresa. Vacío si quien mira no puede verlos, y entonces no se ofrece elegir. */
  roles: readonly RoleRow[]
  path?: readonly ProductionCategoryRow[]
  directChildren?: readonly ProductionCategoryRow[]
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
}) {
  const t = await getTranslations("productions.categories")
  const selected = path.at(-1)
  const parent = path.at(-2)
  const canAct = canEdit || canDelete
  const base = `/c/${companyId}/productions/${productionId}/categories`

  const actionsFor = (category: ProductionCategoryRow, after?: string) => (
    <CategoryActions
      companyId={companyId}
      productionId={productionId}
      category={category}
      roles={roles}
      canEdit={canEdit}
      canDelete={canDelete}
      after={after}
    />
  )

  return (
    <TreeBrowser<ProductionCategoryRow>
      base={base}
      icon={FolderTree}
      labels={{
        roots: t("roots"),
        empty: t("empty"),
        path: t("path"),
        home: t("title"),
        inside: t("inside"),
        noChildren: t("noChildren"),
        selectTitle: t("select"),
        selectBody: t("selectBody"),
      }}
      roots={roots}
      path={path}
      childNodes={directChildren}
      meta={(node) => (node.roleName ? node.roleName : t("roleNone"))}
      badge={selected?.roleName ? <Badge tone="accent">{selected.roleName}</Badge> : undefined}
      facts={
        selected ? (
          <>
            <div>
              <dt className="text-content-faint">{t("children")}</dt>
              <dd className="font-semibold text-content">{selected.childCount}</dd>
            </div>
            <div>
              <dt className="text-content-faint">{t("slug")}</dt>
              <dd className="font-mono text-content">{selected.slug ?? t("none")}</dd>
            </div>
            {selected.description ? (
              <div className="min-w-0 basis-full">
                <dt className="text-content-faint">{t("descriptionLabel")}</dt>
                <dd className="text-content">{selected.description}</dd>
              </div>
            ) : null}
          </>
        ) : undefined
      }
      rootsToolbar={
        canCreate ? (
          <CreateCategory companyId={companyId} productionId={productionId} roles={roles} />
        ) : undefined
      }
      insideToolbar={
        canCreate && selected ? (
          <CreateCategory
            companyId={companyId}
            productionId={productionId}
            roles={roles}
            parentId={selected.id}
            parentName={selected.name}
          />
        ) : undefined
      }
      // Borrar lo que se está mirando devuelve a su padre, o al nivel principal si era una raíz.
      actions={
        canAct && selected
          ? actionsFor(selected, parent ? `${base}/${parent.id}` : base)
          : undefined
      }
      nodeActions={canAct ? (node) => actionsFor(node) : undefined}
    />
  )
}
