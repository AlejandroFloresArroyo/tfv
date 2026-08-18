import type { Metadata } from "next"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { AddressBook } from "~/components/addresses/address-book.tsx"
import { toSearchParams } from "~/components/collection/params.ts"
import { requireProfile } from "~/lib/session.ts"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("addresses.mine") }
}

/**
 * Libreta de direcciones de la persona.
 *
 * La misma pantalla que la de la empresa —`components/addresses`— con otro dueño. **Aquí no hay
 * permisos que consultar**: `addresses` dice que un usuario puede crear, consultar, modificar y
 * eliminar las suyas, y las rutas `/me/addresses` sólo piden sesión. Lo que impide ver las de otro
 * no es un permiso, es que la libreta cuelga de quien pregunta.
 */
export default async function MyAddressesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const query = toSearchParams(await searchParams)

  const path = (await headers()).get("x-pathname") ?? "/account/addresses"
  await requireProfile(path)

  return (
    <AddressBook
      book={{ kind: "user", base: "/me/addresses" }}
      title={t("addresses.mine")}
      subtitle={t("addresses.mineSubtitle")}
      emptyBody={t("addresses.mineEmptyBody")}
      query={query}
      permissions={{ create: true, edit: true, setPrimary: true, delete: true }}
    />
  )
}
