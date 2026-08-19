/**
 * La galería de un producto, como lista que se ordena.
 *
 * Todo lo que decide algo vive aquí y no en el componente: mover una foto, quitarla y saber cuál
 * queda de portada son las tres cosas que se pueden hacer mal, y las tres se pueden probar sin
 * montar un navegador. Es el reparto de `packages/ui/src/lib/wizard.ts` y `file-upload.ts`.
 *
 * **La portada es una elección, no la primera posición.** Reordenar no la cambia; quitar la que lo
 * era sí, y entonces pasa a la primera que quede — porque un producto con fotos y sin portada
 * obligaría a cada listado a inventarse cuál enseñar.
 */

export interface GalleryPhoto {
  readonly uploadId: string
  readonly url: string
  /** El derivado de celda. Nulo cuando el navegador que la subió no supo producirlo. */
  readonly thumbnailUrl: string | null
}

export interface Gallery {
  readonly photos: readonly GalleryPhoto[]
  readonly cover: string | null
}

/** Mueve una foto un puesto. Fuera de los extremos no pasa nada, que es lo que se espera. */
export function move(gallery: Gallery, uploadId: string, direction: -1 | 1): Gallery {
  const from = gallery.photos.findIndex((photo) => photo.uploadId === uploadId)
  if (from === -1) return gallery

  const to = from + direction
  if (to < 0 || to >= gallery.photos.length) return gallery

  const photos = [...gallery.photos]
  const moved = photos[from]
  const displaced = photos[to]
  if (moved === undefined || displaced === undefined) return gallery

  photos[to] = moved
  photos[from] = displaced

  return { ...gallery, photos }
}

/** Quita una foto. Si era la portada, la hereda la primera que quede. */
export function remove(gallery: Gallery, uploadId: string): Gallery {
  const photos = gallery.photos.filter((photo) => photo.uploadId !== uploadId)
  return { photos, cover: coverAfter(photos, gallery.cover) }
}

/** Añade fotos al final, sin repetir. La primera de todas se lleva la portada si no había. */
export function add(gallery: Gallery, photos: readonly GalleryPhoto[]): Gallery {
  const present = new Set(gallery.photos.map((photo) => photo.uploadId))
  const fresh = photos.filter((photo) => !present.has(photo.uploadId))
  const all = [...gallery.photos, ...fresh]

  return { photos: all, cover: coverAfter(all, gallery.cover) }
}

/** Elegir portada. Elegir una que no está no cambia nada. */
export function setCover(gallery: Gallery, uploadId: string): Gallery {
  if (!gallery.photos.some((photo) => photo.uploadId === uploadId)) return gallery
  return { ...gallery, cover: uploadId }
}

/**
 * Qué portada queda.
 *
 * La elegida mientras siga en la lista; si no, la primera; y si no queda ninguna foto, ninguna.
 */
export function coverAfter(photos: readonly GalleryPhoto[], cover: string | null): string | null {
  if (photos.length === 0) return null
  if (cover !== null && photos.some((photo) => photo.uploadId === cover)) return cover
  return photos[0]?.uploadId ?? null
}

/** El cuerpo que la API espera: la colección entera, en su orden, y cuál es la portada. */
export function toBody(gallery: Gallery): {
  uploadIds: string[]
  coverUploadId: string | null
} {
  return {
    uploadIds: gallery.photos.map((photo) => photo.uploadId),
    coverUploadId: gallery.cover,
  }
}
