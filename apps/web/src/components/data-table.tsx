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
 *
 * ## Por qué en tacto no es una tabla
 *
 * Antes desbordaba a lo ancho con su propio desplazamiento horizontal. Eso esconde las **últimas**
 * columnas, que en este sistema son justo las que importan —la tarifa y el estado— y las esconde
 * **sin decirlo**: no hay nada en pantalla que anuncie que a la derecha hay más. Alguien mirando un
 * teléfono ve una lista de nombres y concluye que no hay precios.
 *
 * Con el orden de dispositivos de PRODUCT.md —iPad, celular, escritorio— eso no se sostiene, así
 * que por debajo de tableta cada fila se despliega en bloque, con el nombre de cada columna al lado
 * de su valor. Es la misma información, sin desplazamiento lateral y sin nada escondido.
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
        {/* Tacto: una ficha por fila. El encabezado de cada columna acompaña a su valor, así que
            ninguna columna se pierde por el borde. */}
        <ul className="tablet:hidden">
          {rows.map((row) => (
            <li key={rowKey(row)} className="flex flex-col gap-1.5 px-4 py-3.5 not-last:rule-b">
              {columns.map((column) => (
                <div key={column.header} className="flex items-baseline justify-between gap-4">
                  <span className="apparatus shrink-0 text-content-faint">{column.header}</span>
                  <span className="min-w-0 text-right text-body2 text-content">
                    {column.cell(row)}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>

        {/* Tableta en adelante: la tabla de verdad, que es donde la comparación en columna vale. */}
        <table className="hidden w-full border-collapse text-left tablet:table">
          <thead>
            <tr className="rule-b">
              {columns.map((column) => (
                <th key={column.header} className="px-4 py-3 apparatus text-content-faint">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="not-last:rule-b">
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
      </Panel>

      {note ? <p className="px-1 text-body3 text-content-faint">{note}</p> : null}
    </div>
  )
}
