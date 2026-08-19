/**
 * Empresas, membresías y roles, de extremo a extremo.
 *
 * Transcritas de los criterios de aceptación de `openspec/changes/migrate-identity-and-companies`
 * y de los requisitos de roles de `access-control`.
 *
 * Recorren la API real, así que atraviesan las **dos** capas de aislamiento: la compuerta de
 * permisos y las políticas del motor. Una prueba que llamara a las funciones de dominio
 * directamente comprobaría la primera y se saltaría la segunda, que es justo la que tiene que
 * seguir en pie cuando la primera falle.
 */

import { newId } from "@tfv/contracts"
import { closeConnection, db, withElevated } from "@tfv/db"
import {
  companies,
  companyMembers,
  loginAttempts,
  notificationDeliveries,
  roles,
  sessions,
  users,
} from "@tfv/db/schema"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "../runtime/app.ts"

const app = createApp(routes)
const PASSWORD = "una-frase-larga-y-buena"

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companies} cascade`,
  )
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await closeConnection()
})

// ─── Andamiaje ───────────────────────────────────────────────────────────────

interface Session {
  readonly cookie: string
  readonly userId: string
  readonly email: string
}

async function signUp(email: string, { platformAdmin = false } = {}): Promise<Session> {
  await request("POST", "/auth/register", { email, password: PASSWORD, name: email.split("@")[0] })
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), isPlatformAdmin: platformAdmin })
    .where(eq(users.email, email))

  const response = await request("POST", "/auth/login", { email, password: PASSWORD })
  expect(response.status).toBe(200)

  const cookie = response.headers
    .getSetCookie()
    .find((raw) => raw.startsWith("tfv_session="))
    ?.split(";")[0]

  if (!cookie) throw new Error("no se abrió sesión")

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (!user) throw new Error("la cuenta debería existir")

  return { cookie, userId: user.id, email }
}

function request(method: string, path: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

interface Company {
  id: string
  name: string
  commissionRate: string
}
interface Member {
  id: string
  userId: string
  email: string
  roleId: string | null
  isOwner: boolean
  isActive: boolean
}
interface Role {
  id: string
  name: string
  permissions: string[]
  memberCount: number
}

async function newCompany(session: Session, name = "Empresa de prueba"): Promise<Company> {
  const response = await request("POST", "/companies", { name }, session.cookie)
  expect(response.status).toBe(201)
  return json<Company>(response)
}

// ─── Empresas ────────────────────────────────────────────────────────────────

describe("crear una empresa", () => {
  it("deja a quien la crea como propietaria", async () => {
    const founder = await signUp("funda@ejemplo.mx")
    const company = await newCompany(founder)

    const members = await json<{ items: Member[] }>(
      await request("GET", `/companies/${company.id}/members`, undefined, founder.cookie),
    )

    expect(members.items).toHaveLength(1)
    expect(members.items[0]?.userId).toBe(founder.userId)
    expect(members.items[0]?.isOwner).toBe(true)
  })

  it("no exige permiso, porque todavía no hay empresa contra la que resolverlo", async () => {
    // El catálogo tiene `companies.companies.edit` y `.delete`, y **no** tiene `.create`. No es un
    // olvido: un permiso se resuelve dentro de una empresa.
    const anyone = await signUp("cualquiera@ejemplo.mx")
    expect((await request("POST", "/companies", { name: "Nueva" }, anyone.cookie)).status).toBe(201)
  })

  it("sin sesión no se puede crear", async () => {
    expect((await request("POST", "/companies", { name: "Nueva" })).status).toBe(401)
  })

  it("aparece en el listado de quien la creó y no en el de otra persona", async () => {
    const founder = await signUp("duena@ejemplo.mx")
    const stranger = await signUp("ajena@ejemplo.mx")
    await newCompany(founder, "La Mía")

    const mine = await json<{ items: Company[] }>(
      await request("GET", "/companies", undefined, founder.cookie),
    )
    const theirs = await json<{ items: Company[] }>(
      await request("GET", "/companies", undefined, stranger.cookie),
    )

    expect(mine.items.map((c) => c.name)).toEqual(["La Mía"])
    expect(theirs.items).toEqual([])
  })
})

describe("alcance entre arrendatarios", () => {
  it("una empresa ajena responde 404, no 403", async () => {
    // `403` confirmaría que existe, y eso permite descubrir qué empresas hay probando
    // identificadores. Aquí ni siquiera se llega al manejador: la compuerta no encuentra membresía.
    const founder = await signUp("propia@ejemplo.mx")
    const stranger = await signUp("curiosa@ejemplo.mx")
    const company = await newCompany(founder)

    const response = await request("GET", `/companies/${company.id}`, undefined, stranger.cookie)
    expect(response.status).toBe(404)

    // Y la lista tampoco la revela.
    const listed = await json<{ items: Company[] }>(
      await request("GET", "/companies", undefined, stranger.cookie),
    )
    expect(listed.items).toEqual([])
  })

  it("la administración de plataforma sí entra", async () => {
    const founder = await signUp("ajena2@ejemplo.mx")
    const admin = await signUp("plataforma@ejemplo.mx", { platformAdmin: true })
    const company = await newCompany(founder)

    expect((await request("GET", `/companies/${company.id}`, undefined, admin.cookie)).status).toBe(
      200,
    )
  })
})

describe("editar una empresa", () => {
  it("la propietaria puede, sin permisos explícitos", async () => {
    const founder = await signUp("editora@ejemplo.mx")
    const company = await newCompany(founder)

    const response = await request(
      "PATCH",
      `/companies/${company.id}`,
      { name: "Renombrada" },
      founder.cookie,
    )

    expect(response.status).toBe(200)
    expect((await json<Company>(response)).name).toBe("Renombrada")
  })

  it("la comisión sólo la mueve la administración de plataforma", async () => {
    // Si la moviera quien la paga, dejaría de ser una comisión.
    const founder = await signUp("comision@ejemplo.mx")
    const company = await newCompany(founder)

    const rejected = await request(
      "PATCH",
      `/companies/${company.id}`,
      { commissionRate: "0" },
      founder.cookie,
    )
    expect(rejected.status).toBe(403)

    // Y no se guardó nada: rechazar en vez de ignorar evita hacer creer que se guardó.
    const after = await json<Company>(
      await request("GET", `/companies/${company.id}`, undefined, founder.cookie),
    )
    expect(after.commissionRate).toBe(company.commissionRate)
  })

  it("la administración de plataforma sí la mueve", async () => {
    const founder = await signUp("comision2@ejemplo.mx")
    const admin = await signUp("plataforma2@ejemplo.mx", { platformAdmin: true })
    const company = await newCompany(founder)

    const response = await request(
      "PATCH",
      `/companies/${company.id}`,
      { commissionRate: "5" },
      admin.cookie,
    )

    expect(response.status).toBe(200)
    expect((await json<Company>(response)).commissionRate).toBe("5.0000")
  })
})

describe("dar de baja una empresa", () => {
  it("la fila sobrevive y el acceso no", async () => {
    // Criterio: «Una baja de empresa deja su contenido inaccesible y conserva su historial».
    const founder = await signUp("baja@ejemplo.mx")
    const company = await newCompany(founder)

    expect(
      (await request("DELETE", `/companies/${company.id}`, undefined, founder.cookie)).status,
    ).toBe(204)

    // Inaccesible: ni en el listado ni por su dirección.
    const listed = await json<{ items: Company[] }>(
      await request("GET", "/companies", undefined, founder.cookie),
    )
    expect(listed.items).toEqual([])

    /**
     * **`404`, no `403`**, y la diferencia es deliberada.
     *
     * La membresía sobrevive a la baja, así que la compuerta de permisos sigue viendo a una
     * propietaria y deja pasar. Quien responde es el motor: `app.member_of()` ya no cuenta la
     * empresa, la consulta sale vacía y el manejador dice que no existe.
     *
     * Es la respuesta correcta: para quien pregunta, la empresa **no existe**. Un `403` diría «no
     * tienes permiso», que es falso — era su dueña. Y es también el aislamiento funcionando en la
     * capa que tiene que funcionar cuando la de aplicación no lo hace.
     */
    expect(
      (await request("GET", `/companies/${company.id}`, undefined, founder.cookie)).status,
    ).toBe(404)

    // La fila sigue ahí, con su fecha de baja. El borrado es lógico (`project.md` D-02).
    const surviving = await withElevated("comprobación de prueba", (tx) =>
      tx.select().from(companies).where(eq(companies.id, company.id)),
    )
    expect(surviving).toHaveLength(1)
    expect(surviving[0]?.deletedAt).not.toBeNull()
  })

  it("el motor deja de contarla aunque la membresía sobreviva", async () => {
    // Es lo que arregla la migración `0008`. La membresía no se borra al dar de baja la empresa,
    // así que sin ese arreglo `app.member_of()` la seguía incluyendo y sus datos seguían
    // alcanzables por cualquier consulta que no filtrara a mano.
    const founder = await signUp("motor@ejemplo.mx")
    const company = await newCompany(founder)
    await request("DELETE", `/companies/${company.id}`, undefined, founder.cookie)

    const membership = await withElevated("comprobación de prueba", (tx) =>
      tx.select().from(companyMembers).where(eq(companyMembers.companyId, company.id)),
    )
    expect(membership).toHaveLength(1)
    expect(membership[0]?.isActive).toBe(true)

    // Y aun así ya no está en su alcance.
    const listed = await json<{ items: Company[] }>(
      await request("GET", "/companies", undefined, founder.cookie),
    )
    expect(listed.items).toEqual([])
  })
})

// ─── Membresías ──────────────────────────────────────────────────────────────

describe("incorporar miembros", () => {
  it("incorpora a quien ya tiene cuenta", async () => {
    const founder = await signUp("jefa@ejemplo.mx")
    const invited = await signUp("nueva@ejemplo.mx")
    const company = await newCompany(founder)

    const response = await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: invited.email },
      founder.cookie,
    )

    expect(response.status).toBe(201)
    const member = await json<Member>(response)
    expect(member.userId).toBe(invited.userId)
    expect(member.isOwner).toBe(false)

    // Y ahora la empresa aparece en su listado.
    const theirs = await json<{ items: Company[] }>(
      await request("GET", "/companies", undefined, invited.cookie),
    )
    expect(theirs.items.map((c) => c.id)).toEqual([company.id])
  })

  it("un correo sin cuenta se rechaza con 422", async () => {
    const founder = await signUp("jefa2@ejemplo.mx")
    const company = await newCompany(founder)

    const response = await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: "fantasma@ejemplo.mx" },
      founder.cookie,
    )

    expect(response.status).toBe(422)
  })

  it("incorporar a alguien dos veces se rechaza con 409", async () => {
    const founder = await signUp("jefa3@ejemplo.mx")
    const invited = await signUp("repetida@ejemplo.mx")
    const company = await newCompany(founder)

    await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: invited.email },
      founder.cookie,
    )
    const second = await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: invited.email },
      founder.cookie,
    )

    expect(second.status).toBe(409)
  })

  it("un miembro sin permiso no puede incorporar a nadie", async () => {
    const founder = await signUp("jefa4@ejemplo.mx")
    const worker = await signUp("obrera@ejemplo.mx")
    const outsider = await signUp("tercera@ejemplo.mx")
    const company = await newCompany(founder)

    await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: worker.email },
      founder.cookie,
    )

    const response = await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: outsider.email },
      worker.cookie,
    )

    expect(response.status).toBe(403)
  })
})

describe("la empresa nunca se queda sin propietaria", () => {
  async function companyWithTwo() {
    const founder = await signUp(`p1-${Date.now()}@ejemplo.mx`)
    const other = await signUp(`p2-${Date.now()}@ejemplo.mx`)
    const company = await newCompany(founder)

    const added = await json<Member>(
      await request(
        "POST",
        `/companies/${company.id}/members`,
        { email: other.email },
        founder.cookie,
      ),
    )

    const members = await json<{ items: Member[] }>(
      await request("GET", `/companies/${company.id}/members`, undefined, founder.cookie),
    )
    const founderMember = members.items.find((m) => m.userId === founder.userId)
    if (!founderMember) throw new Error("la propietaria debería estar")

    return { founder, other, company, added, founderMember }
  }

  it("no se puede retirar la propiedad a la última propietaria", async () => {
    const { founder, company, founderMember } = await companyWithTwo()

    const response = await request(
      "PATCH",
      `/companies/${company.id}/members/${founderMember.id}`,
      { isOwner: false },
      founder.cookie,
    )

    expect(response.status).toBe(422)
  })

  it("no se puede desactivar a la última propietaria", async () => {
    const { founder, company, founderMember } = await companyWithTwo()

    const response = await request(
      "PATCH",
      `/companies/${company.id}/members/${founderMember.id}`,
      { isActive: false },
      founder.cookie,
    )

    expect(response.status).toBe(422)
  })

  it("no se puede retirar a la última propietaria", async () => {
    const { founder, company, founderMember } = await companyWithTwo()

    const response = await request(
      "DELETE",
      `/companies/${company.id}/members/${founderMember.id}`,
      undefined,
      founder.cookie,
    )

    expect(response.status).toBe(422)
  })

  it("con dos propietarias sí se puede retirar una", async () => {
    const { founder, company, added, founderMember } = await companyWithTwo()

    // Se nombra propietaria a la segunda…
    expect(
      (
        await request(
          "PATCH",
          `/companies/${company.id}/members/${added.id}`,
          { isOwner: true },
          founder.cookie,
        )
      ).status,
    ).toBe(200)

    // …y ahora la primera sí puede dejar de serlo.
    expect(
      (
        await request(
          "PATCH",
          `/companies/${company.id}/members/${founderMember.id}`,
          { isOwner: false },
          founder.cookie,
        )
      ).status,
    ).toBe(200)
  })

  it("sólo una propietaria mueve la propiedad", async () => {
    // No hay clave de permiso para transferirla, así que se exige el papel y no un permiso.
    const { founder, other, company, added } = await companyWithTwo()

    // Se le concede el permiso de cambiar rol, que es el que protege esta ruta…
    const role = await json<Role>(
      await request(
        "POST",
        `/companies/${company.id}/roles`,
        { name: "Recursos", permissions: ["companies.users.change-role"] },
        founder.cookie,
      ),
    )
    await request(
      "PATCH",
      `/companies/${company.id}/members/${added.id}`,
      { roleId: role.id },
      founder.cookie,
    )

    // …y aun así no puede nombrarse propietaria a sí misma.
    const response = await request(
      "PATCH",
      `/companies/${company.id}/members/${added.id}`,
      { isOwner: true },
      other.cookie,
    )

    expect(response.status).toBe(403)
  })
})

// ─── Roles ───────────────────────────────────────────────────────────────────

describe("roles", () => {
  it("se crean con claves del catálogo y se rechazan las que no existen", async () => {
    const founder = await signUp("roles@ejemplo.mx")
    const company = await newCompany(founder)

    const good = await request(
      "POST",
      `/companies/${company.id}/roles`,
      { name: "Almacén", permissions: ["warehouses.products.view"] },
      founder.cookie,
    )
    expect(good.status).toBe(201)

    const bad = await request(
      "POST",
      `/companies/${company.id}/roles`,
      { name: "Inventado", permissions: ["warehouses.products.aprobar"] },
      founder.cookie,
    )
    expect(bad.status).toBe(400)
  })

  it("el rol concede exactamente lo que declara", async () => {
    const founder = await signUp("concede@ejemplo.mx")
    const worker = await signUp("trabajadora@ejemplo.mx")
    const company = await newCompany(founder)

    const role = await json<Role>(
      await request(
        "POST",
        `/companies/${company.id}/roles`,
        { name: "Sólo mirar", permissions: ["companies.users.view"] },
        founder.cookie,
      ),
    )

    const member = await json<Member>(
      await request(
        "POST",
        `/companies/${company.id}/members`,
        { email: worker.email, roleId: role.id },
        founder.cookie,
      ),
    )
    expect(member.roleId).toBe(role.id)

    // Concede lo que declara…
    expect(
      (await request("GET", `/companies/${company.id}/members`, undefined, worker.cookie)).status,
    ).toBe(200)

    // …y nada más.
    expect(
      (await request("GET", `/companies/${company.id}/roles`, undefined, worker.cookie)).status,
    ).toBe(403)
  })

  it("un rol de otra empresa no se puede asignar", async () => {
    const founder = await signUp("cruzada@ejemplo.mx")
    const worker = await signUp("cruzada2@ejemplo.mx")
    const one = await newCompany(founder, "Una")
    const two = await newCompany(founder, "Otra")

    const roleOfTwo = await json<Role>(
      await request("POST", `/companies/${two.id}/roles`, { name: "Ajeno" }, founder.cookie),
    )

    const response = await request(
      "POST",
      `/companies/${one.id}/members`,
      { email: worker.email, roleId: roleOfTwo.id },
      founder.cookie,
    )

    expect(response.status).toBe(422)
  })

  it("eliminar un rol deja al miembro sin rol y conserva su pertenencia", async () => {
    const founder = await signUp("borra-rol@ejemplo.mx")
    const worker = await signUp("afectada@ejemplo.mx")
    const company = await newCompany(founder)

    const role = await json<Role>(
      await request(
        "POST",
        `/companies/${company.id}/roles`,
        { name: "Temporal", permissions: ["companies.users.view"] },
        founder.cookie,
      ),
    )
    await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: worker.email, roleId: role.id },
      founder.cookie,
    )

    expect(
      (
        await request(
          "DELETE",
          `/companies/${company.id}/roles/${role.id}`,
          undefined,
          founder.cookie,
        )
      ).status,
    ).toBe(204)

    const members = await json<{ items: Member[] }>(
      await request("GET", `/companies/${company.id}/members`, undefined, founder.cookie),
    )
    const affected = members.items.find((m) => m.userId === worker.userId)

    expect(affected).toBeDefined()
    expect(affected?.roleId).toBeNull()

    // Conserva lectura de su propia pertenencia y pierde la escritura.
    const theirs = await json<{ items: Company[] }>(
      await request("GET", "/companies", undefined, worker.cookie),
    )
    expect(theirs.items.map((c) => c.id)).toEqual([company.id])
    expect(
      (await request("GET", `/companies/${company.id}/members`, undefined, worker.cookie)).status,
    ).toBe(403)
  })

  it("cambiar el conjunto de permisos tiene su propia clave", async () => {
    // `companies.roles.edit` renombra; repartir permisos es `change_permissions`. Sin la
    // distinción, quien puede renombrar un rol puede concederse todo lo demás.
    const founder = await signUp("edita-rol@ejemplo.mx")
    const worker = await signUp("editora2@ejemplo.mx")
    const company = await newCompany(founder)

    const editor = await json<Role>(
      await request(
        "POST",
        `/companies/${company.id}/roles`,
        { name: "Editor", permissions: ["companies.roles.edit", "companies.roles.view"] },
        founder.cookie,
      ),
    )
    await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: worker.email, roleId: editor.id },
      founder.cookie,
    )

    // Renombrar, sí.
    expect(
      (
        await request(
          "PATCH",
          `/companies/${company.id}/roles/${editor.id}`,
          { name: "Editor renombrado" },
          worker.cookie,
        )
      ).status,
    ).toBe(200)

    // Concederse permisos, no.
    expect(
      (
        await request(
          "PATCH",
          `/companies/${company.id}/roles/${editor.id}`,
          { permissions: ["companies.companies.delete"] },
          worker.cookie,
        )
      ).status,
    ).toBe(403)
  })

  it("cuenta cuántas personas tienen cada rol", async () => {
    const founder = await signUp("cuenta@ejemplo.mx")
    const worker = await signUp("contada@ejemplo.mx")
    const company = await newCompany(founder)

    const role = await json<Role>(
      await request("POST", `/companies/${company.id}/roles`, { name: "Equipo" }, founder.cookie),
    )
    await request(
      "POST",
      `/companies/${company.id}/members`,
      { email: worker.email, roleId: role.id },
      founder.cookie,
    )

    const listed = await json<{ items: Role[] }>(
      await request("GET", `/companies/${company.id}/roles`, undefined, founder.cookie),
    )

    expect(listed.items.find((r) => r.id === role.id)?.memberCount).toBe(1)
  })
})

// ─── El motor, como segunda capa ─────────────────────────────────────────────

describe("las políticas siguen en pie sin la compuerta", () => {
  it("una consulta con la identidad de otra persona no ve la empresa", async () => {
    // Se salta la API entera y se consulta el motor directamente con la identidad de quien no
    // pertenece. Es lo que quedaría si la capa de aplicación fallara: tiene que devolver cero
    // filas, no las de otro arrendatario.
    const founder = await signUp("motor1@ejemplo.mx")
    const stranger = await signUp("motor2@ejemplo.mx")
    const company = await newCompany(founder)

    const [strangerSession] = await withElevated("comprobación de prueba", (tx) =>
      tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, stranger.userId)),
    )
    if (!strangerSession) throw new Error("la sesión debería existir")

    const { withRequester } = await import("@tfv/db")
    const visible = await withRequester(
      { userId: stranger.userId, sessionId: strangerSession.id },
      (tx) => tx.select().from(companies).where(eq(companies.id, company.id)),
    )

    expect(visible).toEqual([])
  })

  it("y sí la ve quien pertenece", async () => {
    const founder = await signUp("motor3@ejemplo.mx")
    const company = await newCompany(founder)

    const [session] = await withElevated("comprobación de prueba", (tx) =>
      tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, founder.userId)),
    )
    if (!session) throw new Error("la sesión debería existir")

    const { withRequester } = await import("@tfv/db")
    const visible = await withRequester({ userId: founder.userId, sessionId: session.id }, (tx) =>
      tx.select().from(companies).where(eq(companies.id, company.id)),
    )

    expect(visible).toHaveLength(1)
  })
})

// El identificador se usa sólo para construir datos de prueba; se declara aquí para que el
// analizador no marque el importe como sin uso.
void newId
