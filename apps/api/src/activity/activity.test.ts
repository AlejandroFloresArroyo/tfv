/**
 * Bitácora, audiencia y bandeja, de extremo a extremo.
 *
 * Transcritas de los escenarios de `openspec/specs/activity-and-notifications/spec.md`.
 *
 * Lo que se comprueba aquí es lo que la implementación anterior no podía cumplir: que el asiento
 * viva o muera con su mutación, que la audiencia salga del mismo permiso que autoriza la acción, y
 * que un proveedor caído no se lleve por delante una operación de negocio.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db, withRequester } from "@tfv/db"
import {
  backgroundJobs,
  companies,
  companyActivities,
  companyMembers,
  loginAttempts,
  notificationDeliveries,
  notificationPreferences,
  pushDevices,
  roles,
  sessions,
  users,
} from "@tfv/db/schema"
import { desc, eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"
import { describeRoutes } from "../runtime/route.ts"
import { recordActivity } from "./activity.ts"
import {
  deliverQueued,
  RECIPIENT_SYNC,
  type Recipient,
  registerTransport,
  requeueFailed,
  resetTransports,
  syncRecipientEverywhere,
} from "./delivery.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${notificationPreferences}, ${pushDevices}, ${companyActivities}, ${backgroundJobs}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companies} cascade`,
  )
}

function request(method: string, path: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/**
 * Una cuenta abierta, con **su sesión**.
 *
 * El identificador de sesión no es decorativo: `withRequester` lo exige y el motor comprueba que
 * siga viva en cada transacción. Sin él, la identidad se resuelve nula y las escrituras las rechaza
 * una política, que es el modo de fallo correcto y desconcertante en una prueba.
 */
interface Cuenta {
  readonly email: string
  readonly cookie: string
  readonly userId: string
  readonly sessionId: string
}

async function signUp(prefix: string): Promise<Cuenta> {
  const email = `${prefix}-${newId().slice(-8)}@ejemplo.mx`
  await request("POST", "/auth/register", { email, password: PASSWORD, name: prefix })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await request("POST", "/auth/login", { email, password: PASSWORD })
  const cookie = response.headers
    .getSetCookie()
    .find((raw) => raw.startsWith("tfv_session="))
    ?.split(";")[0]

  if (!cookie) throw new Error(`no se abrió sesión de ${email}`)

  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (!row) throw new Error("la cuenta no se creó")

  const [sesion] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, row.id))
    .limit(1)

  if (!sesion) throw new Error("la sesión no se abrió")

  return { email, cookie, userId: row.id, sessionId: sesion.id }
}

interface Page<T> {
  items: T[]
  totalItems: number
}

interface Asiento {
  id: string
  action: string
  entity: string
  entityId: string | null
  entityLabel: string
  messageKey: string
  messageParams: Record<string, string | number>
  url: string
  performedById: string | null
  performedBy: string
  createdAt: string
  permissions: string[]
}

interface Aviso {
  id: string
  kind: string
  title: string
  bodyKey: string
  bodyParams: Record<string, string | number>
  url: string
  readAt: string | null
  archivedAt: string | null
}

/** Las entregas de bandeja de una persona, leídas por debajo de la API. */
async function bandejaDe(userId: string) {
  return db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.recipientId, userId))
}

let duena: Cuenta
let conPermiso: Cuenta
let sinPermiso: Cuenta
let otraDuena: Cuenta
let companyId = ""

beforeAll(async () => {
  await reset()
  resetTransports()

  duena = await signUp("duena")
  conPermiso = await signUp("conpermiso")
  sinPermiso = await signUp("sinpermiso")
  otraDuena = await signUp("otraduena")

  const empresa = await json<{ id: string }>(
    await request("POST", "/companies", { name: "Casa de Renta" }, duena.cookie),
  )
  companyId = empresa.id

  // Un rol que concede exactamente la clave que protege la edición de la empresa: es la misma que
  // seleccionará la audiencia.
  const rol = await json<{ id: string }>(
    await request(
      "POST",
      `/companies/${companyId}/roles`,
      { name: "Administración", permissions: ["companies.companies.edit"] },
      duena.cookie,
    ),
  )

  for (const cuenta of [conPermiso, sinPermiso, otraDuena]) {
    await request("POST", `/companies/${companyId}/members`, { email: cuenta.email }, duena.cookie)
  }

  const miembros = await json<Page<{ id: string; userId: string }>>(
    await request("GET", `/companies/${companyId}/members?limit=50`, undefined, duena.cookie),
  )

  const idDe = (userId: string) => miembros.items.find((m) => m.userId === userId)?.id

  await request(
    "PATCH",
    `/companies/${companyId}/members/${idDe(conPermiso.userId)}`,
    { roleId: rol.id },
    duena.cookie,
  )

  // Una segunda propietaria **sin rol**: recibe todo por ser propietaria, no por sus permisos.
  await request(
    "PATCH",
    `/companies/${companyId}/members/${idDe(otraDuena.userId)}`,
    { isOwner: true },
    duena.cookie,
  )
})

