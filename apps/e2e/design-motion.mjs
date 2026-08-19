/**
 * Comprueba que el movimiento es honesto.
 *
 * Tres cosas, y las tres pueden romperse en silencio:
 *
 * 1. Con `prefers-reduced-motion` el dato tiene que estar **completo y correcto** desde el primer
 *    fotograma. Una cifra que hay que esperar para leer no es una animación, es un dato escondido.
 * 2. Sin JavaScript, lo mismo: el número lo pinta el servidor.
 * 3. Con movimiento permitido, la cuenta arranca por debajo y termina en el valor real.
 */
import { chromium } from "@playwright/test"

const log = (linea) => process.stdout.write(`${linea}\n`)
const DIRECCION = process.env.SHOT_URL ?? "http://127.0.0.1:3300/sistema"

const navegador = await chromium.launch()
let fallos = 0

// ── 1 · Movimiento reducido ─────────────────────────────────────────────────
{
  const ctx = await navegador.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
  })
  const p = await ctx.newPage()
  await p.goto(DIRECCION, { waitUntil: "domcontentloaded" })
  // Sin esperas: se lee lo antes posible, que es justo cuando una cuenta estaría a medias.
  const disponibles = await p.getByText("Unidades disponibles").locator("xpath=..").innerText()
  const ok = disponibles.includes("1,284")
  if (!ok) fallos++
  log(`${ok ? "OK " : "MAL"} movimiento reducido · el dato está completo de inmediato`)
  log(`    ${disponibles.replace(/\n/g, " · ")}`)
  await ctx.close()
}

// ── 2 · Sin JavaScript ──────────────────────────────────────────────────────
{
  const ctx = await navegador.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  })
  const p = await ctx.newPage()
  await p.goto(DIRECCION, { waitUntil: "domcontentloaded" })
  const cuerpo = await p.locator("main").innerText()
  const ok = cuerpo.includes("1,284") && cuerpo.includes("207") && cuerpo.includes("47")
  if (!ok) fallos++
  log(`${ok ? "OK " : "MAL"} sin JavaScript · el servidor pinta las cuatro cifras reales`)
  await ctx.close()
}

// ── 3 · Con movimiento · la cuenta corre y termina donde debe ───────────────
{
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(DIRECCION, { waitUntil: "domcontentloaded" })

  // Se muestrea en continuo en vez de en un instante elegido a ojo: la cuenta arranca cuando
  // hidrata, y ese momento no es predecible desde fuera.
  const vistos = await p.evaluate(
    () =>
      new Promise((resolver) => {
        const v = []
        const obs = new MutationObserver(() => {
          const m = document
            .querySelector("main")
            ?.innerText?.match(/UNIDADES DISPONIBLES\n([^\n]+)/)
          if (m && v.at(-1) !== m[1]) v.push(m[1])
        })
        obs.observe(document.documentElement, {
          subtree: true,
          childList: true,
          characterData: true,
        })
        setTimeout(() => {
          obs.disconnect()
          resolver(v)
        }, 2600)
      }),
  )

  const alFinal = await p.getByText("Unidades disponibles").locator("xpath=..").innerText()
  const asento = alFinal.includes("1,284")
  const corrio = vistos.length > 2
  if (!asento || !corrio) fallos++
  log(`${asento && corrio ? "OK " : "MAL"} con movimiento · la cuenta corre y se asienta`)
  log(`    ${vistos.length} pasos observados · termina en ${alFinal.split("\n")[1]?.trim()}`)
  await ctx.close()
}

await navegador.close()
log(fallos === 0 ? "\nMOVIMIENTO HONESTO" : `\n${fallos} FALLAN`)
process.exitCode = fallos === 0 ? 0 : 1
