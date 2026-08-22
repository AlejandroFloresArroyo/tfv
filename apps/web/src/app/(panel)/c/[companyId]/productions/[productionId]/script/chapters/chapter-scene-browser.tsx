import { Badge } from "@tfv/ui"
import { Film } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { TreeBrowser } from "~/components/tree/tree-browser.tsx"
import type { ScriptRow } from "../../../production.ts"
import { ChapterActions, CreateChapter } from "./chapter-actions.tsx"
import type { BreakdownNode } from "./chapter-scene-data.ts"
import { nextIndexAfter } from "./chapter-scene-data.ts"
import { CreateScene, SceneActions } from "./scene-actions.tsx"

/**
 * El árbol de capítulos y escenas de una producción, sobre `TreeBrowser`.
 *
 * Dos niveles fijos y no una jerarquía arbitraria: la raíz siempre son capítulos, y lo que cuelga
 * de un capítulo siempre son escenas — nunca al revés, y una escena nunca cuelga de otra. Por eso,
 * a diferencia de `CategoryBrowser`, aquí no hay «mover» ni «crear dentro de una escena»: el
 * formulario de creación de escena sólo se ofrece cuando lo elegido **es** un capítulo.
 *
 * El índice que se propone para lo próximo a crear —capítulo o escena— sale de lo que ya está en
 * memoria (`nextIndexAfter`), no de una petición a `/indices`: `roots` y `childNodes` ya traen todos
 * los índices vivos del nivel que corresponde.
 */
export async function ChapterSceneBrowser({
  companyId,
  productionId,
  scripts,
  roots,
  path = [],
  childNodes = [],
  canCreateChapter,
  canEditChapter,
  canDeleteChapter,
  canCreateScene,
  canEditScene,
  canDeleteScene,
}: {
  companyId: string
  productionId: string
  scripts: readonly ScriptRow[]
  roots: readonly BreakdownNode[]
  path?: readonly BreakdownNode[]
  childNodes?: readonly BreakdownNode[]
  canCreateChapter: boolean
  canEditChapter: boolean
  canDeleteChapter: boolean
  canCreateScene: boolean
  canEditScene: boolean
  canDeleteScene: boolean
}) {
  const t = await getTranslations("productions.chapters")
  const tScenes = await getTranslations("productions.scenes")
  const selected = path.at(-1)
  const base = `/c/${companyId}/productions/${productionId}/script/chapters`

  const scriptNames = new Map(scripts.map((script) => [script.id, script.name]))
  const scriptNameOf = (scriptId: string | null) =>
    scriptId === null ? t("noScript") : (scriptNames.get(scriptId) ?? t("noScript"))

  const meta = (node: BreakdownNode) =>
    node.kind === "chapter" ? scriptNameOf(node.scriptId) : node.label

  const actionsFor = (node: BreakdownNode, after?: string) =>
    node.kind === "chapter" ? (
      <ChapterActions
        companyId={companyId}
        productionId={productionId}
        chapter={node}
        scripts={scripts}
        canEdit={canEditChapter}
        canDelete={canDeleteChapter}
        {...(after === undefined ? {} : { after })}
      />
    ) : (
      <SceneActions
        companyId={companyId}
        productionId={productionId}
        scene={node}
        canEdit={canEditScene}
        canDelete={canDeleteScene}
        {...(after === undefined ? {} : { after })}
      />
    )

  const canAct =
    (selected?.kind === "chapter" && (canEditChapter || canDeleteChapter)) ||
    (selected?.kind === "scene" && (canEditScene || canDeleteScene))

  const nodeCanAct = (node: BreakdownNode) =>
    node.kind === "chapter" ? canEditChapter || canDeleteChapter : canEditScene || canDeleteScene

  const parent = path.at(-2)

  return (
    <TreeBrowser<BreakdownNode>
      base={base}
      icon={Film}
      labels={{
        roots: t("roots"),
        empty: t("empty"),
        path: t("path"),
        home: t("title"),
        inside: tScenes("title"),
        noChildren: tScenes("empty"),
        selectTitle: t("select"),
        selectBody: t("selectBody"),
      }}
      roots={roots}
      path={path}
      childNodes={childNodes}
      meta={meta}
      badge={
        selected?.kind === "scene" ? (
          <Badge tone="reposo">{selected.label}</Badge>
        ) : selected?.kind === "chapter" && selected.scriptId !== null ? (
          <Badge tone="reposo">{scriptNameOf(selected.scriptId)}</Badge>
        ) : undefined
      }
      facts={selected ? <SelectedFacts node={selected} /> : undefined}
      rootsToolbar={
        canCreateChapter ? (
          <CreateChapter
            companyId={companyId}
            productionId={productionId}
            scripts={scripts}
            nextIndex={nextIndexAfter(roots.map((root) => root.index))}
          />
        ) : undefined
      }
      insideToolbar={
        canCreateScene && selected?.kind === "chapter" ? (
          <CreateScene
            companyId={companyId}
            productionId={productionId}
            chapterId={selected.id}
            nextIndex={nextIndexAfter(childNodes.map((child) => child.index))}
          />
        ) : undefined
      }
      actions={
        canAct && selected
          ? actionsFor(selected, parent ? `${base}/${parent.id}` : base)
          : undefined
      }
      nodeActions={(node) => (nodeCanAct(node) ? actionsFor(node) : undefined)}
    />
  )
}

/** Los datos del nodo elegido, capítulo o escena, como pares de una lista de definición. */
async function SelectedFacts({ node }: { node: BreakdownNode }) {
  const t = await getTranslations("productions.chapters")
  const tScenes = await getTranslations("productions.scenes")
  const format = await getFormatter()

  if (node.kind === "chapter") {
    return (
      <>
        <div>
          <dt className="text-content-faint">{t("scenesCount")}</dt>
          <dd className="font-semibold text-content">{node.sceneCount}</dd>
        </div>
        <div>
          <dt className="text-content-faint">{t("responsible")}</dt>
          <dd className="text-content">{node.responsibleName ?? t("noResponsible")}</dd>
        </div>
        {node.synopsis.trim() === "" ? null : (
          <div className="min-w-0 basis-full">
            <dt className="text-content-faint">{t("synopsis")}</dt>
            <dd className="text-content">{node.synopsis}</dd>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div>
        <dt className="text-content-faint">{tScenes("workflowCount")}</dt>
        <dd className="font-semibold text-content">{node.workflowCount}</dd>
      </div>
      {node.missingFromLastSync ? (
        <div>
          <dt className="text-content-faint">{tScenes("syncLabel")}</dt>
          <dd className="font-semibold text-tinta-cuida">{tScenes("missingFromLastSync")}</dd>
        </div>
      ) : null}
      {node.synopsisEditedAt !== null ? (
        <div>
          <dt className="text-content-faint">{tScenes("synopsisEditedAt")}</dt>
          <dd className="text-content">
            {format.dateTime(new Date(node.synopsisEditedAt), { dateStyle: "medium" })}
          </dd>
        </div>
      ) : null}
      {node.synopsis.trim() === "" ? null : (
        <div className="min-w-0 basis-full">
          <dt className="text-content-faint">{tScenes("synopsis")}</dt>
          <dd className="text-content">{node.synopsis}</dd>
        </div>
      )}
    </>
  )
}
