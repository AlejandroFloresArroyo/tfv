import type { Section } from "@tfv/contracts/sections"
import type { WebsiteVertical } from "@tfv/contracts/storefront"

/** Un sitio, tal y como llega de la API. */
export interface WebsiteRow {
  id: string
  companyId: string
  name: string
  description: string
  slug: string
  isPublished: boolean
  categoryId: string | null
  vertical: WebsiteVertical
  warehouseId: string | null
  pixitStoreId: string | null
  logoUrl: string | null
  iconUrl: string | null
  /** Dónde se sirve. Derivados del identificador legible por el servidor, no por la pantalla. */
  subdomain: string
  address: string
  createdAt: string
  updatedAt: string
}

/** Una personalización con su contenido. Es el documento que el constructor edita. */
export interface CustomizationRow {
  id: string
  websiteId: string
  name: string
  color: string
  bannerUploadId: string | null
  bannerUrl: string | null
  isPrimary: boolean
  /** Si es la que la tienda está sirviendo ahora. Lo calcula el servidor. */
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  sections: Section[]
  createdAt: string
  updatedAt: string
}
