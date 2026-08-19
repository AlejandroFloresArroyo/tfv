/**
 * Las reglas de las secciones de una página, como aritmética.
 *
 * Transcritas de los escenarios de `openspec/specs/site-builder/spec.md` —catálogo cerrado, tipo
 * desconocido que se omite, orden explícito, destino de desplazamiento, contenido inicial por
 * vertical— y del requisito «Personalización vigente de un sitio» de `computed-fields/spec.md`.
 *
 * Están aquí y no en una prueba de pantalla porque **son la misma regla en los dos extremos**: el
 * servidor decide qué sirve y el constructor decide qué previsualiza. Probada una vez, no hay dos
 * respuestas posibles a «qué se ve».
 */

import { describe, expect, it } from "vitest"
import {
  activeCustomization,
  type CustomizationWindow,
  initialSections,
  isSectionKind,
  normalizeSections,
  renderableSections,
  SECTION_KINDS,
  type Section,
  scrollTargets,
  sectionAnchor,
  sectionSpec,
  unresolvedScrollTargets,
} from "./sections.ts"

function section(kind: string, overrides: Partial<Section> = {}): Section {
  return { kind, show: true, position: 0, ...overrides }
}

describe("catálogo de tipos", () => {
  it("es cerrado y cada tipo declara sus campos editables", () => {
    expect(SECTION_KINDS.length).toBeGreaterThan(0)

    for (const kind of SECTION_KINDS) {
      const spec = sectionSpec(kind)
      expect(spec, kind).toBeDefined()
      expect(spec?.fields.length, kind).toBeGreaterThan(0)
    }
  })

  it("reconoce los tipos del catálogo y sólo ésos", () => {
    expect(isSectionKind("faq")).toBe(true)
    expect(isSectionKind("carrusel-de-la-suerte")).toBe(false)
  })

  it("una sección de catálogo no edita sus elementos: los lee de la fuente", () => {
    expect(sectionSpec("products")?.source).toBe("catalog")
    expect(sectionSpec("products")?.item).toBeNull()
    expect(sectionSpec("testimonials")?.source).toBeNull()
    expect(sectionSpec("testimonials")?.item).not.toBeNull()
  })
})

describe("qué se renderiza", () => {
  it("un tipo desconocido se omite y el resto se muestra con normalidad", () => {
    const rendered = renderableSections([
      section("hero", { position: 0 }),
      section("carrusel-de-la-suerte", { position: 1 }),
      section("faq", { position: 2 }),
    ])

    expect(rendered.map((entry) => entry.kind)).toEqual(["hero", "faq"])
  })

  it("una sección oculta no se renderiza, y conserva su contenido", () => {
    const oculta = section("faq", { show: false, title: "Preguntas" })
    expect(renderableSections([section("hero"), oculta])).toHaveLength(1)
    expect(renderableSections([section("hero"), { ...oculta, show: true }])).toHaveLength(2)
    expect(oculta.title).toBe("Preguntas")
  })

  it("se renderizan en su orden explícito y no en el del arreglo", () => {
    const rendered = renderableSections([
      section("faq", { position: 2 }),
      section("hero", { position: 0 }),
      section("about", { position: 1 }),
    ])

    expect(rendered.map((entry) => entry.kind)).toEqual(["hero", "about", "faq"])
  })

  it("dos secciones en la misma posición conservan el orden del arreglo", () => {
    const rendered = renderableSections([
      section("about", { position: 1 }),
      section("faq", { position: 1 }),
    ])

    expect(rendered.map((entry) => entry.kind)).toEqual(["about", "faq"])
  })

  it("sin secciones no hay nada que renderizar, y no es un error", () => {
    expect(renderableSections([])).toEqual([])
  })
})

describe("normalización del orden", () => {
  it("numera las posiciones por el orden del arreglo, que es el que se guarda", () => {
    const normalized = normalizeSections([
      section("faq", { position: 7 }),
      section("hero", { position: 7 }),
      section("about", { position: 2 }),
    ])

    expect(normalized.map((entry) => [entry.kind, entry.position])).toEqual([
      ["faq", 0],
      ["hero", 1],
      ["about", 2],
    ])
  })

  it("no toca el contenido de la sección", () => {
    const [normalized] = normalizeSections([
      section("faq", { position: 9, title: "Preguntas", items: [{ code: "a", title: "¿?" }] }),
    ])

    expect(normalized?.title).toBe("Preguntas")
    expect(normalized?.items).toEqual([{ code: "a", title: "¿?" }])
  })
})

