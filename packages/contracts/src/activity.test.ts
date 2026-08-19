/**
 * Lo que dice un asiento y a dónde lleva.
 *
 * Transcrito de `openspec/specs/activity-and-notifications/spec.md`, requisitos «Toda mutación deja
 * un asiento de actividad» —«El asiento SHALL incluir una referencia navegable a la entidad
 * afectada»— y «El aviso resume la actividad».
 */

import { describe, expect, it } from "vitest"
import {
  ACTIVITY_MESSAGES,
  type ActivityMessageKey,
  activityTarget,
  noticeWindowName,
} from "./activity.ts"

describe("el catálogo de mensajes", () => {
  it("declara los parámetros de cada mensaje", () => {
    // Lo que se guarda es la clave y sus parámetros. Que la lista sea cerrada es lo que impide
    // volver a guardar una frase: no hay dónde ponerla.
    expect(ACTIVITY_MESSAGES["member.invited"]).toEqual(["email"])
    expect(ACTIVITY_MESSAGES["company.created"]).toEqual([])
  })

  it("nombra toda clave como <dominio>.<hecho>", () => {
    for (const key of Object.keys(ACTIVITY_MESSAGES)) {
      expect(key, key).toMatch(/^[a-z]+\.[a-z_]+$/)
    }
  })
})

describe("a dónde lleva un asiento", () => {
  it("el de la empresa, a su panel", () => {
    expect(activityTarget({ companyId: "emp", entity: "companies", entityId: "emp" })).toBe(
      "/c/emp",
    )
  })

  it("el de una membresía, a la pantalla de miembros", () => {
    // Y no a `/emp/miembros`, que es lo que se guardaba y no existe en ninguna parte (H-154).
    expect(activityTarget({ companyId: "emp", entity: "company_members", entityId: "m1" })).toBe(
      "/c/emp/settings/members",
    )
  })

  it("el de un almacén, a ese almacén", () => {
    expect(activityTarget({ companyId: "emp", entity: "warehouses", entityId: "nave" })).toBe(
      "/c/emp/warehouses/nave",
    )
  })

  it("sin identificador, al panel de la empresa y no a una dirección rota", () => {
    // Es el caso que produce `/c/emp/warehouses/undefined`, que responde `500` desde H-144.
    expect(activityTarget({ companyId: "emp", entity: "warehouses" })).toBe("/c/emp")
  })

  it("de una entidad que aún no tiene pantalla, al panel de la empresa", () => {
    expect(activityTarget({ companyId: "emp", entity: "quotes", entityId: "q1" })).toBe("/c/emp")
  })

  it("nunca devuelve una dirección con un hueco sin rellenar", () => {
    for (const entity of ["companies", "company_members", "warehouses", "lo-que-sea"]) {
      const target = activityTarget({ companyId: "emp", entity, entityId: "x" })
      expect(target, entity).toMatch(/^\/c\/emp(\/[\w-]+)*$/)
      expect(target, entity).not.toContain("undefined")
    }
  })
})

describe("la pestaña a la que pertenece un aviso", () => {
  it("es la misma para dos avisos de la misma entidad", () => {
    // «Si ya estaba abierta en otra pestaña, se enfoca esa»: la decisión es el nombre, y el
    // enfoque lo hace el navegador. Dos avisos del mismo almacén comparten pestaña.
    expect(noticeWindowName("/c/emp/warehouses/nave")).toBe(
      noticeWindowName("/c/emp/warehouses/nave"),
    )
  })

  it("es distinta para entidades distintas", () => {
    expect(noticeWindowName("/c/emp/warehouses/uno")).not.toBe(
      noticeWindowName("/c/emp/warehouses/dos"),
    )
  })

  it("es un nombre de ventana legal: sin espacios, sin comillas y sin barras", () => {
    expect(noticeWindowName("/c/emp/settings/members")).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("no confunde dos direcciones que sólo difieren en un carácter no alfanumérico", () => {
    // Aplanar a guiones sin más haría que `/c/a/b` y `/c/a-b` fueran la misma pestaña.
    expect(noticeWindowName("/c/emp/a/b")).not.toBe(noticeWindowName("/c/emp/a-b"))
  })
})

describe("los tipos", () => {
  it("aceptan una clave del catálogo", () => {
    const key: ActivityMessageKey = "company.updated"
    expect(ACTIVITY_MESSAGES[key]).toBeDefined()
  })
})
