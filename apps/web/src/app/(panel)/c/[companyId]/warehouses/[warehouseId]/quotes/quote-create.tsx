"use client"

import { Button, Callout, DialogTrigger, Field, Input, Select, Spinner } from "@tfv/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { FormDialog } from "~/components/form-dialog.tsx"
import { ApiError, api } from "~/lib/api.client.ts"
import type { QuoteRow } from "../../warehouse.ts"

/**
 * Alta de una cotización desde la bandeja.
 *
 * ## Por qué pide tres cosas y no diez
 *
 * Nace **pendiente y sin líneas** —es lo que dice `quotations`, «una cotización creada sin líneas
 * nace pendiente»— y lleva derecho al constructor, que es donde se arma. Aquí sólo se pregunta lo
 * que el constructor no puede deducir ni calcular sin ello:
 *
 * - **El tipo**, porque decide qué se cobra: una renta multiplica por días y una venta no.
 * - **El cliente**, que es a quien va dirigida.
 * - **La ventana**, y sólo si es de renta. Sin fechas, una línea de renta no sabe cuántos días
 *   cobra y el desglose enseña cifras que no son las que se firmarán.
 *
 * El nombre y la descripción **no** se piden. Se editan luego en su bloque, y pedirlos aquí sería
 * cobrar dos campos de trámite antes de dejar empezar. El folio y el código los pone el servicio.
 *
 * ## La ventana no aparece en una venta
 *
 * «Una cotización de venta no SHALL exigir ventana de fechas» (`quotations`). Enseñar dos campos
 * de fecha que no se usan invita a rellenarlos y a creer que significan algo.
 *
 * ## El responsable no viaja
 *
 * El servicio nombra responsable a quien la creó cuando no se indica otro. Mandarlo desde aquí
 * sería repetir una regla que ya está del otro lado, y el día que cambie habría dos.
 */

interface ClientOption {
  id: string
  alias: string
}

/** De dónde salen los clientes, y qué pasa cuando no se pueden pedir. */
type Directory =
  | { state: "loading" }
  | { state: "ready"; clients: ClientOption[] }
  /** Sin `companies.clients.view`. Se crea sin cliente en lugar de cerrar la puerta. */
  | { state: "forbidden" }
  | { state: "failed" }

export function CreateQuote({
  companyId,
  warehouseId,
}: {
  companyId: string
  warehouseId: string
}) {
  const t = useTranslations("warehouses.quotes")
  const common = useTranslations("common")
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"rent" | "sale">("rent")
  const [startsOn, setStartsOn] = useState("")
  const [endsOn, setEndsOn] = useState("")
  const [directory, setDirectory] = useState<Directory>({ state: "loading" })

  // Los clientes se piden al abrir y no con la bandeja: la bandeja se carga muchas veces y esto
  // hace falta una. Es la misma razón por la que el alcance de una baja tampoco viaja con su lista.
  useEffect(() => {
    if (!open) return

    let cancelled = false
    setDirectory({ state: "loading" })

    api<{ items: ClientOption[] }>(`/companies/${companyId}/clients?limit=96`)
      .then((page) => {
        if (!cancelled) setDirectory({ state: "ready", clients: page.items })
      })
      .catch((failure) => {
        if (cancelled) return
        setDirectory(
          failure instanceof ApiError && failure.status === 403
            ? { state: "forbidden" }
            : { state: "failed" },
        )
      })

    return () => {
      cancelled = true
    }
  }, [open, companyId])

  function reset() {
    setType("rent")
    setStartsOn("")
    setEndsOn("")
  }

  return (
    <FormDialog
      title={t("createTitle")}
      description={t("createBody")}
      submitLabel={common("create")}
      size="sm"
      trigger={
        <DialogTrigger asChild>
          <Button size="sm">{t("create")}</Button>
        </DialogTrigger>
      }
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
      action={async (data) => {
        // La ventana se comprueba aquí porque **el servicio no la exige al crear**: una renta sin
        // fechas es legal hasta que quiere avanzar. Legal y, en el constructor, inservible — las
        // líneas cobrarían cero días. Se avisa con la forma de error del contrato para que el
        // mensaje caiga en su campo, como el de cualquier rechazo del servidor.
        if (type === "rent") {
          if (!startsOn || !endsOn) {
            throw new ApiError(
              422,
              t("createNeedsWindow"),
              new Map([[startsOn ? "endsOn" : "startsOn", t("createNeedsWindow")]]),
            )
          }
          if (endsOn <= startsOn) {
            throw new ApiError(
              422,
              t("createEndsBefore"),
              new Map([["endsOn", t("createEndsBefore")]]),
            )
          }
        }

        const clientId = String(data.get("clientId") ?? "")

        const quote = await api<QuoteRow>(
          `/companies/${companyId}/warehouses/${warehouseId}/quotes`,
          {
            method: "POST",
            body: {
              type,
              ...(clientId ? { clientId } : {}),
              ...(type === "rent"
                ? {
                    startsOn: new Date(`${startsOn}T00:00:00`).toISOString(),
                    endsOn: new Date(`${endsOn}T00:00:00`).toISOString(),
                  }
                : {}),
            },
          },
        )

        // Al constructor, que es donde se arma. Nace pendiente y sin líneas: dejarla en la bandeja
        // obligaría a buscarla entre las demás para seguir con lo que se acaba de empezar.
        router.push(`/c/${companyId}/warehouses/${warehouseId}/quotes/${quote.id}`)
        return quote
      }}
    >
      {(state) => (
        <>
          <Field label={t("type")} required>
            {(ids) => (
              <Select
                {...ids}
                value={type}
                onChange={(event) => setType(event.target.value as "rent" | "sale")}
              >
                <option value="rent">{t("kind.rent")}</option>
                <option value="sale">{t("kind.sale")}</option>
              </Select>
            )}
          </Field>

          {directory.state === "loading" ? (
            <div className="flex items-center gap-2 text-body3 text-content-faint">
              <Spinner className="size-4" />
              {common("loading")}
            </div>
          ) : directory.state === "ready" && directory.clients.length > 0 ? (
            <Field label={t("client")} error={state.fieldErrors.get("clientId")}>
              {(ids) => (
                <Select {...ids} name="clientId" defaultValue="">
                  <option value="">{t("noClient")}</option>
                  {directory.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.alias}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Callout tone={directory.state === "failed" ? "danger" : "info"}>
              {directory.state === "forbidden"
                ? t("createClientForbidden")
                : directory.state === "failed"
                  ? t("createClientFailed")
                  : t("createClientEmpty")}
            </Callout>
          )}

          {type === "rent" ? (
            <div className="grid gap-4 tablet:grid-cols-2">
              <Field label={t("extensionStart")} error={state.fieldErrors.get("startsOn")} required>
                {(ids) => (
                  <Input
                    {...ids}
                    type="date"
                    value={startsOn}
                    onChange={(event) => setStartsOn(event.target.value)}
                  />
                )}
              </Field>

              <Field label={t("extensionEnd")} error={state.fieldErrors.get("endsOn")} required>
                {(ids) => (
                  <Input
                    {...ids}
                    type="date"
                    value={endsOn}
                    onChange={(event) => setEndsOn(event.target.value)}
                  />
                )}
              </Field>
            </div>
          ) : null}

          <p className="text-body3 text-content-faint">{t("createNote")}</p>
        </>
      )}
    </FormDialog>
  )
}
