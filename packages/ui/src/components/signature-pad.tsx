"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { cn } from "../lib/cn.ts"
import { Button } from "./button.tsx"

/**
 * Lienzo de captura de firma.
 *
 * Rebanada 28e. Lo pedía la nota de entrega —quien recibe firma en el momento de recibir— y le
 * faltaba también a la 14.
 *
 * ## El dispositivo manda, y aquí más que en ninguna otra pantalla
 *
 * El orden de dispositivos de `PRODUCT.md` es **iPad → celular → escritorio**, y una firma no se
 * hace con ratón: se hace con el dedo sobre una tableta que alguien sostiene mientras el chofer
 * espera. Eso decide tres cosas del primitivo:
 *
 * - **`touch-action: none` sobre el lienzo.** Sin ello, el primer trazo hacia abajo lo interpreta
 *   el navegador como desplazamiento de la página y la firma sale cortada o no sale. Es el defecto
 *   número uno de los lienzos de firma en la web y no se ve nunca probando con un ratón.
 * - **Captura de puntero**, no eventos de ratón ni de tacto por separado: un solo camino para
 *   dedo, lápiz y ratón, y el trazo sigue vivo aunque el dedo salga del lienzo a media rúbrica.
 * - **Altura de sobra.** Firmar en una franja de cuarenta píxeles produce garabatos que no se
 *   parecen a la firma de nadie.
 *
 * ## Por qué guarda los puntos y no sólo los píxeles
 *
 * El lienzo se redimensiona —al girar la tableta, al abrirse el teclado— y cambiar el tamaño de un
 * `<canvas>` **lo borra**. Guardando los trazos como coordenadas normalizadas se vuelven a dibujar
 * después, así que girar el aparato no le borra la firma a nadie a media rúbrica.
 *
 * Las coordenadas van de 0 a 1 y no en píxeles por la misma razón: el mismo trazo vale para
 * cualquier tamaño de lienzo.
 *
 * ## El tema y la resolución
 *
 * La tinta sale de `--content`, así que la firma se ve en claro y en oscuro sin que quien la usa
 * elija nada. Y el mapa de bits se dimensiona por `devicePixelRatio`: sin eso, en una pantalla
 * densa —que es justo la de una tableta— el trazo sale con el borde escalonado.
 *
 * ## Lo que este primitivo no decide
 *
 * **No sube nada.** Devuelve el trazo como `Blob` de PNG cuando se le pide y quien lo use decide
 * qué hacer con él. Un primitivo que además supiera de almacenamiento sería inservible en la
 * segunda pantalla que lo necesite.
 *
 * Y no es obligatorio: firmar exige un pulso y un puntero, y el sistema no puede exigir ninguno de
 * los dos. Quien no pueda firmar aquí deja constancia por otro camino — en la nota de entrega, el
 * cierre no depende de la firma justamente por esto.
 */

/** Un trazo: la secuencia de puntos entre que el puntero baja y sube. */
type Stroke = readonly { readonly x: number; readonly y: number }[]

export interface SignaturePadLabels {
  /** Qué se está firmando. Va al nombre accesible del lienzo. */
  readonly label: string
  /** La instrucción dentro del lienzo vacío. */
  readonly hint: string
  readonly clear: string
  /** Se anuncia a los lectores de pantalla al terminar un trazo. */
  readonly captured: string
}

export interface SignaturePadProps {
  readonly labels: SignaturePadLabels
  /**
   * Se avisa en cada cambio con si hay algo dibujado.
   *
   * Booleano y no el trazo: quien lo usa sólo necesita saber si puede habilitar su botón, y pasarle
   * el mapa de bits en cada movimiento del dedo lo obligaría a codificarlo sesenta veces por
   * segundo.
   */
  readonly onChange?: ((hasSignature: boolean) => void) | undefined
  readonly disabled?: boolean | undefined
  readonly className?: string | undefined
  /** Alto del lienzo. Generoso a propósito: una firma necesita sitio. */
  readonly height?: number | undefined
}

export interface SignaturePadHandle {
  /** El trazo como PNG, o `null` si está vacío. */
  readonly toBlob: () => Promise<Blob | null>
  readonly clear: () => void
  readonly isEmpty: () => boolean
}

const LINE_WIDTH = 2.25

/**
 * Dibuja los trazos sobre el contexto, en píxeles de lienzo.
 *
 * Los extremos y las uniones van redondeados: en angulares, un cambio de dirección brusco deja una
 * punta que no existe en ninguna firma real.
 */
