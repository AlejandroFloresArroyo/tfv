"use client"

import { Button, Callout, Checkbox, DialogTrigger } from "@tfv/ui"
import { PackagePlus, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { FormDialog } from "~/components/form-dialog.tsx"
import { apiTyped } from "~/lib/api.client.ts"
import type { CharacterRow, ContinuityRow } from "../../../production.ts"
import { castRoster } from "../rodaje-logic.ts"

/**
 * Asignar reparto a una jornada.
 *
 * ## Es aditiva, y la pantalla lo respeta
 *
 * `assignCharacters` nunca quita a quien ya tiene continuidad
 * (`apps/api/src/productions/continuity.ts:475`) — sólo abre las que faltan y pone la jornada en
 * curso. Por eso quien ya está asignado se enseña aparte, sin casilla: si la hubiera y alguien la
 * desmarcara, parecería que lo está quitando, y no es así. Quitar a alguien es otra acción, sobre
 * su propia continuidad (`ContinuityPanel`, «Quitar»).
 *
 * ## En una jornada cerrada, la acción sigue disponible y avisa antes
 *
 * `assignCharacters` pone la jornada en curso **siempre**, sin comprobar su estado —el mismo
 * `set({ status: "ongoing" })` corre tanto si estaba en borrador como si ya estaba terminada—. No
 * se oculta el botón cuando está cerrada: nada del lado del servidor lo impide, y esconderlo
 * inventaría una restricción que no existe. Lo que sí hace falta, por la voz de marca
 * (`PRODUCT.md`: «explica la consecuencia antes de que ocurra»), es decirlo antes de que se pulse.
 */
export function AssignCast({
  companyId,
  productionId,
  recordingId,
  characters,
  continuities,
  isClosed,
}: {
  companyId: string
  productionId: string
  recordingId: string
  characters: readonly CharacterRow[]
  continuities: readonly ContinuityRow[]
  /** Si la jornada ya está terminada: asignar la reabre. */
  isClosed: boolean
}) {
  const t = useTranslations("productions.rodaje")

  const roster = castRoster(characters, continuities)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())

  function toggle(id: string, on: boolean) {
    setChosen((previous) => {
      const next = new Set(previous)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">
            <UserPlus className="size-4" aria-hidden="true" />
            {t("assignCast")}
          </Button>
        </DialogTrigger>
      }
      title={t("assignCastTitle")}
      description={t("assignCastBody")}
      submitLabel={t("assignCastConfirm")}
      size="lg"
      action={async () => {
        await apiTyped(
          "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/characters",
          {
            params: { companyId, productionId, recordingId },
            body: { characterIds: [...chosen] },
          },
        )
      }}
    >
      {() =>
        roster.available.length === 0 ? (
          <Callout tone="info">{t("assignCastAllIn")}</Callout>
        ) : (
          <>
            {isClosed ? <Callout tone="warning">{t("assignCastReopens")}</Callout> : null}

            {roster.assigned.length > 0 ? (
              <p className="text-body3 text-content-faint">
                {t("assignCastAlready", { count: roster.assigned.length })}
              </p>
            ) : null}

            <ul className="max-h-[22rem] overflow-y-auto rounded-lg border border-edge">
              {roster.available.map((character) => (
                <li
                  key={character.id}
                  className="flex items-center gap-3 px-3 py-2.5 not-last:border-edge not-last:border-b"
                >
                  <Checkbox
                    checked={chosen.has(character.id)}
                    onCheckedChange={(checked) => toggle(character.id, checked === true)}
                    aria-label={character.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-body2 text-content">
                    {character.name}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )
      }
    </FormDialog>
  )
}

/**
 * Utilería sin personaje.
 *
 * `createContinuityRoute`, del lado del servidor: «sirve para lo que la spec llama "elementos que
 * no corresponden a ningún personaje en concreto"» —el atrezo de la escena, no de nadie en
 * particular—. **No** pone la jornada en curso: eso lo hace asignar el reparto, que es otro acto,
 * y una continuidad suelta no es una persona presente ese día.
 */
export function AddLooseContinuity({
  companyId,
  productionId,
  recordingId,
}: {
  companyId: string
  productionId: string
  recordingId: string
}) {
  const t = useTranslations("productions.rodaje")
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function add() {
    setPending(true)
    try {
      await apiTyped(
        "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities",
        { params: { companyId, productionId, recordingId }, body: {} },
      )
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Button variant="secondary" size="sm" loading={pending} onClick={add}>
      <PackagePlus className="size-4" aria-hidden="true" />
      {t("addLooseContinuity")}
    </Button>
  )
}
