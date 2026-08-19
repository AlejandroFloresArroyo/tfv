/**
 * Un identificador con la forma equivocada no es un fallo del servidor.
 *
 * Ver `openspec/specs/api-conventions/spec.md`, tabla de códigos de estado: «Cuerpo, ruta o consulta
 * que no cumple el esquema → `400`». Y `HALLAZGOS.md` H-144.
 *
 * ## Por qué es un barrido y no una prueba por caso
 *
 * El defecto no era de una ruta: era de la **capa**. Alcanzaba a las noventa y tantas rutas con
 * parámetro de identificador, y arreglarlo en una sola habría dejado el mismo error respondiendo
 * distinto según quién lo sirviera. Una prueba por caso comprobaría las que alguien se acordó de
 * escribir; ésta recorre **la tabla de rutas registrada**, así que una ruta nueva entra sola.
 *
 * Es el mismo espíritu que el candado de la superficie pública: no describe, sujeta.
 *
 * Requiere la base local levantada: `pnpm db:up`.
 */

import { closeConnection, db } from "@tfv/db"
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
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { routes } from "../routes/index.ts"
import { createApp } from "./app.ts"
import { isIdentifierParam, pathParamsOf } from "./identifiers.ts"

const app = createApp(routes)

const PASSWORD = "una-frase-larga-y-buena"
let cookie = ""

async function reset() {
  await db.execute(
    sql`truncate table ${notificationDeliveries}, ${sessions}, ${loginAttempts}, ${users}, ${companyMembers}, ${roles}, ${companies} cascade`,
  )
}

beforeAll(async () => {
  await reset()

  const email = "barrido@ejemplo.mx"
  await app.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, name: "Barrido" }),
  })
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email))

  const response = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })

  cookie = (
    response.headers.getSetCookie().find((raw) => raw.startsWith("tfv_session=")) ?? ""
  ).split(";")[0] as string
})

afterAll(async () => {
  await reset()
  await closeConnection()
})

/**
 * Los valores que llegan de verdad cuando algo va mal aguas arriba.
 *
 * `undefined` es el que encontró este defecto: una plantilla que interpola una variable que no
 * existe deja esa cadena literal en el camino. Los otros dos son el enlace copiado a medias y el
 * identificador de otra cosa.
 */
const BASURA = ["undefined", "null", "0", "no-existe", "%20"]

/** Un identificador con la forma correcta que no le pertenece a nadie. */
const AJENO = "01a018e5-51bd-7cfc-9394-a8924c970462"

/**
 * Una ruta con sus parámetros rellenos.
 *
 * Los que no son identificadores —`slug`, `reference`, `handle`, `space`— reciben algo plausible:
 * lo que se está probando es qué pasa con los que **sí** lo son.
 */
function urlFor(path: string, garbage: string): string {
  return path.replace(/\{(\w+)\}/g, (_, name: string) =>
    isIdentifierParam(name) ? garbage : "algo-plausible",
  )
}

const conIdentificador = routes.filter((route) =>
  pathParamsOf(route.config.path).some(isIdentifierParam),
)

describe("el barrido", () => {
  it("hay rutas con parámetro de identificador que barrer", () => {
    // Si esto llega a cero, el barrido dejó de comprobar nada y nadie se enteraría.
    expect(conIdentificador.length).toBeGreaterThan(80)
  })
})

