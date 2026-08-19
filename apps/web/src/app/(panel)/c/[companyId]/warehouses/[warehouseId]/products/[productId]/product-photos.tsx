"use client"

import { Button, Callout } from "@tfv/ui"
import { ArrowDown, ArrowUp, Star, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { FormDialog } from "~/components/form-dialog.tsx"
import { Photo } from "~/components/photo.tsx"
import { PhotoPicker, usePhotoUploads } from "~/components/photo-picker.tsx"
import { ApiError, api } from "~/lib/api.client.ts"
import { add, type Gallery, move, remove, setCover, toBody } from "~/lib/gallery.ts"
import type { ProductDetail } from "../../../warehouse.ts"

/**
 * Las fotos de un producto, en su propio diálogo.
 *
 * La ficha reparte la edición en un diálogo por bloque, y éste es el de las fotos. Lo que decide
 * algo —mover, quitar, qué portada queda— vive en `~/lib/gallery.ts` con sus pruebas; aquí sólo se
 * conectan los eventos, que es el reparto de `AmountInput` y del asistente.
 *
 * ## El orden de las tres cosas que pasan al guardar
 *
 * 1. **Se suben las fotos nuevas.** Después de que el producto exista, nunca antes.
 * 2. **Se envía la colección entera**, en su orden y con su portada. El servidor diferencia: lo que
 *    no vaya, deja de estar, y sus archivos se eliminan. Ver `apps/api/src/media/collections.ts`.
 * 3. Si alguna subida falló, **no se cierra**: lo guardado es lo que sí llegó, y las que fallaron
 *    se quedan con su botón de reintentar. Dar la operación por buena escondería el fallo, y
 *    revertirla tiraría las que sí subieron.
 */
export function EditPhotos({
  companyId,
  path,
  product,
  open,
  onOpenChange,
}: {
  companyId: string
  path: string
  product: ProductDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const uploads = usePhotoUploads(companyId)
  const { reset } = uploads

  const [gallery, setGallery] = useState<Gallery>(() => galleryOf(product))

  // Al abrir se parte de lo que hay guardado. Sin esto, cerrar sin guardar deja lo tocado dentro
  // para la próxima vez, que es una galería que dice una cosa y un producto que dice otra.
  useEffect(() => {
    if (!open) return
    setGallery(galleryOf(product))
    reset()
  }, [open, product, reset])

  async function save() {
    const outcome = await uploads.run()

    // Las recién subidas entran sin dirección: el navegador no la conoce hasta que el servidor
    // responde. Por eso la galería se rehace **con la respuesta** y no con esto, que sólo sirve
    // para componer el cuerpo — pintar una dirección vacía es un hueco roto y una descarga inútil.
    const next = add(
      gallery,
      outcome.uploaded.map((uploadId) => ({ uploadId, url: "", thumbnailUrl: null })),
    )

    // Se guarda lo que sí llegó **antes** de avisar de lo que no: revertir por una foto caída
    // tiraría las que sí subieron, y darlo todo por bueno escondería el fallo.
    const saved = await api<ProductDetail>(`${path}/images`, {
      method: "PUT",
      body: toBody(next),
    })
    setGallery(galleryOf(saved))

    // `207 Multi-Status` dicho en voz alta: parte llegó y parte no. Se lanza como error del
    // contrato porque es lo que el diálogo sabe enseñar tal cual; un `Error` pelado saldría como
    // «problema de red», que no es lo que pasó.
    if (outcome.failed > 0) {
      throw new ApiError(207, t("media.gallery.someFailed", { count: outcome.failed }))
    }
    uploads.setFiles([])
  }

  return (
    <FormDialog
      title={t("warehouses.products.editPhotos")}
      description={t("warehouses.products.photosBody")}
      submitLabel={t("common.save")}
      size="md"
      open={open}
      onOpenChange={onOpenChange}
      action={save}
    >
      {() => (
        <div className="flex flex-col gap-4">
          {gallery.photos.length === 0 ? (
            <Callout>{t("media.gallery.empty")}</Callout>
          ) : (
            <ul className="flex flex-col gap-2">
              {gallery.photos.map((photo, index) => (
                <li
                  key={photo.uploadId}
                  className="flex items-center gap-3 rounded-sm border border-line bg-panel p-2"
                >
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xs bg-panel-sunken">
                    {/* Sin texto alternativo: el nombre no lo tiene la galería, y repetir «foto
                        del producto» doce veces es ruido para quien la escucha. */}
                    <Photo
                      src={photo.thumbnailUrl ?? photo.url}
                      className="size-full object-cover"
                    />
                  </span>

                  <span className="min-w-0 flex-1 text-body3 text-content-muted tabular-nums">
                    {gallery.cover === photo.uploadId
                      ? t("media.gallery.isCover")
                      : t("media.gallery.position", { position: index + 1 })}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("media.gallery.makeCover")}
                    aria-pressed={gallery.cover === photo.uploadId}
                    disabled={gallery.cover === photo.uploadId}
                    onClick={() => setGallery(setCover(gallery, photo.uploadId))}
                  >
                    <Star
                      aria-hidden="true"
                      className={gallery.cover === photo.uploadId ? "size-4 text-accent" : "size-4"}
                    />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("media.gallery.moveUp")}
                    disabled={index === 0}
                    onClick={() => setGallery(move(gallery, photo.uploadId, -1))}
                  >
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("media.gallery.moveDown")}
                    disabled={index === gallery.photos.length - 1}
                    onClick={() => setGallery(move(gallery, photo.uploadId, 1))}
                  >
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("media.gallery.removePhoto")}
                    onClick={() => setGallery(remove(gallery, photo.uploadId))}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <PhotoPicker uploads={uploads} />
        </div>
      )}
    </FormDialog>
  )
}

function galleryOf(product: ProductDetail): Gallery {
  return {
    photos: product.images.map((image) => ({
      uploadId: image.uploadId,
      url: image.url,
      thumbnailUrl: image.thumbnailUrl,
    })),
    cover: product.images.find((image) => image.isCover)?.uploadId ?? null,
  }
}
