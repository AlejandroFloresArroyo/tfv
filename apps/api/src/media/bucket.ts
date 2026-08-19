/**
 * Dejar el depósito puesto, y comprobar que sirve.
 *
 * Ver `openspec/specs/media-storage/spec.md`. Rebanada 08.
 *
 * ## Qué se estaba arreglando
 *
 * `HALLAZGOS.md` H-136: el depósito local existía **porque alguien lo creó a mano**. No había
 * migración, ni guion, ni configuración que lo dejara puesto, así que en una máquina nueva la
 * primera subida fallaba, y desplegar exigía que alguien recordara un paso que no estaba escrito en
 * ninguna parte. Un paso no escrito es un paso que se olvida el día que lo hace otro.
 *
 * ## Las dos cosas de las que depende que una foto se vea
 *
 * **Lectura pública.** Las direcciones de los archivos se persisten en su fila y se reparten: acaban
 * incrustadas en documentos generados y en enlaces compartidos. Una dirección firmada caduca, así
 * que un documento emitido hace un mes enseñaría un hueco. El depósito sirve lectura pública, y lo
 * que no debe verse no se protege con la dirección.
 *
 * **CORS que admita `PUT` desde el origen de la aplicación.** El modelo es subida directa: quien
 * escribe es el navegador, no el servicio. El almacenamiento de hoy responde a cualquier origen
 * —resuelve CORS para todos sus depósitos a la vez— y un depósito de AWS recién creado no responde
 * a ninguno. Es decir: **sin CORS las subidas fallan en producción y funcionan en local**, que es el
 * peor modo de fallo que hay, porque no se descubre hasta que lo descubre un cliente.
 *
 * ## Por qué esto comprueba en vez de fiarse
 *
 * Porque lo que se puede declarar depende del proveedor y lo que hace falta no. El de hoy declara la
 * lectura pública en el propio depósito; en S3 es una política, y ponerla es cosa de la herramienta
 * del proveedor (ver `aws.ts`). Un informe que dijera «listo» leyendo lo que acaba de escribir sería
 * un informe sobre nuestra idea del almacenamiento. Así que la comprobación **mira desde donde mira
 * el navegador**: escribe un objeto con la autorización que se le daría a él, pide el preflight de
 * `PUT` contra la dirección a la que escribiría, y lee el resultado sin credencial ninguna. Eso vale
 * igual contra AWS que contra la pila local, y es lo que separa «debería servir» de «lo vi servir».
 *
 * ## Cuándo corre
 *
 * Al montar y al desplegar, no al arrancar el servicio: es idempotente y reparadora, pero cuesta
 * media docena de viajes contra el almacenamiento y ninguna petición debería esperarlos. La corre
 * `ensurePlaceholders` —que sin depósito no tiene dónde escribir— y por tanto la siembra, y se puede
 * correr sola con `pnpm --filter @tfv/api bucket`.
 */

import { env } from "../env.ts"
import type { StorageProvider } from "./provider.ts"
import { storageProvider } from "./storage.ts"
import { MAX_BYTES } from "./uploads.ts"

/** Bajo `sistema/`, que no es de ninguna empresa. Se retira en cuanto se ha leído. */
const PROBE_PREFIX = "sistema/comprobacion"

export interface BucketReport {
  readonly provider: string
  readonly bucket: string
  /** Si lo creó esta llamada. Falso significa que ya estaba. */
  readonly created: boolean
  /** Comprobada leyendo sin credencial un objeto recién escrito. Si no, esto no devuelve: lanza. */
  readonly publicRead: boolean
  /** Los orígenes desde los que el navegador puede escribir, comprobados con un preflight. */
  readonly cors: readonly string[]
  readonly notes: readonly string[]
}

export interface EnsureBucketOptions {
  /** El puesto, salvo en las pruebas, que ejercen los dos contra depósitos de un solo uso. */
  readonly provider?: StorageProvider | undefined
  /** De dónde escribe el navegador. Es la misma lista que ya declara la API en `CORS_ORIGINS`. */
  readonly origins?: readonly string[] | undefined
  readonly maxObjectBytes?: number | undefined
}

