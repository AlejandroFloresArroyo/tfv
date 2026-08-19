/**
 * La máquina de un formulario por pasos, fuera de React para poder probarla.
 *
 * Es el mismo reparto que `createAutosaver` en la aplicación web: la regla vive en una función pura
 * y el componente sólo la conecta a los eventos. Aquí importa más que en otros sitios, porque lo
 * que un asistente de cinco pasos hace mal no se ve mirándolo —se ve tres pasos después, cuando el
 * envío rechaza algo que el usuario creía resuelto—.
 *
 * Las dos reglas que gobiernan todo esto vienen de `openspec/specs/forms-and-wizards/spec.md`:
 *
 * - **Al avanzar se valida sólo el paso actual.** Es lo que permite avanzar con los pasos
 *   posteriores vacíos, y lo que hace usable un formulario de treinta campos.
 * - **Al enviar se validan todos**, y el indicador señala cuáles fallan — no sólo el primero, que
 *   obligaría a descubrir los errores de uno en uno.
 *
 * Y una tercera que no está escrita como requisito pero se deduce de la primera: un paso **no
 * delata sus errores hasta que se ha intentado pasar por él**. Un asistente que abre con cinco
 * pasos en rojo ha dado por incompleto lo que el usuario todavía no ha tenido ocasión de escribir.
 */

/** Errores de un paso: campo → mensaje. Vacío significa paso válido. */
export type StepErrors = Readonly<Record<string, string>>

export interface WizardStep<T> {
  /** Identifica el paso en el indicador y en los errores. Estable: no es el índice. */
  readonly id: string
  /** Ausente en un paso que no puede fallar — un resumen, por ejemplo. */
  readonly validate?: ((values: T) => StepErrors) | undefined
}

export interface WizardState {
  readonly current: number
  /**
   * Hasta dónde se ha llegado.
   *
   * Existe para que volver atrás no cierre el camino de vuelta: quien ya validó el paso tres puede
   * saltar de nuevo a él desde el uno, pero nadie puede saltarse un paso que nunca superó.
   */
  readonly furthest: number
  /** Pasos por los que ya se ha intentado pasar. Sólo éstos enseñan sus errores. */
  readonly attempted: readonly string[]
}

export function start(): WizardState {
  return { current: 0, furthest: 0, attempted: [] }
}

function errorsAt<T>(steps: readonly WizardStep<T>[], values: T, index: number): StepErrors {
  const step = steps[index]
  return step?.validate?.(values) ?? {}
}

function invalid(errors: StepErrors): boolean {
  return Object.keys(errors).length > 0
}

function withAttempted(state: WizardState, ids: readonly string[]): readonly string[] {
  return [...state.attempted, ...ids.filter((id) => !state.attempted.includes(id))]
}

/**
 * Intentar pasar al siguiente.
 *
 * Marca el paso actual como intentado **aunque no se avance**: es justo el momento en que sus
 * errores dejan de ser prematuros y pasan a ser lo que impide seguir.
 */
export function advance<T>(
  steps: readonly WizardStep<T>[],
  values: T,
  state: WizardState,
): WizardState {
  const id = steps[state.current]?.id
  const attempted = withAttempted(state, id === undefined ? [] : [id])

  if (invalid(errorsAt(steps, values, state.current))) {
    return { ...state, attempted }
  }

  const current = Math.min(state.current + 1, steps.length - 1)
  return { current, furthest: Math.max(state.furthest, current), attempted }
}

export function back(state: WizardState): WizardState {
  return { ...state, current: Math.max(state.current - 1, 0) }
}

/** Saltar a un paso ya superado. Hacia adelante no se salta: el índice se ignora. */
export function goTo(state: WizardState, index: number): WizardState {
  if (index < 0 || index > state.furthest) return state
  return { ...state, current: index }
}

/**
 * Enviar.
 *
 * Devuelve los pasos que fallan **en su orden**, y sitúa el asistente en el primero: enseñar los
 * cuatro que fallan y dejar al usuario en el quinto es enseñar el problema y esconder dónde se
 * arregla.
 */
export function submit<T>(
  steps: readonly WizardStep<T>[],
  values: T,
  state: WizardState,
): { readonly state: WizardState; readonly invalid: readonly string[] } {
  const failing = steps.filter((_, index) => invalid(errorsAt(steps, values, index)))
  const attempted = withAttempted(
    state,
    steps.map((step) => step.id),
  )

  const first = failing[0]
  const current = first === undefined ? state.current : steps.indexOf(first)

  return {
    state: { ...state, current, furthest: Math.max(state.furthest, current), attempted },
    invalid: failing.map((step) => step.id),
  }
}

/** Los errores que el indicador debe enseñar: los de los pasos por los que ya se intentó pasar. */
export function errorsOf<T>(
  steps: readonly WizardStep<T>[],
  values: T,
  state: WizardState,
): ReadonlyMap<string, StepErrors> {
  const shown = new Map<string, StepErrors>()

  steps.forEach((step, index) => {
    if (!state.attempted.includes(step.id)) return
    const errors = errorsAt(steps, values, index)
    if (invalid(errors)) shown.set(step.id, errors)
  })

  return shown
}
