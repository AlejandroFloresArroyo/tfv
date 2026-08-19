/**
 * Capturas de la referencia del sistema, en los cuatro tamaños y los dos temas.
 *
 * El orden de dispositivos es el de PRODUCT.md —iPad, celular, escritorio, ultrapanorámico— y no
 * el habitual de móvil y escritorio: la tablet es el dispositivo de referencia de este producto.
 *
 * Además corre axe sobre cada tema, porque afirmar accesibilidad sin medirla es exactamente lo que
 * este repositorio ya decidió no hacer con el contraste.
 */
import { mkdirSync } from "node:fs"
import AxeBuilder from "@axe-core/playwright"
import { chromium } from "@playwright/test"

/** La salida se escribe directo: `console.log` está limitado a `error` y `warn` en este repo. */
const log = (linea) => process.stdout.write(`${linea}\n`)

const DIRECCION = process.env.SHOT_URL ?? "http://127.0.0.1:3300/sistema"
const OUT = new URL("../../.impeccable/review/", import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const TAMANOS = [
  { nombre: "tablet", width: 834, height: 1194 },
  { nombre: "phone", width: 390, height: 844 },
  { nombre: "desktop", width: 1440, height: 900 },
  { nombre: "ultra", width: 2560, height: 1080 },
]

const navegador = await chromium.launch()
let fallos = 0

for (const tema of ["dark", "light"]) {
  for (const t of TAMANOS) {
    const contexto = await navegador.newContext({
      viewport: { width: t.width, height: t.height },
      deviceScaleFactor: 2,
    })
    const pagina = await contexto.newPage()
    await pagina.goto(DIRECCION, { waitUntil: "networkidle" })

    // El tema lo escribe el servidor en `<html>`; aquí se fuerza para capturar los dos.
    await pagina.evaluate((modo) => {
      document.documentElement.classList.toggle("dark", modo === "dark")
    }, tema)

    // Las tipografías variables tienen que haber cargado antes de medir o capturar: una captura
    // con la reserva del sistema mide otra cosa distinta de la que se va a servir.
    await pagina.evaluate(() => document.fonts.ready)
    await pagina.waitForTimeout(250)

    const archivo = `${OUT}${t.nombre}-${tema}.png`
    await pagina.screenshot({ path: archivo, fullPage: true })
    log(`captura  ${t.nombre.padEnd(8)} ${tema.padEnd(5)} ${t.width}×${t.height}`)

    // Una pasada de axe por tema, en el tamaño de referencia.
    if (t.nombre === "tablet") {
      const { violations } = await new AxeBuilder({ page: pagina })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
      if (violations.length === 0) {
        log(`axe      ${tema.padEnd(5)} sin violaciones`)
      } else {
        fallos += violations.length
        for (const v of violations) {
          log(`AXE ${tema} · ${v.id} (${v.impact}) · ${v.nodes.length} nodo(s)`)
          log(`    ${v.help}`)
          for (const n of v.nodes.slice(0, 3)) log(`    → ${n.target.join(" ")}`)
        }
      }
    }

    await contexto.close()
  }
}

await navegador.close()
log(fallos === 0 ? "\nAXE LIMPIO" : `\n${fallos} violaciones de axe`)
