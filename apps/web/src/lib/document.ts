/**
 * Las tres acciones de un documento: previsualizar, imprimir y descargar.
 *
 * Ver `openspec/specs/pdf-documents/spec.md`, requisito «Previsualizar, imprimir y descargar».
 *
 * ## Por qué son la misma cosa
 *
 * Se decidió componer desde el navegador y no montar un servicio aparte. Con eso, **previsualizar
 * es la propia pantalla**, imprimir es mandarla a la impresora, y descargar es mandarla al destino
 * «Guardar como PDF» — el mismo dibujo y la misma hoja de estilos en los tres casos.
 *
 * La spec exige que las tres representaciones tengan idéntico contenido y disposición. Aquí eso no
 * se comprueba: **no se puede incumplir**, porque no hay dos dibujos que mantener de acuerdo. Un
 * servicio de composición aparte habría sido justamente la segunda implementación que se desvía.
 *
 * ## El nombre del archivo
 *
 * El navegador nombra el PDF con el **título del documento**, así que se pone antes de imprimir y
 * se devuelve al terminar. Sin devolverlo, la pestaña se queda llamándose como el archivo y el
 * siguiente documento hereda el nombre del anterior.
 */

/**
 * Lo que hace falta del documento del navegador para imprimir.
 *
 * Es una interfaz y no `window` porque así la mecánica se prueba sin navegador, que es donde vive
 * el único error posible: olvidarse de devolver el título.
 */
export interface PrintTarget {
  title: string
  print(): void
  /** Se llama cuando el diálogo de impresión se cierra, se haya impreso o no. */
  onAfterPrint(handler: () => void): void
}

/** El documento del navegador, visto como objetivo de impresión. */
export function browserTarget(): PrintTarget {
  return {
    get title() {
      return document.title
    },
    set title(value: string) {
      document.title = value
    },
    print: () => window.print(),
    onAfterPrint: (handler) => window.addEventListener("afterprint", handler, { once: true }),
  }
}

/**
 * Manda el documento a imprimir con el nombre que le corresponde.
 *
 * El título se devuelve en `afterprint` y no justo después de `print()`: el diálogo puede bloquear
 * o no según el navegador, y restaurarlo antes de que el motor componga la página deja el archivo
 * con el nombre de la pestaña.
 */
export function printDocument(target: PrintTarget, fileName: string): void {
  const previous = target.title

  target.onAfterPrint(() => {
    target.title = previous
  })

  target.title = fileName
  target.print()
}

/** El enlace público de un documento, sobre el origen desde el que se está mirando. */
export function publicDocumentUrl(origin: string, reference: string): string {
  return `${origin.replace(/\/+$/, "")}/d/${reference}`
}