afterAll(async () => {
  await reset()
  resetTransports()
  await closeConnection()
})

// ─── Asiento ─────────────────────────────────────────────────────────────────

describe("toda mutación deja un asiento", () => {
  it("una edición queda registrada, con quién, qué, cuándo y a dónde ir", async () => {
    // Escenario: «Una creación queda registrada».
    const antes = Date.now()
    const response = await request(
      "PATCH",
      `/companies/${companyId}`,
      { description: "Renta de equipo de cine" },
      duena.cookie,
    )
    expect(response.status).toBe(200)

    const page = await json<Page<Asiento>>(
      await request("GET", `/companies/${companyId}/activity`, undefined, duena.cookie),
    )

    const asiento = page.items[0]
    expect(asiento?.action).toBe("update")
    expect(asiento?.entity).toBe("companies")
    expect(asiento?.entityId).toBe(companyId)
    expect(asiento?.performedById).toBe(duena.userId)
    expect(asiento?.performedBy).toContain("duena")
    // Lo que se guarda es la clave, no la frase: no hay una sola palabra en español en el asiento.
    expect(asiento?.messageKey).toBe("company.updated")
    // Y la referencia lleva a una pantalla que existe, con el prefijo del panel (H-154).
    expect(asiento?.url).toBe(`/c/${companyId}`)
    expect(new Date(asiento?.createdAt ?? 0).getTime()).toBeGreaterThanOrEqual(antes - 1000)
  })

  it("el asiento no guarda ninguna frase redactada", async () => {
    // La comprobación de fondo de H-153: mientras hubo un campo de texto libre, lo que se guardó
    // fue español. Ahora la única forma de decir qué pasó es una clave del catálogo.
    const columnas = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns
          where table_name = 'company_activities'`,
    )

    const nombres = [...columnas].map((fila) => fila.column_name)
    expect(nombres).toContain("message_key")
    expect(nombres).not.toContain("title")
  })

  it("una mutación revertida no deja rastro", async () => {
    // El asiento va en la transacción de la mutación: si se revierte, no existe. Es la mitad del
    // requisito que la implementación anterior no cumplía —emitía la actividad sin esperarla y
    // descartaba sus errores, así que una operación podía completarse sin dejar asiento.
    const [{ total: antes }] = await contar()

    await expect(
      withRequester(duena, async (tx) => {
        await recordActivity(tx, {
          companyId,
          action: "create",
          entity: "companies",
          entityId: companyId,
          entityLabel: "Casa de Renta",
          message: { key: "company.updated", params: {} },
          performedById: duena.userId,
        })
        throw new Error("la mutación falla después de escribir")
      }),
    ).rejects.toThrow("la mutación falla después de escribir")

    const [{ total: despues }] = await contar()
    expect(despues).toBe(antes)
  })

  it("una acción denegada no registra ni notifica nada", async () => {
    // Sale de dónde vive la compuerta: en el middleware, antes del manejador. Un `403` no llega a
    // ejecutar nada, así que no hay nada que registrar.
    const [{ total: antes }] = await contar()

    const response = await request(
      "PATCH",
      `/companies/${companyId}`,
      { description: "No debería poder" },
      sinPermiso.cookie,
    )

    expect(response.status).toBe(403)
    const [{ total: despues }] = await contar()
    expect(despues).toBe(antes)
  })
})

async function contar() {
  const rows = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from company_activities`,
  )
  return [...rows] as [{ total: number }]
}

// ─── Audiencia ───────────────────────────────────────────────────────────────

describe("la audiencia sale del permiso", () => {
  it("la reciben los que tienen la clave y los propietarios, y no el resto", async () => {
    // Escenarios: «Sólo los autorizados reciben el aviso», «El propietario recibe todo» y «El autor
    // ve el asiento pero no recibe aviso».
    await limpiarEntregas()

    const response = await request(
      "PATCH",
      `/companies/${companyId}`,
      { description: "Una edición que avisa" },
      duena.cookie,
    )
    expect(response.status).toBe(200)

    expect(await bandejaDe(conPermiso.userId)).toHaveLength(1)
    // Propietaria sin rol: recibe por serlo.
    expect(await bandejaDe(otraDuena.userId)).toHaveLength(1)
    expect(await bandejaDe(sinPermiso.userId)).toHaveLength(0)
    // Quien lo hizo no se avisa a sí mismo.
    expect(await bandejaDe(duena.userId)).toHaveLength(0)
  })

  it("el autor sí ve su asiento en la bitácora", async () => {
    const page = await json<Page<Asiento>>(
      await request("GET", `/companies/${companyId}/activity`, undefined, duena.cookie),
    )

    expect(page.items.some((asiento) => asiento.performedById === duena.userId)).toBe(true)
  })

  it("con dos claves declaradas hacen falta las dos", async () => {
    // Escenario: «Varios permisos exigen todos». Quien tiene una de las dos no entra.
    await limpiarEntregas()

    await withRequester(duena, (tx) =>
      recordActivity(tx, {
        companyId,
        action: "update",
        entity: "companies",
        entityId: companyId,
        entityLabel: "Casa de Renta",
        message: { key: "company.updated", params: {} },
        permissions: ["companies.companies.edit", "companies.roles.edit"],
        performedById: duena.userId,
      }),
    )

    expect(await bandejaDe(conPermiso.userId)).toHaveLength(0)
    // La propietaria sigue recibiéndolo: la propiedad no es un permiso, es la vía que los elude.
    expect(await bandejaDe(otraDuena.userId)).toHaveLength(1)
  })
})

async function limpiarEntregas() {
  await db.execute(sql`truncate table ${notificationDeliveries} cascade`)
}

/** Los trabajos de sincronización de destinatario que hay encolados ahora mismo. */
async function trabajosDeSincronizacion() {
  return db
    .select({ payload: backgroundJobs.payload })
    .from(backgroundJobs)
    .where(eq(backgroundJobs.kind, RECIPIENT_SYNC))
}

// ─── Bandeja ─────────────────────────────────────────────────────────────────

describe("la bandeja", () => {
  beforeAll(async () => {
    await limpiarEntregas()

    // Tres avisos para quien tiene permiso.
    for (const texto of ["Primero", "Segundo", "Tercero"]) {
      await request("PATCH", `/companies/${companyId}`, { description: texto }, duena.cookie)
    }
  })

  it("llega ordenada y con su contador", async () => {
    const page = await json<Page<Aviso>>(
      await request("GET", "/me/notifications", undefined, conPermiso.cookie),
    )

    expect(page.totalItems).toBe(3)
    expect(page.items[0]?.kind).toBe("activity")
    expect(page.items[0]?.url).toBe(`/c/${companyId}`)

    const counts = await json<{ unread: number; news: number }>(
      await request("GET", "/me/notifications/counts", undefined, conPermiso.cookie),
    )
    expect(counts.unread).toBe(3)
    // Nunca la ha abierto: todo lo que hay es novedad.
    expect(counts.news).toBe(3)
  })

  it("marcar una como leída baja el contador y la conserva", async () => {
    // Escenario: «Marcar como leída actualiza el contador».
    const page = await json<Page<Aviso>>(
      await request("GET", "/me/notifications", undefined, conPermiso.cookie),
    )
    const primera = page.items[0]

    const marcada = await json<Aviso>(
      await request(
        "POST",
        `/me/notifications/${primera?.id}/read`,
        { read: true },
        conPermiso.cookie,
      ),
    )
    expect(marcada.readAt).not.toBeNull()

    const counts = await json<{ unread: number }>(
      await request("GET", "/me/notifications/counts", undefined, conPermiso.cookie),
    )
    expect(counts.unread).toBe(2)

    // Sigue estando en la bandeja.
    const todas = await json<Page<Aviso>>(
      await request("GET", "/me/notifications?filter=all", undefined, conPermiso.cookie),
    )
    expect(todas.totalItems).toBe(3)
  })

  it("archivar la saca de las activas y la deja entre las archivadas", async () => {
    // Escenario: «Archivar la saca de las activas».
    const page = await json<Page<Aviso>>(
      await request("GET", "/me/notifications?filter=unread", undefined, conPermiso.cookie),
    )
    const alguna = page.items[0]

    await request(
      "POST",
      `/me/notifications/${alguna?.id}/archive`,
      { archived: true },
      conPermiso.cookie,
    )

    const sinLeer = await json<Page<Aviso>>(
      await request("GET", "/me/notifications?filter=unread", undefined, conPermiso.cookie),
    )
    const leidas = await json<Page<Aviso>>(
      await request("GET", "/me/notifications?filter=read", undefined, conPermiso.cookie),
    )
    const archivadas = await json<Page<Aviso>>(
      await request("GET", "/me/notifications?filter=archived", undefined, conPermiso.cookie),
    )

    expect(sinLeer.items.some((aviso) => aviso.id === alguna?.id)).toBe(false)
    expect(leidas.items.some((aviso) => aviso.id === alguna?.id)).toBe(false)
    expect(archivadas.items.some((aviso) => aviso.id === alguna?.id)).toBe(true)
  })

  it("el aviso de novedades se reinicia al abrirla y cuenta lo que llega después", async () => {
    // Escenario: «Llegan avisos mientras la bandeja está cerrada».
    const abierta = await json<{ unread: number; news: number }>(
      await request("POST", "/me/notifications/open", undefined, conPermiso.cookie),
    )
    expect(abierta.news).toBe(0)

    await request(
      "PATCH",
      `/companies/${companyId}`,
      { description: "Mientras no mira" },
      duena.cookie,
    )
    await request("PATCH", `/companies/${companyId}`, { description: "Y otra más" }, duena.cookie)

    const counts = await json<{ unread: number; news: number }>(
      await request("GET", "/me/notifications/counts", undefined, conPermiso.cookie),
    )
    expect(counts.news).toBe(2)
  })

  it("no se toca la de otra persona", async () => {
    const ajena = (await bandejaDe(conPermiso.userId))[0]

    const response = await request(
      "POST",
      `/me/notifications/${ajena?.id}/read`,
      { read: true },
      sinPermiso.cookie,
    )

    expect(response.status).toBe(404)
  })
})

// ─── Entrega ─────────────────────────────────────────────────────────────────

describe("la entrega", () => {
  it("con el proveedor caído, la operación de negocio se completa y queda encolada", async () => {
    // Escenario: «El proveedor caído no rompe la operación».
    await limpiarEntregas()
    resetTransports()

    let intentos = 0
    registerTransport("push", {
      send: async () => {
        intentos++
        throw new Error("el proveedor de empuje no responde")
      },
    })

    const response = await request(
      "PATCH",
      `/companies/${companyId}`,
      { description: "Con el proveedor caído" },
      duena.cookie,
    )

    // La operación no se entera de nada.
    expect(response.status).toBe(200)

    // La bandeja se entrega —es nuestra propia base— y abre la de empuje.
    const primera = await deliverQueued()
    expect(primera.sent).toBeGreaterThan(0)
    expect(primera.fanned).toBeGreaterThan(0)

    const segunda = await deliverQueued()
    expect(segunda.failed).toBeGreaterThan(0)
    expect(intentos).toBeGreaterThan(0)

    const fallidas = (await bandejaDe(conPermiso.userId)).filter((fila) => fila.status === "failed")
    expect(fallidas).toHaveLength(1)
    expect(fallidas[0]?.lastError).toContain("no responde")
  })

  it("y se reintenta, sin volver a entregar lo que ya salió", async () => {
    // Escenario: «Una entrega fallida se reintenta».
    const entregadas: string[] = []
    resetTransports()
    registerTransport("push", {
      send: async (delivery) => {
        entregadas.push(delivery.id)
      },
    })

    const reintentadas = await requeueFailed()
    expect(reintentadas).toBeGreaterThan(0)

    const report = await deliverQueued()
    expect(report.sent).toBe(reintentadas)
    expect(entregadas).toHaveLength(reintentadas)

    // Y una segunda vuelta no reenvía nada: la condición de la toma es que siga encolada.
    const tercera = await deliverQueued()
    expect(tercera.sent).toBe(0)
    expect(entregadas).toHaveLength(reintentadas)
  })

  it("respeta el canal que la persona apagó, y la bandeja sigue llegando", async () => {
    // Escenario: «Se desactiva el push de actividad».
    await limpiarEntregas()
    resetTransports()

    const enviadas: string[] = []
    registerTransport("push", { send: async (d) => void enviadas.push(d.id) })

    const guardada = await request(
      "PUT",
      "/me/notification-preferences",
      { category: "activity", channel: "push", enabled: false },
      conPermiso.cookie,
    )
    expect(guardada.status).toBe(200)

    await request("PATCH", `/companies/${companyId}`, { description: "Sin empuje" }, duena.cookie)
    await deliverQueued()

    const suyas = await bandejaDe(conPermiso.userId)
    // Aparece en su bandeja…
    expect(suyas.filter((fila) => fila.channel === "inbox")).toHaveLength(1)
    // …y no se le abre ninguna de empuje.
    expect(suyas.filter((fila) => fila.channel === "push")).toHaveLength(0)
    expect(enviadas).toHaveLength(0)

    // La otra propietaria, que no apagó nada, sí la recibe.
    expect((await bandejaDe(otraDuena.userId)).filter((f) => f.channel === "push")).toHaveLength(1)

    await request(
      "PUT",
      "/me/notification-preferences",
      { category: "activity", channel: "push", enabled: true },
      conPermiso.cookie,
    )
    resetTransports()
  })

  it("la bandeja no se puede apagar, y los avisos de cuenta no salen del correo", async () => {
    const bandeja = await request(
      "PUT",
      "/me/notification-preferences",
      { category: "activity", channel: "inbox", enabled: false },
      conPermiso.cookie,
    )
    expect(bandeja.status).toBe(403)

    const correo = await request(
      "PUT",
      "/me/notification-preferences",
      { category: "account", channel: "email", enabled: false },
      conPermiso.cookie,
    )
    expect(correo.status).toBe(403)
  })

  it("lo que no tiene proveedor se queda encolado, y no cuenta como fallo", async () => {
    // Las entregas de correo llevan encoladas desde la rebanada 04 —los enlaces de verificación y
    // de recuperación—. Sin proveedor no salen, y marcarlas fallidas sería llenar de ruido la única
    // lista que hay que mirar.
    await limpiarEntregas()
    resetTransports()

    await db.insert(notificationDeliveries).values({
      id: newId(),
      recipientId: conPermiso.userId,
      channel: "email",
      kind: "password_recovery",
      payload: { token: "un-token" },
    })

    const report = await deliverQueued()

    expect(report.waiting).toBe(1)
    expect(report.failed).toBe(0)
    const [fila] = await bandejaDe(conPermiso.userId)
    expect(fila?.status).toBe("queued")
  })
})

// ─── El destinatario, ante el proveedor ──────────────────────────────────────

describe("el destinatario se da de alta y se mantiene al día", () => {
  it("el primer envío lo crea, y no hace falta darlo de alta antes", async () => {
    // Escenario: «El primer envío crea al destinatario». Lo que se comprueba es el **orden**: el
    // alta va antes del envío, porque un proveedor que no conoce al destinatario no puede
    // entregarle nada.
    await limpiarEntregas()
    resetTransports()

    const orden: string[] = []
    const altas: Recipient[] = []

    registerTransport("push", {
      send: async () => void orden.push("envío"),
      syncRecipient: async (recipient) => {
        orden.push("alta")
        altas.push(recipient)
      },
    })

    await request("PATCH", `/companies/${companyId}`, { description: "Primer envío" }, duena.cookie)
    await deliverQueued()
    const report = await deliverQueued()

    expect(orden[0]).toBe("alta")
    expect(orden).toContain("envío")
    expect(report.introduced).toBeGreaterThan(0)
    expect(altas[0]?.email).toBeTruthy()

    resetTransports()
  })

  it("y no se le da de alta una vez por aviso", async () => {
    // Tres avisos a la misma persona son un alta, no tres: repetirla por fila convertiría una tanda
    // en una ráfaga de llamadas idénticas al proveedor.
    await limpiarEntregas()
    resetTransports()

    const altas: string[] = []
    registerTransport("push", {
      send: async () => {},
      syncRecipient: async (recipient) => void altas.push(recipient.userId),
    })

    for (const texto of ["Uno", "Dos", "Tres"]) {
      await request("PATCH", `/companies/${companyId}`, { description: texto }, duena.cookie)
    }

    await deliverQueued()
    await deliverQueued()

    expect(altas.filter((userId) => userId === conPermiso.userId)).toHaveLength(1)

    resetTransports()
  })

  it("un canal sin alta que ofrecer entrega igual", async () => {
    // `syncRecipient` es opcional: la bandeja escribe en una fila nuestra y no tiene a quién
    // presentar. Exigirlo obligaría a todo transporte a escribir un método vacío.
    await limpiarEntregas()
    resetTransports()

    const enviadas: string[] = []
    registerTransport("push", { send: async (d) => void enviadas.push(d.id) })

    await request("PATCH", `/companies/${companyId}`, { description: "Sin alta" }, duena.cookie)
    await deliverQueued()
    const report = await deliverQueued()

    expect(enviadas.length).toBeGreaterThan(0)
    expect(report.introduced).toBe(0)

    resetTransports()
  })

  it("cambiar el correo del perfil se propaga a los proveedores", async () => {
    // Escenario: «Cambiar el nombre se propaga». Hoy el único dato del perfil que la API deja
    // cambiar es el correo, y llega por su enlace de verificación: es el cambio de perfil que
    // existe, y es el que se comprueba.
    resetTransports()

    const sincronizados: Recipient[] = []
    registerTransport("email", {
      send: async () => {},
      syncRecipient: async (recipient) => void sincronizados.push(recipient),
    })

    const nuevo = `nueva-${newId().slice(-8)}@ejemplo.mx`
    const solicitud = await request(
      "POST",
      "/auth/change-email",
      { newEmail: nuevo },
      sinPermiso.cookie,
    )
    expect(solicitud.status).toBe(200)

    // Pedirlo **no** cambia nada todavía, así que tampoco hay nada que sincronizar.
    expect(await trabajosDeSincronizacion()).toHaveLength(0)

    const [enlace] = await db
      .select({ payload: notificationDeliveries.payload })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.kind, "email_change_verification"))
      .orderBy(desc(notificationDeliveries.createdAt))
      .limit(1)

    const token = (enlace?.payload as { token?: string } | undefined)?.token
    expect(token).toBeTruthy()

    const confirmacion = await request("POST", "/auth/verify-email", { token }, sinPermiso.cookie)
    expect(confirmacion.status).toBe(200)

    // Confirmarlo sí: el trabajo queda encolado por el hecho de cambiar el perfil, no por un
    // temporizador que pregunte de vez en cuando si alguien cambió algo.
    const encolados = await trabajosDeSincronizacion()
    expect(encolados).toHaveLength(1)
    expect((encolados[0]?.payload as { userId?: string } | undefined)?.userId).toBe(
      sinPermiso.userId,
    )

    // Y al correrlo, el proveedor recibe la dirección nueva.
    await syncRecipientEverywhere(sinPermiso.userId)
    expect(sincronizados.at(-1)?.email).toBe(nuevo)

    resetTransports()
  })
})

