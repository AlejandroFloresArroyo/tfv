import { Panel } from "@tfv/ui"
import type { ReactNode } from "react"

/**
 * Tabla de datos.
 *
 * Se extrajo al escribir la tercera: la de sesiones ya llevaba su encabezado y su desplazamiento a
 * mano, y copiarlos dos veces más habría dejado tres tablas que se parecen y no coinciden.
 *
 * **No es la exploración de colecciones**: no tiene búsqueda, ni filtros, ni paginación, ni
 * ordenación, y no habla el sobre de paginación de la API. Es una tabla.
 *
 * Llegada la 28d, lo que era una colección se pasó a `components/collection`. Esto se queda para lo
 * que **no** lo es: las sesiones abiertas de una cuenta son las de sus dispositivos, un puñado como
 * mucho, y la spec de consulta las nombra entre los recursos sin búsqueda. Darles paginación sería
 * ceremonia sobre cuatro filas.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  note,
}: {
  columns: readonly { header: string; cell: (row: T) => ReactNode; className?: string }[]
  rows: readonly T[]
  rowKey: (row: T) => string
  empty: string
  /** Una línea bajo la tabla, para lo que la tabla no puede decir por sí sola. */
  note?: string
}) {
  if (rows.length === 0) {
    return <Panel className="p-6 text-body1 text-content-muted">{empty}</Panel>
  }

  return (
    <div className="flex flex-col gap-2">
      <Panel className="overflow-hidden">
        {/* La tabla desborda a lo ancho en un teléfono. Se le da su propio desplazamiento para que
            la página no se mueva en horizontal completa. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-140 border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {columns.map((column) => (
                  <th
                    key={column.header}
                    className="px-4 py-3 text-body3 font-semibold tracking-wide text-content-faint uppercase"
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)} className="border-b border-line last:border-0">
                  {columns.map((column) => (
                    <td
                      key={column.header}
                      className={`px-4 py-3 text-body2 text-content-muted ${column.className ?? ""}`}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {note ? <p className="px-1 text-body3 text-content-faint">{note}</p> : null}
    </div>
  )
}
