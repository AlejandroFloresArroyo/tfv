"use client"

/**
 * Los cuatro puertos de la máquina de subida, atados a esta aplicación.
 *
 * `packages/ui/src/lib/file-upload.ts` sabe **qué** hay que hacer —producir, autorizar, escribir,
 * confirmar— y no sabe de `fetch`, de direcciones ni de sesión: entran como dependencias. Aquí se
 * las damos, y por eso este archivo es corto y aquél tiene pruebas.
 *
 * ## Subir va **después** de crear la entidad
 *
 * Es la regla de `forms-and-wizards` y no una preferencia: la escritura va directa al
 * almacenamiento y puede fallar por su cuenta. Al revés —subir primero y guardar después— una foto
 * caída se lleva por delante los treinta campos que la persona acaba de escribir.
 *
 * ## Producir se memoriza
 *
 * Reducir una foto de doce megas a sus cuatro tamaños cuesta segundos de hilo principal. El
 * reintento vuelve a llamar a `prepare`, y sin memoria volvería a dibujarlas todas para reescribir
 * una miniatura.
 */

import {
  browserMedia,
  type FileKind,
  fileDerivatives,
  fileUpload,
  type PickedFile,
  type UploadAuthorization,
  type UploadPorts,
  type UploadResult,
  type UploadState,
  type UploadTarget,
  type UploadVariant,
} from "@tfv/ui"
import { api } from "./api.client.ts"

/** La respuesta de las dos rutas que autorizan: la que registra y la que vuelve a firmar. */
interface AuthorizationResponse {
  readonly upload: { readonly id: string; readonly kind: FileKind }
  readonly targets: readonly (UploadTarget & { readonly expiresAt: string })[]
}

/**
 * De la respuesta de la API a lo que la máquina entiende.
 *
 * La caducidad la trae **cada objeto** y la máquina lleva una por archivo, así que se queda con la
 * **más próxima**: quedarse con la más lejana daría por buenas firmas ya vencidas, y volver a
 * pedirlas tarde es lo que convierte una subida larga en una subida perdida.
 */
export function authorizationOf(response: AuthorizationResponse): UploadAuthorization {
  const expiries = response.targets
    .map((target) => Date.parse(target.expiresAt))
    .filter((value) => !Number.isNaN(value))

  return {
    uploadId: response.upload.id,
    kind: response.upload.kind,
    expiresAt: new Date(expiries.length === 0 ? Date.now() : Math.min(...expiries)).toISOString(),
    targets: response.targets.map((target) => ({
      variant: target.variant,
      method: target.method,
      url: target.url,
      headers: target.headers,
    })),
  }
}

/** Los archivos que terminaron, con el registro que les corresponde. */
export function uploadedIds(state: UploadState): readonly string[] {
  return state.files
    .filter((file) => file.phase === "done" && file.uploadId !== undefined)
    .map((file) => file.uploadId as string)
}

/** Si queda algo por subir o algo que reintentar. */
export function unfinished(state: UploadState): boolean {
  return state.files.some((file) => file.phase !== "done")
}

/**
 * Los puertos, para una selección concreta.
 *
 * La selección entra entera porque los puertos hablan por **identificador de archivo elegido**, que
 * es la clave del progreso y del reintento: el navegador no puede leer un `File` a partir de su
 * identificador, así que la correspondencia vive aquí.
 */
export function uploadPorts(companyId: string, files: readonly PickedFile[]): UploadPorts {
  const produced = new Map<string, ReadonlyMap<UploadVariant, Blob>>()

  const pick = (id: string): PickedFile => {
    const picked = files.find((one) => one.id === id)
    if (picked === undefined) throw new Error(`el archivo ${id} ya no está en la selección`)
    return picked
  }

  return {
    async prepare(id) {
      const memorized = produced.get(id)
      if (memorized !== undefined) return memorized

      const picked = pick(id)
      const objects = await browserMedia.prepareObjects(
        picked.file,
        picked.kind,
        fileDerivatives.plannedVariants(picked.kind),
      )

      produced.set(id, objects)
      return objects
    },

    async authorize(id) {
      const picked = pick(id)
      const body = fileUpload.requestFor({
        fileName: picked.file.name,
        byteSize: picked.file.size,
        contentType: picked.contentType,
      })

      return authorizationOf(
        await api<AuthorizationResponse>(`/companies/${companyId}/uploads`, {
          method: "POST",
          body,
        }),
      )
    },

    async reissue(uploadId) {
      return authorizationOf(
        await api<AuthorizationResponse>(`/companies/${companyId}/uploads/${uploadId}/targets`, {
          method: "POST",
          body: {},
        }),
      )
    },

    async send(target, body) {
      // Va directo al almacenamiento y **sin cookies**: el permiso viaja dentro de la dirección, y
      // mandar las credenciales de la aplicación a otro origen sería regalarlas.
      const response = await fetch(target.url, {
        method: target.method,
        headers: { ...target.headers },
        body,
      })

      if (!response.ok)
        throw new Error(`el almacenamiento rechazó la escritura (${response.status})`)
    },

    async confirm(uploadId, result: UploadResult) {
      await api(`/companies/${companyId}/uploads/${uploadId}/confirm`, {
        method: "POST",
        body: result,
      })
    },
  }
}

/**
 * Qué mandar en la columna de imagen única después de subir.
 *
 * Tres respuestas y no dos, y la tercera es la que importa: **nada**. Omitir el campo deja la
 * imagen como está; mandar `null` la retira. Confundirlos hace que guardar el nombre de un almacén
 * le borre la foto, que es un efecto que nadie relaciona con lo que acaba de hacer.
 */
export function imagePatch(
  uploaded: readonly string[],
  removed: boolean,
  hadImage: boolean,
): { readonly imageUploadId: string | null } | undefined {
  const fresh = uploaded[0]
  if (fresh !== undefined) return { imageUploadId: fresh }
  if (removed && hadImage) return { imageUploadId: null }
  return undefined
}

/**
 * Marca como fallido el registro de un archivo que se quitó a medias.
 *
 * Sin esto, quitar una foto que falló deja el registro pendiente hasta que la recolección lo barra.
 * No se espera ni se propaga el fallo: es limpieza, y hacerla ruidosa interrumpiría a quien acaba
 * de decir que ya no quiere esa foto.
 */
export function abandonUpload(companyId: string, uploadId: string): void {
  void api(`/companies/${companyId}/uploads/${uploadId}/confirm`, {
    method: "POST",
    body: { failed: true, reason: "abandoned" },
  }).catch(() => undefined)
}