describe("destino de un botón de desplazamiento", () => {
  it("un botón de desplazamiento apunta a una sección presente", () => {
    const sections = [section("hero"), section("faq")]
    expect(scrollTargets(sections)).toEqual(["hero", "faq"])
    expect(unresolvedScrollTargets(sections, "faq")).toEqual([])
  })

  it("un destino que no está en la personalización se señala", () => {
    const sections = [section("hero"), section("about")]
    expect(unresolvedScrollTargets(sections, "faq")).toEqual(["faq"])
  })

  it("los botones de enlace y de aplicación no tienen destino que comprobar", () => {
    const sections = [
      section("hero", {
        buttons: [
          {
            code: "a",
            label: "Ir",
            action: "link",
            value: "https://ejemplo.mx",
            variant: "filled",
          },
          { code: "b", label: "Carrito", action: "app", value: "cart", variant: "light" },
        ],
      }),
    ]

    expect(unresolvedScrollTargets(sections)).toEqual([])
  })

  it("recoge los destinos rotos de los botones ya guardados", () => {
    const sections = [
      section("hero", {
        buttons: [
          { code: "a", label: "Preguntas", action: "scroll", value: "faq", variant: "filled" },
        ],
      }),
    ]

    expect(unresolvedScrollTargets(sections)).toEqual(["faq"])
    expect(unresolvedScrollTargets([...sections, section("faq")])).toEqual([])
  })

  it("un botón hacia una sección oculta sigue apuntando a algo que existe", () => {
    // La sección de destino está, aunque hoy no se muestre: volver a mostrarla no puede dejar un
    // botón roto detrás, y ocultarla no puede invalidar una personalización que ya estaba guardada.
    const sections = [
      section("hero", {
        buttons: [
          { code: "a", label: "Preguntas", action: "scroll", value: "faq", variant: "filled" },
        ],
      }),
      section("faq", { show: false }),
    ]

    expect(unresolvedScrollTargets(sections)).toEqual([])
  })

  it("el ancla de una sección se deriva de su tipo", () => {
    expect(sectionAnchor("faq")).toBe("seccion-faq")
  })
})

describe("personalización vigente", () => {
  const enero = new Date("2026-01-15T12:00:00Z")
  const diciembre = new Date("2026-12-15T12:00:00Z")

  const primaria: CustomizationWindow = {
    id: "01-primaria",
    isPrimary: true,
    startsAt: null,
    endsAt: null,
  }

  const campana: CustomizationWindow = {
    id: "02-campana",
    isPrimary: false,
    startsAt: new Date("2026-12-01T00:00:00Z"),
    endsAt: new Date("2026-12-31T23:59:59Z"),
  }

  it("la campaña vigente sustituye al tema primario", () => {
    expect(activeCustomization([primaria, campana], diciembre)?.id).toBe("02-campana")
  })

  it("fuera de la ventana vuelve el primario", () => {
    expect(activeCustomization([primaria, campana], enero)?.id).toBe("01-primaria")
  })

  it("la campaña se retira sola cuando pasa su fecha de fin", () => {
    const despues = new Date("2027-01-02T00:00:00Z")
    expect(activeCustomization([primaria, campana], despues)?.id).toBe("01-primaria")
  })

  it("un sitio sin personalizaciones no tiene vigente, y no es un error", () => {
    expect(activeCustomization([], enero)).toBeNull()
  })

  it("sin primaria ni campaña vigente no hay vigente", () => {
    expect(activeCustomization([campana], enero)).toBeNull()
  })

  it("una ventana abierta por un extremo vale desde o hasta siempre", () => {
    const desde: CustomizationWindow = {
      id: "03",
      isPrimary: false,
      startsAt: new Date("2026-06-01T00:00:00Z"),
      endsAt: null,
    }

    expect(activeCustomization([primaria, desde], enero)?.id).toBe("01-primaria")
    expect(activeCustomization([primaria, desde], diciembre)?.id).toBe("03")
  })

  it("ante solapamiento gana la que empezó más tarde, y el desempate es estable", () => {
    const antigua: CustomizationWindow = {
      id: "aa",
      isPrimary: false,
      startsAt: new Date("2026-12-01T00:00:00Z"),
      endsAt: new Date("2026-12-31T00:00:00Z"),
    }
    const reciente: CustomizationWindow = {
      id: "bb",
      isPrimary: false,
      startsAt: new Date("2026-12-10T00:00:00Z"),
      endsAt: new Date("2026-12-20T00:00:00Z"),
    }

    expect(activeCustomization([antigua, reciente], diciembre)?.id).toBe("bb")
    expect(activeCustomization([reciente, antigua], diciembre)?.id).toBe("bb")

    // Mismo comienzo: decide el identificador, para que el orden de la consulta no cambie la página.
    const gemela: CustomizationWindow = { ...reciente, id: "aa" }
    expect(activeCustomization([reciente, gemela], diciembre)?.id).toBe("aa")
  })

  it("los extremos de la ventana están dentro", () => {
    const inicio = campana.startsAt as Date
    const fin = campana.endsAt as Date

    expect(activeCustomization([primaria, campana], inicio)?.id).toBe("02-campana")
    expect(activeCustomization([primaria, campana], fin)?.id).toBe("02-campana")
  })
})

describe("contenido inicial por vertical", () => {
  it("un sitio de almacén nace con secciones, ya pobladas", () => {
    const sections = initialSections("warehouse")

    expect(sections.length).toBeGreaterThan(0)
    expect(sections.every((entry) => isSectionKind(entry.kind))).toBe(true)
    expect(sections.some((entry) => entry.kind === "products")).toBe(true)
    expect(sections.every((entry) => (entry.title ?? "") !== "")).toBe(true)
  })

  it("nace con las posiciones ya numeradas y todas visibles", () => {
    const sections = initialSections("warehouse")
    expect(sections.map((entry) => entry.position)).toEqual(sections.map((_, index) => index))
    expect(sections.every((entry) => entry.show)).toBe(true)
  })

  it("sus botones de desplazamiento apuntan a secciones que trae", () => {
    for (const vertical of ["warehouse", "mosaic", "under-construction"] as const) {
      expect(unresolvedScrollTargets(initialSections(vertical)), vertical).toEqual([])
    }
  })

  it("una vertical sin páginas propias trae lo mínimo, no cero", () => {
    expect(initialSections("under-construction").length).toBeGreaterThan(0)
  })
})