const BYTES = new Uint8Array([84, 70, 86])

/**
 * ¿Dejaría el navegador escribir aquí desde ese origen?
 *
 * Se pregunta con un preflight de verdad porque es lo que el navegador manda antes de un `PUT` con
 * cabeceras: si esta respuesta no trae el origen y el verbo, la subida no llega a intentarse. Un
 * depósito de S3 sin CORS responde `403` a esta misma petición.
 */
async function allowsWriteFrom(url: string, origin: string): Promise<boolean> {
  const response = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  })

  if (!response.ok) return false

  const allowedOrigin = response.headers.get("access-control-allow-origin")
  const allowedMethods = response.headers.get("access-control-allow-methods") ?? ""

  return (allowedOrigin === "*" || allowedOrigin === origin) && /put/i.test(allowedMethods)
}

/**
 * Deja el depósito puesto y comprueba que sirve para lo que se usa.
 *
 * Se planta —y no devuelve un informe con una casilla en falso— cuando algo de lo comprobado falla:
 * quien la corre es un guion de despliegue, y un guion que termina bien con el depósito privado deja
 * el fallo para el primer cliente que suba una foto.
 */
export async function ensureBucket(options: EnsureBucketOptions = {}): Promise<BucketReport> {
  const provider = options.provider ?? storageProvider()
  const origins = options.origins ?? env.CORS_ORIGINS
  const maxObjectBytes = options.maxObjectBytes ?? MAX_BYTES

  const setup = await provider.ensureBucket({ maxObjectBytes })

  const prefix = `${PROBE_PREFIX}/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const path = `${prefix}/sonda.txt`
  const authorization = await provider.authorizeWrite(path, "text/plain")

  try {
    const rechazados: string[] = []
    for (const origin of origins) {
      if (!(await allowsWriteFrom(authorization.url, origin))) rechazados.push(origin)
    }

    const written = await fetch(authorization.url, {
      method: "PUT",
      headers: authorization.headers,
      body: BYTES,
    })

    if (!written.ok) {
      throw new Error(
        `El depósito «${setup.bucket}» no admitió la escritura de comprobación ` +
          `(${written.status}). Sin eso no se puede subir nada: revisa la credencial del ` +
          "almacenamiento y que el depósito exista de verdad.",
      )
    }

    const read = await fetch(provider.publicUrl(path))

    if (!read.ok) {
      throw new Error(
        `El depósito «${setup.bucket}» no sirve **lectura pública**: el objeto recién escrito ` +
          `responde ${read.status} sin credencial. Las direcciones de los archivos se persisten y ` +
          "se reparten —acaban incrustadas en documentos generados—, así que no pueden ir firmadas: " +
          "una firmada caduca y rompería un documento emitido hace un mes. En S3 la lectura pública " +
          "es una política del depósito; `pnpm --filter @tfv/api bucket --aws` imprime las órdenes " +
          "que la ponen.",
      )
    }

    if (rechazados.length > 0) {
      throw new Error(
        `El depósito «${setup.bucket}» no admite escritura desde ${rechazados.join(", ")}: el ` +
          "preflight de `PUT` no la autoriza. El navegador escribe **directo** contra el " +
          "almacenamiento, así que sin CORS toda subida falla en producción y sigue funcionando en " +
          "local, donde el almacenamiento responde a cualquier origen. Los orígenes salen de " +
          "`CORS_ORIGINS`; en S3 se declaran en el depósito con `pnpm --filter @tfv/api bucket --aws`.",
      )
    }

    return {
      provider: provider.name,
      bucket: setup.bucket,
      created: setup.created,
      publicRead: true,
      cors: origins,
      notes: setup.notes,
    }
  } finally {
    // Se retira pase lo que pase: la sonda no es un archivo de nadie y dejarla sería basura con
    // nombre de sistema, que es la que después nadie se atreve a borrar. Y si retirarla falla, se
    // calla: sobre un depósito que acaba de fallar la comprobación, este error taparía el
    // diagnóstico con un síntoma suyo.
    await provider.removeObjects([prefix]).catch(() => undefined)
  }
}
