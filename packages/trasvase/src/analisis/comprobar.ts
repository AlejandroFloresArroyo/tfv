/**
 * El comprobador del volcado: el «Análisis previo» de la rebanada 30.
 *
 * Recibe un directorio de exportación y produce el informe con el que se decide el trasvase:
 * qué colecciones hay y cuántas filas traen, cuántas fallarían cada restricción del esquema
 * nuevo, qué referencias están rotas **de verdad** —resueltas contra los `_id` presentes, no
 * contra lo que el esquema declaraba— y qué filas quedaron huérfanas de las cascadas defectuosas.
 *
 * Es la herramienta que se ejecutará sobre el volcado real cuando exista; hoy se ejercita con los
 * accesorios. Dos pasadas: la primera junta los identificadores de cada colección, la segunda
 * evalúa referencias y reglas documento a documento, sin cargar ninguna colección entera.
 */

import { COLECCIONES } from "../modelo/colecciones.ts"
import type { Documento } from "../volcado/ejson.ts"
import type { Volcado } from "../volcado/leer.ts"

export interface ResumenColeccion {
  readonly nombre: string
  readonly filas: number
  /** Está declarada en `modelo/colecciones.ts`; una desconocida se cuenta pero no se comprueba. */
  readonly conocida: boolean
}

export interface ReferenciaRota {
  readonly coleccion: string
  readonly campo: string
  readonly destino: string
  filas: number
  readonly ejemplos: string[]
}

export interface Huerfano {
  readonly coleccion: string
  readonly campo: string
  filas: number
  readonly ejemplos: string[]
}

export interface Violacion {
  readonly coleccion: string
  /** Identificador corto de la regla, estable para los informes. */
  readonly regla: string
  /** La restricción del esquema nuevo que la rechazaría. */
  readonly restriccion: string
  filas: number
  readonly ejemplos: string[]
}

export interface Analisis {
  readonly directorio: string
  readonly colecciones: ResumenColeccion[]
  /** Colecciones del alcance declaradas que el volcado no trae. */
  readonly ausentes: string[]
  /** Colecciones presentes sólo como `.bson`. */
  readonly sinExportar: string[]
  readonly referenciasRotas: ReferenciaRota[]
  readonly huerfanos: Huerfano[]
  readonly violaciones: Violacion[]
}

const MAXIMO_EJEMPLOS = 5

function anotar(entrada: { filas: number; ejemplos: string[] }, ejemplo: string): void {
  entrada.filas += 1
  if (entrada.ejemplos.length < MAXIMO_EJEMPLOS) entrada.ejemplos.push(ejemplo)
}

/** Detector de claves repetidas: la primera aparición gana, las demás violan la restricción. */
class Unicidad {
  private readonly vistas = new Set<string>()
  private violacion: Violacion | undefined

  constructor(
    private readonly coleccion: string,
    private readonly regla: string,
    private readonly restriccion: string,
    private readonly destino: Violacion[],
  ) {}

  observar(clave: string | undefined, id: string): void {
    if (clave === undefined || clave === "") return
    if (!this.vistas.has(clave)) {
      this.vistas.add(clave)
      return
    }
    if (!this.violacion) {
      this.violacion = {
        coleccion: this.coleccion,
        regla: this.regla,
        restriccion: this.restriccion,
        filas: 0,
        ejemplos: [],
      }
      this.destino.push(this.violacion)
    }
    anotar(this.violacion, id)
  }
}

function cadena(valor: unknown): string | undefined {
  return typeof valor === "string" && valor !== "" ? valor : undefined
}

const ESTADOS_SUSCRIPCION = new Set([
  "trialing",
  "active",
  "past_due",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "canceled",
])

