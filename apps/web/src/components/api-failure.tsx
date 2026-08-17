import { Callout, Panel } from "@tfv/ui"
import { getTranslations } from "next-intl/server"
import type { ApiResult } from "~/lib/api.server.ts"

/**
 * Qué se pinta cuando la API no devuelve lo que la pantalla pedía.
 *
 * Distingue **la falta de permiso del fallo**, y la distinción no es cosmética. Un `403` no es un
 * error: es la respuesta correcta a una pregunta que esta persona no puede hacer. Presentarlo como
 * «algo salió mal» le hace reintentar, recargar y acabar escribiendo a soporte por un sistema que
 * está funcionando exactamente como debe.
 *
 * La navegación oculta lo que el rol no permite, así que llegar aquí significa que alguien escribió
 * la dirección, siguió un enlace viejo, o le acaban de cambiar el rol con la pantalla abierta. Los
 * tres merecen que se les diga qué pasa.
 */
export async function ApiFailure({
  result,
}: {
  result: Extract<ApiResult<unknown>, { ok: false }>
}) {
  const t = await getTranslations()

  if (result.status === 403) {
    return (
      <Panel className="p-6">
        <p className="text-title2 font-bold text-content">{t("errors.noAccess.title")}</p>
        <p className="mt-1.5 max-w-prose text-body1 text-content-muted">
          {t("errors.noAccess.body")}
        </p>
      </Panel>
    )
  }

  // El detalle del fallo no se enseña: sale del servidor y puede describir su interior. Lo que se
  // enseña es que falló y que se puede reintentar.
  return <Callout tone="danger">{t("common.unexpectedError")}</Callout>
}
