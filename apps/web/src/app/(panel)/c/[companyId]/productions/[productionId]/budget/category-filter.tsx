"use client"

import { Select } from "@tfv/ui"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useId } from "react"

/**
 * El filtro por categoría del presupuesto.
 *
 * No usa la barra de colección porque **esta pantalla no es una colección**: es una lectura
 * derivada, sin paginación ni disposición ni búsqueda. Traer la barra entera para un desplegable
 * añadiría tres controles que aquí no significan nada.
 *
 * La elección viaja **en la dirección** y no en el estado del componente, por la misma razón que en
 * el calendario: lo que se está mirando se tiene que poder pegar en un chat y abrirse igual. Y se
 * navega con `push`, no con `replace`: volver atrás desde una categoría al conjunto es un gesto que
 * la gente espera que funcione.
 */
export function CategoryFilter({
  label,
  allLabel,
  categories,
  value,
}: {
  label: string
  allLabel: string
  categories: readonly { id: string; name: string }[]
  value: string | null
}) {
  const id = useId()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  if (categories.length === 0) return null

  function choose(next: string) {
    const search = new URLSearchParams(params.toString())
    if (next === "") search.delete("categoryId")
    else search.set("categoryId", next)

    const query = search.toString()
    router.push(query === "" ? pathname : `${pathname}?${query}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="legend text-content-faint">
        {label}
      </label>
      <Select
        id={id}
        value={value ?? ""}
        onChange={(event) => choose(event.target.value)}
        className="w-auto min-w-52"
      >
        <option value="">{allLabel}</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
    </div>
  )
}
