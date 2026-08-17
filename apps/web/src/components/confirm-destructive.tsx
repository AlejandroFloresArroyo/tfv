"use client"

import { Button, Callout, Dialog, DialogClose, DialogContent } from "@tfv/ui"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useState } from "react"
import { useSubmit } from "./use-submit.ts"

/**
 * Confirmación de una acción destructiva.
 *
 * `forms-and-wizards` pide dos cosas que la mayoría de las confirmaciones no hacen, y son
 * justamente las que evitan el borrado por reflejo:
 *
 * - **Nombrar la entidad.** «¿Eliminar?» se contesta que sí sin leer. «¿Eliminar el rol
 *   Almacén?» hace que quien iba a borrar otro se detenga.
 * - **Enumerar la cascada.** Qué más se lleva por delante, antes de pulsar y no después. Es la
 *   diferencia entre una decisión y una sorpresa.
 *
 * Cuando no hay cascada, la lista se omite en lugar de decir «no afecta a nada»: una lista vacía
 * ocupa sitio y no informa.
 */
export function ConfirmDestructive({
  trigger,
  title,
  /** Qué se elimina, por su nombre. Sale entrecomillado en el cuerpo. */
  entity,
  /** Qué más se lleva por delante. Vacío significa que no se lleva nada. */
  cascade = [],
  confirmLabel,
  action,
}: {
  trigger: ReactNode
  title: string
  entity: string
  cascade?: readonly string[]
  confirmLabel: string
  action: () => Promise<unknown>
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const form = useSubmit(async () => action(), { onDone: () => setOpen(false) })

  function change(next: boolean) {
    if (form.pending) return
    setOpen(next)
    if (!next) form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      {trigger}

      <DialogContent title={title} size="sm" locked={form.pending} closeLabel={t("common.close")}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          {form.error ? (
            <Callout tone="danger" live>
              {form.error}
            </Callout>
          ) : null}

          <p className="text-body1 text-content">
            {t.rich("common.confirmDelete", {
              entity: () => <strong className="font-semibold">{entity}</strong>,
            })}
          </p>

          {cascade.length > 0 ? (
            <div>
              <p className="text-body2 font-semibold text-content">{t("common.alsoAffects")}</p>
              <ul className="mt-1.5 list-disc pl-5 text-body2 text-content-muted">
                {cascade.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-body2 text-content-faint">{t("common.cannotUndo")}</p>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={form.pending}>
                {t("common.cancel")}
              </Button>
            </DialogClose>

            <Button type="submit" variant="danger" loading={form.pending}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
