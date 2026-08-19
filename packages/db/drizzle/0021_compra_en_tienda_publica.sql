-- La compra en tienda pública: idempotencia de la sesión, y quién puede tocar qué.
--
-- Ver `openspec/specs/storefront-checkout/spec.md` y `order-fulfillment/spec.md`. Rebanada 18.
-- Escrita a mano, como las 0014, 0015, 0018, 0019 y 0020: `drizzle-kit generate` no corre en este
-- árbol (`HALLAZGOS.md` H-87).
--
-- Trae dos cosas que no se parecen entre sí y van juntas porque son la misma rebanada:
--
-- 1. **La clave de idempotencia** de la creación de la sesión de pago, que `api-conventions` exige
--    a todo endpoint que mueva dinero.
-- 2. **Tres políticas corregidas**. Las tres son el mismo error, y el mismo que la `0005` deja
--    advertido en su propia cabecera: «un `exists` se resuelve con la política de **lectura** del
--    padre», así que un hijo escrito sobre un padre que el comprador lee hereda la anchura de esa
--    lectura y deja escribir a quien sólo debía mirar.

-- ─── La clave de idempotencia ────────────────────────────────────────────────
--
-- «Crear una sesión de pago SHALL admitir una clave de idempotencia… de modo que un reintento del
-- comprador no genere dos sesiones ni aparte inventario dos veces».
--
-- Van **dos** columnas y no una. La clave sola resuelve el doble clic; el resumen del cuerpo es lo
-- que permite distinguir un reintento de la misma compra —que devuelve lo de la primera vez— de
-- una compra distinta enviada con una clave ya usada, que `api-conventions` manda rechazar con
-- `409`. Sin él, reutilizar una clave devolvería alegremente el carrito de otra compra.
--
-- El único es **por comprador**, no global: las claves las escoge el navegador de cada quien y dos
-- personas pueden elegir la misma sin que eso signifique nada. Global, la segunda recibiría la
-- compra de la primera — que es un fallo de aislamiento, no una colisión.
--
-- Parcial, para que las compras que no traen clave —no es obligatoria— no colisionen todas entre sí
-- por compartir el nulo.
ALTER TABLE "checkouts" ADD COLUMN "idempotency_key" varchar(120);--> statement-breakpoint
ALTER TABLE "checkouts" ADD COLUMN "request_hash" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "checkouts_idempotency_unique" ON "checkouts" USING btree ("buyer_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint

-- ─── La instantánea de la compra deja de ser escribible por el comprador ─────
--
-- La `0005` dejó `checkouts` con una sola política para todo: la empresa vendedora **o el
-- comprador**. Correcta para leer —el comprador tiene que poder ver su compra— y demasiado ancha
-- para escribir, porque `checkouts.lines` es la instantánea:
--
-- > «Esta instantánea SHALL ser la fuente para materializar el pedido, de modo que un cambio
-- > posterior en el catálogo no altere lo comprado.»
--
-- Con la política anterior, el propio comprador podía reescribirla entre el pago y la confirmación:
-- cambiar cantidades, precios, importes, o marcar la compra como ya materializada para que el
-- pedido no llegara a existir. La fuente de la materialización no puede estar en manos de una de
-- las partes.
--
-- No se pierde nada al cerrarla: la compra **no la escribe el comprador** ni antes ni después. La
-- crea el servicio con el alcance de la empresa vendedora declarado —lo necesita de todos modos
-- para apartar unidades—, y cancelarla también, tras comprobar en la aplicación que quien cancela
-- es su dueño. Es el aislamiento en sus dos capas, que es lo que la spec pide.
--
-- Anotado en `HALLAZGOS.md` H-102.
drop policy if exists lectura on public.checkouts;--> statement-breakpoint
create policy lectura on public.checkouts
  for select to authenticated
  using (
        checkouts.company_id = any((select app.current_companies())::uuid[])
    or checkouts.buyer_id = (select app.uid())
  );--> statement-breakpoint

drop policy if exists arrendatario on public.checkouts;--> statement-breakpoint
create policy arrendatario on public.checkouts
  for all to authenticated
  using (checkouts.company_id = any((select app.current_companies())::uuid[]))
  with check (checkouts.company_id = any((select app.current_companies())::uuid[]));--> statement-breakpoint

-- ─── El pago no lo escribe quien paga ────────────────────────────────────────
--
-- `payments` se escribía con `exists (select 1 from checkouts c where c.id = payments.checkout_id)`,
-- y ese `exists` se resuelve con la **lectura** de `checkouts`, que incluye al comprador. Es decir:
-- el comprador podía insertar y modificar el registro de su propio cobro —importe bruto, comisión,
-- neto, estado, referencias del procesador—, que es exactamente el asiento con el que después se
-- concilia lo que entró.
--
-- Atraviesa hasta `companies`, que tiene política simétrica y corta ahí. Es la misma corrección que
-- `buyer_order_lines` ya llevaba escrita en la `0005` —«si compusiera con `buyer_orders` a secas,
-- el comprador podría añadirle líneas»— aplicada a la tabla vecina, donde se había quedado sin
-- hacer. La rama de sistema se conserva: el pago nace dentro de la materialización.
--
-- Anotado en `HALLAZGOS.md` H-103.
drop policy if exists arrendatario on public.payments;--> statement-breakpoint
create policy arrendatario on public.payments
  for all to authenticated
  using (
        (select app.is_system())
    or exists (
      select 1 from checkouts c join companies co on co.id = c.company_id
      where c.id = payments.checkout_id
    )
  )
  with check (
        (select app.is_system())
    or exists (
      select 1 from checkouts c join companies co on co.id = c.company_id
      where c.id = payments.checkout_id
    )
  );--> statement-breakpoint

-- ─── Y el comprador sí puede ver lo que compró ───────────────────────────────
--
-- El mismo error por el otro lado. `buyer_order_lines` sólo tenía política de arrendatario, que
-- atraviesa hasta `companies` —correcto para escribir, por lo que la propia `0005` explica— y deja
-- al comprador **sin poder leer las líneas de su propio pedido**: ve el pedido, ve el total, y no ve
-- qué compró.
--
-- «Un comprador SHALL poder consultar sus pedidos con su estado, **sus artículos**, su pago y el
-- seguimiento de su envío.» La lectura se apoya en `buyer_orders`, que es donde vive la regla de
-- quién alcanza un pedido, y componer lecturas con lecturas no ensancha nada: una línea se ve
-- exactamente cuando se ve su pedido.
drop policy if exists lectura on public.buyer_order_lines;--> statement-breakpoint
create policy lectura on public.buyer_order_lines
  for select to authenticated
  using (exists (select 1 from buyer_orders o where o.id = buyer_order_lines.order_id));--> statement-breakpoint

-- ─── Y el pedido operativo tampoco ───────────────────────────────────────────
--
-- El tercero del mismo grupo, y el más caro: la escritura de `warehouse_orders` admite
-- `exists (select 1 from buyer_orders bo where bo.id = warehouse_orders.buyer_order_id)`, y la
-- lectura de `buyer_orders` incluye «los míos». Un comprador con un pedido suyo podía **insertar
-- una orden de trabajo en el almacén de cualquier empresa**, nombrando su propio pedido: el
-- `warehouse_id` no lo acota nada, porque la primera rama del `or` ya no hace falta cuando la
-- segunda es cierta.
--
-- La rama existe por un motivo real —la materialización crea el pedido operativo y quiere poder
-- alcanzarlo desde el pedido de comprador—, así que no se quita: se hace atravesar hasta
-- `companies`, igual que la `0020` hizo con `shipments` (H-99). La materialización corre con la
-- empresa vendedora declarada, así que la sigue satisfaciendo; el comprador, no.
--
-- La **lectura** se deja como está: el comprador sí tiene que poder ver la orden de trabajo que
-- originó su compra.
--
-- Anotado en `HALLAZGOS.md` H-104.
drop policy if exists arrendatario on public.warehouse_orders;--> statement-breakpoint
create policy arrendatario on public.warehouse_orders
  for all to authenticated
  using (
        exists (select 1 from warehouses w where w.id = warehouse_orders.warehouse_id)
    or exists (
      select 1 from buyer_orders bo join companies c on c.id = bo.company_id
      where bo.id = warehouse_orders.buyer_order_id
    )
    or (select app.reaches_purchase_order(warehouse_orders.purchase_order_id))
  )
  with check (
        exists (select 1 from warehouses w where w.id = warehouse_orders.warehouse_id)
    or exists (
      select 1 from buyer_orders bo join companies c on c.id = bo.company_id
      where bo.id = warehouse_orders.buyer_order_id
    )
    or (select app.reaches_purchase_order(warehouse_orders.purchase_order_id))
  );--> statement-breakpoint

-- ─── Y la comprobación de siempre ────────────────────────────────────────────
--
-- Ninguna tabla sin aislamiento, ninguna sin política, y ninguna política llamando a la identidad
-- cruda. Se repite en cada migración que toca políticas porque el modo de fallo de olvidarla no es
-- «cerrado» sino abierto de par en par, y en silencio.
do $$
declare sin_rls text[]; sin_politica text[]; crudas text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
  into sin_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  select coalesce(array_agg(c.relname order by c.relname), '{}')
  into sin_politica
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  select coalesce(array_agg(c.relname || '.' || p.polname order by c.relname, p.polname), '{}')
  into crudas
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (pg_get_expr(p.polqual, p.polrelid) like '%auth.uid()%'
      or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%auth.uid()%');

  if array_length(sin_rls, 1) is not null then
    raise exception 'Tablas sin RLS activado: %', sin_rls;
  end if;
  if array_length(sin_politica, 1) is not null then
    raise exception 'Tablas sin ninguna política: %', sin_politica;
  end if;
  if array_length(crudas, 1) is not null then
    raise exception 'Políticas que llaman a la identidad cruda: %', crudas;
  end if;
end $$;