// ─── Sin credenciales ────────────────────────────────────────────────────────

describe("ninguna carga útil lleva una contraseña", () => {
  it("ni la del alta, ni la de la invitación, ni la de recuperación", async () => {
    // Criterio de aceptación de la rebanada, y corrección de `DEFECTS.md` S-09: la implementación
    // anterior enviaba la contraseña temporal por correo.
    const email = `recupera-${newId().slice(-8)}@ejemplo.mx`
    await request("POST", "/auth/register", { email, password: PASSWORD, name: "Quien recupera" })
    await request("POST", "/auth/forgot-password", { email })

    const filas = await db.select().from(notificationDeliveries)
    expect(filas.length).toBeGreaterThan(0)

    for (const fila of filas) {
      const sobre = JSON.stringify(fila.payload).toLowerCase()
      expect(sobre).not.toContain(PASSWORD.toLowerCase())
      expect(sobre).not.toContain("password")
      expect(sobre).not.toContain("contraseña")
    }
  })
})

// ─── Consulta ────────────────────────────────────────────────────────────────

describe("la bitácora se consulta", () => {
  it("filtra por tipo de acción y por autor", async () => {
    // Escenario: «Se filtra la bitácora por servicio» —aquí por acción y autor, que son los otros
    // dos filtros del mismo requisito; el servicio lo llevan los asientos de los dominios que
    // cuelgan de uno, y los de empresa no cuelgan de ninguno.
    const creaciones = await json<Page<Asiento>>(
      await request(
        "GET",
        `/companies/${companyId}/activity?action=create`,
        undefined,
        duena.cookie,
      ),
    )

    expect(creaciones.items.length).toBeGreaterThan(0)
    expect(creaciones.items.every((asiento) => asiento.action === "create")).toBe(true)

    const ajenos = await json<Page<Asiento>>(
      await request(
        "GET",
        `/companies/${companyId}/activity?performedById=${conPermiso.userId}`,
        undefined,
        duena.cookie,
      ),
    )
    expect(ajenos.totalItems).toBe(0)
  })

  it("la actividad propia cruza empresas", async () => {
    // Escenario: «La actividad propia cruza empresas».
    const otra = await json<{ id: string }>(
      await request("POST", "/companies", { name: "Segunda casa" }, duena.cookie),
    )

    const mia = await json<Page<Asiento>>(
      await request("GET", "/me/activity?limit=100", undefined, duena.cookie),
    )

    const empresas = new Set(mia.items.map((asiento) => asiento.entityId))
    expect(empresas.has(companyId)).toBe(true)
    expect(empresas.has(otra.id)).toBe(true)
    expect(mia.items.every((asiento) => asiento.performedById === duena.userId)).toBe(true)
  })

  it("y no se ve la de una empresa ajena", async () => {
    const forastera = await signUp("forastera")

    const response = await request(
      "GET",
      `/companies/${companyId}/activity`,
      undefined,
      forastera.cookie,
    )

    expect(response.status).toBe(404)
  })
})

