/**
 * La pizarra, apartada para poder pulsar el borde derecho de una pantalla.
 *
 * ## Por qué existe este archivo
 *
 * Con la pizarra abierta —que es como abre el escritorio, sin que nadie la abra— el contenido se
 * desplaza 21 rem a la derecha **sin encoger**. En el ancho con el que conduce esta suite, 1280
 * (`Desktop Chrome`), eso deja los últimos 336 píxeles de cada pantalla fuera del lienzo y
 * recortados: todo lo que vive en el borde derecho de una cabecera —«Acciones», «Nuevo …», el
 * conmutador de una fila— es invisible y no se puede pulsar. Medido sobre la ficha de empresa: el
 * botón de acciones cae en `x = 1560` de un lienzo de 1280, y `scrollWidth` sigue siendo 1280, así
 * que **no hay desplazamiento que lo alcance**.
 *
 * Está anotado en `HALLAZGOS.md` como **H-300** y no se corrige desde aquí: vive en `tokens.css`.
 *
 * ## Qué hace, y por qué así
 *
 * Cierra la pizarra **por su propio cierre**, que es lo que haría una persona a la que le estorba.
 * No se escribe la preferencia a mano ni se fabrica ningún estado: se pulsa la equis que la ventana
 * ofrece. Con la pizarra cerrada el empuje vuelve a cero y la pantalla entera es alcanzable.
 *
 * Se llama **después de llegar a la pantalla y antes de tocar su borde derecho**. Es idempotente:
 * si la ventana ya está cerrada —o si esta pasada corre en un ancho donde no estorba— no hace nada.
 *
 * Lo que este rodeo **deja de vigilar**: que la pantalla sea usable con la pizarra abierta. Mientras
 * H-300 siga vivo, ninguna prueba lo mira.
 */

import type { Page } from "@playwright/test"

/** Cuánto se espera a que la ventana aparezca antes de dar por hecho que no está. */
const ESPERA = 3_000

export async function apartarLaPizarra(page: Page): Promise<void> {
  const cierre = page.getByRole("button", { name: "Cerrar el menú" })

  try {
    await cierre.waitFor({ state: "visible", timeout: ESPERA })
  } catch {
    return
  }

  await cierre.click()
  // La ventana se va con una transición; sin esperar a que se vaya, el clic siguiente puede caer
  // sobre el velo que todavía está saliendo.
  await cierre.waitFor({ state: "hidden" })
}
