import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

/**
 * El origen real de la API. Sólo lo usa el servidor de Next: el navegador nunca lo ve.
 *
 * El navegador habla siempre con `/api/*` de su propio origen, y este proceso reenvía. Es lo que
 * evita el envío entre orígenes y, con él, la clase entera de problemas de cookies que aparece
 * cuando la aplicación y la API viven en dominios distintos.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:5000"

const config: NextConfig = {
  reactStrictMode: true,

  /**
   * La raíz del espacio de trabajo.
   *
   * Sin declararla, el empaquetador la deduce buscando el fichero de bloqueo más cercano y avisa de
   * que no está seguro. El síntoma no es un error de compilación: son **trozos de cliente
   * incoherentes** —«module factory is not available»— que aparecen en una pestaña nueva y se
   * arreglan recargando, así que parecen cosa del navegador.
   */
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },

  // Las convenciones de este repositorio viven en `openspec/` y en `IMPLEMENTATION.md`. Que la
  // herramienta escriba las suyas encima sólo crea un segundo sitio donde mirar, y desactualizado.
  agentRules: false,

  /**
   * Orígenes admitidos por el servidor de desarrollo.
   *
   * En desarrollo, Next sirve su paquete de cliente sólo a los orígenes que reconoce. Entrando por
   * `127.0.0.1` —que es lo que hace cualquier herramienta que no resuelva nombres— la petición se
   * rechaza y **la página no hidrata**: se pinta entera, se ve bien, y ningún botón responde.
   *
   * Cuesta de diagnosticar precisamente porque no falla nada visible. Sólo afecta a desarrollo.
   */
  allowedDevOrigins: ["127.0.0.1"],

  // Los paquetes del espacio de trabajo se consumen como fuente TypeScript, sin paso de emisión.
  transpilePackages: ["@tfv/ui"],

  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }]
  },
}

export default createNextIntlPlugin("./src/i18n/request.ts")(config)