// ─── Dispositivos ────────────────────────────────────────────────────────────

describe("los dispositivos de empuje", () => {
  it("se registran varios, el mismo no duplica, y se revocan", async () => {
    // Escenarios: «Se registra un segundo dispositivo» y «Registrar el mismo dispositivo no duplica».
    const primero = await request(
      "POST",
      "/me/push-devices",
      { token: "credencial-del-navegador-1", userAgent: "Firefox" },
      duena.cookie,
    )
    expect(primero.status).toBe(201)

    await request(
      "POST",
      "/me/push-devices",
      { token: "credencial-del-navegador-2", userAgent: "Chrome" },
      duena.cookie,
    )

    // El mismo, otra vez.
    await request(
      "POST",
      "/me/push-devices",
      { token: "credencial-del-navegador-1", userAgent: "Firefox" },
      duena.cookie,
    )

    const lista = await json<{ items: { id: string }[] }>(
      await request("GET", "/me/push-devices", undefined, duena.cookie),
    )
    expect(lista.items).toHaveLength(2)

    const revocado = await request(
      "DELETE",
      `/me/push-devices/${lista.items[0]?.id}`,
      undefined,
      duena.cookie,
    )
    expect(revocado.status).toBe(204)

    const despues = await json<{ items: unknown[] }>(
      await request("GET", "/me/push-devices", undefined, duena.cookie),
    )
    expect(despues.items).toHaveLength(1)
  })

  it("no se revoca el de otra persona", async () => {
    const lista = await json<{ items: { id: string }[] }>(
      await request("GET", "/me/push-devices", undefined, duena.cookie),
    )

    const response = await request(
      "DELETE",
      `/me/push-devices/${lista.items[0]?.id}`,
      undefined,
      sinPermiso.cookie,
    )

    expect(response.status).toBe(404)
  })
})

