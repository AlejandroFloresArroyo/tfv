import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * Nuestros tamaños de texto.
 *
 * Hay que declararlos porque `text-` sirve para dos cosas —tamaño y color— y quien resuelve el
 * conflicto tiene que poder distinguirlas. Sin esta lista, `text-body1` no encaja en ninguna escala
 * conocida, se clasifica como **color**, y entonces `text-body1 text-content` se consideran dos
 * colores en pugna: sobrevive el último y el tamaño desaparece.
 *
 * El síntoma no es un error, es peor: la interfaz se pinta, y lo que se pierde es el tamaño de los
 * títulos o el color del texto de un botón, que queda del color de su propio fondo. Se ve como un
 * problema de diseño y no como lo que es.
 */
const FONT_SIZES = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "title1",
  "title2",
  "title3",
  "title4",
  "title5",
  "body1",
  "body2",
  "body3",
  "body4",
  "button",
  "fluid3",
]

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZES }],
    },
  },
})

/**
 * Compone clases y resuelve los conflictos entre ellas.
 *
 * `clsx` aplana condicionales; el fusionador decide quién gana cuando dos clases tocan la misma
 * propiedad. Sin lo segundo, pasar `className="p-8"` a un componente que ya trae `p-4` deja las dos
 * en el atributo y gana la que el archivo de estilos declare después — un orden que quien escribe
 * la llamada no controla ni puede ver.
 */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
