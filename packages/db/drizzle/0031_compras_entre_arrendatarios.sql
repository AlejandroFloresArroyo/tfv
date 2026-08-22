-- Compras de una producción a los almacenes de otras empresas.
--
-- Ver `openspec/specs/production-procurement/spec.md`. Rebanada 23.
--
-- No trae tablas: `production_purchase_orders` y sus líneas existen desde la `0002`. Trae **una
-- columna, dos índices y cuatro funciones**, y todas existen por el mismo motivo de fondo: ésta es la
-- única operación del sistema que escribe en dos arrendatarios a la vez.

-- ─── En qué pedido acabó cada línea ──────────────────────────────────────────
--
-- Lo escribe el abanico, en la misma transacción que abre el pedido. Sin clave foránea, como
-- `production_shoppings.warehouse_order_id` y por lo mismo: el pedido pertenece a otra empresa y a
-- un módulo que importa a éste.
--
-- **No es redundante con mirar las líneas del pedido.** Es lo único que permite a la producción
-- decir cuántas líneas fueron a cada almacén sin salir de su propio arrendatario:
-- `warehouse_order_lines` atraviesa hasta el almacén en su política, así que contarlas desde aquí
-- exigiría declarar alcance sobre empresas ajenas **para responder a un listado** — que es abrir de
-- par en par lo que esta rebanada existe para mantener cerrado.
ALTER TABLE "production_purchase_order_lines" ADD COLUMN "warehouse_order_id" uuid;--> statement-breakpoint
CREATE INDEX "production_purchase_order_lines_warehouse_order_idx" ON "production_purchase_order_lines" USING btree ("warehouse_order_id");--> statement-breakpoint

-- ─── Una liquidación por pedido, garantizada por el motor ────────────────────
--
-- La liquidación comprueba antes si el pedido ya se liquidó y responde `409`. Esto es la red de
-- debajo, para las dos peticiones que entran a la vez: cada una mira en su propia instantánea, las
-- dos ven un pedido sin liquidar, y la producción acaba con el gasto contado dos veces y el doble
-- de artículos en su inventario. Un índice único no tiene esa ventana.
--
-- Parcial en las dos direcciones que este repositorio siempre exige: nulo no colisiona con nulo
-- —la inmensa mayoría de las compras se registran a mano y no vienen de ningún pedido— y una
-- compra dada de baja libera su pedido, por si hay que rehacerla.
CREATE UNIQUE INDEX "production_shoppings_warehouse_order_unique" ON "production_shoppings" USING btree ("warehouse_order_id") WHERE warehouse_order_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint

-- ─── El huevo y la gallina de la resolución, otra vez ────────────────────────
--
-- Es literalmente el problema de la `0019`, con otro sujeto. Toda política de aislamiento compara
-- contra `app.current_companies()`, que sale de las membresías del solicitante más el alcance que
-- declare la operación de sistema. Quien arma una orden de compra **es de la empresa de la
-- producción y de ninguna otra**: las medidas que pide pertenecen a almacenes de empresas ajenas,
-- así que con las políticas puestas la consulta que resolvería a qué empresa es cada una sale
-- vacía — y el alcance no se puede declarar todavía, porque esas empresas son justo lo que se está
-- averiguando.
--
-- Las tres salidas y las dos malas son las mismas que allí. Leer con el rol de la conexión
-- —`withElevated`— elude las políticas para toda la operación, y de aquí cuelga después el abanico
-- entero, que escribe en cuatro tablas de dos empresas. Abrir una política de lectura de
-- `warehouse_measurements` a cualquier arrendatario autenticado pone el catálogo entero —con sus
-- ubicaciones y sus costos— al alcance de todo el mundo, que es mucho más de lo que se pedía.
--
-- La tercera es ésta: **funciones que responden a una sola pregunta**, con su predicado escrito
-- aquí y no en quien llama, y que devuelven identificadores y nada más. Con ellos, todo lo demás
-- corre por `withSystem` con esas empresas declaradas, sujeto a las mismas políticas que cualquier
-- petición de usuario.
--
-- ## Por qué la publicación se comprueba aquí dentro
--
-- Por lo mismo que en `app.public_website`. Si el filtro viviera en quien llama, la función
-- devolvería la empresa de un almacén sin publicar y la única barrera sería que alguien se
-- acordara de mirar. Aquí dentro, un almacén sin publicar y una medida inexistente son literalmente
-- la misma fila ausente, y no hay forma de distinguirlos desde fuera porque no hay nada que
-- distinguir.
--
-- Y tiene una consecuencia que conviene decir en voz alta: **una producción sólo puede comprar de
-- un almacén publicado**. Es lo que la spec describe —la tienda interna enseña «los productos
-- publicados de los almacenes disponibles» y de ahí sale la orden—, y es además lo que impide que
-- este camino sirva de oráculo: probar identificadores de medida al azar no dice si existen.
--
-- `security definer` con `search_path` fijado, como `app.member_of()` y por lo mismo: la consulta
-- que alimenta al alcance no puede quedar sujeta a las políticas que ese alcance gobierna, y un
-- esquema en el camino de búsqueda no puede suplantar la tabla que se consulta.

