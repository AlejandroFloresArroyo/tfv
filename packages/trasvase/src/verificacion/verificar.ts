/**
 * La verificación del trasvase.
 *
 * Tres piezas, las tres medidas y ninguna estimada:
 *
 * - **Recuentos**: por colección, origen contra migradas más cuarentena; y por tabla destino,
 *   filas reales contra las que la correspondencia predice. Que las dos vistas cuadren es lo que
 *   convierte «no se perdió nada» de una frase en un número.
 * - **Cuadre de importes**: los cobros de suscripción, en centavos enteros por las dos puntas.
 *   El origen se suma de los documentos migrados; el destino, de la tabla. La resta tiene que dar
 *   cero exacto.
 * - **Muestreo**: pares documento viejo ↔ fila nueva elegidos con semilla, para que la revisión a
 *   ojo sea repetible y dos personas miren las mismas filas.
 */

import type { Documento } from "../volcado/ejson.ts"
import type { Contexto } from "../trasvase/contexto.ts"
import { idDe, texto } from "../trasvase/contexto.ts"

/** Colección vieja → tabla destino. `null`: se absorbe en otra (la meta dentro de `uploads`). */
export const TABLA_DESTINO: Record<string, string | null> = {
  core_user: "users",
  core_companies: "companies",
  core_companies_user: "company_members",
  core_role: "roles",
  core_addresses: "user_addresses",
  core_companies_address: "company_addresses",
  core_client: "counterparties",
  core_provider: "counterparties",
  core_categories: "global_categories",
  core_service: "services",
  core_companies_service: "company_services",
  core_upload: "uploads",
  core_meta: null,
  core_subscription: "subscription_plans",
  core_companies_subscription: "company_subscriptions",
  core_companies_subscriptions_payment: "subscription_payments",
}

/** Correspondencias que no vienen de una colección: las membresías de dueño sintetizadas. */
const COLECCIONES_SINTETICAS: Record<string, string> = {
  trasvase_membresia_dueño: "company_members",
}

export interface FilaRecuento {
  readonly coleccion: string
  readonly tabla: string | null
  readonly origen: number
  readonly migradas: number
  readonly cuarentena: number
  readonly cuadra: boolean
}

export interface RecuentoDestino {
  readonly tabla: string
  readonly filas: number
  /** Migradas de sus colecciones más las sintetizadas que le tocan. */
  readonly esperadas: number
  readonly cuadra: boolean
}

export interface Recuentos {
  readonly colecciones: FilaRecuento[]
  readonly destinos: RecuentoDestino[]
}

export async function verificarRecuentos(contexto: Contexto): Promise<Recuentos> {
  const { sql, volcado } = contexto

  const migradasPorColeccion = new Map<string, number>()
  for (const fila of await sql<{ coleccion: string; total: string }[]>`
    select coleccion, count(*)::text as total from trasvase.correspondencia group by coleccion
  `) {
    migradasPorColeccion.set(fila.coleccion, Number(fila.total))
  }

  const cuarentenaPorColeccion = new Map<string, number>()
  for (const fila of await sql<{ coleccion: string; total: string }[]>`
    select coleccion, count(*)::text as total from trasvase.cuarentena group by coleccion
  `) {
    cuarentenaPorColeccion.set(fila.coleccion, Number(fila.total))
  }

  const colecciones: FilaRecuento[] = []
  for (const [coleccion, tabla] of Object.entries(TABLA_DESTINO)) {
    if (!volcado.existe(coleccion)) continue
    const origen = await volcado.contar(coleccion)
    const migradas = migradasPorColeccion.get(coleccion) ?? 0
    const cuarentena = cuarentenaPorColeccion.get(coleccion) ?? 0
    colecciones.push({
      coleccion,
      tabla,
      origen,
      migradas,
      cuarentena,
      // Una colección absorbida no escribe filas propias: su cuadre es no haber perdido documentos
      // de vista, y eso lo cubre la colección que la absorbe.
      cuadra: tabla === null ? true : origen === migradas + cuarentena,
    })
  }

  const esperadasPorTabla = new Map<string, number>()
  for (const [coleccion, tabla] of Object.entries(TABLA_DESTINO)) {
    if (tabla === null) continue
    esperadasPorTabla.set(
      tabla,
      (esperadasPorTabla.get(tabla) ?? 0) + (migradasPorColeccion.get(coleccion) ?? 0),
    )
  }
  for (const [coleccion, tabla] of Object.entries(COLECCIONES_SINTETICAS)) {
    esperadasPorTabla.set(
      tabla,
      (esperadasPorTabla.get(tabla) ?? 0) + (migradasPorColeccion.get(coleccion) ?? 0),
    )
  }

  const destinos: RecuentoDestino[] = []
  for (const [tabla, esperadas] of esperadasPorTabla) {
    // El nombre de la tabla sale del mapa constante de arriba, nunca de datos.
    const [fila] = await sql.unsafe<{ total: string }[]>(
      `select count(*)::text as total from ${tabla}`,
    )
    const filas = Number(fila?.total ?? 0)
    destinos.push({ tabla, filas, esperadas, cuadra: filas === esperadas })
  }

  return { colecciones, destinos }
}

