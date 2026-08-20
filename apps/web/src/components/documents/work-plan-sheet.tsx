import type { DocumentStamp } from "@tfv/contracts/document"
import type { WorkPlanDocument, WorkPlanTask } from "@tfv/contracts/work-plan"
import { getFormatter, getTranslations } from "next-intl/server"
import { PrintRules } from "./print-rules.tsx"

/**
 * La hoja de un plan de trabajo.
 *
 * Ver `openspec/specs/production-workflows/spec.md`, requisito «Documento y enlace del plan».
 *
 * **Es la hoja de llamado de verdad**, la que el equipo lee por la mañana: los hechos duros arriba
 * —qué día, qué escena, quién responde, en qué estado va— y debajo el trabajo repartido por semana
 * y por día. La composición no la decide este componente: llega hecha del servidor, agrupada, y
 * aquí sólo se dibuja.
 *
 * Es la misma hoja con sesión y sin ella: la pantalla del panel y la del enlace público pintan este
 * componente con el mismo modelo. Dos dibujos distintos serían dos documentos distintos con el
 * mismo código.
 *
 * ## Papel, no interfaz
 *
 * Colores fijos —blanco y grises— y no los papeles del tema, igual que la cotización. Una hoja no
 * cambia de color según quién la mire, y un plan impreso en modo oscuro saldría con el fondo del
 * panel.
 *
 * **Sin temperaturas de set.** Los `luz-*` siguen al tema y aquí no hay tema; además el color de un
 * estado no sobrevive a una fotocopiadora ni a una impresora de blanco y negro, que es la que hay
 * en la oficina de producción. El estado va escrito, que es como se lee en papel.
 */
