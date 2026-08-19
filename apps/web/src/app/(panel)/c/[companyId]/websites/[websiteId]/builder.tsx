"use client"

import type { Section, SectionButton, SectionItem, SectionKind } from "@tfv/contracts/sections"
import {
  isSectionKind,
  normalizeSections,
  renderableSections,
  SECTION_KINDS,
  scrollTargets,
  sectionSpec,
  unresolvedScrollTargets,
} from "@tfv/contracts/sections"
import { Badge, Button, Callout, cn, Input, Panel, ReorderList, Textarea } from "@tfv/ui"
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { SECTION_PRODUCT_SAMPLE, sectionsCatalog } from "~/components/site/page.ts"
import { SiteSections } from "~/components/site/sections.tsx"
import { formatAmount } from "~/lib/amount.ts"
import { api } from "~/lib/api.client.ts"
import type { CustomizationRow, WebsiteRow } from "../site.ts"

/**
 * El constructor de la página de un sitio.
 *
 * Ver `openspec/specs/site-builder/spec.md`.
 *
 * ## Lo que esta pantalla **no** decide
 *
 * Casi todo lo que importa:
 *
 * - **Qué se pinta y en qué orden** lo decide `renderableSections`, del contrato compartido. La
 *   misma que usa el servidor para componer lo que sirve. Por eso la vista previa no puede
 *   discrepar de la tienda: no hay dos implementaciones que puedan separarse.
 * - **A dónde va una sección al soltarla** lo decide `reorder` de `@tfv/ui`, probado sin navegador.
 *   Aquí no se calcula ningún índice.
 * - **Qué campos ofrece cada tipo** lo decide `sectionSpec`. El formulario se construye leyendo el
 *   catálogo, así que un tipo nuevo trae su editor sin escribir una pantalla.
 *
 * Lo que sí decide es cuándo se guarda, y ahí hay una decisión: **no se guarda solo**. El resto del
 * panel usa autoguardado por bloques, pero aquí lo que se edita es una página pública entera: soltar
 * una sección en el sitio equivocado y que eso llegue a la tienda de inmediato es lo contrario de
 * una vista previa. Se ve, y luego se publica.
 */
