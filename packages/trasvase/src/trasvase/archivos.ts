/**
 * Archivos: `core_upload` + `core_meta` → `uploads`.
 *
 * El destino fundió el archivo y su metainformación en una sola tabla (ver
 * `packages/db/src/schema/media.ts`), así que la rutina absorbe cada `core_meta` dentro de su
 * subida y `core_meta` no tiene tabla destino propia.
 *
 * Cuando la meta no existe —referencia rota real del origen— la fila **se migra igual** derivando
 * lo obligatorio de la URL, con incidencia: un archivo cuyos bytes existen y al que apuntan
 * usuarios y empresas no se tira por un documento de metadatos perdido.
 *
 * **Esto condiciona la sección «Archivos» pendiente**: aquí se migran las URL del proveedor viejo
 * tal cual. La copia de objetos al proveedor nuevo, cuando exista, reescribirá `url`, `variants` y
 * `storage_path` sobre estas mismas filas usando la correspondencia; ninguna otra tabla guarda la
 * dirección, así que la reescritura es un solo barrido.
 */

import { uploads } from "@tfv/db/schema"
import type { Documento } from "../volcado/ejson.ts"
import { type Contexto, enTransaccion, idDe, marcasDe, recortar, texto } from "./contexto.ts"

const COLECCION = "core_upload"
const COLECCION_META = "core_meta"

const TIPOS: Record<string, "image" | "video" | "document" | "file" | "signature"> = {
  IMAGE: "image",
  VIDEO: "video",
  PDF: "document",
  FILE: "file",
  SIGNATURE: "signature",
}

const ESTADOS = new Set(["pending", "uploaded", "error"])

interface Variantes {
  readonly thumbnail: string | null
  readonly small: string | null
  readonly medium: string | null
  readonly large: string | null
}

function variantesDe(doc: Documento): Variantes | null {
  const calidad = doc.quality
  if (calidad === null || typeof calidad !== "object") return null
  const fuente = calidad as Record<string, unknown>
  const variantes: Variantes = {
    thumbnail: texto(fuente.thumbnail) || null,
    small: texto(fuente.small) || null,
    medium: texto(fuente.medium) || null,
    large: texto(fuente.large) || null,
  }
  const alguna = Object.values(variantes).some((valor) => valor !== null)
  return alguna ? variantes : null
}

function nombreDesdeUrl(url: string): string {
  try {
    const ruta = new URL(url).pathname
    const ultimo = ruta.split("/").filter(Boolean).at(-1)
    return ultimo ?? "archivo"
  } catch {
    return "archivo"
  }
}

export async function trasvasarArchivos(contexto: Contexto): Promise<void> {
  const { volcado, registro } = contexto
  registro.limpiarCuarentena([COLECCION, COLECCION_META])

  // La meta se lee entera a memoria: se consulta al azar desde cada subida.
  const metas = new Map<string, Documento>()
  if (volcado.existe(COLECCION_META)) {
    for await (const doc of volcado.documentos(COLECCION_META)) {
      metas.set(idDe(doc), doc)
    }
  }

  await enTransaccion(contexto, async (db) => {
    /** Un marcador de posición por tipo, como exige `uploads_placeholder_unique`. */
    const marcadorPorTipo = new Set<string>()

    for await (const doc of volcado.documentos(COLECCION)) {
      const idViejo = idDe(doc)

      const url = texto(doc.url)
      if (url === "") {
        registro.cuarentena(
          COLECCION,
          idViejo,
          "url-ausente",
          "La subida no trae URL y la columna destino es obligatoria",
          doc,
        )
        continue
      }

      const estado = texto(doc.status, "pending")
      if (!ESTADOS.has(estado)) {
        registro.cuarentena(
          COLECCION,
          idViejo,
          "estado-desconocido",
          `El estado «${estado}» no existe en el enum destino`,
          doc,
        )
        continue
      }

      const tipoViejo = texto(doc.type, "FILE")
      let kind = TIPOS[tipoViejo]
      if (!kind) {
        kind = "file"
        registro.incidencia(
          COLECCION,
          idViejo,
          "type",
          `Tipo «${tipoViejo}» desconocido; queda como archivo genérico`,
        )
      }

      const metaId = texto(doc.metaId)
      const meta = metaId === "" ? undefined : metas.get(metaId)
      if (metaId !== "" && !meta) {
        registro.incidencia(
          COLECCION,
          idViejo,
          "metaId",
          "La meta no existe en el volcado; lo obligatorio se derivó de la URL",
        )
      }

      const nombre = meta ? texto(meta.fileName, nombreDesdeUrl(url)) : nombreDesdeUrl(url)
      const extension = meta
        ? texto(meta.ext)
        : nombre.includes(".")
          ? (nombre.split(".").at(-1) ?? "")
          : ""

      let esMarcador = doc.default === true
      if (esMarcador) {
        if (marcadorPorTipo.has(kind)) {
          esMarcador = false
          registro.incidencia(
            COLECCION,
            idViejo,
            "default",
            "Ya hay un marcador de posición de este tipo; éste deja de serlo",
          )
        } else {
          marcadorPorTipo.add(kind)
        }
      }

      const fila = {
        id: registro.idPara(COLECCION, idViejo),
        kind,
        status: estado as "pending" | "uploaded" | "error",
        url,
        variants: variantesDe(doc),
        fileName: recortar(contexto, COLECCION, idViejo, "fileName", nombre, 255),
        extension: recortar(contexto, COLECCION, idViejo, "extension", extension, 16),
        contentType: recortar(
          contexto,
          COLECCION,
          idViejo,
          "contentType",
          meta ? texto(meta.contentType, "application/octet-stream") : "application/octet-stream",
          128,
        ),
        byteSize:
          meta && typeof meta.size === "number" && Number.isFinite(meta.size)
            ? Math.max(0, Math.trunc(meta.size))
            : 0,
        storagePath: meta ? texto(meta.path) : nombreDesdeUrl(url),
        isPlaceholder: esMarcador,
        ...marcasDe(doc),
      }

      await db.insert(uploads).values(fila).onConflictDoUpdate({ target: uploads.id, set: fila })
    }
  })
}
