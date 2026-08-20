"use client"

import { AmountInput, type FieldIds } from "@tfv/ui"
import { useFormatter } from "next-intl"
import { useState } from "react"
import { decimalSeparator } from "~/lib/amount.ts"

/**
 * Un importe dentro de un formulario.
 *
 * `AmountInput` es un control gobernado —tiene que serlo: sanea cada pulsación para que no entre un
 * número de coma flotante— y los diálogos de esta sección leen el formulario entero con `FormData`.
 * Esto casa las dos cosas: el estado vive aquí y el `name` viaja al DOM, así que el valor llega al
 * envío sin que cada formulario tenga que llevar su propio estado.
 *
 * El separador decimal sale del idioma en que se está sirviendo la página. Sin él se supone el
 * punto, y con el supuesto equivocado un importe agrupado se manda con tres órdenes de magnitud de
 * menos, sin avisar.
 */
export function AmountField({
  ids,
  name,
  defaultValue = "",
}: {
  ids: FieldIds
  name: string
  defaultValue?: string
}) {
  const decimal = decimalSeparator(useFormatter())
  const [value, setValue] = useState(defaultValue)

  return (
    <AmountInput {...ids} name={name} decimal={decimal} value={value} onValueChange={setValue} />
  )
}
