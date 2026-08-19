"use client"

import { Button, Callout, Field, Panel, Select, Spinner } from "@tfv/ui"
import { Printer } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"

/** Los dos formatos que la spec exige. Los dos, no uno: se elige al imprimir. */
type MachineFormat = "qr" | "barcode"

export interface LabelRow {
  id: string
  code: string
}

/**
 * Las reglas de impresión.
 *
 * Van en una etiqueta de estilo y no en clases de utilidad porque tienen que **apagar la cáscara
 * de la aplicación**, que vive fuera de esta ruta: la barra superior, la navegación y el pie salen
 * en el papel si nadie los quita. Con `visibility` en lugar de `display` no hace falta conocer la
 * estructura de la cáscara ni tocarla: se oculta todo y se vuelve a encender la hoja.
 *
 * Los colores del papel se fijan a negro sobre blanco. La aplicación tiene tema oscuro y una
 * etiqueta impresa en él sale ilegible —o gasta un cartucho por hoja—; y el lector de códigos
 * necesita contraste real, no el del tema.
 */
const PRINT_CSS = `
@page { margin: 10mm; }

@media print {
  body { background: #fff; }
  body * { visibility: hidden !important; }
  #hoja-de-etiquetas, #hoja-de-etiquetas * { visibility: visible !important; }

  #hoja-de-etiquetas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    grid-template-columns: repeat(3, 1fr);
    gap: 4mm;
  }

  #hoja-de-etiquetas .etiqueta {
    break-inside: avoid;
    page-break-inside: avoid;
    border: 1px solid #999;
    box-shadow: none;
  }
}
`

/**
 * La hoja de etiquetas.
 *
 * Lo que va impreso, y por qué:
 *
 * - **El código de doce caracteres en grande.** Es lo que se dicta por teléfono cuando alguien
 *   llama desde la nave, y va agrupado de cuatro en cuatro por la misma razón por la que se agrupa
 *   un número de tarjeta: dictar doce caracteres seguidos se falla.
 * - **El mismo código, legible por máquina**, en el formato que se elija al imprimir.
 * - **El producto y su medida**, porque una etiqueta que sólo lleva un código no dice qué es la
 *   caja a la que está pegada.
 * - **La ubicación no.** La unidad se mueve por la nave y la etiqueta va pegada: una ubicación
 *   impresa empieza a mentir el primer día, y lo hace de la peor manera — con aspecto de dato.
 *
 * ## Por qué las dos bibliotecas se cargan aquí y sólo aquí
 *
 * Dibujar un código bidimensional o uno de barras es la única pantalla del panel que lo necesita.
 * Importarlas arriba las metería en el paquete que descarga quien sólo entra a ver una cotización.
 * Se piden con importación dinámica, y sólo la del formato elegido.
 */