-- De qué almacén y de qué empresa es cada una de estas medidas.
--
-- Toma el conjunto entero de una vez y no una medida por llamada: una orden con quince líneas son
-- quince viajes, y el abanico necesita el conjunto de empresas **antes** de abrir la transacción.
-- Lo que no encuentra sencillamente no sale, y quien llama compara cardinalidades.
create or replace function app.procurement_source(measurement_ids uuid[])
returns table (measurement_id uuid, warehouse_id uuid, company_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, w.id, w.company_id
  from warehouse_measurements m
  join warehouse_products p on p.id = m.product_id
  join warehouses w on w.id = p.warehouse_id
  where m.id = any(measurement_ids)
    and m.deleted_at is null
    and p.deleted_at is null
    and p.is_published
    and w.deleted_at is null
    and w.is_published
$$;--> statement-breakpoint

-- Qué almacenes publicados hay, para la tienda interna.
--
-- Es la otra mitad de la misma pregunta: la de arriba resuelve medidas concretas y ésta enumera el
-- escaparate. Devuelve el almacén y su empresa y nada más — el nombre, la descripción y el catálogo
-- se leen después por `withSystem`, con las políticas puestas, que es donde tienen que leerse.
create or replace function app.published_warehouses()
returns table (warehouse_id uuid, company_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id, w.company_id
  from warehouses w
  where w.deleted_at is null
    and w.is_published
$$;--> statement-breakpoint

-- Qué empresas toca una orden de compra que ya existe.
--
-- Las dos de arriba resuelven el alcance de lo que **va a nacer**. Ésta resuelve el de lo que ya
-- nació: leer las líneas de una orden, cancelarla o liquidar uno de sus pedidos exige alcanzar los
-- almacenes que la orden repartió, y el vínculo con ellos no lo dice ninguna tabla que la
-- producción pueda leer — `warehouse_orders` sí, pero `warehouses`, que es donde está la empresa,
-- no.
--
-- **Comprueba por dentro que quien pregunta alcanza la orden**, con la misma función que usa la
-- política de `warehouse_orders`. Por eso no revela nada: sólo responde a quien ya podía ver esos
-- pedidos, y sólo con las empresas de los pedidos de **su** orden. A quien no la alcanza le
-- responde el conjunto vacío, que es indistinguible de una orden inexistente.
--
-- El sentido es de ida y no de vuelta: el almacén **no** obtiene por aquí las empresas de los
-- demás almacenes de la orden, porque `app.reaches_purchase_order` mira el lado de la producción.
create or replace function app.purchase_order_scope(purchase_order uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct empresa), '{}'::uuid[])
  from (
    select pr.company_id as empresa
      from production_purchase_orders po
      join productions pr on pr.id = po.production_id
     where po.id = purchase_order
       and app.reaches_purchase_order(purchase_order)
    union
    select w.company_id
      from warehouse_orders o
      join warehouses w on w.id = o.warehouse_id
     where o.purchase_order_id = purchase_order
       and app.reaches_purchase_order(purchase_order)
  ) alcanzadas
$$;--> statement-breakpoint

-- Y la de vuelta, que es de una sola empresa y por un solo motivo.
--
-- **La propagación del rechazo hacia arriba nunca funcionó entre empresas.** La rebanada 15 cancela
-- la orden de compra cuando su último pedido se rechaza, y lo hace dentro de la transacción del
-- almacén que rechaza — que no es miembro de la empresa de la producción. La política de
-- `production_purchase_orders` exige serlo para escribir, así que la actualización afectaba a cero
-- filas **en silencio** y la orden se quedaba abierta para siempre. Su prueba estaba en verde
-- porque el almacén y la producción vivían en la misma empresa. Ver `HALLAZGOS.md` H-280.
--
-- Para arreglarlo, el rechazo tiene que declarar alcance sobre la empresa de la producción, y para
-- declararlo tiene que saber cuál es — que es otra vez la misma pregunta que no se puede hacer con
-- las políticas puestas.
--
-- Devuelve **una** empresa y sólo a quien surte uno de los pedidos de esa orden. No es una
-- revelación: el almacén ya tiene en su propia cartera al cliente que representa a esa empresa,
-- dado de alta por el abanico al abrirle el pedido. Y no da lo que la de arriba da: el almacén no
-- obtiene por aquí las empresas de los **demás** almacenes de la orden.
create or replace function app.purchase_order_buyer(purchase_order uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pr.company_id
  from production_purchase_orders po
  join productions pr on pr.id = po.production_id
  where po.id = purchase_order
    and exists (
      select 1
        from warehouse_orders o
        join warehouses w on w.id = o.warehouse_id
       where o.purchase_order_id = purchase_order
         and w.company_id = any(app.current_companies())
    )
$$;--> statement-breakpoint

-- Al alcance de quien atiende peticiones, y de nadie más. El rol `public` incluye a cualquiera que
-- llegue a hablar con la base.
revoke execute on function app.procurement_source(uuid[]) from public;--> statement-breakpoint
revoke execute on function app.purchase_order_buyer(uuid) from public;--> statement-breakpoint
grant execute on function app.purchase_order_buyer(uuid) to authenticated, service_role;--> statement-breakpoint
revoke execute on function app.published_warehouses() from public;--> statement-breakpoint
revoke execute on function app.purchase_order_scope(uuid) from public;--> statement-breakpoint
grant execute on function app.procurement_source(uuid[]) to authenticated, service_role;--> statement-breakpoint
grant execute on function app.published_warehouses() to authenticated, service_role;--> statement-breakpoint
grant execute on function app.purchase_order_scope(uuid) to authenticated, service_role;--> statement-breakpoint

comment on function app.procurement_source(uuid[]) is
  'De qué almacén y de qué empresa es cada medida, entre las publicadas. Resuelve el alcance del abanico de compra antes de que se pueda declarar. Rebanada 23.';--> statement-breakpoint
comment on function app.published_warehouses() is
  'Los almacenes publicados y su empresa. Escaparate de la tienda interna. Rebanada 23.';--> statement-breakpoint
comment on function app.purchase_order_scope(uuid) is
  'Las empresas que toca una orden de compra, para quien ya la alcanza. Alcance de la lectura de sus lineas, de su cancelacion y de su liquidacion. Rebanada 23.';--> statement-breakpoint
comment on function app.purchase_order_buyer(uuid) is
  'La empresa de la produccion que abrio una orden de compra, para el almacen que surte uno de sus pedidos. Alcance de la propagacion del rechazo hacia arriba. Rebanada 23, H-280.';
