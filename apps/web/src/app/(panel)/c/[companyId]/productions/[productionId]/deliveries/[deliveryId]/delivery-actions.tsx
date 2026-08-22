"use client"

import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
  type PickedFile,
  SignaturePad,
  type SignaturePadHandle,
} from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useRef, useState } from "react"
import { ConfirmDestructive } from "~/components/confirm-destructive.tsx"
import { FormDialog } from "~/components/form-dialog.tsx"
import { usePhotoUploads } from "~/components/photo-picker.tsx"
import { text } from "~/components/use-submit.ts"
import { ApiError, api } from "~/lib/api.client.ts"
import type { DeliveryRow, ItemRow } from "../../../production.ts"

/**
 * Los pasos de una nota: componer, cerrar, cancelar, firmar y dar de baja.
 *
 * Cada uno es su propia operación con su propio permiso, igual que en el servidor. No hay un
 * desplegable de estado: componer, cerrar y cancelar tienen reglas distintas, y un solo control que
 * los hiciera los tres los haría con la comprobación de ninguno.
 *
 * ## El cierre dice lo que va a pasar antes de que pase
 *
 * Es la voz del sistema (`PRODUCT.md`): «Los ocho artículos quedarán entregados». Cerrar una nota
 * mueve inventario de verdad, y quien lo pulsa tiene que saberlo **antes**, no descubrirlo al ver
 * ocho artículos cambiados de estado.
 *
 * Y el rechazo por líneas pendientes llega del servidor con **la cuenta dentro del mensaje**. Se
 * pinta tal cual: «Faltan 3 piezas por verificar» es accionable; «no se pudo completar» no.
 *
 * ## Las firmas no bloquean el cierre, y la pantalla lo dice
 *
 * Es la decisión de producto que gobierna esta rebanada: en un set se firma en papel
 * constantemente, y una nota que no se pudiera cerrar sin firma dejaría artículos atrapados en
 * «entregado» para siempre. Así que se cierra con las piezas verificadas y **firmar es un paso
 * aparte, después**, que puede no llegar nunca.
 *
 * Lo que sí es definitivo: una vez escrita, la firma no se corrige. El diálogo lo advierte antes,
 * y el servidor responde `409` si alguien lo intenta igual.
 *
 * ## El trazo se sube antes de escribir la firma, y si falla no se pierde la firma
 *
 * Al revés de la regla general —subir después de guardar—, y por una razón concreta: aquí lo que se
 * guarda es un solo nombre, no treinta campos. Si el almacenamiento falla, se ofrece registrar la
 * firma **sin el trazo**: el documento seguirá diciendo quién recibió y cuándo, que es más de lo
 * que la nota tenía antes. Perder eso por una subida caída sería el peor de los dos resultados.
 */

export function ComposeDelivery({
  companyId,
  productionId,
  delivery,
  items,
}: {
  companyId: string
  productionId: string
  delivery: DeliveryRow
  items: readonly ItemRow[]
}) {
  const t = useTranslations("productions.deliveries")

  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(delivery.lines.map((line) => line.itemId)),
  )

  function toggle(itemId: string, on: boolean) {
    setChosen((previous) => {
      const next = new Set(previous)
      if (on) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="secondary">{t("compose")}</Button>
        </DialogTrigger>
      }
      title={t("composeTitle")}
      description={t("composeBody")}
      submitLabel={t("composeConfirm")}
      size="lg"
      action={async () => {
        await api(
          `/companies/${companyId}/productions/${productionId}/deliveries/${delivery.id}/items`,
          { method: "PUT", body: { itemIds: [...chosen] } },
        )
      }}
    >
      {() =>
        items.length === 0 ? (
          <Callout tone="warning">{t("composeNoItems")}</Callout>
        ) : (
          <>
            <p className="text-body2 text-content-muted tabular-nums">
              {t("composeChosen", { count: chosen.size })}
            </p>

            <ul className="max-h-[22rem] overflow-y-auto rounded-lg border border-edge">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5 not-last:border-edge not-last:border-b"
                >
                  <Checkbox
                    checked={chosen.has(item.id)}
                    onCheckedChange={(checked) => toggle(item.id, checked === true)}
                    aria-label={item.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-body2 text-content">
                    {item.name}
                  </span>
                  <span className="shrink-0 font-mono text-body3 text-content-faint">
                    {item.code}
                  </span>
                </li>
              ))}
            </ul>

            <Callout tone="info">{t("composeKeepsVerified")}</Callout>
          </>
        )
      }
    </FormDialog>
  )
}