/** Reglas de forma y de unicidad por colección, derivadas de las restricciones del destino. */
function reglasDe(coleccion: string, violaciones: Violacion[]): (doc: Documento, id: string) => void {
  const simple = (regla: string, restriccion: string): Violacion => {
    const entrada: Violacion = { coleccion, regla, restriccion, filas: 0, ejemplos: [] }
    // Se registra sólo cuando anota su primera fila, para no llenar el informe de ceros.
    return entrada
  }
  const registrar = (entrada: Violacion, id: string): void => {
    if (entrada.filas === 0) violaciones.push(entrada)
    anotar(entrada, id)
  }

  switch (coleccion) {
    case "core_user": {
      const correo = new Unicidad(coleccion, "correo-duplicado", "users_email_unique", violaciones)
      const usuario = new Unicidad(
        coleccion,
        "usuario-duplicado",
        "users_username_unique",
        violaciones,
      )
      const ausente = simple("correo-ausente", "users.email not null")
      return (doc, id) => {
        const email = cadena(doc.email)?.trim().toLowerCase()
        if (email === undefined || email === "") registrar(ausente, id)
        else correo.observar(email, id)
        usuario.observar(cadena(doc.username), id)
      }
    }
    case "core_companies_user": {
      const pareja = new Unicidad(
        coleccion,
        "membresia-repetida",
        "company_members_unique",
        violaciones,
      )
      return (doc, id) => {
        const companyId = cadena(doc.companyId)
        const userId = cadena(doc.userId)
        if (companyId && userId) pareja.observar(`${companyId}|${userId}`, id)
      }
    }
    case "core_addresses": {
      const primaria = new Unicidad(
        coleccion,
        "primaria-repetida",
        "user_addresses_primary_unique",
        violaciones,
      )
      return (doc, id) => {
        if (doc.isPrimary === true) primaria.observar(cadena(doc.userId), id)
      }
    }
    case "core_companies_address": {
      const primaria = new Unicidad(
        coleccion,
        "primaria-repetida",
        "company_addresses_primary_unique",
        violaciones,
      )
      return (doc, id) => {
        if (doc.isPrimary === true) primaria.observar(cadena(doc.companyId), id)
      }
    }
    case "core_client":
    case "core_provider": {
      const porUsuario = new Unicidad(
        coleccion,
        "pareja-repetida",
        "counterparties_user_pair_unique",
        violaciones,
      )
      const porEmpresa = new Unicidad(
        coleccion,
        "pareja-empresa-repetida",
        "counterparties_company_pair_unique",
        violaciones,
      )
      return (doc, id) => {
        const dueña = cadena(doc.companyId)
        if (!dueña) return
        const contraparteEmpresa = cadena(doc.userCompanyId)
        const contraparteUsuario = cadena(doc.userId)
        if (contraparteEmpresa) porEmpresa.observar(`${dueña}|${contraparteEmpresa}`, id)
        else if (contraparteUsuario) porUsuario.observar(`${dueña}|${contraparteUsuario}`, id)
      }
    }
    case "core_categories": {
      const slug = new Unicidad(
        coleccion,
        "slug-duplicado",
        "global_categories_slug_unique",
        violaciones,
      )
      const keyname = new Unicidad(
        coleccion,
        "keyname-duplicado",
        "global_categories_keyname_unique",
        violaciones,
      )
      return (doc, id) => {
        slug.observar(cadena(doc.slug), id)
        keyname.observar(cadena(doc.keyname), id)
      }
    }
    case "core_service": {
      const keycode = new Unicidad(
        coleccion,
        "keycode-duplicado",
        "services_keycode_unique",
        violaciones,
      )
      return (doc, id) => keycode.observar(cadena(doc.keycode), id)
    }
    case "core_companies_service": {
      const pareja = new Unicidad(
        coleccion,
        "habilitacion-repetida",
        "company_services_unique",
        violaciones,
      )
      return (doc, id) => {
        const companyId = cadena(doc.companyId)
        const serviceId = cadena(doc.serviceId)
        if (companyId && serviceId) pareja.observar(`${companyId}|${serviceId}`, id)
      }
    }
    case "core_subscription": {
      const producto = new Unicidad(
        coleccion,
        "producto-duplicado",
        "subscription_plans_external_unique",
        violaciones,
      )
      return (doc, id) => producto.observar(cadena(doc.productId), id)
    }
    case "core_companies_subscription": {
      const vigente = new Unicidad(
        coleccion,
        "vigente-repetida",
        "company_subscriptions_company_unique",
        violaciones,
      )
      const externa = new Unicidad(
        coleccion,
        "externa-repetida",
        "company_subscriptions_external_unique",
        violaciones,
      )
      const estado = simple("estado-desconocido", "subscription_status")
      return (doc, id) => {
        if (doc.status !== "canceled") vigente.observar(cadena(doc.companyId), id)
        externa.observar(cadena(doc.stripe_subscriptionId), id)
        if (!ESTADOS_SUSCRIPCION.has(String(doc.status))) registrar(estado, id)
      }
    }
    case "core_companies_subscriptions_payment": {
      const factura = new Unicidad(
        coleccion,
        "factura-repetida",
        "subscription_payments_invoice_unique",
        violaciones,
      )
      const importe = simple("importe-no-entero", "subscription_payments.amount")
      return (doc, id) => {
        factura.observar(cadena(doc.stripe_invoiceId), id)
        const monto = doc.amount
        if (typeof monto !== "number" || !Number.isInteger(monto) || monto < 0) {
          registrar(importe, id)
        }
      }
    }
    default:
      return () => {}
  }
}

