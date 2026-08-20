"use client"

import { Button, Callout, Dialog, DialogClose, DialogContent, Spinner } from "@tfv/ui"
import { Printer } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import type { ItemRow } from "../../production.ts"

/**
 * La etiqueta de un artículo de utilería.
 *
 * ## Qué va impreso, y por qué
 *
 * - **El código de doce caracteres en grande**, agrupado de cuatro en cuatro. Es lo que se dicta
 *   por teléfono desde una bodega de arte, y doce caracteres seguidos se fallan al dictarlos por
 *   la misma razón por la que se agrupa un número de tarjeta.
 * - **El mismo código, legible por máquina.** Es lo que se escanea al verificar una nota de
 *   entrega pieza por pieza, que es el gesto para el que la etiqueta existe.
 * - **El nombre del artículo.** Una etiqueta que sólo lleva un código no dice qué es la cosa a la
 *   que está pegada.
 * - **El estado no.** El artículo se rompe, se guarda y se entrega con la etiqueta puesta: un
 *   estado impreso empieza a mentir el primer día, y lo hace con aspecto de dato.
 *
 * ## El símbolo lo dibuja la pantalla; el servidor garantiza el viaje
 *
 * `GET .../items/{itemId}/label` devuelve `payload`, que es **exactamente** lo que la localización
 * por código acepta de vuelta. Aquí sólo se dibuja. Que las dos puntas coincidan es cosa del
 * servidor y está probado allí; si cada lado inventara su formato, la etiqueta impresa dejaría de
 * leerse el día que uno de los dos cambiara.
 *
 * ## Por qué la biblioteca se pide y no se importa
 *
 * Dibujar un código bidimensional lo necesitan dos pantallas del panel. Importarla arriba la
 * metería en el paquete que descarga quien sólo entra a ver una producción. Se pide al abrir el
 * diálogo, que es el único momento en que hace falta.
 */

/**
 * Reglas de impresión.
 *
 * Apagan la cáscara de la aplicación, que vive fuera de este componente: barra superior,
 * navegación y pie salen en el papel si nadie los quita. Con `visibility` en lugar de `display` no
 * hace falta conocer la estructura de la cáscara ni tocarla.
 *
 * El papel se fija a negro sobre blanco. La aplicación tiene tema oscuro y una etiqueta impresa en
 * él sale ilegible o gasta un cartucho por hoja; y el lector necesita contraste real, no el del
 * tema de quien imprime.
 */
const PRINT_CSS = `
@page { margin: 12mm; }

@media print {
  body { background: #fff; }
  body * { visibility: hidden !important; }
  #etiqueta-de-articulo, #etiqueta-de-articulo * { visibility: visible !important; }

  #etiqueta-de-articulo {
    position: absolute;
    top: 0;
    left: 0;
    width: 72mm;
    border: 1px solid #999;
    background: #fff;
    color: #000;
    box-shadow: none;
  }
}
`

/** El código, de cuatro en cuatro. Doce caracteres seguidos se fallan al dictarlos. */
function grouped(code: string): string {
  return (code.match(/.{1,4}/g) ?? [code]).join(" ")
}

export function ItemLabel({
  item,
  open,
  onOpenChange,
}: {
  item: ItemRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("productions.items")

  const [image, setImage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setFailed(false)

    // A un mapa de bits ancho que la hoja de estilo encoge: al imprimir, un símbolo escalado hacia
    // arriba sale con el borde escalonado y el lector no lo perdona.
    import("qrcode")
      .then(async ({ toDataURL }) => {
        const drawn = await toDataURL(item.code, { margin: 2, width: 512 })
        if (!cancelled) setImage(drawn)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [open, item.code])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("label.title")}
        description={t("label.description")}
        closeLabel={t("label.close")}
        size="sm"
      >
        <style>{PRINT_CSS}</style>

        {failed ? <Callout tone="danger">{t("label.failed")}</Callout> : null}

        <div
          id="etiqueta-de-articulo"
          className="flex flex-col items-center gap-3 rounded-lg border border-edge bg-white p-5 text-center text-black"
        >
          <p className="font-semibold text-body1 leading-tight">{item.name}</p>

          {image ? (
            // `alt` vacío a propósito: el código va escrito debajo en grande, y repetirlo aquí
            // hace que un lector de pantalla lo dicte dos veces seguidas.
            // biome-ignore lint/performance/noImgElement: es un `data:` dibujado en el navegador, sin anfitrión que optimizar.
            <img src={image} alt="" width={148} height={148} className="size-[148px]" />
          ) : (
            <span className="grid size-[148px] place-items-center">
              {failed ? null : <Spinner className="size-5" />}
            </span>
          )}

          <p className="font-mono text-h4 tracking-[0.12em]">{grouped(item.code)}</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t("label.close")}</Button>
          </DialogClose>

          <Button onClick={() => window.print()} disabled={!image}>
            <Printer className="size-4" aria-hidden="true" />
            {t("label.print")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
