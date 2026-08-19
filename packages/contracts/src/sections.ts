/**
 * Las secciones de la página de un sitio, y la personalización que se está sirviendo.
 *
 * Ver `openspec/specs/site-builder/spec.md` y el requisito «Personalización vigente de un sitio» de
 * `computed-fields/spec.md`.
 *
 * ## Por qué vive en los contratos
 *
 * Porque la spec pide una cosa que no se consigue de otra manera: «la vista previa SHALL usar el
 * mismo renderizado que el sitio público, **de modo que lo que se ve sea lo que se sirve**». Si el
 * constructor decidiera por su cuenta qué secciones pinta y en qué orden, y el servidor lo
 * decidiera por la suya, la vista previa sería una promesa que nadie comprueba: se cumpliría
 * mientras las dos implementaciones coincidieran, y el día que dejaran de hacerlo el constructor
 * enseñaría una página que la tienda no sirve.
 *
 * Aquí está escrita **una vez**: qué tipos existen, cuáles se omiten, en qué orden van y cuál de
 * las personalizaciones manda hoy. El servidor la usa para componer lo que sirve; el navegador, para
 * componer lo que previsualiza. No hay dos respuestas posibles.
 *
 * Es el mismo motivo por el que `storefront.ts` guarda la aritmética de la dirección y `money.ts` la
 * del dinero.
 *
 * ## Lo que no está aquí
 *
 * El **arrastre**. Mover una sección de la tercera posición a la primera es aritmética sobre un
 * arreglo y vive en `@tfv/ui` (`lib/reorder.ts`), separada del ratón que la dispara. Aquí sólo está
 * `normalizeSections`, que es lo que convierte el arreglo ya movido en posiciones que se guardan.
 */

import type { WebsiteVertical } from "./storefront.ts"

// ─── El catálogo cerrado ─────────────────────────────────────────────────────

/**
 * Los tipos de sección que el sistema reconoce.
 *
 * Cerrado a propósito, como el de verticales y el de permisos: un tipo que no esté aquí no compila
 * en el editor, en lugar de ser una cadena que nunca coincide con ninguna rama y deja un hueco
 * blanco en la página que nadie relaciona con un dato mal escrito.
 *
 * Son los ocho que enumera la spec: portada, categorías, productos, acerca de, características,
 * testimonios, preguntas frecuentes y pie.
 */
export const SECTION_KINDS = [
  "hero",
  "categories",
  "products",
  "about",
  "features",
  "testimonials",
  "faq",
  "footer",
] as const

export type SectionKind = (typeof SECTION_KINDS)[number]

/** Los campos de texto propios de la sección que el editor ofrece. */
export type SectionField = "title" | "description" | "icon"

/** Los campos de un elemento repetible que el editor ofrece. */
export type SectionItemField = "title" | "description" | "icon" | "avatar" | "image"

/** Una propiedad declarada de la sección, con el tipo que el editor debe presentar. */
export interface SectionProp {
  readonly key: string
  readonly type: "text" | "number" | "boolean" | "category"
}

/**
 * Lo que un tipo de sección deja editar.
 *
 * La spec pide un catálogo «cada uno con sus campos editables **declarados**». Declarados aquí
 * significa que el editor se construye leyendo esta tabla: un tipo nuevo trae su formulario sin que
 * nadie escriba una pantalla, y un tipo que deja de admitir elementos deja de ofrecerlos en el acto.
 */
export interface SectionKindSpec {
  readonly kind: SectionKind
  readonly fields: readonly SectionField[]
  /** `null` cuando el tipo no tiene elementos repetibles. */
  readonly item: readonly SectionItemField[] | null
  readonly buttons: boolean
  readonly props: readonly SectionProp[]
  /**
   * De dónde salen los elementos que enseña.
   *
   * `"catalog"` significa que **no se editan**: los pone la fuente de catálogo del sitio, y la
   * personalización sólo puede acotar cuáles. Es lo que impide que una sección de productos enseñe
   * algo que el almacén tiene despublicado — no hay campo donde escribirlo.
   */
  readonly source: "catalog" | null
}