export function CompleteDelivery({
  companyId,
  productionId,
  delivery,
}: {
  companyId: string
  productionId: string
  delivery: DeliveryRow
}) {
  const t = useTranslations("productions.deliveries")
  const ready = delivery.counts.pending === 0 && delivery.counts.total > 0

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button disabled={!ready}>{t("complete")}</Button>
        </DialogTrigger>
      }
      title={t("completeTitle")}
      description={
        delivery.direction === "outbound"
          ? t("completeBodyOut", { count: delivery.counts.total })
          : t("completeBodyIn", { count: delivery.counts.total })
      }
      submitLabel={t("completeConfirm")}
      action={async () => {
        await api(
          `/companies/${companyId}/productions/${productionId}/deliveries/${delivery.id}/completion`,
          { method: "POST" },
        )
      }}
    >
      {() => <Callout tone="info">{t("signatureIsLater")}</Callout>}
    </FormDialog>
  )
}

export function CancelDelivery({
  companyId,
  productionId,
  delivery,
}: {
  companyId: string
  productionId: string
  delivery: DeliveryRow
}) {
  const t = useTranslations("productions.deliveries")

  return (
    <FormDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="secondary">{t("cancel")}</Button>
        </DialogTrigger>
      }
      title={t("cancelTitle")}
      description={t("cancelBody", { name: delivery.name })}
      submitLabel={t("cancelConfirm")}
      action={async () => {
        await api(
          `/companies/${companyId}/productions/${productionId}/deliveries/${delivery.id}/cancellation`,
          { method: "POST" },
        )
      }}
    >
      {() => <Callout tone="info">{t("cancelKeepsItems")}</Callout>}
    </FormDialog>
  )
}

export function DeleteDelivery({
  companyId,
  productionId,
  delivery,
}: {
  companyId: string
  productionId: string
  delivery: DeliveryRow
}) {
  const t = useTranslations("productions.deliveries")
  const router = useRouter()

  const cascade = [t("deleteCascadeLines", { count: delivery.counts.total })]
  if (delivery.status === "completed" && delivery.direction === "outbound") {
    cascade.push(t("deleteCascadeReturns"))
  }
  if (delivery.isSigned) cascade.push(t("deleteCascadeSignature"))

  return (
    <ConfirmDestructive
      trigger={
        <DialogTrigger asChild>
          <Button variant="ghost" className="text-tinta-alto">
            {t("delete")}
          </Button>
        </DialogTrigger>
      }
      title={t("deleteTitle")}
      entity={delivery.name}
      cascade={cascade}
      confirmLabel={t("delete")}
      action={async () => {
        await api(`/companies/${companyId}/productions/${productionId}/deliveries/${delivery.id}`, {
          method: "DELETE",
        })
        router.push(`/c/${companyId}/productions/${productionId}/deliveries`)
      }}
    />
  )
}

/**
 * Recoger las firmas.
 *
 * Quien entrega es quien tiene la sesión: su identidad ya la garantiza el sistema y no hace falta
 * escribirla. Quien recibe es **texto libre** porque suele ser alguien de fuera —el chofer, la
 * dueña de la bodega—, y su trazo es lo único que lo ata a la hoja.
 */