export async function comprobarVolcado(volcado: Volcado): Promise<Analisis> {
  const presentes = new Set(volcado.nombres())
  const conocidas = new Map(COLECCIONES.map((entrada) => [entrada.nombre, entrada]))

  // ── Primera pasada: los identificadores presentes por colección, y los recuentos. ──
  const identificadores = new Map<string, Set<string>>()
  const colecciones: ResumenColeccion[] = []

  for (const nombre of volcado.nombres()) {
    const ids = new Set<string>()
    for await (const documento of volcado.documentos(nombre)) {
      const id = documento._id
      if (typeof id === "string") ids.add(id)
    }
    identificadores.set(nombre, ids)
    colecciones.push({ nombre, filas: ids.size, conocida: conocidas.has(nombre) })
  }

  const ausentes = [...conocidas.keys()].filter((nombre) => !presentes.has(nombre))

  // ── Segunda pasada: referencias y reglas, documento a documento. ──
  const referenciasRotas: ReferenciaRota[] = []
  const huerfanos: Huerfano[] = []
  const violaciones: Violacion[] = []

  for (const declaracion of COLECCIONES) {
    if (!presentes.has(declaracion.nombre)) continue

    const rotasPorCampo = new Map<string, ReferenciaRota>()
    const huerfanosPorCampo = new Map<string, Huerfano>()
    const reglas = reglasDe(declaracion.nombre, violaciones)

    for await (const documento of volcado.documentos(declaracion.nombre)) {
      const id = typeof documento._id === "string" ? documento._id : "(sin _id)"

      for (const referencia of declaracion.referencias) {
        // Si la colección destino no vino en el volcado, todo apuntaría «roto»: eso ya lo dice
        // `ausentes`, y repetirlo por referencia sería ruido.
        const destino = identificadores.get(referencia.destino)
        if (!destino) continue

        const crudo = documento[referencia.campo]
        const valores = referencia.multiple
          ? (Array.isArray(crudo) ? crudo : [])
          : [crudo]

        for (const valor of valores) {
          if (typeof valor !== "string" || valor === "" || destino.has(valor)) continue

          let rotas = rotasPorCampo.get(referencia.campo)
          if (!rotas) {
            rotas = {
              coleccion: declaracion.nombre,
              campo: referencia.campo,
              destino: referencia.destino,
              filas: 0,
              ejemplos: [],
            }
            rotasPorCampo.set(referencia.campo, rotas)
            referenciasRotas.push(rotas)
          }
          anotar(rotas, id)

          if (referencia.dueño) {
            let huerfano = huerfanosPorCampo.get(referencia.campo)
            if (!huerfano) {
              huerfano = { coleccion: declaracion.nombre, campo: referencia.campo, filas: 0, ejemplos: [] }
              huerfanosPorCampo.set(referencia.campo, huerfano)
              huerfanos.push(huerfano)
            }
            anotar(huerfano, id)
          }
        }
      }

      reglas(documento, id)
    }
  }

  return {
    directorio: volcado.directorio,
    colecciones,
    ausentes,
    sinExportar: volcado.sinExportar(),
    referenciasRotas,
    huerfanos,
    violaciones,
  }
}

// ─── El informe legible ──────────────────────────────────────────────────────

function tabla(encabezados: string[], filas: string[][]): string {
  if (filas.length === 0) return "_Nada que señalar._\n"
  const linea = (celdas: string[]) => `| ${celdas.join(" | ")} |`
  return [
    linea(encabezados),
    linea(encabezados.map(() => "---")),
    ...filas.map(linea),
    "",
  ].join("\n")
}

/** El análisis, como texto que negocio puede leer sin abrir una consola. */
export function informeAnalisis(analisis: Analisis): string {
  const partes: string[] = []

  partes.push("# Análisis previo del volcado")
  partes.push("")
  partes.push(`Directorio: \`${analisis.directorio}\``)
  partes.push("")

  partes.push("## Colecciones")
  partes.push("")
  partes.push(
    tabla(
      ["colección", "filas", "en el alcance"],
      analisis.colecciones.map((entrada) => [
        entrada.nombre,
        String(entrada.filas),
        entrada.conocida ? "sí" : "no",
      ]),
    ),
  )
  if (analisis.ausentes.length > 0) {
    partes.push(`Ausentes del alcance: ${analisis.ausentes.join(", ")}`)
    partes.push("")
  }
  if (analisis.sinExportar.length > 0) {
    partes.push(
      `Sólo como .bson, hay que exportarlas con mongoexport: ${analisis.sinExportar.join(", ")}`,
    )
    partes.push("")
  }

  partes.push("## Filas que fallarían una restricción del esquema nuevo")
  partes.push("")
  partes.push(
    tabla(
      ["colección", "regla", "restricción destino", "filas", "ejemplos"],
      analisis.violaciones.map((entrada) => [
        entrada.coleccion,
        entrada.regla,
        `\`${entrada.restriccion}\``,
        String(entrada.filas),
        entrada.ejemplos.join(", "),
      ]),
    ),
  )

  partes.push("## Referencias rotas")
  partes.push("")
  partes.push(
    tabla(
      ["colección", "campo", "apunta a", "filas", "ejemplos"],
      analisis.referenciasRotas.map((entrada) => [
        entrada.coleccion,
        entrada.campo,
        entrada.destino,
        String(entrada.filas),
        entrada.ejemplos.join(", "),
      ]),
    ),
  )

  partes.push("## Huérfanas")
  partes.push("")
  partes.push("Filas cuyo dueño no existe: quedaron inalcanzables por una cascada defectuosa.")
  partes.push("")
  partes.push(
    tabla(
      ["colección", "por el campo", "filas", "ejemplos"],
      analisis.huerfanos.map((entrada) => [
        entrada.coleccion,
        entrada.campo,
        String(entrada.filas),
        entrada.ejemplos.join(", "),
      ]),
    ),
  )

  return partes.join("\n")
}
