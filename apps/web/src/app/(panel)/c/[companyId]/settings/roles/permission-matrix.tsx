"use client"

import { Checkbox, cn, Input } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { useId, useMemo, useState } from "react"

export interface Catalog {
  /** `servicio → recurso → acciones`, tal y como lo sirve el servidor. */
  services: Record<string, Record<string, string[]>>
  total: number
}

/**
 * La matriz de permisos.
 *
 * Ver `access-control`: «La interfaz construye la matriz desde el catálogo del servidor». Ésta es
 * la pantalla para la que ese requisito existe, y la que justifica que el catálogo se publique.
 *
 * ## Por qué las claves no tienen etiqueta
 *
 * El catálogo trae identificadores, no palabras: la interfaz es bilingüe y fijar un idioma en el
 * servidor obligaría a deshacerlo. Así que se muestran las claves tal cual, agrupadas por servicio
 * y recurso, y el nombre del recurso hace de encabezado.
 *
 * Es menos bonito que «Crear productos» y tiene una ventaja que no es menor: **lo que se ve es
 * exactamente lo que se guarda**. Cuando alguien reporte que un permiso no funciona, la clave del
 * mensaje y la de la pantalla son la misma cadena. Traducirlas es trabajo de la 29, y hasta
 * entonces esto es honesto en lugar de aproximado.
 *
 * ## Tres estados por grupo, no dos
 *
 * La casilla de cada recurso gobierna sus acciones y sabe quedarse a medias. Sin el estado
 * intermedio, un grupo con tres de cinco marcadas se pintaría como vacío o como lleno, y las dos
 * cosas son mentira.
 */
export function PermissionMatrix({
  catalog,
  defaultValue,
  name = "permissions",
}: {
  catalog: Catalog
  defaultValue: readonly string[]
  name?: string
}) {
  const t = useTranslations()
  const searchId = useId()

  const [granted, setGranted] = useState<ReadonlySet<string>>(new Set(defaultValue))
  const [query, setQuery] = useState("")

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return Object.entries(catalog.services).flatMap(([service, resources]) =>
      Object.entries(resources)
        .map(([resource, actions]) => ({
          service,
          resource,
          keys: actions
            .map((action) => `${service}.${resource}.${action}`)
            .filter((key) => needle === "" || key.toLowerCase().includes(needle)),
        }))
        .filter((group) => group.keys.length > 0),
    )
  }, [catalog.services, query])

  function toggle(keys: readonly string[], on: boolean) {
    setGranted((current) => {
      const next = new Set(current)
      for (const key of keys) {
        if (on) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* El valor viaja como campos repetidos: `FormData.getAll` los devuelve como lista sin que
          haya que serializar nada a mano. */}
      {[...granted].map((key) => (
        <input key={key} type="hidden" name={name} value={key} />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body3 text-content-faint">{t("roles.permissionsHint")}</p>
        <span className="text-body3 font-semibold text-content">
          {t("roles.allOf", { count: granted.size, total: catalog.total })}
        </span>
      </div>

      <Input
        id={searchId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("roles.searchPlaceholder")}
        aria-label={t("roles.searchPlaceholder")}
      />

      <div className="max-h-90 overflow-y-auto rounded-sm border border-line">
        {groups.length === 0 ? (
          <p className="p-4 text-body2 text-content-faint">{t("roles.noMatches")}</p>
        ) : (
          groups.map((group) => {
            const on = group.keys.filter((key) => granted.has(key)).length
            const state = on === 0 ? false : on === group.keys.length ? true : "indeterminate"

            return (
              <fieldset
                key={`${group.service}.${group.resource}`}
                className="border-0 border-b border-line p-3 last:border-0"
              >
                <legend className="sr-only">{`${group.service}.${group.resource}`}</legend>

                <Checkbox
                  id={`${group.service}-${group.resource}`}
                  checked={state}
                  onCheckedChange={(value) => toggle(group.keys, value === true)}
                  label={`${group.service}.${group.resource}`}
                  hint={t("roles.allOf", { count: on, total: group.keys.length })}
                />

                <div className="mt-2 grid gap-1.5 pl-7 tablet:grid-cols-2">
                  {group.keys.map((key) => (
                    <Checkbox
                      key={key}
                      id={key}
                      checked={granted.has(key)}
                      onCheckedChange={(value) => toggle([key], value === true)}
                      label={key.split(".")[2] ?? key}
                      className={cn(granted.has(key) && "border-accent")}
                    />
                  ))}
                </div>
              </fieldset>
            )
          })
        )}
      </div>
    </div>
  )
}
