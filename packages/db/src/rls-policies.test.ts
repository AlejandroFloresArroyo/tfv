/**
 * Políticas de aislamiento sobre las tablas reales.
 *
 * Ver `openspec/specs/access-control/spec.md` y `drizzle/0005_rls_policies.sql`.
 *
 * `tenant-context.test.ts` comprueba el **mecanismo** —cómo llega la identidad al motor— sobre una
 * tabla de sonda. Esto comprueba las **políticas del dominio**: que la composición padre → hijo
 * llega hasta el fondo, que leer no implica escribir, y que las excepciones deliberadas —el chat
 * con el cliente, el directorio de locaciones, el catálogo de plataforma— son las únicas que hay.
 *
 * Ninguna consulta de aquí lleva filtro de aplicación. Lo que devuelvan sale sólo de las políticas.
 *
 * Requiere la pila local de Supabase: `pnpm db:up`.
 */

import { newId } from "@tfv/contracts"
import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeConnection, db, type Transaction, withRequester, withSystem } from "./index.ts"

// ─── Sembrado ────────────────────────────────────────────────────────────────

/**
 * Dos arrendatarios completos, y un tercer principal que no es miembro de ninguno.
 *
 * `cliente` es la figura interesante: compra en la tienda de A y es la contraparte de un pedido de
 * A. Ve cosas de A sin ser miembro de A, que es justo el caso que las políticas tienen que acotar.
 */
const seed = {
  ana: newId(),
  beto: newId(),
  cliente: newId(),
  admin: newId(),
  companyA: newId(),
  companyB: newId(),
  warehouseA: newId(),
  warehouseB: newId(),
  productA: newId(),
  productionA: newId(),
  productionB: newId(),
  recordingA: newId(),
  continuityA: newId(),
  itemA: newId(),
  itemEventA: newId(),
  propA: newId(),
  counterpartyA: newId(),
  orderA: newId(),
  buyerOrderA: newId(),
  networkB: newId(),
  locationB: newId(),
  categoryG: newId(),
  ratesA: newId(),
  shipmentA: newId(),
  sessionAna: newId(),
  sessionBeto: newId(),
  sessionCliente: newId(),
  sessionAdmin: newId(),
  sessionCerrada: newId(),
}

/** Cada principal opera con su sesión: el motor comprueba que sigue viva en cada transacción. */
const identity = (userId: string) => ({ userId, sessionId: sessionOf[userId] as string })

const sessionOf: Record<string, string> = {}

async function reset() {
  const rows = await db.execute<{ relname: string }>(sql`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `)
  const tables = [...rows].map((r) => `public."${r.relname}"`).join(", ")
  await db.execute(sql.raw(`truncate table ${tables} cascade`))
}

const live = "now() + interval '1 hour', now() + interval '1 day'"

