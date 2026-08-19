import type { RenderableSection, SectionButton } from "@tfv/contracts/sections"
import { isSectionKind, sectionAnchor } from "@tfv/contracts/sections"
import { cn } from "@tfv/ui"
import { ImageOff } from "lucide-react"
import { Photo } from "~/components/photo.tsx"

/**
 * Las secciones de un sitio, pintadas.
 *
 * Ver `openspec/specs/site-builder/spec.md`, «Vista previa en el editor»: «La vista previa SHALL
 * usar el mismo renderizado que el sitio público, **de modo que lo que se ve sea lo que se
 * sirve**».
 *
 * **Este componente es esa frase.** Lo usan la portada de la tienda pública —componente de
 * servidor, sin sesión— y la vista previa del constructor —componente de cliente, con cambios sin
 * guardar—, y no hay una segunda implementación en ninguna parte. Escrito dos veces, la promesa se
 * cumpliría mientras las dos coincidieran; el día que dejaran de hacerlo, el constructor mentiría y
 * nada fallaría.
 *
 * Por eso no importa nada de servidor: ni `next-intl/server`, ni `headers`, ni `apiGet`. Lo que
 * pinta es **contenido del arrendatario** —lo escribió quien construyó el sitio— así que tampoco
 * hay nada que traducir: el idioma de una sección es el que su dueño escribió dentro.
 *
 * Lo que sí recibe es el catálogo, porque las secciones que lo enseñan **leen de la fuente** y no
 * de la personalización: no hay campo donde escribir un producto, que es lo que impide que una
 * sección enseñe algo que el almacén tiene despublicado.
 */

/** Una categoría de la fuente, con su dirección ya compuesta. */
export interface SectionCategory {
  readonly id: string
  readonly name: string
  readonly href: string
}

/** Un producto publicado de la fuente, con su dirección ya compuesta. */
export interface SectionProduct {
  readonly id: string
  readonly name: string
  readonly price: string | null
  readonly coverUrl: string | null
  readonly href: string
}

export interface SectionsCatalog {
  readonly categories: readonly SectionCategory[]
  readonly products: readonly SectionProduct[]
  /** Cómo se escribe un importe. Lo inyecta quien pinta, para no formatear dinero aquí. */
  readonly money: (amount: string) => string
  /** Qué decir cuando una sección de catálogo no tiene nada que enseñar. */
  readonly emptyLabel: string
  readonly askForPriceLabel: string
}

export interface SiteSectionsProps {
  readonly sections: readonly RenderableSection[]
  /** El color de la personalización. Tiñe la portada y los botones llenos. */
  readonly color: string
  readonly bannerUrl: string | null
  readonly catalog: SectionsCatalog
}

export function SiteSections({ sections, color, bannerUrl, catalog }: SiteSectionsProps) {
  if (sections.length === 0) return null

  return (
    <>
      {sections.map((section) => (
        <section
          key={`${section.kind}-${section.position}`}
          // El ancla a la que baja un botón de desplazamiento. Se deriva del tipo, que es la única
          // identidad estable de una sección: la posición cambia con cada arrastre.
          id={sectionAnchor(section.kind)}
          className="scroll-mt-4 border-b border-line last:border-b-0"
        >
          <div className="mx-auto w-full max-w-(--breakpoint-desktop) px-4 py-10 tablet:px-6">
            <Body section={section} color={color} bannerUrl={bannerUrl} catalog={catalog} />
          </div>
        </section>
      ))}
    </>
  )
}

function Body({
  section,
  color,
  bannerUrl,
  catalog,
}: {
  section: RenderableSection
  color: string
  bannerUrl: string | null
  catalog: SectionsCatalog
}) {
  switch (section.kind) {
    case "hero":
      return <Hero section={section} color={color} bannerUrl={bannerUrl} />
    case "categories":
      return <Categories section={section} catalog={catalog} />
    case "products":
      return <Products section={section} color={color} catalog={catalog} />
    case "about":
      return <About section={section} color={color} />
    case "features":
      return <Features section={section} />
    case "testimonials":
      return <Testimonials section={section} />
    case "faq":
      return <Faq section={section} />
    case "footer":
      return <Footer section={section} color={color} />
  }
}

