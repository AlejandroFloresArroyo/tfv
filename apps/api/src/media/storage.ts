/**
 * El almacenamiento de objetos, visto desde el servicio.
 *
 * Ver `openspec/specs/media-storage/spec.md`. Lo único que hace este módulo es **elegir proveedor**
 * y prestarle las tres operaciones al resto del sistema: firmar la escritura de un objeto, componer
 * su dirección de lectura y retirar objetos. Los bytes no pasan por aquí.
 *
 * La cuarta operación del proveedor —dejar puesto el depósito— no se presta desde aquí: no está en
 * el camino de datos, corre al montar y quien la usa es `bucket.ts`, que además comprueba que el
 * depósito sirve para lo que se usa.
 *
 * ## Por qué hay una costura y no una implementación
 *
 * Porque el destino cambia y el resto del sistema no debería enterarse. `uploads.ts` y
 * `collections.ts` llaman a estas tres funciones y no saben —ni deben— si detrás hay una API HTTP o
 * una firma SigV4. La interfaz está en `provider.ts` y las implementaciones en `providers/`; lo que
 * elige es `STORAGE_PROVIDER`.
 *
 * **Lo que se despliega hoy no cambia.** La variable llega valiendo `supabase`, que es el de
 * siempre. Que exista otro no es lo mismo que ponerlo — y ponerlo tampoco basta: las direcciones de
 * lectura están persistidas, y mudarse exige reescribirlas con `scripts/rewrite-media-urls.ts`.
 *
 * ## Se elige una vez
 *
 * El proveedor se construye en la primera llamada y se conserva. No por ahorro —construirlo es leer
 * configuración— sino porque **el proveedor tiene que ser el mismo durante toda la vida del
 * proceso**: uno que cambiara a mitad dejaría direcciones de dos almacenamientos distintos en filas
 * escritas con minutos de diferencia, y averiguar cuál es cuál después no se puede.
 */

import { env } from "../env.ts"
import type { StorageProvider, WriteAuthorization } from "./provider.ts"
import { createS3Provider } from "./providers/s3.ts"
import { createSupabaseProvider } from "./providers/supabase.ts"

export type { StorageProvider, WriteAuthorization } from "./provider.ts"

let current: StorageProvider | undefined

function build(): StorageProvider {
  if (env.STORAGE_PROVIDER === "s3") {
    return createS3Provider({
      bucket: env.STORAGE_BUCKET,
      region: env.STORAGE_S3_REGION,
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
      endpoint: env.STORAGE_S3_ENDPOINT,
      publicUrl: env.STORAGE_S3_PUBLIC_URL,
      expiresInSeconds: env.STORAGE_S3_EXPIRES_SECONDS,
    })
  }

  return createSupabaseProvider({
    url: env.STORAGE_URL,
    bucket: env.STORAGE_BUCKET,
    serviceKey: env.STORAGE_SERVICE_KEY,
  })
}

/** El proveedor puesto. Lo usan las tres funciones de abajo y la prueba de contrato. */
export function storageProvider(): StorageProvider {
  current ??= build()
  return current
}

/** Autoriza a escribir **ese** objeto y ninguno más. */
export function authorizeWrite(path: string, contentType: string): Promise<WriteAuthorization> {
  return storageProvider().authorizeWrite(path, contentType)
}

/** Dirección pública de lectura de un objeto ya escrito. */
export function publicUrl(path: string): string {
  return storageProvider().publicUrl(path)
}

/**
 * Borra del almacenamiento todo lo que cuelga de esos prefijos.
 *
 * La usan la sustitución de archivos y el recolector de subidas abandonadas.
 */
export function removeObjects(prefixes: readonly string[]): Promise<void> {
  return storageProvider().removeObjects(prefixes)
}
