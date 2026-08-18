/**
 * El filtrado del selector con búsqueda, fuera del componente para poder probarlo.
 *
 * Lo único con sustancia aquí es la normalización: quien busca «angel» tiene que encontrar
 * «Producciones Ángel», y quien busca «ángeles» tiene que encontrar «angeles cinematográficos».
 * Un `includes` a secas falla en los dos sentidos, y falla en silencio — la lista sale vacía y
 * quien busca concluye que el cliente no está dado de alta.
 *
 * Es la misma regla que el motor aplica del lado del servidor con `app.norm`; aquí se repite
 * porque este filtrado es local y no pasa por la base.
 */

export interface SelectOption {
  value: string
  label: string
  /** Segunda línea: el código, la ubicación, lo que distinga a dos que se llaman parecido. */
  hint?: string | undefined
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

/** Los que casan, **en el orden en que venían**: reordenar por relevancia mueve el sitio de todos. */
export function filterOptions<T extends SelectOption>(
  options: readonly T[],
  query: string,
): readonly T[] {
  const needle = normalize(query.trim())
  if (needle === "") return options

  return options.filter((option) =>
    normalize(`${option.label} ${option.hint ?? ""}`).includes(needle),
  )
}
