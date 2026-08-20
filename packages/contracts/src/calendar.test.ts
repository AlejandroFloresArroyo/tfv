/**
 * El calendario de producción, en lo que tiene de puro.
 *
 * Transcripción de la decisión de producto que gobierna esta superficie: **el calendario siempre
 * muestra algo, y la fecha la resuelve el servidor**. Se prueba aquí y no contra la base porque no
 * necesita la base: dadas las fechas de los sucesos y el día de hoy, la fecha de aterrizaje es una
 * función. Probarla aquí la deja probada para todas las superficies que la consumen.
 */

import { describe, expect, it } from "vitest"
import { CALENDAR_VIEWS, calendarRange, dayOf, landingOf, shiftDay, weekStart } from "./calendar.ts"

// ─── El día civil ────────────────────────────────────────────────────────────

describe("el día civil de un instante", () => {
  it("es el de la fecha en tiempo universal", () => {
    expect(dayOf(new Date("2026-03-15T06:00:00.000Z"))).toBe("2026-03-15")
  })

  it("no se desplaza con la hora", () => {
    expect(dayOf(new Date("2026-03-15T00:00:00.000Z"))).toBe("2026-03-15")
    expect(dayOf(new Date("2026-03-15T23:59:59.999Z"))).toBe("2026-03-15")
  })
})

// ─── La fecha de aterrizaje ──────────────────────────────────────────────────

describe("la fecha de aterrizaje", () => {
  it("con el rodaje por delante, aterriza en el primer suceso", () => {
    const landing = landingOf(["2026-05-01", "2026-05-08", "2026-06-02"], "2026-03-15")

    expect(landing).toEqual({ date: "2026-05-01", reason: "before" })
  })

  it("con el rodaje ya pasado, aterriza en el último suceso", () => {
    const landing = landingOf(["2025-01-10", "2025-02-20"], "2026-03-15")

    expect(landing).toEqual({ date: "2025-02-20", reason: "after" })
  })

  it("dentro del periodo, aterriza en el suceso más cercano a hoy", () => {
    const landing = landingOf(["2026-03-01", "2026-03-14", "2026-04-30"], "2026-03-15")

    expect(landing).toEqual({ date: "2026-03-14", reason: "during" })
  })

  it("un suceso exactamente hoy gana a cualquier otro", () => {
    const landing = landingOf(["2026-03-01", "2026-03-15", "2026-03-16"], "2026-03-15")

    expect(landing).toEqual({ date: "2026-03-15", reason: "during" })
  })

  it("a igual distancia, mira hacia adelante", () => {
    // Una hoja de llamado se lee hacia el futuro: con un suceso a tres días por detrás y otro a
    // tres por delante, el que importa es el que viene.
    const landing = landingOf(["2026-03-12", "2026-03-18"], "2026-03-15")

    expect(landing).toEqual({ date: "2026-03-18", reason: "during" })
  })

  it("sin ningún suceso, aterriza en hoy y lo dice", () => {
    // **Nunca una rejilla vacía sin explicación.** El motivo es lo que la pantalla convierte en
    // palabras en lugar de pintar un mes en blanco que parece un fallo de carga.
    expect(landingOf([], "2026-03-15")).toEqual({ date: "2026-03-15", reason: "empty" })
  })

  it("no le importa en qué orden lleguen las fechas", () => {
    const desordenadas = landingOf(["2026-06-02", "2026-05-01", "2026-05-08"], "2026-03-15")

    expect(desordenadas).toEqual({ date: "2026-05-01", reason: "before" })
  })

  it("ignora las fechas repetidas sin cambiar el resultado", () => {
    const landing = landingOf(["2026-05-01", "2026-05-01", "2026-05-08"], "2026-03-15")

    expect(landing).toEqual({ date: "2026-05-01", reason: "before" })
  })
})

// ─── El rango de cada vista ──────────────────────────────────────────────────

describe("el rango que abarca cada vista", () => {
  it("son cuatro y sólo cuatro", () => {
    expect([...CALENDAR_VIEWS]).toEqual(["year", "month", "week", "day"])
  })

  it("el día es un solo día", () => {
    expect(calendarRange("day", "2026-03-15")).toEqual({ from: "2026-03-15", to: "2026-03-15" })
  })

  it("la semana empieza en lunes", () => {
    // Domingo 15 de marzo de 2026 pertenece a la semana que empezó el lunes 9.
    expect(calendarRange("week", "2026-03-15")).toEqual({ from: "2026-03-09", to: "2026-03-15" })
    expect(calendarRange("week", "2026-03-09")).toEqual({ from: "2026-03-09", to: "2026-03-15" })
  })

  it("el mes va del uno al último, y sabe cuántos días tiene febrero", () => {
    expect(calendarRange("month", "2026-03-15")).toEqual({ from: "2026-03-01", to: "2026-03-31" })
    expect(calendarRange("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" })
    expect(calendarRange("month", "2024-02-10")).toEqual({ from: "2024-02-01", to: "2024-02-29" })
  })

  it("el año va de enero a diciembre", () => {
    expect(calendarRange("year", "2026-03-15")).toEqual({ from: "2026-01-01", to: "2026-12-31" })
  })

  it("cambiar de vista sobre la misma fecha la conserva dentro del rango", () => {
    // El escenario de la spec: «el calendario situado en una fecha en vista de mes → se cambia a
    // vista de semana → se muestra la semana que contiene esa fecha».
    for (const view of CALENDAR_VIEWS) {
      const range = calendarRange(view, "2026-03-15")
      expect(range.from <= "2026-03-15").toBe(true)
      expect(range.to >= "2026-03-15").toBe(true)
    }
  })

  it("la misma semana pedida dos veces da el mismo rango", () => {
    // Es lo que hace que una semana se comparta por enlace: la dirección lleva la fecha, y la
    // fecha determina el rango sin depender de cuándo se abra.
    expect(calendarRange("week", "2026-03-11")).toEqual(calendarRange("week", "2026-03-15"))
  })
})

// ─── Aritmética de días ──────────────────────────────────────────────────────

describe("aritmética de días", () => {
  it("desplaza cruzando el fin de mes", () => {
    expect(shiftDay("2026-03-31", 1)).toBe("2026-04-01")
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("el lunes de una semana es el propio lunes", () => {
    expect(weekStart("2026-03-09")).toBe("2026-03-09")
    expect(weekStart("2026-03-15")).toBe("2026-03-09")
  })
})