function paint(
  context: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  width: number,
  height: number,
  ink: string,
) {
  context.clearRect(0, 0, width, height)
  context.lineWidth = LINE_WIDTH
  context.lineCap = "round"
  context.lineJoin = "round"
  context.strokeStyle = ink

  for (const stroke of strokes) {
    if (stroke.length === 0) continue

    context.beginPath()
    const [first] = stroke
    if (!first) continue

    // Un toque sin arrastre es un punto, y un punto sobre el papel es tinta: se dibuja como tal en
    // lugar de desaparecer. Es el punto de una «i».
    if (stroke.length === 1) {
      context.arc(first.x * width, first.y * height, LINE_WIDTH / 2, 0, Math.PI * 2)
      context.fillStyle = ink
      context.fill()
      continue
    }

    context.moveTo(first.x * width, first.y * height)
    for (const point of stroke.slice(1)) {
      context.lineTo(point.x * width, point.y * height)
    }
    context.stroke()
  }
}

export function SignaturePad({
  labels,
  onChange,
  disabled = false,
  className,
  height = 180,
  ref,
}: SignaturePadProps & { ref?: React.Ref<SignaturePadHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<{ x: number; y: number }[] | null>(null)
  const hintId = useId()

  const [hasSignature, setHasSignature] = useState(false)

  /**
   * Redibuja a la resolución real del elemento.
   *
   * Se llama al montar, al redimensionar y después de cada trazo. La tinta se lee del estilo
   * calculado y no se fija en el código: así la firma sigue al tema sin que este componente sepa
   * cuál está puesto.
   */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const ratio = window.devicePixelRatio || 1
    const width = Math.round(rect.width * ratio)
    const heightPx = Math.round(rect.height * ratio)

    // Asignar tamaño **borra** el lienzo, así que sólo se toca cuando de verdad cambió.
    if (canvas.width !== width || canvas.height !== heightPx) {
      canvas.width = width
      canvas.height = heightPx
    }

    const context = canvas.getContext("2d")
    if (!context) return

    const ink = getComputedStyle(canvas).color
    paint(context, strokesRef.current, width, heightPx, ink)
  }, [])

  useEffect(() => {
    redraw()

    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [redraw])

  const commit = useCallback(
    (next: Stroke[]) => {
      strokesRef.current = next
      redraw()

      const filled = next.some((stroke) => stroke.length > 0)
      setHasSignature(filled)
      onChange?.(filled)
    },
    [onChange, redraw],
  )

  const clear = useCallback(() => {
    drawingRef.current = null
    commit([])
  }, [commit])

  /** El punto del evento, normalizado a la caja del lienzo y acotado a ella. */
  const pointOf = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }, [])

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return

    // Sin la captura, sacar el dedo del lienzo a media rúbrica corta el trazo donde no toca.
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = [pointOf(event)]
    commit([...strokesRef.current, drawingRef.current])
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = drawingRef.current
    if (!stroke || disabled) return

    stroke.push(pointOf(event))
    redraw()
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    drawingRef.current = null
    commit([...strokesRef.current])
  }

  useEffect(() => {
    if (!ref) return

    const handle: SignaturePadHandle = {
      isEmpty: () => strokesRef.current.every((stroke) => stroke.length === 0),
      clear,
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current
          if (!canvas || strokesRef.current.every((stroke) => stroke.length === 0)) {
            resolve(null)
            return
          }
          canvas.toBlob(resolve, "image/png")
        }),
    }

    if (typeof ref === "function") {
      ref(handle)
      return () => {
        ref(null)
      }
    }

    ref.current = handle
    return () => {
      ref.current = null
    }
  }, [clear, ref])

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={labels.label}
          aria-describedby={hintId}
          style={{ height }}
          className={cn(
            // `touch-action-none` es lo que hace que el primer trazo hacia abajo sea una firma y
            // no un desplazamiento de la página. En una tableta, sin esto el componente no sirve.
            "w-full touch-none rounded-lg border border-edge-control bg-panel text-content",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair",
          )}
          // Enfocable con teclado para que el recorrido no se salte el bloque, aunque firmar
          // exija un puntero. Ver la cabecera: la firma nunca es obligatoria.
          tabIndex={disabled ? -1 : 0}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />

        {hasSignature ? null : (
          <p
            id={hintId}
            className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center text-body2 text-content-faint"
          >
            {labels.hint}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-body2 text-content-muted">
          {hasSignature ? labels.captured : null}
        </p>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={disabled || !hasSignature}
        >
          {labels.clear}
        </Button>
      </div>
    </div>
  )
}
