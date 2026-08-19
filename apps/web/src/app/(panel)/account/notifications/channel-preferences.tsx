"use client"

import { Callout, Switch } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { api } from "~/lib/api.client.ts"

export interface Preference {
  category: string
  channel: string
  enabled: boolean
  editable: boolean
}

/**
 * Por qué canales quiero enterarme.
 *
 * Se guarda al cambiar, sin botón, como el resto de bloques que no mueven nada: apagar un aviso no
 * aparta equipo ni cobra dinero, así que confirmar sería pedir permiso para algo que se deshace
 * pulsando otra vez.
 *
 * **Un canal sin proveedor se enseña apagado y no editable**, con el motivo escrito. La alternativa
 * —ofrecerlo como si funcionara— es prometer avisos que nadie va a mandar, y quien los espere
 * dejará de mirar la bandeja porque «ya le llegan por correo».
 */
export function ChannelPreferences({
  preferences,
  available,
}: {
  preferences: readonly Preference[]
  available: readonly string[]
}) {
  const t = useTranslations()
  const [state, setState] = useState(preferences)
  const [failed, setFailed] = useState(false)

  const categories = [...new Set(state.map((preference) => preference.category))]
  const channels = [...new Set(state.map((preference) => preference.channel))]

  async function toggle(category: string, channel: string, enabled: boolean) {
    // Lo escrito se queda aunque falle: volver al valor anterior tira lo que la persona acaba de
    // decidir, que es la peor manera de contarle que hubo un problema.
    setState((previous) =>
      previous.map((preference) =>
        preference.category === category && preference.channel === channel
          ? { ...preference, enabled }
          : preference,
      ),
    )

    try {
      await api("/me/notification-preferences", {
        method: "PUT",
        body: { category, channel, enabled },
      })
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="space-y-4">
      {failed ? <Callout tone="danger">{t("notifications.preferences.failed")}</Callout> : null}

      {available.length < channels.length ? (
        <Callout tone="info">{t("notifications.preferences.noProvider")}</Callout>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-96 text-body2">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="py-2 pr-4 font-semibold text-content">
                {t("notifications.preferences.category")}
              </th>
              {channels.map((channel) => (
                <th key={channel} scope="col" className="px-3 py-2 font-semibold text-content">
                  {t(`notifications.channels.${channel}`)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {categories.map((category) => (
              <tr key={category} className="border-b border-line last:border-0">
                <th scope="row" className="py-3 pr-4 text-left font-medium text-content">
                  {t(`notifications.categories.${category}`)}
                </th>

                {channels.map((channel) => {
                  const preference = state.find(
                    (candidate) => candidate.category === category && candidate.channel === channel,
                  )
                  if (!preference) return <td key={channel} className="px-3 py-3" />

                  const usable = preference.editable && available.includes(channel)

                  return (
                    <td key={channel} className="px-3 py-3">
                      <Switch
                        checked={preference.enabled && (usable || preference.channel === "inbox")}
                        disabled={!usable}
                        // El nombre accesible va aquí porque la etiqueta visible es la cabecera de
                        // la columna, y una cabecera no basta: recorriendo la tabla con un lector de
                        // pantalla, el control se anuncia solo y hay que saber qué apaga.
                        aria-label={t("notifications.preferences.toggle", {
                          category: t(`notifications.categories.${category}`),
                          channel: t(`notifications.channels.${channel}`),
                        })}
                        onCheckedChange={(checked) => void toggle(category, channel, checked)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