const SPECS: Readonly<Record<SectionKind, SectionKindSpec>> = {
  hero: {
    kind: "hero",
    fields: ["title", "description", "icon"],
    item: null,
    buttons: true,
    props: [{ key: "image", type: "text" }],
    source: null,
  },
  categories: {
    kind: "categories",
    fields: ["title", "description"],
    item: null,
    buttons: false,
    props: [{ key: "limit", type: "number" }],
    source: "catalog",
  },
  products: {
    kind: "products",
    fields: ["title", "description"],
    item: null,
    buttons: true,
    props: [
      { key: "categoryId", type: "category" },
      { key: "limit", type: "number" },
    ],
    source: "catalog",
  },
  about: {
    kind: "about",
    fields: ["title", "description", "icon"],
    item: null,
    buttons: true,
    props: [{ key: "image", type: "text" }],
    source: null,
  },
  features: {
    kind: "features",
    fields: ["title", "description"],
    item: ["title", "description", "icon"],
    buttons: false,
    props: [],
    source: null,
  },
  testimonials: {
    kind: "testimonials",
    fields: ["title", "description"],
    item: ["title", "description", "avatar"],
    buttons: false,
    props: [],
    source: null,
  },
  faq: {
    kind: "faq",
    fields: ["title", "description"],
    item: ["title", "description"],
    buttons: false,
    props: [],
    source: null,
  },
  footer: {
    kind: "footer",
    fields: ["title", "description"],
    item: ["title", "description"],
    buttons: true,
    props: [],
    source: null,
  },
}

export function isSectionKind(value: string): value is SectionKind {
  return Object.hasOwn(SPECS, value)
}

/** Lo que deja editar un tipo, o nada si no es del catálogo. */
export function sectionSpec(kind: string): SectionKindSpec | undefined {
  return isSectionKind(kind) ? SPECS[kind] : undefined
}

// ─── El contenido ────────────────────────────────────────────────────────────

/** Un botón de una sección. */
export interface SectionButton {
  readonly code: string
  readonly label: string
  readonly icon?: string
  /**
   * Qué hace el botón, según su acción: la dirección de un enlace, **el tipo de la sección** a la
   * que se desplaza, o la clave de la acción de aplicación.
   */
  readonly value?: string
  readonly action: "link" | "scroll" | "app"
  readonly variant: "filled" | "outline" | "light"
}

/** Un elemento repetible: un testimonio, una característica, una pregunta. */
export interface SectionItem {
  readonly code: string
  readonly title?: string
  readonly description?: string
  readonly icon?: string
  readonly avatar?: string
  readonly image?: string
}

/**
 * Un bloque de la página.
 *
 * `kind` es `string` y no `SectionKind` **a propósito**: lo que llega de la base puede traer un tipo
 * que este código no conoce —datos trasvasados de la pila anterior, o un tipo retirado del
 * catálogo— y la spec dice qué hacer con él: omitirlo al renderizar, sin romper la página. Un tipo
 * estrecho aquí obligaría a rechazar la lectura entera, que es justo lo contrario.
 */
export interface Section {
  readonly kind: string
  readonly show: boolean
  readonly position: number
  readonly title?: string
  readonly description?: string
  readonly icon?: string
  readonly props?: Readonly<Record<string, unknown>>
  readonly styles?: Readonly<Record<string, string>>
  readonly items?: readonly SectionItem[]
  readonly buttons?: readonly SectionButton[]
}

/** Una sección que sí se va a pintar: su tipo está en el catálogo y se muestra. */
export interface RenderableSection extends Section {
  readonly kind: SectionKind
}

/**
 * Lo que se pinta, en el orden en que se pinta.
 *
 * Tres reglas de la spec en una función, y por eso está aquí y no repartida por las pantallas:
 *
 * 1. Un tipo no reconocido **se omite**, y el resto se muestra con normalidad.
 * 2. Una sección oculta no se renderiza —y conserva su contenido, que sigue en el arreglo—.
 * 3. Se renderizan en su **orden explícito**, no en el que traiga el arreglo.
 *
 * El desempate es el orden del arreglo, para que dos secciones que compartan posición —cosa que la
 * base admite— no se intercambien entre dos cargas de la misma página.
 */
export function renderableSections(sections: readonly Section[]): readonly RenderableSection[] {
  return sections
    .map((section, index) => ({ section, index }))
    .filter(
      (entry): entry is { section: RenderableSection; index: number } =>
        entry.section.show && isSectionKind(entry.section.kind),
    )
    .sort((first, second) => {
      const byPosition = first.section.position - second.section.position
      return byPosition !== 0 ? byPosition : first.index - second.index
    })
    .map((entry) => entry.section)
}