// ─── Cuadre de importes ──────────────────────────────────────────────────────

export interface Cuadre {
  readonly concepto: string
  readonly origenCentavos: bigint
  readonly destinoCentavos: bigint
  readonly diferenciaCentavos: bigint
  readonly cuadra: boolean
}

export async function cuadrarImportes(contexto: Contexto): Promise<Cuadre[]> {
  const { sql, volcado, registro } = contexto

  // El origen: los documentos migrados —con correspondencia—, separados por resultado del cobro.
  let origenExitosos = 0n
  let origenFallidos = 0n
  if (volcado.existe("core_companies_subscriptions_payment")) {
    for await (const doc of volcado.documentos("core_companies_subscriptions_payment")) {
      if (!registro.idExistente("core_companies_subscriptions_payment", idDe(doc))) continue
      if (typeof doc.amount !== "number" || !Number.isInteger(doc.amount)) continue
      const centavos = BigInt(doc.amount)
      if (texto(doc.status) === "paid") origenExitosos += centavos
      else origenFallidos += centavos
    }
  }

  const sumar = async (exitoso: boolean): Promise<bigint> => {
    const [fila] = await sql<{ centavos: string }[]>`
      select coalesce(sum(amount * 100), 0)::bigint::text as centavos
      from subscription_payments where succeeded = ${exitoso}
    `
    return BigInt(fila?.centavos ?? "0")
  }
  const destinoExitosos = await sumar(true)
  const destinoFallidos = await sumar(false)

  const cuadre = (concepto: string, origen: bigint, destino: bigint): Cuadre => ({
    concepto,
    origenCentavos: origen,
    destinoCentavos: destino,
    diferenciaCentavos: destino - origen,
    cuadra: destino === origen,
  })

  return [
    cuadre("cobros de suscripción exitosos", origenExitosos, destinoExitosos),
    cuadre("cobros de suscripción fallidos", origenFallidos, destinoFallidos),
  ]
}

// ─── Muestreo ────────────────────────────────────────────────────────────────

export interface Muestra {
  readonly coleccion: string
  readonly tabla: string
  readonly idViejo: string
  readonly idNuevo: string
  readonly documento: Documento
  readonly fila: Record<string, unknown> | undefined
}

/** Generador determinista pequeño; con la misma semilla salen las mismas filas. */
function azarCon(semilla: number): () => number {
  let estado = semilla >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function muestrear(
  contexto: Contexto,
  opciones: { porColeccion: number; semilla?: number },
): Promise<Muestra[]> {
  const { sql, volcado, registro } = contexto
  const azar = azarCon(opciones.semilla ?? 1)
  const muestras: Muestra[] = []

  for (const [coleccion, tabla] of Object.entries(TABLA_DESTINO)) {
    if (tabla === null || !volcado.existe(coleccion)) continue

    // Muestreo de yacimiento sobre los documentos migrados, sin cargar la colección entera.
    const elegidos: Documento[] = []
    let vistos = 0
    for await (const doc of volcado.documentos(coleccion)) {
      if (!registro.idExistente(coleccion, idDe(doc))) continue
      vistos += 1
      if (elegidos.length < opciones.porColeccion) {
        elegidos.push(doc)
      } else {
        const lugar = Math.floor(azar() * vistos)
        if (lugar < opciones.porColeccion) elegidos[lugar] = doc
      }
    }

    for (const doc of elegidos) {
      const idViejo = idDe(doc)
      const idNuevo = registro.idExistente(coleccion, idViejo)
      if (!idNuevo) continue
      const filas = await sql.unsafe<Record<string, unknown>[]>(
        `select * from ${tabla} where id = $1`,
        [idNuevo],
      )
      muestras.push({ coleccion, tabla, idViejo, idNuevo, documento: doc, fila: filas[0] })
    }
  }

  return muestras
}

// ─── El informe de lo descartado ─────────────────────────────────────────────

/** La cuarentena, contada y explicada, para que negocio decida sobre ella. */
export async function informeCuarentena(contexto: Contexto): Promise<string> {
  const grupos = await contexto.sql<
    { coleccion: string; regla: string; motivo: string; filas: string; ejemplos: string[] }[]
  >`
    select coleccion, regla, min(motivo) as motivo, count(*)::text as filas,
           (array_agg(id_viejo order by id_viejo))[1:5] as ejemplos
    from trasvase.cuarentena
    group by coleccion, regla
    order by coleccion, regla
  `

  const partes = [
    "# Filas que no migraron, y por qué",
    "",
    "Ninguna se tiró: cada una está entera en `trasvase.cuarentena` con su documento original.",
    "",
  ]

  if (grupos.length === 0) {
    partes.push("_La cuarentena está vacía._")
    return partes.join("\n")
  }

  partes.push("| colección | regla | filas | motivo | ejemplos |")
  partes.push("| --- | --- | --- | --- | --- |")
  for (const grupo of grupos) {
    partes.push(
      `| ${grupo.coleccion} | ${grupo.regla} | ${grupo.filas} | ${grupo.motivo} | ${grupo.ejemplos.join(", ")} |`,
    )
  }
  return partes.join("\n")
}
