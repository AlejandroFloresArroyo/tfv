import { Panel } from "@tfv/ui"
import { ChevronRight, type LucideIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import type { TreeNode } from "./tree.ts"

/**
 * Un árbol navegable y editable, el mismo para las ubicaciones y para las categorías.
 *
 * ## Qué navega, y por qué así
 *
 * Tres piezas por nivel: la columna de raíces, la ruta de migas y las hijas de lo seleccionado. No
 * es un árbol desplegable con todo cargado, y no lo es a propósito: los dos recursos listan **por
 * padre** —«el listado del almacén muestra las raíces; las hijas se consultan indicando su padre»—
 * porque una nave grande tiene cientos de nodos y enseña seis.
 *
 * **La selección vive en la dirección**, no en el estado de un componente. Es lo que pide
 * `warehouses-and-storage` para poder compartir por enlace un nodo concreto, y de paso es lo que
 * hace que volver atrás en el navegador signifique volver al nivel anterior.
 *
 * ## Qué edita
 *
 * Nada, directamente. Las cuatro operaciones —crear dentro, renombrar, cambiar de padre y borrar—
 * entran como **ranuras**, porque lo que cambia entre los dos casos no es el árbol sino los campos
 * de cada formulario y lo que hay que enumerar antes de borrar. Con banderas, este archivo tendría
 * que saber qué es una ubicación y qué una categoría; con ranuras, no sabe ni una cosa ni la otra.
 *
 * Las acciones que la persona no puede hacer **no llegan hasta aquí**: la pantalla no las pasa. No
 * se pintan apagadas, se omiten.
 */

/** Los textos del recorrido. Van juntos para que añadir uno no sea añadir un parámetro más. */
export interface TreeLabels {
  /** Encabezado de la columna de la izquierda. */
  readonly roots: string
  /** El árbol no tiene ni una raíz todavía. */
  readonly empty: string
  /** Nombre accesible de la ruta de migas. */
  readonly path: string
  /** Primer eslabón de la ruta, el que devuelve al nivel principal. */
  readonly home: string
  /** Encabezado de las hijas de lo seleccionado. */
  readonly inside: string
  /** Lo seleccionado no tiene hijas. */
  readonly noChildren: string
  /** Invitación de la parte derecha cuando no hay nada seleccionado. */
  readonly selectTitle: string
  readonly selectBody: string
}

export function TreeBrowser<T extends TreeNode>({
  base,
  icon: Icon,
  labels,
  roots,
  path = [],
  childNodes = [],
  meta,
  crumb = (node) => node.name,
  badge,
  facts,
  rootsToolbar,
  insideToolbar,
  actions,
  nodeActions,
}: {
  /** Prefijo de las direcciones: cada nodo se enlaza como `${base}/${id}`. */
  base: string
  icon: LucideIcon
  labels: TreeLabels
  roots: readonly T[]
  /** De la raíz al seleccionado, ambos incluidos. Vacío es «no hay nada seleccionado». */
  path?: readonly T[]
  /** Las hijas directas de lo seleccionado. */
  childNodes?: readonly T[]
  /** La línea secundaria de cada nodo: el código y el tipo, el identificador legible… */
  meta: (node: T) => ReactNode
  /** Cómo se nombra un nodo en la ruta de migas. Por omisión, su nombre. */
  crumb?: ((node: T) => string) | undefined
  /** Distintivo del nodo seleccionado, arriba a la derecha de su ficha. */
  badge?: ReactNode
  /** Los datos del nodo seleccionado, como pares de una lista de definición. */
  facts?: ReactNode
  /** Crear una raíz. Junto al encabezado de la columna, que es donde se ven las raíces. */
  rootsToolbar?: ReactNode
  /** Crear dentro de lo seleccionado. Junto al encabezado de sus hijas. */
  insideToolbar?: ReactNode
  /** Las acciones del nodo seleccionado. */
  actions?: ReactNode
  /** Las acciones de cada hija, para no tener que entrar en ella para editarla. */
  nodeActions?: ((node: T) => ReactNode) | undefined
}) {
  const selected = path.at(-1)

  return (
    <div className="grid gap-4 laptop:grid-cols-[16rem_minmax(0,1fr)]">
      <aside>
        <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2">
          <h2 className="text-body2 font-bold text-content">{labels.roots}</h2>
          {rootsToolbar}
        </div>

        {roots.length > 0 ? (
          <ul className="space-y-1">
            {roots.map((root) => (
              <li key={root.id}>
                <TreeCard
                  node={root}
                  href={`${base}/${root.id}`}
                  icon={Icon}
                  meta={meta}
                  current={path.some((entry) => entry.id === root.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Panel className="p-4 text-body2 text-content-muted">{labels.empty}</Panel>
        )}
      </aside>

      <div className="min-w-0">
        {selected ? (
          <>
            <nav aria-label={labels.path} className="mb-3 overflow-x-auto">
              <ol className="flex min-w-max items-center gap-1 text-body3 text-content-muted">
                <li>
                  <Link href={base} className="rounded-xs hover:text-content hover:underline">
                    {labels.home}
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
                      {crumb(entry)}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>

            <Panel className="mb-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-title2 font-bold text-content">{selected.name}</h2>
                    <div className="text-body3 text-content-faint">{meta(selected)}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {badge}
                  {actions}
                </div>
              </div>
              {facts ? (
                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-body3">{facts}</dl>
              ) : null}
            </Panel>

            <section aria-labelledby="tree-children-heading">
              <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2">
                <h2 id="tree-children-heading" className="text-title2 font-bold text-content">
                  {labels.inside}
                </h2>
                {insideToolbar}
              </div>

              {childNodes.length > 0 ? (
                <ul className="grid gap-2 tablet:grid-cols-2">
                  {childNodes.map((child) => (
                    <li key={child.id}>
                      <TreeCard
                        node={child}
                        href={`${base}/${child.id}`}
                        icon={Icon}
                        meta={meta}
                        actions={nodeActions?.(child)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body2 text-content-faint">{labels.noChildren}</p>
              )}
            </section>
          </>
        ) : (
          <Panel className="grid min-h-44 place-items-center p-6 text-center">
            <div>
              <Icon className="mx-auto size-6 text-content-faint" aria-hidden="true" />
              <p className="mt-3 text-title2 font-bold text-content">{labels.selectTitle}</p>
              <p className="mt-1 max-w-prose text-body2 text-content-muted">{labels.selectBody}</p>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

/**
 * Un nodo, como tarjeta que se abre.
 *
 * El enlace **no envuelve la tarjeta entera**: el menú de acciones va al lado y no dentro, porque un
 * botón dentro de un enlace es marcado inválido y en la práctica significa que abrir el menú navega.
 */
function TreeCard<T extends TreeNode>({
  node,
  href,
  icon: Icon,
  meta,
  current = false,
  actions,
}: {
  node: T
  href: string
  icon: LucideIcon
  meta: (node: T) => ReactNode
  current?: boolean
  actions?: ReactNode
}) {
  return (
    <div
      className={
        current
          ? "flex items-center gap-1 rounded-sm bg-accent pr-1 text-on-accent"
          : "flex items-center gap-1 rounded-sm border border-line bg-panel pr-1 transition-colors hover:bg-panel-hover"
      }
    >
      <Link
        href={href}
        aria-current={current ? "location" : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm p-3"
      >
        <Icon
          className={current ? "size-4 shrink-0" : "size-4 shrink-0 text-content-faint"}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body2 font-semibold">{node.name}</span>
          <span
            className={
              current ? "block text-body3 text-on-accent/75" : "block text-body3 text-content-faint"
            }
          >
            {meta(node)}
          </span>
        </span>
        {node.childCount > 0 ? (
          <ChevronRight
            className={current ? "size-4 shrink-0" : "size-4 shrink-0 text-content-faint"}
            aria-hidden="true"
          />
        ) : null}
      </Link>
      {actions}
    </div>
  )
}
