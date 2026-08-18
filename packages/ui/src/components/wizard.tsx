"use client"

import { AlertCircle, Check } from "lucide-react"
import type { FormEvent, ReactNode } from "react"
import { useState } from "react"
import { cn } from "../lib/cn.ts"
import {
  advance,
  back,
  errorsOf,
  goTo,
  type StepErrors,
  submit,
  type WizardState,
  type WizardStep,
} from "../lib/wizard.ts"
import { Button } from "./button.tsx"
import { Callout } from "./callout.tsx"
import { Dialog, DialogContent } from "./dialog.tsx"

/**
 * Asistente por pasos.
 *
 * La regla vive en `../lib/wizard.ts`, que es una máquina pura y probada; esto es su cara. Aquí
 * sólo quedan las decisiones que son de pantalla:
 *
 * - **El estado se gobierna desde fuera.** Lo pide el acuerdo de que el paso viaje en la dirección
 *   (`?paso=3`), para que el botón de atrás del navegador haga lo que cualquiera espera. Un
 *   asistente con el paso guardado por dentro convierte ese botón en una salida del formulario.
 * - **`Intro` avanza, no envía**, salvo en el último paso. En un formulario de treinta campos, que
 *   `Intro` envíe desde el paso dos es enviar a medias sin querer.
 * - **Cancelar con cambios pregunta.** Es la casilla de la 28e, y va aquí y no en cada pantalla
 *   porque es exactamente donde se olvida.
 *
 * El indicador se desplaza en horizontal en un teléfono en lugar de apretujar cinco etiquetas: se
 * puede leer y se puede tocar, que es más de lo que consigue un indicador que cabe entero.
 */

export interface WizardStepView<T> extends WizardStep<T> {
  label: string
  /** Recibe los errores del paso para que cada campo sitúe el suyo. */
  content: (errors: StepErrors) => ReactNode
}

export interface WizardLabels {
  back: string
  next: string
  submit: string
  cancel: string
  /** «Paso 2 de 5» — se compone fuera porque el orden de las palabras cambia con el idioma. */
  counter: (step: number, total: number) => string
  /** Anuncia el estado de un paso a quien no ve el color. */
  stepWithError: string
  stepDone: string
  discardTitle: string
  discardDescription: string
  discardConfirm: string
  discardKeep: string
  close: string
}

export function Wizard<T>({
  steps,
  values,
  state,
  onStateChange,
  onSubmit,
  onCancel,
  labels,
  dirty = false,
  pending = false,
  error,
  className,
}: {
  steps: readonly WizardStepView<T>[]
  values: T
  state: WizardState
  onStateChange: (state: WizardState) => void
  onSubmit: () => void
  onCancel: () => void
  labels: WizardLabels
  /** Si hay algo escrito, cancelar pregunta antes de tirarlo. */
  dirty?: boolean | undefined
  pending?: boolean | undefined
  /** Error del servidor que no corresponde a ningún campo. */
  error?: string | undefined
  className?: string | undefined
}) {
  const [confirming, setConfirming] = useState(false)

  const shown = errorsOf(steps, values, state)
  const last = state.current === steps.length - 1
  const step = steps[state.current]

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    if (!last) {
      onStateChange(advance(steps, values, state))
      return
    }

    const result = submit(steps, values, state)
    onStateChange(result.state)
    if (result.invalid.length === 0) onSubmit()
  }

  function cancel() {
    if (dirty) {
      setConfirming(true)
      return
    }
    onCancel()
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={cn("flex flex-col gap-6", className)}>
      <Steps
        steps={steps}
        state={state}
        errored={shown}
        labels={labels}
        onGoTo={(index) => onStateChange(goTo(state, index))}
      />

      {/* La clave por paso descarta el estado de los campos al cambiar: un control no controlado
          del paso tres no debe reaparecer con el valor que tenía el del paso dos en su sitio. */}
      <div key={step?.id}>{step?.content(shown.get(step.id) ?? {})}</div>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      <div className="flex items-center gap-2 border-t border-line pt-5">
        <Button type="button" variant="ghost" onClick={cancel} disabled={pending}>
          {labels.cancel}
        </Button>

        <span className="flex-1" />

        {state.current > 0 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onStateChange(back(state))}
            disabled={pending}
          >
            {labels.back}
          </Button>
        ) : null}

        <Button type="submit" loading={pending}>
          {last ? labels.submit : labels.next}
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title={labels.discardTitle}
          description={labels.discardDescription}
          size="sm"
          closeLabel={labels.close}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {labels.discardKeep}
              </Button>
              <Button variant="danger" onClick={onCancel}>
                {labels.discardConfirm}
              </Button>
            </>
          }
        />
      </Dialog>
    </form>
  )
}

function Steps<T>({
  steps,
  state,
  errored,
  labels,
  onGoTo,
}: {
  steps: readonly WizardStepView<T>[]
  state: WizardState
  errored: ReadonlyMap<string, StepErrors>
  labels: WizardLabels
  onGoTo: (index: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body3 text-content-faint tabular-nums">
        {labels.counter(state.current + 1, steps.length)}
      </p>

      <ol className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1">
        {steps.map((step, index) => {
          const current = index === state.current
          const fails = errored.has(step.id)
          const done = index < state.furthest && !fails
          const reachable = index <= state.furthest

          return (
            <li key={step.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onGoTo(index)}
                disabled={!reachable}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-body3 font-semibold",
                  "transition-colors duration-150",
                  "disabled:cursor-default disabled:opacity-60",
                  current ? "bg-accent text-on-accent" : "text-content-muted",
                  !current && reachable ? "hover:bg-panel-hover hover:text-content" : "",
                  !current && fails ? "text-danger" : "",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-xl text-body3",
                    current ? "bg-on-accent/20" : "bg-line-strong text-content",
                    // El círculo no se rellena: `--danger` es claro en el tema oscuro y el
                    // blanco encima deja de leerse. El icono ya lleva el significado.
                    !current && fails ? "bg-transparent text-danger" : "",
                  )}
                  aria-hidden="true"
                >
                  {fails ? (
                    <AlertCircle className="size-3.5" />
                  ) : done ? (
                    <Check className="size-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>

                {step.label}

                {/* El color no es el único portador del estado: se dice, para quien no lo ve. */}
                {fails ? <span className="sr-only">{labels.stepWithError}</span> : null}
                {done ? <span className="sr-only">{labels.stepDone}</span> : null}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