describe("un identificador con la forma equivocada", () => {
  for (const garbage of BASURA) {
    it(`no produce 5xx en ninguna ruta · «${garbage}»`, async () => {
      const fallos: string[] = []

      for (const route of conIdentificador) {
        const method = route.config.method.toUpperCase()
        const url = urlFor(route.config.path, garbage)

        const response = await app.request(url, {
          method,
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          ...(method === "GET" || method === "DELETE" ? {} : { body: "{}" }),
        })

        if (response.status >= 500) fallos.push(`${response.status} ${method} ${url}`)
      }

      expect(fallos, `respondieron 5xx:\n${fallos.join("\n")}`).toEqual([])
    })
  }

  it("responde 400, que es lo que la tabla de códigos dice de una ruta que no cumple", async () => {
    const response = await app.request("/companies/undefined/warehouses", {
      headers: { Cookie: cookie },
    })

    expect(response.status).toBe(400)

    const body = (await response.json()) as {
      error: string
      message: { key: string; message: string }[]
    }
    expect(body.error).toBe("validation_failed")
    expect(body.message[0]?.key).toBe("companyId")
  })

  it("señala todos los que vienen mal, no sólo el primero", async () => {
    const response = await app.request("/companies/undefined/warehouses/tampoco", {
      headers: { Cookie: cookie },
    })

    const body = (await response.json()) as { message: { key: string }[] }
    expect(body.message.map((issue) => issue.key)).toEqual(["companyId", "warehouseId"])
  })

  it("no devuelve el valor recibido en el mensaje", async () => {
    // Lo que llega en el camino es de quien llama. Devolverlo tal cual es cómo una respuesta de
    // error acaba sirviendo de espejo para lo que a uno le apetezca reflejar.
    // Sin barras: una barra añadiría un segmento al camino y la petición no casaría con ninguna
    // ruta, así que respondería 404 y la prueba no comprobaría lo que dice comprobar.
    const response = await app.request("/companies/<script>alerta/warehouses", {
      headers: { Cookie: cookie },
    })

    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain("script")
  })
})

/**
 * Toda ruta de arrendatario, probada contra una empresa ajena.
 *
 * `access-control` lo exige con esas palabras: quien pide datos de una empresa a la que no
 * pertenece recibe `404`, «de modo que no pueda inferir la existencia de esa empresa ni de sus
 * recursos». Un `403` responde «existe, pero no es tuya», y con eso se enumera.
 *
 * Se barre en vez de escribir un caso por ruta porque **una ruta nueva entra sola**: la lista sale
 * de la tabla registrada. Es el mismo motivo por el que el barrido de identificadores existe, y es
 * la tarea de la rebanada 06 que decía «por cada endpoint de arrendatario, intentar el acceso
 * cruzado».
 *
 * Los demás parámetros reciben identificadores **bien formados** y de nadie: con basura respondería
 * `400` la capa de forma, que corre antes, y el barrido no llegaría a la compuerta.
 */
const deArrendatario = routes.filter(
  (route) =>
    pathParamsOf(route.config.path).includes("companyId") && route.access.kind === "permission",
)

function urlAjena(path: string): string {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (name === "companyId") return AJENO
    return isIdentifierParam(name) ? "01a018e5-51bd-7cfc-9394-a8924c970463" : "algo-plausible"
  })
}

describe("una empresa ajena", () => {
  it("hay rutas de arrendatario que barrer", () => {
    expect(deArrendatario.length).toBeGreaterThan(100)
  })

  it("responde 404 en todas, nunca 403", async () => {
    const delatoras: string[] = []

    for (const route of deArrendatario) {
      const method = route.config.method.toUpperCase()
      const response = await app.request(urlAjena(route.config.path), {
        method,
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        ...(method === "GET" || method === "DELETE" ? {} : { body: "{}" }),
      })

      if (response.status === 403) {
        delatoras.push(`${method} ${route.config.path}`)
      }
    }

    expect(delatoras).toEqual([])
  })
})

describe("un identificador con la forma correcta", () => {
  it("sigue su curso y responde 404, sin distinguir inexistente de ajeno", async () => {
    // La comprobación de forma **no puede** convertirse en una vía para saber si algo existe: lo
    // que rechaza depende sólo de la cadena que envió quien llama, no de lo que haya en la base.
    const response = await app.request(`/companies/${AJENO}/warehouses`, {
      headers: { Cookie: cookie },
    })

    expect(response.status).not.toBe(400)
    // `404` exacto y no «403 o 404»: aceptar las dos es lo que dejó pasar H-147 durante meses.
    expect(response.status).toBe(404)
  })

  it("admite también los identificadores de la pila anterior", async () => {
    // Veinticuatro hexadecimales: están incrustados en URLs ya compartidas con clientes, y la
    // columna existe en el esquema. Rechazarlos aquí cerraría esa puerta antes de abrirla.
    const response = await app.request("/companies/507f1f77bcf86cd799439011/warehouses", {
      headers: { Cookie: cookie },
    })

    expect(response.status).not.toBe(400)
  })
})