export async function WorkPlanSheet({
  document,
  stamp,
}: {
  document: WorkPlanDocument
  stamp: DocumentStamp
}) {
  const t = await getTranslations("documents")
  const w = await getTranslations("productions.workflowStatus")
  const ts = await getTranslations("productions.taskStatus")
  const p = await getTranslations("productions.workPlanDocument")
  const format = await getFormatter()

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00.000Z`), { dateStyle: "full", timeZone: "UTC" })
  const shortDay = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00.000Z`), { dateStyle: "medium", timeZone: "UTC" })
  const instant = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" })

  return (
    <>
      <PrintRules />

      <article className="documento-hoja mx-auto w-full max-w-[210mm] bg-white p-8 text-gray-9 shadow-[0_1px_3px_rgb(0_0_0/0.12)] tablet:p-10">
        <header className="documento-bloque flex flex-wrap items-start justify-between gap-6 border-gray-3 border-b pb-6">
          <div className="min-w-0">
            <p className="text-h4 font-bold">{document.issuer.name}</p>
            <p className="mt-0.5 text-body1 text-gray-7">{document.production.name}</p>
          </div>

          <div className="text-right">
            <p className="text-body3 uppercase tracking-wider text-gray-6">{p("label")}</p>
            <p className="font-mono text-body1">{document.identity.code}</p>
            <p className="mt-1 text-body2 text-gray-7">{w(document.identity.status)}</p>
          </div>
        </header>

        {/* Los hechos duros del día, que es lo primero que se lee de una hoja de llamado. */}
        <section className="documento-bloque documento-columnas mt-6 grid gap-6 tablet:grid-cols-2">
          <Fact
            label={p("scheduledFor")}
            value={day(document.identity.scheduledFor.slice(0, 10))}
          />
          {document.identity.endsAt ? (
            <Fact label={p("endsAt")} value={day(document.identity.endsAt.slice(0, 10))} />
          ) : null}
          {document.responsibleName ? (
            <Fact label={p("responsible")} value={document.responsibleName} />
          ) : null}
          {document.scene ? (
            <Fact
              label={p("scene")}
              value={`${document.scene.label} · ${document.scene.name}`}
              note={document.scene.chapterName}
            />
          ) : null}
        </section>

        {document.identity.observations.trim() === "" ? null : (
          <section className="documento-bloque mt-6 border-gray-3 border-y py-3">
            <p className="whitespace-pre-wrap text-body1">{document.identity.observations}</p>
          </section>
        )}

        {/* ─── El trabajo, por semana y por día ───────────────────────────── */}
        {document.weeks.length === 0 && document.undated.length === 0 ? (
          <p className="mt-8 text-body1 text-gray-7">{p("noTasks")}</p>
        ) : (
          <section className="mt-8">
            <h2 className="documento-bloque text-body3 uppercase tracking-wider text-gray-6">
              {p("tasks")}
            </h2>

            {document.weeks.map((week) => (
              <div key={week.from} className="documento-bloque mt-5">
                <h3 className="border-gray-3 border-b pb-1 text-body2 font-bold">
                  {p("week", { from: shortDay(week.from), to: shortDay(week.to) })}
                </h3>

                {week.days.map((entry) => (
                  <div key={entry.day} className="documento-bloque mt-3">
                    <h4 className="text-body2 text-gray-7">{day(entry.day)}</h4>
                    <TaskList tasks={entry.tasks} statusOf={ts} labels={p} />
                  </div>
                ))}
              </div>
            ))}

            {document.undated.length > 0 ? (
              <div className="documento-bloque mt-5">
                <h3 className="border-gray-3 border-b pb-1 text-body2 font-bold">{p("undated")}</h3>
                <div className="mt-3">
                  <TaskList tasks={document.undated} statusOf={ts} labels={p} />
                </div>
              </div>
            ) : null}
          </section>
        )}

        {/* ─── El pie ─────────────────────────────────────────────────────── */}
        <section className="documento-bloque mt-8 border-gray-3 border-t pt-3">
          <p className="text-body2">
            {p("totals", {
              total: document.totals.tasks,
              completed: document.totals.byStatus.completed,
            })}
          </p>
        </section>

        <footer className="documento-bloque mt-6 border-gray-3 border-t pt-3 text-body3 text-gray-6">
          <p>{t("generatedBy", { system: stamp.system })}</p>
          <p className="break-all">{stamp.address}</p>
          <p>{instant(stamp.generatedAt)}</p>
        </footer>
      </article>
    </>
  )
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-body3 uppercase tracking-wider text-gray-6">{label}</p>
      <p className="mt-0.5 text-body1">{value}</p>
      {note ? <p className="text-body2 text-gray-7">{note}</p> : null}
    </div>
  )
}

function TaskList({
  tasks,
  statusOf,
  labels,
}: {
  tasks: readonly WorkPlanTask[]
  statusOf: (status: string) => string
  labels: (key: string, values?: Record<string, string | number>) => string
}) {
  return (
    <ul className="mt-1 divide-y divide-gray-2 border-gray-2 border-t">
      {tasks.map((task) => (
        <li key={task.id} className="documento-bloque flex flex-wrap gap-x-4 gap-y-1 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-body1">{task.title}</p>
            {task.description.trim() === "" ? null : (
              <p className="mt-0.5 whitespace-pre-wrap text-body2 text-gray-7">
                {task.description}
              </p>
            )}
            <p className="mt-0.5 text-body3 text-gray-6">
              {[
                task.categoryName,
                task.characterName,
                task.responsibleName,
                task.activityCount > 0
                  ? labels("activities", {
                      done: task.completedActivities,
                      total: task.activityCount,
                    })
                  : null,
              ]
                .filter((piece): piece is string => piece !== null && piece !== "")
                .join(" · ")}
            </p>
          </div>

          {/* El estado va escrito y sin color: el papel no tiene tema, y la fotocopiadora tampoco. */}
          <p className="shrink-0 text-body2 text-gray-7">{statusOf(task.status)}</p>
        </li>
      ))}
    </ul>
  )
}