export function LabelSheet({
  labels,
  productName,
  measurementName,
  scope,
  truncatedAt,
}: {
  labels: readonly LabelRow[]
  productName: string
  measurementName: string
  scope: "selected" | "all"
  /** Presente cuando la medida tiene más unidades de las que cabe preparar de una vez. */
  truncatedAt?: number
}) {
  const t = useTranslations("warehouses.labels")

  const [format, setFormat] = useState<MachineFormat>("qr")
  const [images, setImages] = useState<Readonly<Record<string, string>>>({})
  const [failed, setFailed] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)

  // Bidimensional: se dibuja a un mapa de bits ancho y se encoge por hoja de estilo, para que al
  // imprimir no salga escalonado. Un lector no perdona un borde dentado.
  useEffect(() => {
    if (format !== "qr" || labels.length === 0) return

    let cancelled = false
    setFailed(false)

    import("qrcode")
      .then(async ({ toDataURL }) => {
        const drawn = await Promise.all(
          labels.map(
            async (label) =>
              [label.code, await toDataURL(label.code, { margin: 2, width: 512 })] as const,
          ),
        )
        if (!cancelled) setImages(Object.fromEntries(drawn))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [format, labels])

  /**
   * De barras: se dibuja **sobre el `<svg>` ya montado**, no a una imagen.
   *
   * Es vectorial, así que la impresora lo saca a su resolución en lugar de a la del navegador — y
   * un código de barras mal resuelto es un código de barras que el lector no lee. Se recorren los
   * nodos del contenedor en lugar de llevar una referencia por etiqueta: son quinientas como mucho
   * y quinientas referencias no aportan nada que un selector no dé.
   */
  useEffect(() => {
    if (format !== "barcode" || labels.length === 0) return

    let cancelled = false
    setFailed(false)

    import("jsbarcode")
      .then(({ default: draw }) => {
        const container = sheet.current
        if (cancelled || !container) return

        for (const node of container.querySelectorAll<SVGSVGElement>("svg[data-code]")) {
          draw(node, node.dataset.code ?? "", {
            format: "CODE128B",
            displayValue: false,
            // Zona muda: sin blanco a los lados el lector no encuentra dónde empieza el código.
            margin: 10,
            height: 46,
            width: 2,
            background: "#ffffff",
            lineColor: "#000000",
          })
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [format, labels])

  const ready = format === "barcode" || labels.length === 0 || Object.keys(images).length > 0

  return (
    <div className="flex flex-col gap-5">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: son reglas de impresión fijas, sin
          nada que venga de fuera. Como texto hijo, React escaparía los `>` de los selectores. */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <Panel className="flex flex-col gap-4 p-5 print:hidden">
        <p className="max-w-prose text-body2 text-content-muted">{t("description")}</p>

        <div className="flex flex-wrap items-end gap-4">
          <Field label={t("format")} className="w-64">
            {(ids) => (
              <Select
                {...ids}
                value={format}
                onChange={(event) => setFormat(event.target.value as MachineFormat)}
              >
                <option value="qr">{t("qr")}</option>
                <option value="barcode">{t("barcode")}</option>
              </Select>
            )}
          </Field>

          <Button onClick={() => window.print()} disabled={labels.length === 0 || !ready}>
            <Printer className="size-4" aria-hidden="true" />
            {t("print")}
          </Button>

          <p className="text-body2 text-content-muted">
            {t("count", { count: labels.length })} ·{" "}
            {scope === "selected" ? t("scopeSelected") : t("scopeAll")}
          </p>
        </div>

        <p className="max-w-prose text-body3 text-content-faint">{t("noLocationNote")}</p>

        {truncatedAt === undefined ? null : (
          <Callout tone="warning">{t("truncated", { count: truncatedAt })}</Callout>
        )}

        {failed ? (
          <Callout tone="danger" live>
            {t("failed")}
          </Callout>
        ) : null}

        {!ready && !failed ? (
          <p className="flex items-center gap-2 text-body2 text-content-muted">
            <Spinner className="size-4" />
            {t("preparing")}
          </p>
        ) : null}
      </Panel>

      {labels.length === 0 ? (
        <Panel className="p-6 text-body1 text-content-muted print:hidden">{t("empty")}</Panel>
      ) : (
        <div
          id="hoja-de-etiquetas"
          ref={sheet}
          className="grid grid-cols-1 gap-3 phone:grid-cols-2 laptop:grid-cols-3"
        >
          {labels.map((label) => (
            <div
              key={label.id}
              // Papel: negro sobre blanco siempre, también con el tema oscuro puesto. Lo que se ve
              // en pantalla es la etiqueta que va a salir, no una tarjeta de la aplicación.
              className="etiqueta flex flex-col items-center gap-2 rounded-xs border border-line bg-white p-3 text-black"
            >
              <p className="w-full truncate text-center text-[9pt] font-semibold">
                {productName} · {measurementName}
              </p>

              <div className="flex h-[24mm] w-full items-center justify-center">
                {format === "qr" ? (
                  images[label.code] ? (
                    // biome-ignore lint/performance/noImgElement: `data:` dibujado en el navegador
                    <img
                      src={images[label.code]}
                      alt=""
                      className="size-[22mm]"
                      // Sin esto, algunos navegadores suavizan el mapa de bits al escalarlo y
                      // redondean las esquinas de los módulos, que es justo lo que impide leerlo.
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : null
                ) : (
                  // La biblioteca deja escritos `width` y `height` en píxeles sobre el propio
                  // `<svg>`; el ancho que pone desborda la etiqueta. Las clases mandan sobre los
                  // atributos de presentación, y el `viewBox` que también escribe hace el resto.
                  <svg
                    data-code={label.code}
                    role="img"
                    aria-label={label.code}
                    preserveAspectRatio="xMidYMid meet"
                    className="h-full w-full"
                  >
                    <title>{label.code}</title>
                  </svg>
                )}
              </div>

              <p className="text-center font-mono text-[15pt] leading-none font-bold tracking-wider">
                {group(label.code)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Doce caracteres, de cuatro en cuatro.
 *
 * Se dicta por teléfono. Un bloque de doce se pierde a la mitad; tres de cuatro se leen de un
 * golpe cada uno. Los espacios son sólo visuales: el código que la máquina lee, y el que se busca,
 * sigue siendo el de doce.
 */
function group(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1 ")
}