export function SignDelivery({
  companyId,
  productionId,
  delivery,
}: {
  companyId: string
  productionId: string
  delivery: DeliveryRow
}) {
  const t = useTranslations("productions.deliveries")
  const router = useRouter()
  const uploads = usePhotoUploads(companyId)

  const receiverPad = useRef<SignaturePadHandle | null>(null)
  const issuerPad = useRef<SignaturePadHandle | null>(null)

  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Cierto cuando el trazo no se pudo subir y se ofrece firmar sin él. */
  const [withoutStroke, setWithoutStroke] = useState(false)

  const { setFiles, run, reset } = uploads

  /** El trazo del lienzo, como archivo elegible por la máquina de subida. */
  async function pick(pad: SignaturePadHandle | null, name: string): Promise<PickedFile | null> {
    const blob = await pad?.toBlob()
    if (!blob) return null

    return {
      id: crypto.randomUUID(),
      file: new File([blob], `${name}.png`, { type: "image/png" }),
      kind: "image",
      contentType: "image/png",
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const receiverName = text(new FormData(event.currentTarget), "receiverName")
    if (receiverName === "") {
      setError(t("receiverRequired"))
      return
    }

    setPending(true)
    setError(null)

    try {
      let issuerUploadId: string | undefined
      let receiverUploadId: string | undefined

      if (!withoutStroke) {
        const picked = [
          await pick(issuerPad.current, "firma-entrega"),
          await pick(receiverPad.current, "firma-recibe"),
        ].filter((one): one is PickedFile => one !== null)

        if (picked.length > 0) {
          setFiles(picked)
          const outcome = await run()

          if (outcome.failed > 0) {
            // No se firma a medias ni se pierde lo escrito: se avisa y se ofrece firmar sin trazo.
            setWithoutStroke(true)
            setError(t("strokeFailed"))
            setPending(false)
            return
          }

          // El orden de `uploaded` es el de la cola, que es el de `picked`.
          const ids = outcome.uploaded
          let cursor = 0
          if (issuerPad.current && !issuerPad.current.isEmpty()) issuerUploadId = ids[cursor++]
          if (receiverPad.current && !receiverPad.current.isEmpty()) receiverUploadId = ids[cursor]
        }
      }

      await api(
        `/companies/${companyId}/productions/${productionId}/deliveries/${delivery.id}/signatures`,
        {
          method: "PUT",
          body: {
            receiverName,
            ...(issuerUploadId === undefined ? {} : { signatureUploadId: issuerUploadId }),
            ...(receiverUploadId === undefined
              ? {}
              : { receiverSignatureUploadId: receiverUploadId }),
          },
        },
      )

      reset()
      setOpen(false)
      setWithoutStroke(false)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : t("signFailed"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        if (!next) {
          setError(null)
          setWithoutStroke(false)
          reset()
        }
      }}
    >
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("sign")}
      </Button>

      <DialogContent
        title={t("signTitle")}
        description={t("signBody")}
        closeLabel={t("signCancel")}
        size="lg"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error ? (
            <Callout tone="danger" live>
              {error}
            </Callout>
          ) : null}

          <Callout tone="warning">{t("signIsFinal")}</Callout>

          <Field label={t("receiverName")} hint={t("receiverNameHint")} required>
            {(ids) => <Input {...ids} name="receiverName" autoComplete="off" maxLength={200} />}
          </Field>

          {withoutStroke ? null : (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-body2 font-semibold text-content">{t("receiverStroke")}</span>
                <SignaturePad
                  ref={receiverPad}
                  labels={{
                    label: t("receiverStroke"),
                    hint: t("strokeHint"),
                    clear: t("strokeClear"),
                    captured: t("strokeCaptured"),
                  }}
                  disabled={pending}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-body2 font-semibold text-content">{t("issuerStroke")}</span>
                <SignaturePad
                  ref={issuerPad}
                  labels={{
                    label: t("issuerStroke"),
                    hint: t("strokeHint"),
                    clear: t("strokeClear"),
                    captured: t("strokeCaptured"),
                  }}
                  disabled={pending}
                />
              </div>

              <p className="text-body2 text-content-muted">{t("strokeOptional")}</p>
            </>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                {t("signCancel")}
              </Button>
            </DialogClose>

            <Button type="submit" loading={pending}>
              {withoutStroke ? t("signWithoutStroke") : t("signConfirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