/**
 * Numera las posiciones por el orden del arreglo.
 *
 * Es el paso que convierte «este arreglo está en el orden que quiero» en algo que se guarda. Lo
 * llama el servidor al escribir, siempre, y no sólo cuando se reordena: una sección nueva insertada
 * en medio también renumera, y dejar esa decisión a quien llama es dejar que un día llegue un
 * arreglo con dos secciones en la posición 3.
 */
export function normalizeSections(sections: readonly Section[]): readonly Section[] {
  return sections.map((section, index) => ({ ...section, position: index }))
}

// ─── Botones de desplazamiento ───────────────────────────────────────────────

/**
 * El ancla de una sección dentro de la página.
 *
 * **Una sección se referencia por su tipo**, que es la única identidad que tiene: el modelo guarda
 * las secciones como un arreglo sin identificador propio, así que no hay nada más estable a lo que
 * apuntar —la posición cambia con cada arrastre, y es justo lo que un botón no puede seguir—. Ver
 * `HALLAZGOS.md` H-114.
 */
export function sectionAnchor(kind: SectionKind): string {
  return `seccion-${kind}`
}

/** Los tipos de sección a los que un botón puede desplazarse: los que están en la personalización. */
export function scrollTargets(sections: readonly Section[]): readonly SectionKind[] {
  const targets: SectionKind[] = []

  for (const section of sections) {
    if (isSectionKind(section.kind) && !targets.includes(section.kind)) targets.push(section.kind)
  }

  return targets
}

/**
 * Los destinos de desplazamiento que no llevan a ninguna parte.
 *
 * Devuelve la lista y no un booleano porque quien la llama tiene que poder **decir cuál**: un
 * rechazo que sólo diga «hay un botón mal» deja a quien edita buscándolo entre ocho secciones.
 *
 * Se comprueban también los destinos de las secciones ocultas, y ésa es la parte que no es obvia:
 * una sección oculta **sigue estando en la personalización**, así que un botón que apunte a ella es
 * válido y volver a mostrarla no puede exigir revisar los botones. Lo contrario —invalidarlo al
 * ocultarla— convertiría ocultar una sección en una operación que rompe otras.
 *
 * El segundo argumento comprueba además un destino que todavía no está guardado, que es lo que
 * necesita el editor mientras alguien elige en un desplegable.
 */
export function unresolvedScrollTargets(
  sections: readonly Section[],
  candidate?: string,
): readonly string[] {
  const available = scrollTargets(sections)
  const wanted: string[] = []

  const want = (value: string | undefined) => {
    if (value === undefined || value === "") return
    if (available.includes(value as SectionKind)) return
    if (!wanted.includes(value)) wanted.push(value)
  }

  for (const section of sections) {
    for (const button of section.buttons ?? []) {
      if (button.action === "scroll") want(button.value)
    }
  }

  want(candidate)
  return wanted
}

// ─── Personalización vigente ─────────────────────────────────────────────────

/** Lo que hace falta de una personalización para saber si es la que manda hoy. */
export interface CustomizationWindow {
  readonly id: string
  readonly isPrimary: boolean
  readonly startsAt: Date | null
  readonly endsAt: Date | null
}

/**
 * La única personalización que debe renderizarse ahora.
 *
 * El orden de `computed-fields`, literal: una programada cuya ventana incluya el instante, y si no,
 * la primaria, y si no, nada. Los extremos de la ventana **están dentro**: una campaña que empieza
 * el uno de diciembre se ve el uno de diciembre.
 *
 * «Cuando varias programadas solapen, SHALL elegirse de forma determinista», dice la spec, sin
 * decir cuál. **Criterio adoptado**: gana la que empezó más tarde, y a igualdad de comienzo, la de
 * identificador menor. La primera mitad es la que tiene sentido para quien monta las campañas —la
 * que se puso encima es la última que se montó—; la segunda no significa nada y no pretende
 * significarlo: existe para que el orden en que la base devuelva las filas no cambie la página.
 *
 * Una programada **sin fecha de inicio ni de fin** no es una campaña: es una personalización que
 * nadie programó, y no compite con la primaria. Por eso se exige al menos un extremo.
 */
export function activeCustomization<T extends CustomizationWindow>(
  customizations: readonly T[],
  now: Date,
): T | null {
  const instant = now.getTime()

  const live = customizations.filter((entry) => {
    if (entry.startsAt === null && entry.endsAt === null) return false
    if (entry.startsAt !== null && entry.startsAt.getTime() > instant) return false
    if (entry.endsAt !== null && entry.endsAt.getTime() < instant) return false
    return true
  })

  const [chosen] = [...live].sort((first, second) => {
    const byStart = (second.startsAt?.getTime() ?? 0) - (first.startsAt?.getTime() ?? 0)
    return byStart !== 0 ? byStart : first.id.localeCompare(second.id)
  })

  if (chosen !== undefined) return chosen
  return customizations.find((entry) => entry.isPrimary) ?? null
}

