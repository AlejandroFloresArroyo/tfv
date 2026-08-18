/**
 * Declaración de `jsbarcode`.
 *
 * El paquete **trae** un `jsbarcode.d.ts` en su raíz y no lo anuncia en su `package.json`, así que
 * TypeScript no lo encuentra y el importe queda sin tipo. Se declara aquí lo que esta aplicación
 * usa —una llamada, seis opciones— en lugar de apuntar al archivo del paquete, que describe veinte
 * simbologías de las que aquí no se ofrece ninguna.
 *
 * En forma de módulo ES y no de `export =`: se consume con importación dinámica desde la hoja de
 * etiquetas, y es `default` lo que el empaquetador entrega de un módulo de los antiguos.
 */
declare module "jsbarcode" {
  export interface BarcodeOptions {
    /** Simbología. Se usa `CODE128B`: el alfabeto del código es alfanumérico en mayúsculas. */
    format?: string
    /** Ancho del módulo más estrecho, en píxeles. */
    width?: number
    height?: number
    margin?: number
    /** El código va escrito aparte y en grande; el que dibuja la biblioteca sobraría. */
    displayValue?: boolean
    background?: string
    lineColor?: string
  }

  export default function JsBarcode(
    element: SVGSVGElement,
    data: string,
    options?: BarcodeOptions,
  ): void
}