// ─── Saneado ─────────────────────────────────────────────────────────────────

describe("el texto del aviso", () => {
  it("no arrastra marcado", async () => {
    // Escenario: «El texto no arrastra marcado». Con el cuerpo hecho de clave y huecos, el marcado
    // sólo puede entrar **por los huecos**, así que es cada parámetro el que se sanea.
    await limpiarEntregas()

    await withRequester(duena, (tx) =>
      recordActivity(tx, {
        companyId,
        action: "update",
        entity: "companies",
        entityId: companyId,
        entityLabel: "<b>Casa</b> de Renta",
        message: { key: "member.invited", params: { email: "<b>quien@ejemplo.mx</b>" } },
        permissions: ["companies.companies.edit"],
        performedById: duena.userId,
      }),
    )

    const page = await json<Page<Aviso>>(
      await request("GET", "/me/notifications", undefined, conPermiso.cookie),
    )

    expect(page.items[0]?.title).toBe("Casa de Renta")
    expect(page.items[0]?.bodyParams.email).toBe("quien@ejemplo.mx")
  })
})

// ─── Título, cuerpo y referencia ─────────────────────────────────────────────

describe("el aviso lleva título, cuerpo y referencia", () => {
  it("el nombre de la entidad, quién hizo qué, y a dónde ir", async () => {
    // Requisito «El aviso resume la actividad»: «un título con el nombre de la entidad afectada, un
    // cuerpo que indique quién hizo qué, y una referencia que lleve a la entidad al pulsarla».
    await limpiarEntregas()

    await request("PATCH", `/companies/${companyId}`, { description: "Con sobre" }, duena.cookie)

    const page = await json<Page<Aviso>>(
      await request("GET", "/me/notifications", undefined, conPermiso.cookie),
    )

    const aviso = page.items[0]
    expect(aviso?.title).toBe("Casa de Renta")
    expect(aviso?.bodyKey).toBe("company.updated")
    // «Quién»: el nombre viaja **en el sobre** porque el sobre acaba lejos de la fila que lo diría.
    expect(aviso?.bodyParams.actor).toContain("duena")
    expect(aviso?.url).toBe(`/c/${companyId}`)
  })

  it("y la referencia de una membresía lleva a la pantalla de miembros", async () => {
    // La que se guardaba era `/{companyId}/miembros`, que no existe en ninguna parte (H-154).
    await limpiarEntregas()

    const invitada = await signUp("invitada")
    await request(
      "POST",
      `/companies/${companyId}/members`,
      { email: invitada.email },
      duena.cookie,
    )

    const page = await json<Page<Aviso>>(
      await request("GET", "/me/notifications", undefined, otraDuena.cookie),
    )

    const aviso = page.items.find((item) => item.bodyKey === "member.invited")
    expect(aviso?.url).toBe(`/c/${companyId}/settings/members`)
    expect(aviso?.bodyParams.email).toBe(invitada.email)
  })

  it("ninguna referencia de la bitácora apunta fuera del panel", async () => {
    // El defecto no era una dirección concreta: era que nadie comprobaba a dónde llevaban. Esto lo
    // comprueba de todas a la vez, y seguirá comprobándolo de las que vengan.
    const page = await json<Page<Asiento>>(
      await request("GET", `/companies/${companyId}/activity?limit=100`, undefined, duena.cookie),
    )

    expect(page.items.length).toBeGreaterThan(0)
    for (const asiento of page.items) {
      expect(asiento.url, asiento.messageKey).toMatch(new RegExp(`^/c/${companyId}(/|$)`))
      expect(asiento.url).not.toContain("undefined")
    }
  })
})

