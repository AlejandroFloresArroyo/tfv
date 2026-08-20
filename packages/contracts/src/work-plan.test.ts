/**
 * El documento del plan de trabajo.
 *
 * Transcripción del requisito «Documento y enlace del plan» de
 * `openspec/specs/production-workflows/spec.md`: **con sus tareas agrupadas por semana y por día**.
 *
 * La composición es pura y por eso se prueba sin base: recibe las tareas ya leídas y decide cómo se
 * disponen. Es la misma separación que la cotización — el servidor lee, esto ordena, el navegador
 * dibuja — y es lo que hace que previsualizar, imprimir y descargar no puedan diferir.
 */

import { describe, expect, it } from "vitest"
import { composeWorkPlanDocument, type WorkPlanTaskInput } from "./work-plan.ts"

const identity = {
  code: "PLAN-0123456789",
  status: "in_progress" as const,
  observations: "Interiores casa Ruiz",
  scheduledFor: "2026-03-09T06:00:00.000Z",
  endsAt: null,
  generatedAt: "2026-03-01T12:00:00.000Z",
}

const issuer = { name: "Estudios Mariposa", contacts: [] }

function task(overrides: Partial<WorkPlanTaskInput> & { id: string }): WorkPlanTaskInput {
  return {
    title: `Tarea ${overrides.id}`,
    description: "",
    status: "pending",
    scheduledFor: null,
    endsAt: null,
    responsibleName: null,
    categoryName: null,
    characterName: null,
    activityCount: 0,
    completedActivities: 0,
    ...overrides,
  }
}

function compose(tasks: readonly WorkPlanTaskInput[]) {
  return composeWorkPlanDocument({
    identity,
    issuer,
    production: { id: "p1", name: "Serie Piloto" },
    scene: null,
    responsibleName: null,
    tasks,
  })
}

describe("agrupación por semana y por día", () => {
  it("reúne en una semana los días que le pertenecen", () => {
    const doc = compose([
      task({ id: "a", scheduledFor: "2026-03-09T06:00:00.000Z" }),
      task({ id: "b", scheduledFor: "2026-03-11T06:00:00.000Z" }),
      task({ id: "c", scheduledFor: "2026-03-15T06:00:00.000Z" }),
    ])

    expect(doc.weeks).toHaveLength(1)
    expect(doc.weeks[0]).toMatchObject({ from: "2026-03-09", to: "2026-03-15" })
    expect(doc.weeks[0]?.days.map((day) => day.day)).toEqual([
      "2026-03-09",
      "2026-03-11",
      "2026-03-15",
    ])
  })

  it("separa dos semanas distintas y las ordena", () => {
    const doc = compose([
      task({ id: "tarde", scheduledFor: "2026-03-17T06:00:00.000Z" }),
      task({ id: "pronto", scheduledFor: "2026-03-10T06:00:00.000Z" }),
    ])

    expect(doc.weeks.map((week) => week.from)).toEqual(["2026-03-09", "2026-03-16"])
  })

  it("un día con varias tareas las conserva todas", () => {
    const doc = compose([
      task({ id: "a", scheduledFor: "2026-03-10T06:00:00.000Z" }),
      task({ id: "b", scheduledFor: "2026-03-10T18:00:00.000Z" }),
    ])

    expect(doc.weeks[0]?.days).toHaveLength(1)
    expect(doc.weeks[0]?.days[0]?.tasks.map((t) => t.id)).toEqual(["a", "b"])
  })

  it("las tareas sin fecha no se pierden: van aparte", () => {
    // Una tarea sin fecha no cabe en ninguna semana y **existe igual**. Descartarla del documento
    // sería imprimir un plan al que le faltan cosas sin decirlo.
    const doc = compose([
      task({ id: "fechada", scheduledFor: "2026-03-10T06:00:00.000Z" }),
      task({ id: "suelta" }),
    ])

    expect(doc.weeks).toHaveLength(1)
    expect(doc.undated.map((t) => t.id)).toEqual(["suelta"])
  })
})

describe("los recuentos del pie", () => {
  it("cuenta todas las tareas, con fecha y sin ella", () => {
    const doc = compose([
      task({ id: "a", status: "completed", scheduledFor: "2026-03-10T06:00:00.000Z" }),
      task({ id: "b", status: "completed" }),
      task({ id: "c", status: "incomplete", scheduledFor: "2026-03-10T06:00:00.000Z" }),
    ])

    expect(doc.totals.tasks).toBe(3)
    expect(doc.totals.byStatus).toEqual({
      pending: 0,
      in_progress: 0,
      completed: 2,
      incomplete: 1,
    })
  })

  it("un plan sin tareas compone igual, y lo dice con ceros", () => {
    const doc = compose([])

    expect(doc.weeks).toEqual([])
    expect(doc.undated).toEqual([])
    expect(doc.totals.tasks).toBe(0)
  })
})

describe("lo que el documento conserva de su plan", () => {
  it("lleva su identidad, su producción y su emisor", () => {
    const doc = compose([])

    expect(doc.kind).toBe("work-plan")
    expect(doc.identity.code).toBe("PLAN-0123456789")
    expect(doc.production.name).toBe("Serie Piloto")
    expect(doc.issuer.name).toBe("Estudios Mariposa")
  })

  it("cada tarea conserva su día resuelto", () => {
    const doc = compose([task({ id: "a", scheduledFor: "2026-03-10T06:00:00.000Z" })])

    expect(doc.weeks[0]?.days[0]?.tasks[0]?.day).toBe("2026-03-10")
  })
})