// ─── Contenido inicial ───────────────────────────────────────────────────────

/**
 * Las secciones con las que nace la primera personalización de un sitio.
 *
 * «Ya poblado con contenido de ejemplo», pide la spec, y el motivo se ve en cuanto se abre el
 * constructor por primera vez: una página vacía con un botón de «añadir sección» no enseña qué es
 * una sección ni qué aspecto va a tener. Con contenido dentro, el primer gesto de quien lo abre es
 * **corregir**, que es mucho más fácil que inventar.
 *
 * El texto está en español porque es contenido de la tienda —lo lee el visitante, no el panel— y el
 * idioma de la tienda hoy es uno. Cuando la tienda tenga idioma seleccionable (rebanada 19, tarea
 * pendiente) esto se convertirá en la semilla del idioma que el sitio declare.
 */
export function initialSections(vertical: WebsiteVertical): readonly Section[] {
  return normalizeSections(vertical === "warehouse" ? WAREHOUSE_SEED : MINIMAL_SEED)
}

const CONTACT_BUTTON: SectionButton = {
  code: "contacto",
  label: "Contáctanos",
  action: "link",
  value: "/contacto",
  variant: "outline",
}

const WAREHOUSE_SEED: readonly Section[] = [
  {
    kind: "hero",
    show: true,
    position: 0,
    title: "Equipo listo para tu próxima producción",
    description: "Renta y venta con inventario real, sin sorpresas el día del rodaje.",
    buttons: [
      {
        code: "catalogo",
        label: "Ver el catálogo",
        action: "scroll",
        value: "products",
        variant: "filled",
      },
      CONTACT_BUTTON,
    ],
  },
  {
    kind: "categories",
    show: true,
    position: 1,
    title: "Explora por categoría",
    description: "Cámara, iluminación, grip y todo lo demás.",
    props: { limit: 8 },
  },
  {
    kind: "products",
    show: true,
    position: 2,
    title: "Lo más pedido",
    description: "Una muestra de lo que está publicado ahora mismo.",
    props: { limit: 8 },
  },
  {
    kind: "features",
    show: true,
    position: 3,
    title: "Por qué rentar con nosotros",
    items: [
      {
        code: "inventario",
        title: "Inventario por unidad",
        description: "Sabemos qué equipo concreto sale y cuándo vuelve.",
        icon: "package",
      },
      {
        code: "cotizacion",
        title: "Cotización en el día",
        description: "Te respondemos con precios firmes, no con estimados.",
        icon: "receipt",
      },
      {
        code: "soporte",
        title: "Soporte en set",
        description: "Si algo falla en rodaje, hay alguien del otro lado.",
        icon: "life-buoy",
      },
    ],
  },
  {
    kind: "faq",
    show: true,
    position: 4,
    title: "Preguntas frecuentes",
    items: [
      {
        code: "deposito",
        title: "¿Piden depósito?",
        description: "Depende del equipo y del proyecto. Te lo decimos en la cotización.",
      },
      {
        code: "entrega",
        title: "¿Entregan en locación?",
        description: "Sí, dentro de la ciudad. Fuera se cotiza el traslado.",
      },
    ],
  },
  {
    kind: "footer",
    show: true,
    position: 5,
    title: "¿Hablamos?",
    description: "Escríbenos y armamos el paquete para tu producción.",
    buttons: [CONTACT_BUTTON],
  },
]

/**
 * Lo mínimo para una vertical que todavía no tiene páginas propias.
 *
 * Una sola sección y no ninguna: un sitio recién creado del que nadie decidió aún qué vende sigue
 * teniendo algo que decirle a quien abra su dirección, y el constructor abre con algo que editar en
 * vez de con un lienzo en blanco.
 */
const MINIMAL_SEED: readonly Section[] = [
  {
    kind: "hero",
    show: true,
    position: 0,
    title: "Estamos preparando algo",
    description: "Vuelve pronto: esta tienda está en construcción.",
    buttons: [CONTACT_BUTTON],
  },
  {
    kind: "about",
    show: true,
    position: 1,
    title: "Quiénes somos",
    description: "Cuenta aquí a qué se dedica tu empresa y por qué alguien debería escribirte.",
  },
]
