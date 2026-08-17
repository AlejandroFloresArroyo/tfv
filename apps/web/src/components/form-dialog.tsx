"use client"

import { Button, Callout, Dialog, DialogClose, DialogContent } from "@tfv/ui"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useState } from "react"
import { type SubmitState, useSubmit } from "./use-submit.ts"

/**
 * Diálogo con un formulario dentro.
 *
 * Es la cáscara de formulario de la 28e, con sus ranuras: título, campos, error general y la fila
 * de acciones. Todo lo que se envía desde una pantalla de lista pasa por aquí.
 *
 * Tres decisiones que conviene ver de golpe:
 *
 * - **Mientras hay un envío en curso el diálogo no se cierra.** Ni con `Escape`, ni pulsando fuera,
 *   ni con la aspa — que desaparece. Perder un formulario a medias por un `Escape` de reflejo es
 *   de las cosas que hacen que la gente deje de confiar en una pantalla.
 * - **Al terminar bien se cierra solo**, y el árbol de servidor se vuelve a resolver, así que lo
 *   creado aparece en la lista sin recargar la página.
 * - **Al cerrar se limpia el estado.** Volver a abrirlo y encontrarse el error del intento anterior
 *   hace creer que ya falló otra vez.
 */
export function FormDialog<T>({
  trigger,
  title,
  description,
  submitLabel,
  action,
  children,
  tone = "primary",
  size,
}: {
  trigger: ReactNode
  title: string
  description?: string
  submitLabel: string
  action: (data: FormData) => Promise<T>
  /** Los campos. Reciben el estado para poder situar sus errores. */
  children: (state: SubmitState) => ReactNode
  tone?: "primary" | "danger"
  size?: "sm" | "md" | "lg"
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const form = useSubmit(action, { onDone: () => setOpen(false) })

  function change(next: boolean) {
    if (form.pending) return
    setOpen(next)
    if (!next) form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      {trigger}

      <DialogContent
        title={title}
        {...(description ? { description } : {})}
        {...(size ? { size } : {})}
        locked={form.pending}
        closeLabel={t("common.close")}
      >
        <form onSubmit={form.submit} noValidate className="flex flex-col gap-4">
          {form.error ? (
            <Callout tone="danger" live>
              {form.error}
            </Callout>
          ) : null}

          {children(form)}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={form.pending}>
                {t("common.cancel")}
              </Button>
            </DialogClose>

            <Button type="submit" variant={tone} loading={form.pending}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
