import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ApiFailure } from "~/components/api-failure.tsx"
import type { PageEnvelope } from "~/components/collection/collection.tsx"
import { PageShell } from "~/components/page-shell.tsx"
import { type ApiResult, apiGet } from "~/lib/api.server.ts"
import { requireCompany, requireProfile } from "~/lib/session.ts"
import type { ProductDetail, StockUnitRow } from "../../../../../../warehouse.ts"
import { linkButton } from "../link-button.ts"
import { LabelSheet } from "./label-sheet.tsx"

/**
 * Cuántas etiquetas caben en una hoja antes de que deje de ser una hoja.
 *
 * Cada etiqueta lleva un dibujo que se genera en el navegador; quinientas son ya varios segundos de
 * trabajo y una veintena de páginas. Pasado el tope se dice cuántas quedaron fuera en lugar de
 * dejar la pestaña pensando sin explicación.
 */
const CAP = 500

/** Lo que devuelve una página de la colección de unidades, y lo máximo que admite de una vez. */
const PAGE_SIZE = 96

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())("warehouses.labels.title") }
}

/**
 * La hoja de etiquetas de una medida.
 *
 * Ver `openspec/specs/stock-units/spec.md`, «Etiquetas legibles por máquina». Individual o en lote
 * es la misma hoja con distinto alcance: con `?unit=` se preparan las que se pidan, sin él todas
 * las de la medida.
 *
 * **No hay servicio de documentos en el proyecto**, así que se imprime con el diálogo del
 * navegador sobre una rejilla preparada para papel. Es lo que además permite que quien imprime
 * elija la bandeja, el tamaño y cuántas copias, sin que nadie lo programe.
 */
export default async function LabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{
    companyId: string
    warehouseId: string
    productId: string
    measurementId: string
  }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const { companyId, warehouseId, productId, measurementId } = await params
  const requested = await searchParams
  const screen = `/c/${companyId}/warehouses/${warehouseId}/products/${productId}/measurements/${measurementId}`
  const path = (await headers()).get("x-pathname") ?? `${screen}/labels`
  const profile = await requireProfile(path)
  requireCompany(profile, companyId)

  const wanted = new Set(
    typeof requested.unit === "string" ? [requested.unit] : (requested.unit ?? []),
  )

  const [productResult, unitsResult] = await Promise.all([
    apiGet<ProductDetail>(
      `/companies/${companyId}/warehouses/${warehouseId}/products/${productId}`,
    ),
    loadUnits(`/companies/${companyId}/warehouses/${warehouseId}/measurements/${measurementId}`),
  ])

  const back = (
    <Link href={screen} className={linkButton("secondary")}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t("warehouses.labels.back")}
    </Link>
  )

  if (!productResult.ok) {
    return (
      <PageShell title={t("warehouses.labels.title")} actions={back}>
        <ApiFailure result={productResult} />
      </PageShell>
    )
  }
  if (!unitsResult.ok) {
    return (
      <PageShell title={t("warehouses.labels.title")} actions={back}>
        <ApiFailure result={unitsResult} />
      </PageShell>
    )
  }

  const product = productResult.data
  const measurement = product.measurements.find((entry) => entry.id === measurementId)
  if (!measurement) notFound()

  const all = unitsResult.data.items
  const chosen = wanted.size > 0 ? all.filter((unit) => wanted.has(unit.id)) : all

  return (
    <PageShell
      title={t("warehouses.labels.title")}
      subtitle={t("warehouses.labels.subtitle", {
        product: product.name,
        measurement: measurement.name,
      })}
      actions={back}
    >
      <LabelSheet
        labels={chosen.map((unit) => ({ id: unit.id, code: unit.code }))}
        productName={product.name}
        measurementName={measurement.name}
        scope={wanted.size > 0 ? "selected" : "all"}
        {...(unitsResult.data.truncated ? { truncatedAt: CAP } : {})}
      />
    </PageShell>
  )
}

/**
 * Todas las unidades de la medida, hasta el tope.
 *
 * La colección devuelve como mucho noventa y seis por página, y una medida con doscientas unidades
 * es normal en una casa de renta. Se recorren las páginas en lugar de imprimir la primera y callar:
 * una hoja que trae noventa y seis de doscientas etiquetas es peor que una que avisa.
 */
async function loadUnits(
  base: string,
): Promise<ApiResult<{ items: StockUnitRow[]; truncated: boolean }>> {
  const first = await apiGet<PageEnvelope<StockUnitRow>>(`${base}/units?limit=${PAGE_SIZE}`)
  if (!first.ok) return first

  const items = [...first.data.items]
  let truncated = false

  for (let page = 2; page <= first.data.totalPages; page += 1) {
    if (items.length >= CAP) {
      truncated = true
      break
    }

    const next = await apiGet<PageEnvelope<StockUnitRow>>(
      `${base}/units?limit=${PAGE_SIZE}&page=${page}`,
    )
    if (!next.ok) return next
    items.push(...next.data.items)
  }

  return { ok: true, data: { items: items.slice(0, CAP), truncated } }
}