export function Builder({
  companyId,
  site,
  customizations,
  catalog,
  canEdit,
  canCreate,
  canDelete,
}: {
  companyId: string
  site: WebsiteRow
  customizations: readonly CustomizationRow[]
  catalog: {
    categories: readonly { id: string; name: string }[]
    products: readonly {
      id: string
      slug: string | null
      name: string
      price: string | null
      coverUrl: string | null
    }[]
  }
  canEdit: boolean
  canCreate: boolean
  canDelete: boolean
}) {
  const t = useTranslations("websites.builder")
  const store = useTranslations("storefront")
  const common = useTranslations("common")
  const format = useFormatter()
  const router = useRouter()

  const first = customizations.find((entry) => entry.isActive) ?? customizations[0] ?? null
  const [currentId, setCurrentId] = useState<string | null>(first?.id ?? null)
  const current = customizations.find((entry) => entry.id === currentId) ?? first

  const [draft, setDraft] = useState<{ color: string; entries: readonly Draft[] }>({
    color: current?.color ?? "#000000",
    entries: drafts(current?.sections ?? []),
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sections = normalizeSections(draft.entries.map((entry) => entry.section))

  /** Cambiar de tema descarta lo que no se guardó: guardarlo en el otro sería guardarlo mal. */
  function select(entry: CustomizationRow) {
    setCurrentId(entry.id)
    setDraft({ color: entry.color, entries: drafts(entry.sections) })
    setDirty(false)
    setError(null)
  }

  function edit(next: readonly Draft[]) {
    setDraft((state) => ({ ...state, entries: next }))
    setDirty(true)
  }

  async function save() {
    if (current === null || saving) return
    setSaving(true)
    setError(null)

    try {
      await api(`/companies/${companyId}/websites/${site.id}/customizations/${current.id}`, {
        method: "PATCH",
        body: { color: draft.color, sections },
      })
      setDirty(false)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : common("unexpectedError"))
    } finally {
      setSaving(false)
    }
  }

  async function createTheme() {
    const created = await api<CustomizationRow>(
      `/companies/${companyId}/websites/${site.id}/customizations`,
      { method: "POST", body: { name: t("newThemeName") } },
    )
    setCurrentId(created.id)
    setDraft({ color: created.color, entries: drafts(created.sections) })
    setDirty(false)
    router.refresh()
  }

  async function removeTheme(entry: CustomizationRow) {
    await api(`/companies/${companyId}/websites/${site.id}/customizations/${entry.id}`, {
      method: "DELETE",
    })
    if (entry.id === currentId) setCurrentId(null)
    router.refresh()
  }

  // Lo que se ve. **La misma función que usa el servidor**, sobre lo que todavía no se ha guardado.
  const shown = renderableSections(sections)
  const broken = unresolvedScrollTargets(sections)
  const targets = scrollTargets(sections)

  return (
    <div className="grid gap-6 laptop:grid-cols-[24rem_1fr] laptop:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <Themes
          customizations={customizations}
          currentId={current?.id ?? null}
          onSelect={select}
          onCreate={canCreate ? createTheme : null}
          onRemove={canDelete ? removeTheme : null}
        />

        {current === null ? null : (
          <Panel className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-title2 font-bold text-content">{t("sections")}</h2>
              {canEdit ? (
                <AddSection
                  used={targets}
                  onAdd={(kind) =>
                    edit([
                      ...draft.entries,
                      { key: code(), section: blank(kind, t(`kinds.${kind}`)) },
                    ])
                  }
                  label={t("addSection")}
                  labelOf={(kind) => t(`kinds.${kind}`)}
                />
              ) : null}
            </div>

            {broken.length > 0 ? (
              <Callout tone="warning">{t("brokenTargets", { targets: broken.join(", ") })}</Callout>
            ) : null}

            <ReorderList
              items={draft.entries}
              keyOf={(entry) => entry.key}
              handleLabel={(entry) => t("moveHandle", { section: labelOf(entry.section, t) })}
              onReorder={edit}
              itemClassName="p-3"
            >
              {(entry, index) => (
                <SectionEditor
                  section={entry.section}
                  readOnly={!canEdit}
                  targets={targets}
                  onChange={(next) =>
                    edit(
                      draft.entries.map((candidate, at) =>
                        at === index ? { ...candidate, section: next } : candidate,
                      ),
                    )
                  }
                  onRemove={() => edit(draft.entries.filter((_, at) => at !== index))}
                />
              )}
            </ReorderList>

            {canEdit ? (
              <div className="flex items-center gap-3">
                <Button onClick={save} loading={saving} disabled={!dirty}>
                  {t("save")}
                </Button>
                <span className="text-body3 text-content-muted">
                  {dirty ? t("unsaved") : t("saved")}
                </span>
              </div>
            ) : null}

            {error ? <Callout tone="danger">{error}</Callout> : null}
          </Panel>
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-title2 font-bold text-content">{t("preview")}</h2>
          <a
            href={site.address}
            target="_blank"
            rel="noreferrer"
            className="text-body3 text-content-muted hover:underline"
          >
            {t("openPublic")}
          </a>
        </div>

        <p className="mb-2 text-body3 text-content-faint">
          {site.isPublished ? t("previewNote") : t("previewUnpublished")}
        </p>

        {/*
          El marco de la vista previa: dentro va **el mismo componente** que pinta la tienda, con las
          secciones sin guardar. Lo que cambia fuera es el borde; dentro no cambia nada, y por eso
          «lo que se ve es lo que se sirve» no depende de que nadie se acuerde de mantenerlo.
        */}
        <div className="overflow-hidden rounded-xl border border-line bg-canvas">
          {shown.length === 0 ? (
            <p className="px-4 py-16 text-center text-body2 text-content-muted">
              {t("noSections")}
            </p>
          ) : (
            <SiteSections
              sections={shown}
              color={draft.color}
              bannerUrl={current?.bannerUrl ?? null}
              catalog={sectionsCatalog({
                slug: site.slug,
                categories: catalog.categories,
                products: catalog.products.slice(0, SECTION_PRODUCT_SAMPLE),
                money: (amount) => formatAmount(amount, format),
                emptyLabel: store("empty"),
                askForPriceLabel: store("askForPrice"),
              })}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Temas ───────────────────────────────────────────────────────────────────

function Themes({
  customizations,
  currentId,
  onSelect,
  onCreate,
  onRemove,
}: {
  customizations: readonly CustomizationRow[]
  currentId: string | null
  onSelect: (entry: CustomizationRow) => void
  onCreate: (() => Promise<void>) | null
  onRemove: ((entry: CustomizationRow) => Promise<void>) | null
}) {
  const t = useTranslations("websites.builder")

  return (
    <Panel className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title2 font-bold text-content">{t("themes")}</h2>
        {onCreate ? (
          <Button size="sm" variant="secondary" onClick={onCreate}>
            <Plus className="size-4" aria-hidden="true" />
            {t("newTheme")}
          </Button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-1">
        {customizations.map((entry) => (
          <li key={entry.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(entry)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left",
                entry.id === currentId ? "bg-panel-hover" : "hover:bg-panel-hover",
              )}
            >
              <span
                className="size-3 shrink-0 rounded-full border border-line"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-body2 text-content">{entry.name}</span>
              {entry.isActive ? <Badge tone="success">{t("active")}</Badge> : null}
              {entry.isPrimary && !entry.isActive ? <Badge>{t("primary")}</Badge> : null}
            </button>
            {onRemove ? (
              <button
                type="button"
                aria-label={t("deleteTheme", { name: entry.name })}
                onClick={() => onRemove(entry)}
                className="rounded-sm p-1.5 text-content-faint hover:bg-panel-hover hover:text-content"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ─── Secciones ───────────────────────────────────────────────────────────────

function AddSection({
  used,
  onAdd,
  label,
  labelOf,
}: {
  used: readonly SectionKind[]
  onAdd: (kind: SectionKind) => void
  label: string
  labelOf: (kind: SectionKind) => string
}) {
  return (
    <label className="flex items-center gap-1 text-body3 text-content-muted">
      <span className="sr-only">{label}</span>
      <select
        value=""
        aria-label={label}
        onChange={(event) => {
          const kind = event.currentTarget.value
          if (isSectionKind(kind)) onAdd(kind)
          event.currentTarget.value = ""
        }}
        className="h-8 rounded-sm border border-field bg-panel px-2 text-body3 text-content"
      >
        <option value="">{label}</option>
        {SECTION_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {labelOf(kind)}
            {used.includes(kind) ? " ·" : ""}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * El editor de una sección, construido leyendo el catálogo.
 *
 * Los campos salen de `sectionSpec(kind)`: los de texto, si admite elementos y con qué campos, y si
 * admite botones. Una sección de catálogo —productos, categorías— **no ofrece elementos**, porque
 * los suyos los pone la fuente y no hay dónde escribirlos: es lo que impide que alguien enseñe
 * aquí un producto que el almacén tiene despublicado.
 */
function SectionEditor({
  section,
  readOnly,
  targets,
  onChange,
  onRemove,
}: {
  section: Section
  readOnly: boolean
  targets: readonly SectionKind[]
  onChange: (next: Section) => void
  onRemove: () => void
}) {
  const t = useTranslations("websites.builder")
  const [open, setOpen] = useState(false)
  const spec = sectionSpec(section.kind)

  const patch = (values: Partial<Section>) => onChange({ ...section, ...values })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="min-w-0 flex-1 truncate text-left text-body2 font-semibold text-content"
        >
          {labelOf(section, t)}
          {section.title ? (
            <span className="ml-2 font-normal text-content-muted">{section.title}</span>
          ) : null}
        </button>

        {spec === undefined ? <Badge tone="warning">{t("unknownKind")}</Badge> : null}

        {readOnly ? null : (
          <>
            <button
              type="button"
              aria-label={section.show ? t("hide") : t("show")}
              onClick={() => patch({ show: !section.show })}
              className="rounded-sm p-1.5 text-content-faint hover:bg-panel-hover hover:text-content"
            >
              {section.show ? (
                <Eye className="size-4" aria-hidden="true" />
              ) : (
                <EyeOff className="size-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              aria-label={t("removeSection", { section: labelOf(section, t) })}
              onClick={onRemove}
              className="rounded-sm p-1.5 text-content-faint hover:bg-panel-hover hover:text-content"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {!open || spec === undefined || readOnly ? null : (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          {spec.fields.includes("title") ? (
            <Input
              value={section.title ?? ""}
              aria-label={t("sectionTitle")}
              placeholder={t("sectionTitle")}
              onChange={(event) => patch({ title: event.currentTarget.value })}
            />
          ) : null}

          {spec.fields.includes("description") ? (
            <Textarea
              rows={2}
              value={section.description ?? ""}
              aria-label={t("sectionDescription")}
              placeholder={t("sectionDescription")}
              onChange={(event) => patch({ description: event.currentTarget.value })}
            />
          ) : null}

          {spec.item === null ? null : (
            <Items items={section.items ?? []} onChange={(items) => patch({ items })} />
          )}

          {spec.buttons ? (
            <Buttons
              buttons={section.buttons ?? []}
              targets={targets}
              onChange={(buttons) => patch({ buttons })}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

function Items({
  items,
  onChange,
}: {
  items: readonly SectionItem[]
  onChange: (items: readonly SectionItem[]) => void
}) {
  const t = useTranslations("websites.builder")

  return (
    <div className="flex flex-col gap-2">
      <span className="text-body3 font-semibold text-content-muted">{t("items")}</span>

      {items.map((item, index) => (
        <div key={item.code} className="flex flex-col gap-1 rounded-sm bg-panel-hover p-2">
          <div className="flex items-center gap-1">
            <Input
              value={item.title ?? ""}
              aria-label={t("itemTitle")}
              placeholder={t("itemTitle")}
              onChange={(event) =>
                onChange(
                  items.map((entry, at) =>
                    at === index ? { ...entry, title: event.currentTarget.value } : entry,
                  ),
                )
              }
            />
            <button
              type="button"
              aria-label={t("removeItem")}
              onClick={() => onChange(items.filter((_, at) => at !== index))}
              className="rounded-sm p-1.5 text-content-faint hover:text-content"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
          <Textarea
            rows={2}
            value={item.description ?? ""}
            aria-label={t("itemDescription")}
            placeholder={t("itemDescription")}
            onChange={(event) =>
              onChange(
                items.map((entry, at) =>
                  at === index ? { ...entry, description: event.currentTarget.value } : entry,
                ),
              )
            }
          />
        </div>
      ))}

      <Button
        size="sm"
        variant="secondary"
        onClick={() => onChange([...items, { code: code(), title: "", description: "" }])}
      >
        <Plus className="size-4" aria-hidden="true" />
        {t("addItem")}
      </Button>
    </div>
  )
}

/**
 * Los botones de una sección.
 *
 * El destino de un botón de desplazamiento es **un desplegable de las secciones que están**, no un
 * campo de texto: el servidor rechaza un destino que no exista, y ofrecer un campo libre sería
 * dejar que alguien escriba uno inválido para enterarse al guardar.
 */
function Buttons({
  buttons,
  targets,
  onChange,
}: {
  buttons: readonly SectionButton[]
  targets: readonly SectionKind[]
  onChange: (buttons: readonly SectionButton[]) => void
}) {
  const t = useTranslations("websites.builder")

  const patch = (index: number, values: Partial<SectionButton>) =>
    onChange(buttons.map((entry, at) => (at === index ? { ...entry, ...values } : entry)))

  return (
    <div className="flex flex-col gap-2">
      <span className="text-body3 font-semibold text-content-muted">{t("buttons")}</span>

      {buttons.map((button, index) => (
        <div
          key={button.code}
          className="flex flex-wrap items-center gap-1 rounded-sm bg-panel-hover p-2"
        >
          <Input
            className="min-w-0 flex-1"
            value={button.label}
            aria-label={t("buttonLabel")}
            placeholder={t("buttonLabel")}
            onChange={(event) => patch(index, { label: event.currentTarget.value })}
          />

          <select
            value={button.action}
            aria-label={t("buttonAction")}
            onChange={(event) => {
              const action = event.currentTarget.value as SectionButton["action"]
              // Al cambiar de acción el destino anterior deja de significar nada: un ancla no es
              // una dirección. Se limpia en vez de arrastrarlo y que el guardado lo rechace.
              patch(index, { action, value: action === "scroll" ? (targets[0] ?? "") : "" })
            }}
            className="h-9 rounded-sm border border-field bg-panel px-2 text-body3 text-content"
          >
            <option value="link">{t("actions.link")}</option>
            <option value="scroll">{t("actions.scroll")}</option>
            <option value="app">{t("actions.app")}</option>
          </select>

          {button.action === "scroll" ? (
            <select
              value={button.value ?? ""}
              aria-label={t("buttonTarget")}
              onChange={(event) => patch(index, { value: event.currentTarget.value })}
              className="h-9 rounded-sm border border-field bg-panel px-2 text-body3 text-content"
            >
              {targets.map((target) => (
                <option key={target} value={target}>
                  {t(`kinds.${target}`)}
                </option>
              ))}
            </select>
          ) : (
            <Input
              className="min-w-0 flex-1"
              value={button.value ?? ""}
              aria-label={t("buttonValue")}
              placeholder={t("buttonValue")}
              onChange={(event) => patch(index, { value: event.currentTarget.value })}
            />
          )}

          <button
            type="button"
            aria-label={t("removeButton")}
            onClick={() => onChange(buttons.filter((_, at) => at !== index))}
            className="rounded-sm p-1.5 text-content-faint hover:text-content"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}

      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          onChange([
            ...buttons,
            { code: code(), label: t("newButton"), action: "link", value: "", variant: "filled" },
          ])
        }
      >
        <Plus className="size-4" aria-hidden="true" />
        {t("addButton")}
      </Button>
    </div>
  )
}

// ─── Ayudas ──────────────────────────────────────────────────────────────────

/**
 * Una sección mientras se edita, con una clave que sólo existe en el navegador.
 *
 * El modelo guarda las secciones como un arreglo **sin identidad por elemento** —y ésa es la razón
 * de que reordenar sea escribir el arreglo entero—, pero React necesita una clave estable y la
 * máquina del arrastre necesita saber qué fila se agarró. La posición no sirve para ninguna de las
 * dos cosas: es justo lo que está cambiando.
 *
 * Por eso la clave se genera aquí y **no se guarda**: no es un dato del sitio, es el nombre que
 * esta pantalla le pone a una fila mientras la mueve.
 */
interface Draft {
  readonly key: string
  readonly section: Section
}

function drafts(sections: readonly Section[]): readonly Draft[] {
  return sections.map((section) => ({ key: code(), section }))
}

/** Una sección nueva del tipo pedido, ya con título: una vacía no se distingue de un hueco. */
function blank(kind: SectionKind, title: string): Section {
  return { kind, show: true, position: 0, title, description: "" }
}

function labelOf(section: Section, t: (key: string) => string): string {
  return isSectionKind(section.kind) ? t(`kinds.${section.kind}`) : section.kind
}

/** Identifica un elemento dentro de su sección. Sólo tiene que ser distinto de sus hermanos. */
function code(): string {
  return crypto.randomUUID().slice(0, 8)
}
