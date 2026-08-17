import { Badge, Panel } from "@tfv/ui"
import { ChevronRight, MapPinned } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { StorageRow } from "../../warehouse.ts"

export async function StorageBrowser({
  companyId,
  warehouseId,
  roots,
  path = [],
  directChildren = [],
}: {
  companyId: string
  warehouseId: string
  roots: readonly StorageRow[]
  path?: readonly StorageRow[]
  directChildren?: readonly StorageRow[]
}) {
  const t = await getTranslations()
  const selected = path.at(-1)
  const base = `/c/${companyId}/warehouses/${warehouseId}/storages`

  return (
    <div className="grid gap-4 laptop:grid-cols-[16rem_minmax(0,1fr)]">
      <aside>
        <h2 className="mb-2 text-body2 font-bold text-content">{t("warehouses.storages.roots")}</h2>
        {roots.length > 0 ? (
          <ul className="space-y-1">
            {roots.map((root) => (
              <li key={root.id}>
                <StorageLink
                  storage={root}
                  href={`${base}/${root.id}`}
                  current={path.some((entry) => entry.id === root.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Panel className="p-4 text-body2 text-content-muted">
            {t("warehouses.storages.empty")}
          </Panel>
        )}
      </aside>

      <div className="min-w-0">
        {selected ? (
          <>
            <nav aria-label={t("warehouses.storages.path")} className="mb-3 overflow-x-auto">
              <ol className="flex min-w-max items-center gap-1 text-body3 text-content-muted">
                <li>
                  <Link href={base} className="rounded-xs hover:text-content hover:underline">
                    {t("warehouses.storages.title")}
                  </Link>
                </li>
                {path.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-1">
                    <ChevronRight className="size-3 text-content-faint" aria-hidden="true" />
                    <Link
                      href={`${base}/${entry.id}`}
                      aria-current={entry.id === selected.id ? "location" : undefined}
                      className="rounded-xs font-semibold text-content hover:underline"
                    >
                      {entry.code}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>

            <Panel className="mb-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                    <MapPinned className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-title2 font-bold text-content">{selected.name}</h2>
                    <p className="font-mono text-body3 font-semibold text-content-faint">
                      {selected.code}
                    </p>
                  </div>
                </div>
                <Badge>{t(`warehouses.storages.kind.${selected.kind}`)}</Badge>
              </div>
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-body3">
                <div>
                  <dt className="text-content-faint">{t("warehouses.storages.children")}</dt>
                  <dd className="font-semibold text-content">{selected.childCount}</dd>
                </div>
                <div>
                  <dt className="text-content-faint">{t("warehouses.storages.products")}</dt>
                  <dd className="font-semibold text-content">{selected.productCount}</dd>
                </div>
              </dl>
            </Panel>

            <section aria-labelledby="child-storages-heading">
              <h2 id="child-storages-heading" className="mb-3 text-title2 font-bold text-content">
                {t("warehouses.storages.inside")}
              </h2>
              {directChildren.length > 0 ? (
                <ul className="grid gap-2 tablet:grid-cols-2">
                  {directChildren.map((child) => (
                    <li key={child.id}>
                      <StorageLink storage={child} href={`${base}/${child.id}`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body2 text-content-faint">
                  {t("warehouses.storages.noChildren")}
                </p>
              )}
            </section>
          </>
        ) : (
          <Panel className="grid min-h-44 place-items-center p-6 text-center">
            <div>
              <MapPinned className="mx-auto size-6 text-content-faint" aria-hidden="true" />
              <p className="mt-3 text-title2 font-bold text-content">
                {t("warehouses.storages.select")}
              </p>
              <p className="mt-1 max-w-prose text-body2 text-content-muted">
                {t("warehouses.storages.selectBody")}
              </p>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

async function StorageLink({
  storage,
  href,
  current = false,
}: {
  storage: StorageRow
  href: string
  current?: boolean
}) {
  const t = await getTranslations()

  return (
    <Link
      href={href}
      aria-current={current ? "location" : undefined}
      className={
        current
          ? "flex min-w-0 items-center gap-3 rounded-sm bg-accent p-3 text-on-accent"
          : "flex min-w-0 items-center gap-3 rounded-sm border border-line bg-panel p-3 transition-colors hover:bg-panel-hover"
      }
    >
      <MapPinned
        className={current ? "size-4 shrink-0" : "size-4 shrink-0 text-content-faint"}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body2 font-semibold">{storage.name}</span>
        <span
          className={
            current
              ? "block font-mono text-body3 text-on-accent/75"
              : "block font-mono text-body3 text-content-faint"
          }
        >
          {storage.code} · {t(`warehouses.storages.kind.${storage.kind}`)}
        </span>
      </span>
      {storage.childCount > 0 ? (
        <ChevronRight
          className={current ? "size-4 shrink-0" : "size-4 shrink-0 text-content-faint"}
          aria-hidden="true"
        />
      ) : null}
    </Link>
  )
}
