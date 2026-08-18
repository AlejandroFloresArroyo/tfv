/**
 * Aspecto de botón para un enlace.
 *
 * El sistema de diseño trae `Button asChild` justamente para esto, y **hoy no funciona**: `Button`
 * pinta la ranura del indicador de carga junto a sus hijos, así que `Slot` recibe dos y exige uno,
 * y el árbol revienta con «Slot failed to slot onto its children». No es cosa de esta pantalla —se
 * lleva por delante también la página de «no encontrado», que devuelve `500` en lugar de `404`— y
 * queda anotado como H-30 en `openspec/HALLAZGOS.md`.
 *
 * `packages/ui` lo está cambiando otra persona, así que aquí no se toca: se repiten **las mismas
 * clases** que declara `Button` para su tamaño pequeño, y el día que `asChild` vuelva a funcionar
 * esto se borra de un tirón.
 *
 * Un enlace y no un botón con `router.push`, porque lo que hace es navegar: se abre en otra pestaña
 * con el botón central, se copia su dirección, y un lector de pantalla lo anuncia como lo que es.
 */

const BASE =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-sm px-3 text-body3 font-semibold whitespace-nowrap transition-colors duration-150"

const VARIANTS = {
  secondary:
    "bg-panel text-content border border-field hover:bg-panel-hover hover:border-content-muted",
  ghost: "bg-transparent text-content-muted hover:bg-panel-hover hover:text-content",
} as const

export function linkButton(variant: keyof typeof VARIANTS = "secondary"): string {
  return `${BASE} ${VARIANTS[variant]}`
}
