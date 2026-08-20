/**
 * Lo que la impresora necesita saber y las clases no pueden decir.
 *
 * `@page` no tiene equivalente en utilidades, y los márgenes de la hoja son justo lo que decide si
 * el documento sale con la última línea partida por la mitad.
 *
 * Vive aparte porque **hay más de una familia de documentos**: la cotización y el plan de trabajo
 * se imprimen con las mismas reglas, y dos copias de esto son dos copias que alguien corrige por
 * separado hasta que una de las dos hojas empieza a salir con el menú de usuario encima.
 */
export function PrintRules() {
  return (
    <style>{`
      @page { size: A4; margin: 14mm; }

      @media print {
        html, body { background: #fff; }

        /* Lo que no es el documento: botones, avisos, enlaces. */
        .documento-fuera-de-la-hoja { display: none !important; }

        /* La cáscara del panel —barra superior, menús— no se marca una por una: desaparece todo lo
           que no es la hoja ni la contiene. Marcarlas obligaría a acordarse de hacerlo cada vez que
           alguien añade algo al armazón, y olvidarse significa imprimir el menú de usuario. */
        body *:not(:has(.documento-hoja)):not(.documento-hoja):not(.documento-hoja *) {
          display: none !important;
        }

        /* Lo que la contiene deja de maquetar: sus anchos y sus rellenos son de la pantalla, y en
           el papel empujarían el documento fuera del área imprimible. */
        body :has(.documento-hoja) {
          display: block !important;
          margin: 0 !important;
          padding: 0 !important;
          width: auto !important;
          max-width: none !important;
          background: transparent !important;
        }

        /* La hoja deja de ser una tarjeta sobre un lienzo y pasa a ser la página. Sin posición
           absoluta: sacarla del flujo hace que sólo la primera página se componga, y lo que sobra
           se pierde en lugar de pasar a la siguiente. */
        .documento-hoja {
          box-shadow: none !important;
          margin: 0 !important;
          padding: 0 !important;
          width: auto !important;
          max-width: none !important;
        }

        /* El pie **no** se saca del flujo para repetirlo en cada página. Se probó, y el navegador
           lo repite con la posición de la primera: en la segunda hoja aparecía encima de las firmas.
           Un pie al final del documento es lo que hace cualquier papel, y es lo que se lee igual en
           cualquier navegador. */
        .documento-pie { break-inside: avoid; }

        /* Las dos columnas del documento —las partes y las firmas— son dos también en el papel.
           La hoja impresa mide unos 690 píxeles de ancho, por debajo del punto de ruptura de
           tableta, así que sin esto el documento sale maquetado como en un teléfono: cada bloque
           debajo del anterior y una hoja de más. */
        .documento-columnas {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
        }

        /* Un bloque partido entre dos páginas es la forma más fácil de imprimir un documento que
           parecía correcto en pantalla: un grupo de líneas sin su subtotal, o una firma suelta. */
        .documento-bloque, tr { break-inside: avoid; }
        thead { display: table-header-group; }
      }
    `}</style>
  )
}
