"use client"

import type { QuoteContact } from "@tfv/contracts/quotation"
import { Button, Callout, Field, Input, Panel } from "@tfv/ui"
import { Plus, Trash2, TriangleAlert, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useId, useMemo, useState } from "react"
import { ApiError, api, SessionExpiredError } from "~/lib/api.client.ts"
import { useAutosave } from "~/lib/autosave.ts"
import { SaveState } from "./quote-payment.tsx"

/**
 * Los contactos de las dos partes.
 *
 * `quotations` pide «varios contactos por el lado del cliente y varios por el lado del vendedor,
 * cada uno con nombre, teléfono y cargo». Son dos listas y no una con una casilla de lado: quien
 * atiende la cotización necesita saber a quién llamar **de la otra parte**, y una lista mezclada
 * obliga a leer cada fila para averiguar de quién es.
 *
 * ## Sin botón, como los demás bloques del constructor
 *
 * Al perder el foco. Añadir y quitar una fila guarda al momento, porque no hay foco que perder.
 *
 * ## Por qué una fila sin nombre no viaja
 *
 * El esquema exige nombre, así que una fila a medio escribir haría fallar el guardado **del bloque
 * entero** —el `PATCH` manda las dos listas completas, y mandarlas completas es lo que hace seguro
 * que el guardado automático repita; ver H-59— y el fallo se leería como si lo escrito en las otras
 * filas se hubiera perdido. Mientras le falte el nombre vive sólo aquí, señalada. No
 * bloquea: no es un error, es una fila a medio hacer. El teléfono y el cargo sí son opcionales,
 * porque un contacto del que sólo se sabe el nombre sigue siendo útil.
 *
 * ## Por qué no se declara aquí que un contacto pertenece al cliente del documento
 *
 * Porque no es cierto. El contacto es texto suelto en el documento, no una referencia al directorio
 * de la empresa: se escribe el nombre de quien atiende esta cotización, que suele ser una persona
 * concreta de una empresa cliente y no la empresa. Enlazarlo al directorio es otro modelo.
 */

/** Lo que la ruta acepta por lado. Más allá de veinte, el documento deja de ser un documento. */
const LIMIT = 20

interface Row {
  readonly key: string
  readonly name: string
  readonly position: string
  readonly phone: string
}

interface Form {
  readonly client: readonly Row[]
  readonly seller: readonly Row[]
}

type Side = keyof Form

interface Contacts {
  readonly clientContacts: QuoteContact[]
  readonly sellerContacts: QuoteContact[]
}

export function QuoteContacts({
  companyId,
  warehouseId,
  quoteId,
  clientContacts,
  sellerContacts,
  editable,
}: {
  companyId: string
  warehouseId: string
  quoteId: string
  clientContacts: readonly QuoteContact[]
  sellerContacts: readonly QuoteContact[]
  /** Sin permiso de edición, o con la cotización cerrada: se ve, no se toca. */
  editable: boolean
}) {
  const t = useTranslations("warehouses.quotes")
  const router = useRouter()
  const prefix = useId()
  const [form, setForm] = useState<Form>(() => ({
    client: rowsOf(clientContacts, "cliente"),
    seller: rowsOf(sellerContacts, "vendedor"),
  }))

  const value = useMemo<Contacts>(
    () => ({ clientContacts: contactsOf(form.client), sellerContacts: contactsOf(form.seller) }),
    [form],
  )

  const autosave = useAutosave(value, async (next) => {
    try {
      await api(`/companies/${companyId}/warehouses/${warehouseId}/quotes/${quoteId}/contacts`, {
        method: "PATCH",
        body: next,
      })
      router.refresh()
    } catch (failure) {
      if (failure instanceof SessionExpiredError) {
        router.replace("/login")
        return
      }
      throw failure instanceof ApiError ? failure : new Error(t("contactsFailed"))
    }
  })

  const commit = autosave.commit

  const update = (side: Side, key: string, patch: Partial<Row>) =>
    setForm((current) => ({
      ...current,
      [side]: current[side].map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }))

  const append = (side: Side) => {
    setForm((current) => ({
      ...current,
      [side]: [
        ...current[side],
        {
          key: `${prefix}-${side}-${current[side].length}-${Date.now()}`,
          name: "",
          position: "",
          phone: "",
        },
      ],
    }))
  }

  const remove = (side: Side, key: string) => {
    setForm((current) => ({ ...current, [side]: current[side].filter((row) => row.key !== key) }))
    queueMicrotask(commit)
  }

  // Sin nada que enseñar ni nada que se pueda escribir, la sección entera sobra.
  if (!editable && form.client.length === 0 && form.seller.length === 0) return null

  return (
    <section aria-labelledby="contacts-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-content-faint" aria-hidden="true" />
          <h2 id="contacts-heading" className="text-title2 font-bold text-content">
            {t("contacts")}
          </h2>
        </div>
        <SaveState
          saving={autosave.saving}
          pending={autosave.pending}
          saved={autosave.saved}
          editable={editable}
          incomplete={false}
        />
      </div>

      {autosave.error ? (
        <Callout tone="danger" live>
          {autosave.error}
        </Callout>
      ) : null}

      <div className="grid gap-3 tablet:grid-cols-2">
        <SideList
          title={t("clientSide")}
          rows={form.client}
          editable={editable}
          onChange={(key, patch) => update("client", key, patch)}
          onRemove={(key) => remove("client", key)}
          onAppend={() => append("client")}
          onCommit={commit}
        />
        <SideList
          title={t("sellerSide")}
          rows={form.seller}
          editable={editable}
          onChange={(key, patch) => update("seller", key, patch)}
          onRemove={(key) => remove("seller", key)}
          onAppend={() => append("seller")}
          onCommit={commit}
        />
      </div>
    </section>
  )
}

