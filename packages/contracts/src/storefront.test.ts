import { describe, expect, it } from "vitest"
import {
  RESERVED_SUBDOMAINS,
  storefrontAddress,
  subdomainOf,
  verticalOf,
  WEBSITE_VERTICALS,
} from "./storefront.ts"

describe("el subdominio sale del nombre de host", () => {
  it("un sitio se reconoce por su etiqueta bajo el dominio de tiendas", () => {
    expect(subdomainOf("mi-tienda.tfv.mx", "tfv.mx")).toBe("mi-tienda")
  })

  it("el dominio principal no es ninguna tienda", () => {
    expect(subdomainOf("tfv.mx", "tfv.mx")).toBeNull()
  })

  it("un anfitrión de otro dominio no se atiende como tienda", () => {
    expect(subdomainOf("mi-tienda.otracosa.com", "tfv.mx")).toBeNull()
  })

  /**
   * El puerto no forma parte del nombre. En desarrollo la cabecera llega como
   * `mi-tienda.localhost:3000`, y sin recortarlo el sitio no se encontraría nunca — que es el fallo
   * que sólo aparece al abrir el navegador y no al leer el código.
   */
  it("el puerto no forma parte del nombre", () => {
    expect(subdomainOf("mi-tienda.localhost:3000", "localhost")).toBe("mi-tienda")
  })

  it("el nombre de host no distingue mayúsculas", () => {
    expect(subdomainOf("MI-Tienda.TFV.MX", "tfv.mx")).toBe("mi-tienda")
  })

  /**
   * Un solo nivel. `a.b.tfv.mx` no es la tienda `a`: es un anfitrión que no reconocemos, y tratarlo
   * como tienda dejaría dos direcciones distintas sirviendo lo mismo.
   */
  it("sólo se reconoce una etiqueta de profundidad", () => {
    expect(subdomainOf("uno.dos.tfv.mx", "tfv.mx")).toBeNull()
  })

  it("los nombres reservados de la plataforma no son tiendas", () => {
    for (const reserved of RESERVED_SUBDOMAINS) {
      expect(subdomainOf(`${reserved}.tfv.mx`, "tfv.mx"), reserved).toBeNull()
    }
  })

  it("una etiqueta vacía no es un sitio", () => {
    expect(subdomainOf(".tfv.mx", "tfv.mx")).toBeNull()
    expect(subdomainOf("", "tfv.mx")).toBeNull()
  })

  /**
   * Lo que llega en `Host` lo elige quien llama. Una etiqueta con caracteres fuera del alfabeto de
   * un identificador legible no puede ser un sitio, y dejarla pasar la convertiría en un valor que
   * viaja hasta la consulta.
   */
  it("una etiqueta que no es un identificador legible no es un sitio", () => {
    expect(subdomainOf("mi tienda.tfv.mx", "tfv.mx")).toBeNull()
    expect(subdomainOf("mi_tienda.tfv.mx", "tfv.mx")).toBeNull()
    expect(subdomainOf("../etc.tfv.mx", "tfv.mx")).toBeNull()
  })
})

describe("la dirección pública de un sitio", () => {
  it("se compone del identificador legible y el dominio de tiendas", () => {
    expect(storefrontAddress("mi-tienda", "tfv.mx")).toBe("https://mi-tienda.tfv.mx")
  })

  /** En desarrollo no hay certificado, y una dirección con `https` no abre. */
  it("en un dominio local se sirve sin cifrar", () => {
    expect(storefrontAddress("mi-tienda", "localhost:3000")).toBe("http://mi-tienda.localhost:3000")
  })
})

describe("la vertical sale de la categoría del sitio", () => {
  it("las dos verticales reconocidas se identifican por su clave estable", () => {
    expect(verticalOf("warehouse-store")).toBe("warehouse")
    expect(verticalOf("mosaic-store")).toBe("mosaic")
  })

  /**
   * «Una vertical no reconocida SHALL servir la página en construcción, **sin producir error**».
   * Un sitio se puede dar de alta antes de decidir qué va a vender.
   */
  it("una categoría desconocida o ausente cae en construcción", () => {
    expect(verticalOf("cualquier-otra")).toBe("under-construction")
    expect(verticalOf(null)).toBe("under-construction")
  })

  it("el catálogo de verticales es cerrado", () => {
    expect([...WEBSITE_VERTICALS]).toEqual(["warehouse", "mosaic", "under-construction"])
  })
})