// ─── Retirada de alcance ─────────────────────────────────────────────────────

describe("la administración de plantillas de notificación no existe", () => {
  it("ninguna ruta la expone", () => {
    // `project.md` D-09: era una herramienta de administración **expuesta sin autenticación** que
    // operaba sobre la cuenta real del proveedor. No se reimplementa, y el delta `REMOVED` de esta
    // rebanada lo deja escrito.
    //
    // Comprobarlo con una prueba y no con una frase es la diferencia entre retirar algo y decir que
    // se retiró: la pila nueva nunca lo tuvo, así que lo único que puede fallar es que **vuelva**.
    const rutas = describeRoutes()

    expect(rutas.length).toBeGreaterThan(0)
    for (const ruta of rutas) {
      expect(ruta.path, ruta.summary).not.toMatch(/template|plantilla/i)
    }
  })

  it("y ninguna superficie de avisos queda abierta sin credencial", () => {
    // Lo que hacía peligrosa a aquella herramienta no era administrar plantillas: era hacerlo sin
    // pedir nada. Esto vigila la propiedad, no el nombre.
    const abiertas = describeRoutes()
      .filter((ruta) => /notification|push-devices/.test(ruta.path))
      .filter((ruta) => ruta.access.startsWith("público"))

    expect(abiertas).toEqual([])
  })
})
