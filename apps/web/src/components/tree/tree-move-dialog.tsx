"use client"

import { Callout, Field, Select } from "@tfv/ui"
import { useEffect, useRef, useState } from "react"
import { ApiError } from "~/lib/api.client.ts"
import { FormDialog } from "../form-dialog.tsx"
import { type TreeOption, withoutSubtree } from "./tree.ts"

/**
 * Cambiar de padre.
 *
 * Es la única operación de los dos árboles que puede formar un ciclo, y por eso es la única que
 * tiene diálogo propio en lugar de ser un campo más del formulario de edición: **el rechazo del
 * ciclo tiene que leerse aquí**, junto al desplegable en el que se acaba de elegir el destino, y no
 * como un «algo salió mal» en un formulario que además cambiaba el nombre.
 *
 * ## Por qué se carga el árbol entero
 *
 * Porque un destino puede estar a cualquier profundidad y los dos recursos listan por padre. Se
 * paga al abrir —no al pintar la pantalla— y sólo se piden las hijas de quien declara tenerlas.
 *
 * ## Por qué se ofrece el árbol sin su propio subárbol
 *
 * Ofrecer una descendiente como destino es ofrecer un error garantizado. Aun así el rechazo del
 * servidor se sigue traduciendo: entre que se carga la lista y se pulsa guardar, otra persona puede
 * haber colgado algo justo debajo, y entonces el ciclo es real y hay que decirlo con esas palabras.
 */
export function TreeMoveDialog({
  title,
  description,
  submitLabel,
  fieldLabel,
  hint,
  rootLabel,
  loadingLabel,
  cycleMessage,
  node,
  load,
  move,
  open,
  onOpenChange,
}: {
  title: string
  description?: string
  submitLabel: string
  fieldLabel: string
  /** Qué significa dejarlo sin padre, dicho en la propia pantalla. */
  hint?: string
  /** La opción vacía: pasar a ser raíz. */
  rootLabel: string
  loadingLabel: string
  /** Cómo se dice, en el idioma de quien mira, que un nodo no puede colgar de su descendiente. */
  cycleMessage: string
  /** A quién se mueve. El nombre lo pone la pantalla en el título, que es donde se lee. */
  node: { id: string; parentId: string | null }
  /** El árbol entero, aplanado. Lo trae la pantalla porque cada recurso se pide a su manera. */
  load: () => Promise<readonly TreeOption[]>
  move: (parentId: string | null) => Promise<unknown>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [options, setOptions] = useState<readonly TreeOption[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // Gobernado, y no con `defaultValue`: el padre actual todavía no está entre las opciones cuando
  // el diálogo se monta, así que un valor por omisión se perdería al llegar el árbol.
  const [parentId, setParentId] = useState(node.parentId ?? "")

  // La carga se dispara al abrir, y `load` se toma de la referencia para que volver a crearla en
  // cada pintado del componente de arriba no vuelva a recorrer el árbol entero.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    if (!open) {
      setOptions(null)
      setFailure(null)
      return
    }

    let alive = true
    setParentId(node.parentId ?? "")

    loadRef.current().then(
      (all) => {
        if (alive) setOptions(withoutSubtree(all, node.id))
      },
      (error: unknown) => {
        if (alive) setFailure(error instanceof Error ? error.message : String(error))
      },
    )

    return () => {
      alive = false
    }
  }, [open, node.id, node.parentId])

  return (
    <FormDialog
      title={title}
      {...(description ? { description } : {})}
      submitLabel={submitLabel}
      open={open}
      onOpenChange={onOpenChange}
      action={async (data) => {
        const chosen = String(data.get("parentId") ?? "")

        try {
          return await move(chosen === "" ? null : chosen)
        } catch (error) {
          throw asCycleRejection(error, cycleMessage)
        }
      }}
    >
      {(state) => (
        <>
          {failure ? <Callout tone="danger">{failure}</Callout> : null}

          <Field
            label={fieldLabel}
            {...(hint ? { hint } : {})}
            error={state.fieldErrors.get("parentId")}
          >
            {(ids) => (
              <Select
                {...ids}
                name="parentId"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                disabled={options === null}
              >
                <option value="">{options === null && !failure ? loadingLabel : rootLabel}</option>
                {(options ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {/* El espacio duro va con su escape: uno normal lo colapsa el navegador al principio
                        de una opción, y a simple vista los dos son idénticos. */}
                    {`${"\u00a0\u00a0".repeat(option.depth)}${option.label}`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      )}
    </FormDialog>
  )
}

/**
 * El rechazo del ciclo, dicho en el idioma de quien mira.
 *
 * El servidor lo devuelve como error de dominio con su mensaje en español; traducirlo aquí es lo
 * que hace que en inglés no aparezca una frase suelta en otro idioma. Se reconoce **por el código
 * de estado y por el contexto**: este diálogo manda un único campo, `parentId`, así que un rechazo
 * de estado por parte del servidor no puede venir de ninguna otra regla. Se admiten los dos códigos
 * porque el contrato tiene ambos —`409` para el choque con el estado, `422` para lo que cumple el
 * esquema y no tiene sentido— y hoy el servicio lanza el segundo.
 */
function asCycleRejection(error: unknown, message: string): unknown {
  if (error instanceof ApiError && (error.status === 409 || error.status === 422)) {
    return new ApiError(error.status, message)
  }

  return error
}
