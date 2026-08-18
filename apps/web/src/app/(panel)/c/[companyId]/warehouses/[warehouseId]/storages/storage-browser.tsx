import { Badge } from "@tfv/ui"
import { MapPinned } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { TreeBrowser } from "~/components/tree/tree-browser.tsx"
import type { StorageRow } from "../../warehouse.ts"
import { CreateStorage, StorageActions } from "./storage-actions.tsx"

/**
 * El árbol de ubicaciones.
 *
 * Es el árbol compartido con lo que sólo tienen las ubicaciones: el **código** —que se dice en voz
 * alta y se lee en una etiqueta pegada al estante, y por eso es lo que aparece en la ruta de migas
 * en lugar del nombre—, el tipo, y el recuento de productos guardados directamente aquí.
 *
 * Las acciones llegan ya filtradas por permiso. Las que la persona no puede hacer no se pasan, así
 * que no existen en la página: un botón apagado sin explicación deja a alguien intentándolo.
 */
export async function StorageBrowser({
  companyId,
  warehouseId,
  roots,
  path = [],
  directChildren = [],
  canCreate,
  canEdit,
  canDelete,
}: {
  companyId: string
  warehouseId: string
  roots: readonly StorageRow[]
  path?: readonly StorageRow[]
  directChildren?: readonly StorageRow[]
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
}) {
  const t = await getTranslations()
  const selected = path.at(-1)
  const canAct = canEdit || canDelete

  const actionsFor = (storage: StorageRow) => (
    <StorageActions
      companyId={companyId}
      warehouseId={warehouseId}
      storage={storage}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  )

  return (
    <TreeBrowser<StorageRow>
      base={`/c/${companyId}/warehouses/${warehouseId}/storages`}
      icon={MapPinned}
      labels={{
        roots: t("warehouses.storages.roots"),
        empty: t("warehouses.storages.empty"),
        path: t("warehouses.storages.path"),
        home: t("warehouses.storages.title"),
        inside: t("warehouses.storages.inside"),
        noChildren: t("warehouses.storages.noChildren"),
        selectTitle: t("warehouses.storages.select"),
        selectBody: t("warehouses.storages.selectBody"),
      }}
      roots={roots}
      path={path}
      childNodes={directChildren}
      meta={(node) => (
        <span className="font-mono">
          {node.code} · {t(`warehouses.storages.kind.${node.kind}`)}
        </span>
      )}
      crumb={(node) => node.code}
      badge={selected ? <Badge>{t(`warehouses.storages.kind.${selected.kind}`)}</Badge> : undefined}
      facts={
        selected ? (
          <>
            <div>
              <dt className="text-content-faint">{t("warehouses.storages.children")}</dt>
              <dd className="font-semibold text-content">{selected.childCount}</dd>
            </div>
            <div>
              <dt className="text-content-faint">{t("warehouses.storages.products")}</dt>
              <dd className="font-semibold text-content">{selected.productCount}</dd>
            </div>
          </>
        ) : undefined
      }
      rootsToolbar={
        canCreate ? <CreateStorage companyId={companyId} warehouseId={warehouseId} /> : undefined
      }
      insideToolbar={
        canCreate && selected ? (
          <CreateStorage
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
