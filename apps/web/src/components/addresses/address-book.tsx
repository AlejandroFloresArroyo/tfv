import { Badge, ItemCard } from "@tfv/ui"
import { MapPin } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Collection, type PageEnvelope } from "~/components/collection/collection.tsx"
import { type FilterSpec, toApiQuery } from "~/components/collection/params.ts"
import { PageShell } from "~/components/page-shell.tsx"
import { apiGet } from "~/lib/api.server.ts"
import { type AddressSummary, type Book, describe } from "./address.ts"
import { AddressActions, CreateAddress } from "./address-actions.tsx"

/** Quién puede qué en esta libreta. La de una persona son cuatro veces «sí». */
export interface AddressPermissions {
  readonly create: boolean
  readonly edit: boolean
  readonly setPrimary: boolean
  readonly delete: boolean
}

/**
 * La libreta de direcciones, entera, para cualquiera de sus dos dueños.
 *
 * `addresses` especifica las dos juntas porque son la misma: los mismos campos, la misma regla de
 * la primaria y el mismo selector en mapa; «la única diferencia es de quién cuelgan y quién puede
 * verlas». Así que aquí también son una sola pantalla, y lo que cambia viaja como dato: el camino
 * de la API en `book`, y quién puede qué en `permissions`.
 *
 * La alternativa era copiar la pantalla de empresa bajo `/account`. Dos copias de la regla de la
 * primaria divergen a la tercera corrección, y la que divergiera aquí lo haría sobre el domicilio
 * al que llegan las compras de alguien.
 *
 * **La primaria va primero, y es orden del servidor.** Subirla en memoria dejaría de funcionar en
 * cuanto la libreta pase de una página: la primaria puede estar en la novena, y subirla dentro de
 * la primera la pondría primera entre las que no lo son.
 */
export async function AddressBook({
  book,
  title,
  subtitle,
  emptyBody,
  query,
  permissions,
}: {
  book: Book
  title: string
  subtitle: string
  /** Para qué sirven, dicho en el idioma de quien las tiene: no envía lo mismo una empresa. */
  emptyBody: string
  /** Los parámetros de la pantalla, ya convertidos. */
  query: URLSearchParams
  permissions: AddressPermissions
}) {
  const t = await getTranslations()
  const result = await apiGet<PageEnvelope<AddressSummary>>(`${book.base}?${toApiQuery(query)}`)

  const filters: FilterSpec[] = [
    {
      kind: "boolean",
      key: "isPrimary",
      label: t("addresses.primary"),
      trueLabel: t("addresses.onlyPrimary"),
      falseLabel: t("addresses.exceptPrimary"),
    },
    { kind: "text", key: "city", label: t("addresses.city") },
  ]

  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      actions={permissions.create ? <CreateAddress book={book} /> : undefined}
    >
      <Collection
        params={query}
        result={result}
        filters={filters}
        searchPlaceholder={t("addresses.searchPlaceholder")}
        emptyTitle={t("addresses.empty")}
        emptyBody={emptyBody}
        emptyAction={permissions.create ? <CreateAddress book={book} /> : undefined}
      >
        {(items, view) =>
          items.map((address) => (
            <ItemCard
              key={address.id}
              view={view}
              media={
                <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-panel-hover text-content-muted">
                  <MapPin className="size-4" aria-hidden="true" />
                </span>
              }
              title={address.label || describe(address)}
              subtitle={address.label ? describe(address) : undefined}
              meta={
                <>
                  {address.isPrimary ? <Badge tone="accent">{t("addresses.primary")}</Badge> : null}
                  <span className="text-body3 text-content-faint">
                    {[address.state, address.postalCode].filter(Boolean).join(" · ")}
                  </span>
                </>
              }
              actions={
                <AddressActions
                  book={book}
                  address={address}
                  canEdit={permissions.edit}
                  canSetPrimary={permissions.setPrimary}
                  canDelete={permissions.delete}
                />
              }
            />
          ))
        }
      </Collection>
    </PageShell>
  )
}
