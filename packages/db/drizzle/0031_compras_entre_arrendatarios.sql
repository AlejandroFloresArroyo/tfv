-- Compras de una producción a los almacenes de otras empresas.
--
-- Ver `openspec/specs/production-procurement/spec.md`. Rebanada 23.
--
-- No trae tablas: `production_purchase_orders` y sus líneas existen desde la `0002`. Trae **un
-- índice** y **dos funciones**, y las tres piezas existen por el mismo motivo de fondo: esta es la
-- única operación del sistema que escribe en dos arrendatarios a la vez.

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

-- Al alcance de quien atiende peticiones, y de nadie más. El rol `public` incluye a cualquiera que
-- llegue a hablar con la base.
revoke execute on function app.procurement_source(uuid[]) from public;--> statement-breakpoint
revoke execute on function app.published_warehouses() from public;--> statement-breakpoint
grant execute on function app.procurement_source(uuid[]) to authenticated, service_role;--> statement-breakpoint
grant execute on function app.published_warehouses() to authenticated, service_role;--> statement-breakpoint

comment on function app.procurement_source(uuid[]) is
  'De qué almacén y de qué empresa es cada medida, entre las publicadas. Resuelve el alcance del abanico de compra antes de que se pueda declarar. Rebanada 23.';--> statement-breakpoint
comment on function app.published_warehouses() is
  'Los almacenes publicados y su empresa. Escaparate de la tienda interna. Rebanada 23.';