// ─── Tipos de sección ────────────────────────────────────────────────────────

function Hero({
  section,
  color,
  bannerUrl,
}: {
  section: RenderableSection
  color: string
  bannerUrl: string | null
}) {
  const image = imageOf(section) ?? bannerUrl

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ backgroundColor: color }}>
      {image ? (
        <Photo src={image} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
      ) : null}
      <div className="relative flex flex-col items-start gap-4 px-6 py-14 tablet:px-10 tablet:py-20">
        {section.title ? (
          <h2 className="max-w-2xl text-h4 font-bold tracking-tight text-white drop-shadow">
            {section.title}
          </h2>
        ) : null}
        {section.description ? (
          <p className="max-w-prose text-body1 text-white/90 drop-shadow">{section.description}</p>
        ) : null}
        <Buttons buttons={section.buttons} color={color} onDark />
      </div>
    </div>
  )
}

function Categories({
  section,
  catalog,
}: {
  section: RenderableSection
  catalog: SectionsCatalog
}) {
  const shown = catalog.categories.slice(0, limitOf(section, catalog.categories.length))

  return (
    <>
      <Heading section={section} />
      {shown.length === 0 ? (
        <Empty label={catalog.emptyLabel} />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {shown.map((category) => (
            <li key={category.id}>
              <a
                href={category.href}
                className="inline-flex rounded-full border border-line bg-surface px-4 py-2 text-body2 text-content"
              >
                {category.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Products({
  section,
  color,
  catalog,
}: {
  section: RenderableSection
  color: string
  catalog: SectionsCatalog
}) {
  const shown = catalog.products.slice(0, limitOf(section, catalog.products.length))

  return (
    <>
      <Heading section={section} />
      {shown.length === 0 ? (
        <Empty label={catalog.emptyLabel} />
      ) : (
        <ul className="grid grid-cols-2 gap-4 tablet:grid-cols-3 desktop:grid-cols-4">
          {shown.map((product) => (
            <li key={product.id}>
              <a
                href={product.href}
                className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface"
              >
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-canvas">
                  {product.coverUrl ? (
                    <Photo src={product.coverUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageOff className="size-8 text-content-faint" aria-hidden="true" />
                  )}
                </span>
                <span className="flex flex-1 flex-col gap-1 p-3">
                  <span className="line-clamp-2 text-body1 font-semibold text-content">
                    {product.name}
                  </span>
                  <span className="mt-auto text-body1 text-content">
                    {product.price === null ? (
                      <span className="text-content-muted">{catalog.askForPriceLabel}</span>
                    ) : (
                      catalog.money(product.price)
                    )}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <Buttons buttons={section.buttons} color={color} />
    </>
  )
}

function About({ section, color }: { section: RenderableSection; color: string }) {
  const image = imageOf(section)

  return (
    <div className="grid gap-6 tablet:grid-cols-2 tablet:items-center">
      <div>
        <Heading section={section} />
        <Buttons buttons={section.buttons} color={color} />
      </div>
      {image ? (
        <Photo src={image} alt="" className="w-full rounded-xl object-cover" />
      ) : (
        <div className="hidden rounded-xl border border-dashed border-line tablet:block" />
      )}
    </div>
  )
}

function Features({ section }: { section: RenderableSection }) {
  return (
    <>
      <Heading section={section} />
      <ul className="grid gap-4 tablet:grid-cols-3">
        {(section.items ?? []).map((item) => (
          <li key={item.code} className="rounded-xl border border-line bg-surface p-5">
            {item.title ? (
              <p className="text-body1 font-semibold text-content">{item.title}</p>
            ) : null}
            {item.description ? (
              <p className="mt-1 text-body2 text-content-muted">{item.description}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}

function Testimonials({ section }: { section: RenderableSection }) {
  return (
    <>
      <Heading section={section} />
      <ul className="grid gap-4 tablet:grid-cols-2">
        {(section.items ?? []).map((item) => (
          <li key={item.code} className="rounded-xl border border-line bg-surface p-5">
            {item.description ? (
              <p className="text-body1 text-content">“{item.description}”</p>
            ) : null}
            <div className="mt-3 flex items-center gap-2">
              {item.avatar ? (
                <Photo src={item.avatar} alt="" className="size-8 rounded-full object-cover" />
              ) : null}
              {item.title ? (
                <span className="text-body2 font-semibold text-content-muted">{item.title}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Preguntas frecuentes, con `<details>`.
 *
 * Se despliegan **sin una línea de JavaScript**, igual que el resto del catálogo público: es lo que
 * hace que la tienda funcione en el teléfono de alguien con mala conexión, y lo que permite que la
 * misma marca sirva en la vista previa sin cablear nada.
 */
function Faq({ section }: { section: RenderableSection }) {
  return (
    <>
      <Heading section={section} />
      <ul className="flex flex-col gap-2">
        {(section.items ?? []).map((item) => (
          <li key={item.code}>
            <details className="rounded-xl border border-line bg-surface px-4 py-3">
              <summary className="cursor-pointer text-body1 font-semibold text-content">
                {item.title}
              </summary>
              {item.description ? (
                <p className="mt-2 text-body2 text-content-muted">{item.description}</p>
              ) : null}
            </details>
          </li>
        ))}
      </ul>
    </>
  )
}

function Footer({ section, color }: { section: RenderableSection; color: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Heading section={section} />
      <Buttons buttons={section.buttons} color={color} />
    </div>
  )
}

// ─── Piezas comunes ──────────────────────────────────────────────────────────

function Heading({ section }: { section: RenderableSection }) {
  if (!section.title && !section.description) return null

  return (
    <div className="mb-5">
      {section.title ? (
        <h2 className="text-h5 font-bold tracking-tight text-content">{section.title}</h2>
      ) : null}
      {section.description ? (
        <p className="mt-1 max-w-prose text-body1 text-content-muted">{section.description}</p>
      ) : null}
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-body2 text-content-muted">
      {label}
    </p>
  )
}

/**
 * Los botones de una sección, según su tipo de acción.
 *
 * - **Enlace**: va a la dirección que se escribió.
 * - **Desplazamiento**: baja al ancla de la sección de destino, que el servidor ya comprobó que
 *   está en esta personalización.
 * - **Aplicación**: es una acción de la tienda —el carrito, la cuenta del comprador— y **hoy no se
 *   pinta**, porque esa mitad llega con la rebanada 18. Un botón que no hace nada es peor que uno
 *   que no está: el primero parece una avería.
 */
function Buttons({
  buttons,
  color,
  onDark = false,
}: {
  buttons: readonly SectionButton[] | undefined
  color: string
  onDark?: boolean
}) {
  const shown = (buttons ?? []).filter((button) => button.action !== "app")
  if (shown.length === 0) return null

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {shown.map((button) => (
        <a
          key={button.code}
          href={hrefOf(button)}
          className={cn(
            "inline-flex items-center rounded-lg px-4 py-2 text-body2 font-semibold",
            button.variant === "filled" && "text-white",
            button.variant === "outline" &&
              (onDark ? "border border-white/70 text-white" : "border border-line text-content"),
            button.variant === "light" &&
              (onDark ? "bg-white/15 text-white" : "bg-panel-hover text-content"),
          )}
          style={button.variant === "filled" ? { backgroundColor: color } : undefined}
        >
          {button.label}
        </a>
      ))}
    </div>
  )
}

/**
 * A dónde lleva un botón.
 *
 * El ancla de destino se compone con `sectionAnchor`, la misma función que la escribe en el
 * atributo `id` de la sección. Escrita a mano aquí, un cambio de formato dejaría todos los botones
 * de desplazamiento apuntando a un ancla que ya no existe, y no fallaría nada: sólo dejarían de
 * bajar.
 */
function hrefOf(button: SectionButton): string {
  if (button.action !== "scroll") return button.value ?? "#"
  const target = button.value ?? ""
  return isSectionKind(target) ? `#${sectionAnchor(target)}` : "#"
}

/** Cuántos elementos enseña una sección de catálogo. Sin declararlo, todos los que haya. */
function limitOf(section: RenderableSection, available: number): number {
  const raw = section.props?.limit
  return typeof raw === "number" && raw > 0 ? Math.min(raw, available) : available
}

function imageOf(section: RenderableSection): string | null {
  const raw = section.props?.image
  return typeof raw === "string" && raw !== "" ? raw : null
}