async function sow() {
  const s = seed
  sessionOf[s.ana] = s.sessionAna
  sessionOf[s.beto] = s.sessionBeto
  sessionOf[s.cliente] = s.sessionCliente
  sessionOf[s.admin] = s.sessionAdmin
  await db.execute(
    sql.raw(`
    insert into users (id, email, username, is_platform_admin) values
      ('${s.ana}',     'ana@a.mx',     'ana',     false),
      ('${s.beto}',    'beto@b.mx',    'beto',    false),
      ('${s.cliente}', 'cliente@c.mx', 'cliente', false),
      ('${s.admin}',   'admin@tfv.mx', 'admin',   true);

    insert into companies (id, name) values
      ('${s.companyA}', 'Empresa A'), ('${s.companyB}', 'Empresa B');

    insert into company_members (id, company_id, user_id) values
      ('${newId()}', '${s.companyA}', '${s.ana}'),
      ('${newId()}', '${s.companyB}', '${s.beto}');

    insert into warehouses (id, company_id, name) values
      ('${s.warehouseA}', '${s.companyA}', 'Almacén A'),
      ('${s.warehouseB}', '${s.companyB}', 'Almacén B');

    insert into warehouse_products (id, warehouse_id, name, code) values
      ('${s.productA}', '${s.warehouseA}', 'Cámara', 'CAM-1');

    insert into productions (id, company_id, name) values
      ('${s.productionA}', '${s.companyA}', 'Rodaje A'),
      ('${s.productionB}', '${s.companyB}', 'Rodaje B');

    -- Cuatro saltos hasta la empresa: utilería → continuidad → jornada → producción → empresa.
    insert into production_recordings (id, production_id, name)
      values ('${s.recordingA}', '${s.productionA}', 'Jornada 1');
    insert into production_continuities (id, recording_id)
      values ('${s.continuityA}', '${s.recordingA}');
    insert into production_items (id, production_id, name, code)
      values ('${s.itemA}', '${s.productionA}', 'Reloj', 'UTL-1');
    insert into production_props (id, continuity_id, item_id)
      values ('${s.propA}', '${s.continuityA}', '${s.itemA}');
    -- El historial del artículo: tres saltos hasta la empresa, y ninguno nombrado en su política.
    insert into production_item_events (id, item_id, to_status, reason)
      values ('${s.itemEventA}', '${s.itemA}', 'stored', 'manual');

    insert into counterparties (id, company_id, role, alias, user_id)
      values ('${s.counterpartyA}', '${s.companyA}', 'client', 'Cliente', '${s.cliente}');

    insert into warehouse_orders (id, warehouse_id, code, origin, client_id)
      values ('${s.orderA}', '${s.warehouseA}', 'PED-1', 'storefront', '${s.counterpartyA}');

    -- El envío nace antes que el pedido y éste lo enlaza después, que es el orden real de la
    -- materialización y el motivo de que su alta siga siendo del sistema.
    insert into shipments (id, mode, cost) values ('${s.shipmentA}', 'national', '199.00');

    insert into buyer_orders
      (id, buyer_id, company_id, reference, subtotal, total, shipment_id)
      values
      ('${s.buyerOrderA}', '${s.cliente}', '${s.companyA}', 'REF-1', '100.00', '100.00',
       '${s.shipmentA}');

    insert into location_networks (id, company_id, name)
      values ('${s.networkB}', '${s.companyB}', 'Red B');
    insert into locations (id, network_id, name)
      values ('${s.locationB}', '${s.networkB}', 'Nave industrial');

    insert into global_categories (id, name) values ('${s.categoryG}', 'Cine');

    -- Sólo A configura sus tarifas de envío: B se queda con el cuadro por omisión, que es la
    -- situación normal y la que hace visible el aislamiento de esta tabla.
    insert into shipping_rates (id, company_id) values ('${s.ratesA}', '${s.companyA}');

    insert into sessions
      (id, user_id, chain_id, access_token_hash, refresh_token_hash, access_expires_at, expires_at,
       revoked_at)
      values
      ('${s.sessionAna}',     '${s.ana}',     '${newId()}', 'a1', 'r1', ${live}, null),
      ('${s.sessionBeto}',    '${s.beto}',    '${newId()}', 'a2', 'r2', ${live}, null),
      ('${s.sessionCliente}', '${s.cliente}', '${newId()}', 'a3', 'r3', ${live}, null),
      ('${s.sessionAdmin}',   '${s.admin}',   '${newId()}', 'a4', 'r4', ${live}, null),
      -- Cerrada: el token seguiría siendo válido por su cuenta, y aun así no debe servir.
      ('${s.sessionCerrada}', '${s.ana}',     '${newId()}', 'a5', 'r5', ${live}, now());
  `),
  )
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Cuenta filas **sin filtro de aplicación**: el resultado sale sólo de las políticas. */
async function countAs(userId: string, table: string, where = "true") {
  return withRequester(identity(userId), (tx) => count(tx, table, where))
}

async function count(tx: Transaction, table: string, where = "true") {
  const rows = await tx.execute<{ total: number }>(
    sql.raw(`select count(*)::int as total from ${table} where ${where}`),
  )
  return [...rows][0]?.total ?? -1
}

/** Lee un valor esquivando las políticas, para comprobar si una escritura llegó a ocurrir. */
async function readElevated(query: string) {
  const rows = await db.execute<Record<string, unknown>>(sql.raw(query))
  return [...rows][0]
}

/**
 * Comprueba que la escritura la rechazó una política, no otra cosa.
 *
 * Drizzle envuelve el error del controlador, así que el mensaje visible es «Failed query»; el
 * código real vive en `cause`. `42501` es `insufficient_privilege`, con el que Postgres rechaza una
 * fila que no satisface el `with check` de ninguna política aplicable.
 */
async function expectRejectedByPolicy(work: Promise<unknown>) {
  let raised: unknown
  try {
    await work
  } catch (error) {
    raised = error
  }

  expect(raised, "se esperaba que una política rechazara la escritura").toBeDefined()
  const cause = (raised as { cause?: { code?: string; message?: string } }).cause
  expect(cause?.code, cause?.message).toBe("42501")
}

beforeAll(async () => {
  await reset()
  await sow()
})

afterAll(closeConnection)

// ─── Estructura ──────────────────────────────────────────────────────────────

describe("cobertura", () => {
  it("todas las tablas tienen las políticas activadas y al menos una", async () => {
    // **No borrar esta prueba.** La composición padre → hijo hace que una tabla intermedia sin
    // políticas abra a todos sus descendientes sin que nada más lo delate.
    const rows = await db.execute<{ relname: string; rls: boolean; politicas: number }>(sql`
      select c.relname,
             c.relrowsecurity as rls,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as politicas
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `)
    const tablas = [...rows]

    // El número es una alarma a propósito: añadir una tabla obliga a pasar por aquí, y por aquí es
    // donde se recuerda que una tabla nueva **no hereda** la política de plataforma —la 0005 la
    // repartió con un bucle que corrió una sola vez—. Así se descubrió que faltaba en `prospects`.
    // 96 desde la 0024, que añade `platform_activities`. Es la única tabla del esquema **sin
    // política de arrendatario**, y su ausencia es la decisión: no pertenece a ninguna empresa, así
    // que o la lee la administración de plataforma o no la lee nadie.
    // 95 desde la 0020, que añade `shipping_rates` con sus dos políticas.
    // 96 desde la 0026, que añade `idempotency_keys` con **tres**: la de su dueño, la de sistema
    // —para que el barrido de caducadas alcance las de todo el mundo— y la de plataforma.
    // 98 desde la 0030, que añade `production_item_events`: el historial de estado del artículo,
    // calcado de `warehouse_stock_events` y con su misma política —se apoya en la del artículo, que
    // se apoya en la de la producción—.
    expect(tablas.length).toBe(98)
    expect(tablas.filter((t) => !t.rls).map((t) => t.relname)).toEqual([])
    expect(tablas.filter((t) => t.politicas === 0).map((t) => t.relname)).toEqual([])
  })
})

// ─── Aislamiento ─────────────────────────────────────────────────────────────

describe("aislamiento entre arrendatarios", () => {
  it("sin identidad propagada no se devuelve ninguna fila de dominio", async () => {
    const visible = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`)
      return count(tx, "productions")
    })

    expect(visible).toBe(0)
  })

  it("la composición llega hasta el cuarto salto", async () => {
    // La política de `production_props` no menciona ninguna empresa: se apoya en la de su padre,
    // que se apoya en la del suyo. Si algún eslabón se rompiera, esto devolvería 1 para Beto.
    expect(await countAs(seed.ana, "production_props")).toBe(1)
    expect(await countAs(seed.beto, "production_props")).toBe(0)
  })

  it("el historial de un artículo no se lee ni se escribe desde otra empresa", async () => {
    // `production_item_events` no menciona ninguna empresa: se apoya en la de `production_items`,
    // que se apoya en la de `productions`. Es la misma forma que `warehouse_stock_events`, y si el
    // eslabón del artículo se rompiera esto devolvería 1 para Beto.
    expect(await countAs(seed.ana, "production_item_events")).toBe(1)
    expect(await countAs(seed.beto, "production_item_events")).toBe(0)

    // Y leer no es escribir: Beto tampoco puede **firmar** un cambio en el artículo de Ana, que es
    // lo que convertiría el historial en un sitio donde plantar un rastro falso.
    await expectRejectedByPolicy(
      withRequester(identity(seed.beto), (tx) =>
        tx.execute(sql.raw(`insert into production_item_events (id, item_id, to_status, reason)
                 values ('${newId()}', '${seed.itemA}', 'lost', 'manual')`)),
      ),
    )
  })

  it("no se escribe en el almacén de otra empresa", async () => {
    await expectRejectedByPolicy(
      withRequester(identity(seed.ana), (tx) =>
        tx.execute(
          sql.raw(`insert into warehouse_products (id, warehouse_id, name, code)
                 values ('${newId()}', '${seed.warehouseB}', 'Intruso', 'X-1')`),
        ),
      ),
    )
  })

  it("no se escribe en la jornada de otra empresa", async () => {
    await expectRejectedByPolicy(
      withRequester(identity(seed.beto), (tx) =>
        tx.execute(
          sql.raw(`insert into production_props (id, continuity_id, item_id)
                 values ('${newId()}', '${seed.continuityA}', '${seed.itemA}')`),
        ),
      ),
    )
  })
})

// ─── Tarifas de envío ────────────────────────────────────────────────────────

describe("el cuadro de tarifas de envío", () => {
  it("sólo lo ve su propia empresa", async () => {
    expect(await countAs(seed.ana, "shipping_rates")).toBe(1)
    expect(await countAs(seed.beto, "shipping_rates")).toBe(0)
  })

  it("no lo ve el comprador, que no es miembro de la empresa", async () => {
    // Lo que el comprador tiene que poder ver es el importe ya calculado de su compra, no el cuadro
    // con el que se calculó: es configuración interna del comercio.
    expect(await countAs(seed.cliente, "shipping_rates")).toBe(0)
  })

  it("no se cambia la tarifa de otra empresa", async () => {
    await expectRejectedByPolicy(
      withRequester(identity(seed.beto), (tx) =>
        tx.execute(
          sql.raw(`insert into shipping_rates (id, company_id)
                 values ('${newId()}', '${seed.companyA}')`),
        ),
      ),
    )
  })

  it("la materialización del pedido sí lo alcanza, declarando la empresa", async () => {
    // Es la vía por la que la rebanada 18 cobrará el envío: `withSystem` suma el alcance declarado
    // a las membresías, así que la empresa nombrada entra y ninguna otra.
    const visible = await withSystem("envios.estimar", [seed.companyA], (tx) =>
      count(tx, "shipping_rates"),
    )

    expect(visible).toBe(1)
  })
})

// ─── Seguimiento del envío ───────────────────────────────────────────────────

describe("el envío lo mueve quien lo despacha", () => {
  it("el comercio dueño del pedido cambia el estado de su envío", async () => {
    await withRequester(identity(seed.ana), (tx) =>
      tx.execute(sql.raw(`update shipments set status = 'shipped' where id = '${seed.shipmentA}'`)),
    )

    const row = await readElevated(`select status from shipments where id = '${seed.shipmentA}'`)
    expect(row?.status).toBe("shipped")
  })

  it("otra empresa no lo toca", async () => {
    await withRequester(identity(seed.beto), (tx) =>
      tx.execute(
        sql.raw(`update shipments set status = 'canceled' where id = '${seed.shipmentA}'`),
      ),
    )

    const row = await readElevated(`select status from shipments where id = '${seed.shipmentA}'`)
    expect(row?.status).toBe("shipped")
  })

  it("el comprador lo lee pero no lo mueve", async () => {
    // Es la razón de que el predicado atraviese hasta `companies`: la lectura del pedido es más
    // ancha que su escritura, y apoyarse en ella dejaría al comprador darse por servido.
    expect(await countAs(seed.cliente, "shipments")).toBe(1)

    await withRequester(identity(seed.cliente), (tx) =>
      tx.execute(
        sql.raw(`update shipments set status = 'delivered' where id = '${seed.shipmentA}'`),
      ),
    )

    const row = await readElevated(`select status from shipments where id = '${seed.shipmentA}'`)
    expect(row?.status).toBe("shipped")
  })
})

// ─── Leer no es escribir ─────────────────────────────────────────────────────

describe("leer no implica escribir", () => {
  it("el comercio lee al comprador de su pedido", async () => {
    expect(await countAs(seed.ana, "users", `id = '${seed.cliente}'`)).toBe(1)
  })

  it("pero no puede modificarlo", async () => {
    await withRequester(identity(seed.ana), (tx) =>
      tx.execute(sql.raw(`update users set username = 'secuestrado' where id = '${seed.cliente}'`)),
    )

    const fila = await readElevated(`select username from users where id = '${seed.cliente}'`)
    expect(fila?.username).toBe("cliente")
  })

  it("el comprador lee su pedido", async () => {
    expect(await countAs(seed.cliente, "buyer_orders")).toBe(1)
  })

  it("pero no puede añadirle líneas", async () => {
    // El hijo atraviesa hasta la empresa justamente para que esto falle: si compusiera con
    // `buyer_orders` a secas, la lectura del comprador bastaría para escribir.
    await expectRejectedByPolicy(
      withRequester(identity(seed.cliente), (tx) =>
        tx.execute(
          sql.raw(`insert into buyer_order_lines (id, order_id, line)
                 values ('${newId()}', '${seed.buyerOrderA}', '{}'::jsonb)`),
        ),
      ),
    )
  })

  it("nadie se da de alta a sí mismo en una empresa ajena", async () => {
    await expectRejectedByPolicy(
      withRequester(identity(seed.cliente), (tx) =>
        tx.execute(
          sql.raw(`insert into company_members (id, company_id, user_id)
                 values ('${newId()}', '${seed.companyA}', '${seed.cliente}')`),
        ),
      ),
    )
  })
})

// ─── La contraparte ──────────────────────────────────────────────────────────

describe("la contraparte de un documento", () => {
  it("ve el pedido que le hicieron, aunque la ficha de contraparte no sea suya", async () => {
    expect(await countAs(seed.cliente, "warehouse_orders")).toBe(1)
    // La fila que la enlaza pertenece al proveedor y sigue oculta para ella.
    expect(await countAs(seed.cliente, "counterparties")).toBe(0)
  })

  it("no lo modifica", async () => {
    await withRequester(identity(seed.cliente), (tx) =>
      tx.execute(
        sql.raw(`update warehouse_orders set code = 'MANIPULADO'
                          where id = '${seed.orderA}'`),
      ),
    )

    const fila = await readElevated(`select code from warehouse_orders where id = '${seed.orderA}'`)
    expect(fila?.code).toBe("PED-1")
  })

  it("sí escribe en el chat, que es la única superficie donde puede", async () => {
    await withRequester(identity(seed.cliente), (tx) =>
      tx.execute(
        sql.raw(`insert into warehouse_order_messages (id, order_id, side, author_id, body)
                 values ('${newId()}', '${seed.orderA}', 'client', '${seed.cliente}', 'Hola')`),
      ),
    )

    expect(await countAs(seed.cliente, "warehouse_order_messages")).toBe(1)
    expect(await countAs(seed.ana, "warehouse_order_messages")).toBe(1)
    expect(await countAs(seed.beto, "warehouse_order_messages")).toBe(0)
  })
})

// ─── Superficies abiertas a propósito ────────────────────────────────────────

describe("catálogo de plataforma", () => {
  it("lo lee cualquiera", async () => {
    expect(await countAs(seed.beto, "global_categories")).toBe(1)
  })

  it("no lo escribe cualquiera", async () => {
    await expectRejectedByPolicy(
      withRequester(identity(seed.beto), (tx) =>
        tx.execute(
          sql.raw(`insert into global_categories (id, name) values ('${newId()}', 'Falsa')`),
        ),
      ),
    )
  })
})

describe("directorio de locaciones", () => {
  it("una empresa ve las locaciones de otra: para eso es un directorio", async () => {
    expect(await countAs(seed.ana, "locations")).toBe(1)
  })

  it("pero no cuelga nada de ellas", async () => {
    await expectRejectedByPolicy(
      withRequester(identity(seed.ana), (tx) =>
        tx.execute(
          sql.raw(`insert into location_tags (id, location_id, category_id)
                 values ('${newId()}', '${seed.locationB}', '${seed.categoryG}')`),
        ),
      ),
    )
  })

  it("ni ve la red a la que pertenecen", async () => {
    expect(await countAs(seed.ana, "location_networks")).toBe(0)
  })
})

// ─── Administración de plataforma ────────────────────────────────────────────

describe("administrador de plataforma", () => {
  it("cruza empresas", async () => {
    expect(await countAs(seed.admin, "productions")).toBe(2)
    expect(await countAs(seed.admin, "production_props")).toBe(1)
  })

  it("no alcanza las sesiones de nadie más que las suyas", async () => {
    // El requisito le concede el papel de propietario **de una empresa**. La credencial de otra
    // persona no es dato de ninguna empresa.
    expect(await countAs(seed.admin, "sessions", `user_id <> '${seed.admin}'`)).toBe(0)
    expect(await countAs(seed.beto, "sessions")).toBe(1)
  })

  it("no alcanza las credenciales de un solo uso", async () => {
    expect(await countAs(seed.admin, "one_time_credentials")).toBe(0)
  })
})

// ─── Revocación ──────────────────────────────────────────────────────────────

describe("revocación inmediata", () => {
  it("una sesión cerrada no ve nada, aunque su token siga sin caducar", async () => {
    // El caso que decidió pagar la consulta: el token es válido por sí mismo y aun así no sirve.
    const cerrada = { userId: seed.ana, sessionId: seed.sessionCerrada }

    expect(await withRequester(cerrada, (tx) => count(tx, "productions"))).toBe(0)
    expect(await withRequester(cerrada, (tx) => count(tx, "users"))).toBe(0)
  })

  it("y tampoco escribe", async () => {
    await expectRejectedByPolicy(
      withRequester({ userId: seed.ana, sessionId: seed.sessionCerrada }, (tx) =>
        tx.execute(
          sql.raw(`insert into warehouse_products (id, warehouse_id, name, code)
                   values ('${newId()}', '${seed.warehouseA}', 'Tras cerrar', 'X-2')`),
        ),
      ),
    )
  })

  it("una sesión que no existe tampoco sirve", async () => {
    const inventada = { userId: seed.ana, sessionId: newId() }

    expect(await withRequester(inventada, (tx) => count(tx, "productions"))).toBe(0)
  })

  it("desactivar la cuenta corta el acceso en la petición siguiente", async () => {
    expect(await countAs(seed.beto, "productions")).toBe(1)

    await db.execute(sql.raw(`update users set is_active = false where id = '${seed.beto}'`))
    expect(await countAs(seed.beto, "productions")).toBe(0)

    // Y reactivarla lo devuelve, sin tocar la sesión: la identidad se resuelve viva, no en el token.
    await db.execute(sql.raw(`update users set is_active = true where id = '${seed.beto}'`))
    expect(await countAs(seed.beto, "productions")).toBe(1)
  })

  it("un administrador con la sesión cerrada deja de cruzar empresas", async () => {
    expect(await countAs(seed.admin, "productions")).toBe(2)

    await db.execute(
      sql.raw(`update sessions set revoked_at = now()
                              where id = '${seed.sessionAdmin}'`),
    )
    expect(await countAs(seed.admin, "productions")).toBe(0)

    await db.execute(
      sql.raw(`update sessions set revoked_at = null
                              where id = '${seed.sessionAdmin}'`),
    )
  })

  it("el contexto de sistema no necesita sesión", async () => {
    // No hay usuario que revocar: su alcance lo declara y lo hace cumplir `app.system_scope()`.
    const visible = await withSystem("prueba", [seed.companyA], (tx) => count(tx, "productions"))

    expect(visible).toBe(1)
  })
})

// ─── Rebanada 09 ─────────────────────────────────────────────────────────────

describe("la bitácora es de sólo anexado", () => {
  const asiento = newId()

  it("un miembro anexa el asiento de su empresa", async () => {
    await withRequester(identity(seed.ana), (tx) =>
      tx.execute(
        sql.raw(`insert into company_activities (id, company_id, action, entity, entity_label, message_key)
                 values ('${asiento}', '${seed.companyA}', 'create', 'warehouse_products', 'Cámara', 'company.created')`),
      ),
    )

    expect(await countAs(seed.ana, "company_activities")).toBe(1)
    expect(await countAs(seed.beto, "company_activities")).toBe(0)
  })

  it("y no lo puede modificar ni borrar", async () => {
    // El requisito dice «se rechaza», así que el rechazo tiene que oírse: el permiso está retirado
    // sobre la tabla, de modo que el motor responde en lugar de no encontrar filas.
    await expectRejectedByPolicy(
      withRequester(identity(seed.ana), (tx) =>
        tx.execute(sql.raw("update company_activities set entity_label = 'Otra cosa'")),
      ),
    )
    await expectRejectedByPolicy(
      withRequester(identity(seed.ana), (tx) =>
        tx.execute(sql.raw("delete from company_activities")),
      ),
    )
  })

  it("tampoco la administración de plataforma", async () => {
    // Su papel es el de propietario **de una empresa**, y una propietaria tampoco reescribe su
    // bitácora. Si pudiera, dejaría de servir para lo único que sirve.
    expect(await countAs(seed.admin, "company_activities")).toBe(1)

    await expectRejectedByPolicy(
      withRequester(identity(seed.admin), (tx) =>
        tx.execute(sql.raw("delete from company_activities")),
      ),
    )
  })
})

// ─── La otra bitácora, la que no es de nadie ─────────────────────────────────

/**
 * `platform_activities` es la única tabla del esquema **sin política de arrendatario**.
 *
 * Es la excepción deliberada que la 0024 introduce, y por eso se comprueba aquí y no sólo desde la
 * API: lo que registra son acciones que no ocurren dentro de ninguna empresa —aceptar un prospecto
 * crea una cuenta que todavía no pertenece a nadie—, así que no hay predicado de empresa que pueda
 * acotarla. O la lee la administración de plataforma, o no la lee nadie.
 */
describe("la bitácora de plataforma", () => {
  const asiento = newId()

  it("la anexa y la lee la administración de plataforma", async () => {
    await withRequester(identity(seed.admin), (tx) =>
      tx.execute(
        sql.raw(`insert into platform_activities (id, action, entity, title, performed_by_id)
                 values ('${asiento}', 'create', 'prospects', 'Prospecto aceptado', '${seed.admin}')`),
      ),
    )

    expect(await countAs(seed.admin, "platform_activities")).toBe(1)
  })

  it("y no la ve nadie más, ni siquiera una propietaria", async () => {
    // Ana es propietaria de su empresa. La elusión del propietario llega hasta el borde de la
    // suya; esto está fuera de toda empresa, y por eso no lo alcanza.
    expect(await countAs(seed.ana, "platform_activities")).toBe(0)
    expect(await countAs(seed.beto, "platform_activities")).toBe(0)
    expect(await countAs(seed.cliente, "platform_activities")).toBe(0)
  })

  it("ni la escribe quien no es de plataforma", async () => {
    await expectRejectedByPolicy(
      withRequester(identity(seed.ana), (tx) =>
        tx.execute(
          sql.raw(`insert into platform_activities (id, action, entity, title)
                   values ('${newId()}', 'create', 'prospects', 'Colada')`),
        ),
      ),
    )
  })

  it("y tampoco se reescribe desde plataforma", async () => {
    // Aquí importa más que en la de empresa: quien la protagoniza es justamente quien tiene la
    // llave de todos los arrendatarios.
    await expectRejectedByPolicy(
      withRequester(identity(seed.admin), (tx) =>
        tx.execute(sql.raw("update platform_activities set title = 'Otra cosa'")),
      ),
    )
    await expectRejectedByPolicy(
      withRequester(identity(seed.admin), (tx) =>
        tx.execute(sql.raw("delete from platform_activities")),
      ),
    )
  })
})

describe("la cola de trabajos", () => {
  beforeAll(async () => {
    await db.execute(
      sql.raw(`insert into background_jobs (id, kind, payload)
               values ('${newId()}', 'prueba.trabajo', '{}'::jsonb)`),
    )
  })

  it("no la ve ninguna sesión de usuario", async () => {
    // No es dato de arrendatario, y tampoco es de todos: encolar el recolector con plazo cero
    // borraría las subidas en curso de todo el mundo.
    expect(await countAs(seed.ana, "background_jobs")).toBe(0)
    expect(await countAs(seed.beto, "background_jobs")).toBe(0)
  })

  it("ni la escribe", async () => {
    await expectRejectedByPolicy(
      withRequester(identity(seed.ana), (tx) =>
        tx.execute(
          sql.raw(`insert into background_jobs (id, kind) values ('${newId()}', 'inventado')`),
        ),
      ),
    )
  })

  it("la ve la operación de sistema, que es por donde corre el despachador", async () => {
    // Sin declarar ninguna empresa: un trabajo global no tiene alcance de arrendatario, y la
    // operación queda declarada igual.
    const visibles = await withSystem("trabajos.despachador", [], (tx) =>
      count(tx, "background_jobs"),
    )

    expect(visibles).toBe(1)
  })

  it("y la ve la administración de plataforma, que es quien mira por qué se rindió", async () => {
    expect(await countAs(seed.admin, "background_jobs")).toBe(1)
  })
})

describe("un archivo referenciado", () => {
  it("no se borra, aunque lleve pendiente más del plazo", async () => {
    // El recolector de subidas abandonadas borraba por antigüedad y estado, sin mirar si alguien
    // apuntaba al archivo. Cinco claves foráneas propagan el borrado —una de ellas la del
    // comprobante de un pago—, así que lo que se perdía no era la foto: era la fila.
    const archivo = newId()
    const imagen = newId()

    await db.execute(
      sql.raw(`
        insert into uploads (id, kind, status, url, file_name, extension, content_type,
                             byte_size, storage_path, created_at)
        values ('${archivo}', 'image', 'pending', 'u', 'a.jpg', 'jpg', 'image/jpeg', 10,
                '${seed.companyB}/${archivo}', now() - interval '48 hours');
        insert into location_images (id, location_id, upload_id)
        values ('${imagen}', '${seed.locationB}', '${archivo}');
      `),
    )

    await db.execute(sql.raw(`delete from uploads where id = '${archivo}'`))

    expect(
      await readElevated(`select count(*)::int as total from uploads where id = '${archivo}'`),
    ).toEqual({ total: 1 })
    expect(
      await readElevated(
        `select count(*)::int as total from location_images where id = '${imagen}'`,
      ),
    ).toEqual({ total: 1 })
  })

  it("y el que no lo está sí se borra, que es para lo que existe el recolector", async () => {
    const archivo = newId()

    await db.execute(
      sql.raw(`insert into uploads (id, kind, status, url, file_name, extension, content_type,
                                    byte_size, storage_path, created_at)
               values ('${archivo}', 'image', 'pending', 'u', 'b.jpg', 'jpg', 'image/jpeg', 10,
                       '${seed.companyB}/${archivo}', now() - interval '48 hours')`),
    )

    await db.execute(sql.raw(`delete from uploads where id = '${archivo}'`))

    expect(
      await readElevated(`select count(*)::int as total from uploads where id = '${archivo}'`),
    ).toEqual({ total: 0 })
  })
})