function SideList({
  title,
  rows,
  editable,
  onChange,
  onRemove,
  onAppend,
  onCommit,
}: {
  title: string
  rows: readonly Row[]
  editable: boolean
  onChange: (key: string, patch: Partial<Row>) => void
  onRemove: (key: string) => void
  onAppend: () => void
  onCommit: () => void
}) {
  const t = useTranslations("warehouses.quotes")

  return (
    <Panel className="space-y-3 p-4">
      <h3 className="text-body2 font-bold text-content">{title}</h3>

      {rows.length === 0 ? (
        <p className="text-body3 text-content-muted">{t("noContacts")}</p>
      ) : null}

      {rows.map((row) =>
        editable ? (
          <div key={row.key} className="grid gap-3 rounded-sm border border-edge-control p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t("contactName")} className="min-w-40 flex-1">
                {(ids) => (
                  <Input
                    {...ids}
                    type="text"
                    maxLength={200}
                    value={row.name}
                    onChange={(event) => onChange(row.key, { name: event.target.value })}
                    onBlur={onCommit}
                  />
                )}
              </Field>

              <Button
                variant="ghost"
                size="sm"
                aria-label={t("removeContact", { name: row.name || t("contactName") })}
                onClick={() => onRemove(row.key)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="grid gap-3 tablet:grid-cols-2">
              <Field label={t("contactPosition")}>
                {(ids) => (
                  <Input
                    {...ids}
                    type="text"
                    maxLength={120}
                    value={row.position}
                    onChange={(event) => onChange(row.key, { position: event.target.value })}
                    onBlur={onCommit}
                  />
                )}
              </Field>

              <Field label={t("contactPhone")}>
                {(ids) => (
                  <Input
                    {...ids}
                    type="tel"
                    maxLength={40}
                    value={row.phone}
                    onChange={(event) => onChange(row.key, { phone: event.target.value })}
                    onBlur={onCommit}
                  />
                )}
              </Field>
            </div>

            {row.name.trim() === "" ? (
              <p className="inline-flex items-center gap-1.5 text-body3 text-warning">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                {t("contactIncomplete")}
              </p>
            ) : null}
          </div>
        ) : (
          <div key={row.key} className="min-w-0">
            <p className="truncate text-body2 font-semibold text-content">{row.name}</p>
            {row.position || row.phone ? (
              <p className="truncate text-body3 text-content-faint">
                {[row.position, row.phone].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        ),
      )}

      {editable && rows.length < LIMIT ? (
        <Button variant="ghost" size="sm" onClick={onAppend}>
          <Plus className="size-4" aria-hidden="true" />
          {t("addContact")}
        </Button>
      ) : null}
    </Panel>
  )
}

// ─── Del servidor al formulario, y de vuelta ─────────────────────────────────

function rowsOf(contacts: readonly QuoteContact[], side: string): Row[] {
  return contacts.map((contact, index) => ({
    key: `guardado-${side}-${index}`,
    name: contact.name,
    position: contact.position ?? "",
    phone: contact.phone ?? "",
  }))
}

/** Las filas completas, en el orden en que están. Las que no tienen nombre se quedan. */
function contactsOf(rows: readonly Row[]): QuoteContact[] {
  return rows
    .filter((row) => row.name.trim() !== "")
    .map((row) => ({
      name: row.name.trim(),
      ...(row.position.trim() === "" ? {} : { position: row.position.trim() }),
      ...(row.phone.trim() === "" ? {} : { phone: row.phone.trim() }),
    }))
}
