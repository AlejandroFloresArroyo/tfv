-- Políticas de aislamiento por tabla.
--
-- Ver `openspec/specs/access-control/spec.md`, requisito «El aislamiento se cumple en dos capas».
-- Continúa `0004_tenant_context.sql`, que definió de dónde salen las empresas del solicitante.
-- Migración escrita a mano: define políticas, no tablas, así que no la genera Drizzle.
--
-- ## Tres patrones, y sólo tres
--
-- 1. **Vía directa** — la fila lleva la empresa: `company_id = any(app.current_companies())`.
-- 2. **Vía derivada** — la fila cuelga de otra: `exists (select 1 from padre where padre.id = ...)`.
-- 3. **Catálogo de plataforma** — común a todos: lectura abierta, escritura sólo de administración.
--
-- El patrón 2 **no repite la lógica de empresa**. La consulta interior queda sujeta a la política
-- del padre, así que una fila es visible exactamente cuando su padre lo es, y la composición
-- alcanza cualquier profundidad. Una línea de utilería llega hasta la empresa por cuatro saltos sin
-- que su política mencione ninguna empresa.
--
-- La contrapartida es que **la cadena se rompe si alguien desactiva las políticas de un eslabón
-- intermedio**, y los descendientes quedarían abiertos sin que nada avise. Por eso esta migración
-- termina comprobando que las 91 tablas tienen políticas, y hay una prueba que lo vuelve a
-- comprobar en cada ejecución.
--
-- ## Leer y escribir no llevan el mismo predicado
--
-- Un `exists` se resuelve con la política de **lectura** del padre. Donde la lectura del padre es
-- más ancha que su escritura —un comprador lee su pedido, un cliente lee la cotización que le
-- hicieron— un hijo escrito como `exists (padre)` heredaría la anchura de la lectura y dejaría
-- escribir a quien sólo debía mirar. Esos hijos **atraviesan hasta una tabla de política simétrica**
-- (el almacén, la producción, la empresa) en lugar de apoyarse en el padre inmediato.
--
-- Cuando las dos caras difieren se escriben dos políticas: `lectura` para lo que se ve y
-- `arrendatario` para lo que se toca. Cada una lleva anotado por qué.
--
-- ## Por qué `(select ...)` alrededor de cada llamada
--
-- `app.current_companies()` consulta las membresías. Escrita como `any(app.current_companies())` se
-- evalúa **una vez por fila**; envuelta en `(select ...)` el planificador la convierte en un
-- subplán inicial y la evalúa una sola vez por consulta.
--
-- ## Ciclos
--
-- Dos políticas que se referencian entre sí provocan «infinite recursion detected in policy». Pasa
-- en los dos puntos donde dos empresas distintas ven el mismo documento desde lados opuestos: el
-- pedido de almacén contra la orden de compra de producción, y la contraparte contra su documento.
-- En ambos se rompe el ciclo con una función `security definer`, que resuelve la pertenencia sin
-- pasar por las políticas.

-- ─── Ayudas de tiempo de ejecución ───────────────────────────────────────────

-- ¿La contraparte de este documento soy yo, o una empresa mía?
--
-- La fila de contraparte pertenece a **quien vende**, así que su política se la oculta a quien
-- compra. Sin `security definer`, el cliente no podría ver el pedido que le hicieron a él.
create or replace function app.is_my_counterparty(counterparty uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from counterparties c
    where c.id = counterparty
      and (
        c.user_id = auth.uid()
        or c.counterparty_company_id = any(app.current_companies())
      )
  )
$$;

-- ¿Alcanzo la orden de compra de producción desde la que se generó este pedido de almacén?
--
-- Rompe el ciclo entre `warehouse_orders` y `production_purchase_orders`: cada lado necesita ver el
-- del otro, y si ambos lo hicieran con `exists` las dos políticas se llamarían en círculo.
create or replace function app.reaches_purchase_order(purchase_order uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from production_purchase_orders po
    join productions pr on pr.id = po.production_id
    where po.id = purchase_order
      and pr.company_id = any(app.current_companies())
  )
$$;

-- ¿Esto lo está haciendo un contexto de sistema?
--
-- Tres tablas —envíos, pagos y entregas de aviso— **no tienen vía hasta la empresa en el momento de
-- insertarse**: la fila nace antes de que exista lo que la enlazará. Las escribe la materialización
-- del pedido, que corre con alcance declarado. Esto no afloja nada: `withSystem` sigue sujeto a las
-- políticas de todas las demás tablas que toca.
create or replace function app.is_system()
returns boolean
language sql
stable
as $$
  select array_length(app.system_scope(), 1) is not null
$$;

revoke execute on function app.is_system() from public;
grant execute on function app.is_system() to authenticated, service_role;

revoke execute on function app.is_my_counterparty(uuid) from public;
revoke execute on function app.reaches_purchase_order(uuid) from public;
grant execute on function app.is_my_counterparty(uuid) to authenticated, service_role;
grant execute on function app.reaches_purchase_order(uuid) to authenticated, service_role;

-- ─── Ayudas de construcción ──────────────────────────────────────────────────
--
-- Existen sólo mientras corre esta migración y se eliminan al final: son andamiaje de DDL, no algo
-- que deba quedar al alcance de nadie en tiempo de ejecución.

create or replace function app.__policy_tenant(tabla text, predicado text)
returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', tabla);
  execute format('drop policy if exists arrendatario on public.%I', tabla);
  execute format(
    'create policy arrendatario on public.%I for all to authenticated using (%s) with check (%s)',
    tabla, predicado, predicado
  );
end $$;

create or replace function app.__policy_read(tabla text, predicado text)
returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', tabla);
  execute format('drop policy if exists lectura on public.%I', tabla);
  execute format(
    'create policy lectura on public.%I for select to authenticated using (%s)',
    tabla, predicado
  );
end $$;

create or replace function app.__policy_insert(tabla text, predicado text)
returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', tabla);
  execute format('drop policy if exists alta on public.%I', tabla);
  execute format(
    'create policy alta on public.%I for insert to authenticated with check (%s)',
    tabla, predicado
  );
end $$;

-- ─── Identidad ───────────────────────────────────────────────────────────────

-- **Leer y escribir no llevan el mismo predicado**, y la diferencia importa.
--
-- Un usuario se lee a sí mismo, lee a quien comparte empresa con él, y lee a quien le ha comprado
-- —sin la tercera cláusula un comercio no podría ver al comprador de su propio pedido—. Pero
-- **sólo se modifica a sí mismo**: si el predicado de lectura valiera también para escribir,
-- cualquier compañero de empresa podría reescribir la ficha de otro.
select app.__policy_read('users', $p$
      users.id = (select auth.uid())
  or exists (
       select 1 from company_members m
       where m.user_id = users.id
         and m.company_id = any((select app.current_companies())::uuid[])
     )
  or exists (select 1 from buyer_orders o where o.buyer_id = users.id)
  or exists (select 1 from checkouts c where c.buyer_id = users.id)
$p$);
select app.__policy_tenant('users', $p$ users.id = (select auth.uid()) $p$);

select app.__policy_tenant('companies', $p$ companies.id = any((select app.current_companies())::uuid[]) $p$);

-- La membresía propia se **lee** aunque esté desactivada: es lo que permite explicar por qué ya no
-- se entra a una empresa en la que se estuvo. Escribirla es de la empresa: si «la mía» valiera para
-- escribir, cualquiera podría darse de alta en la empresa que quisiera.
select app.__policy_read('company_members', $p$
      company_members.company_id = any((select app.current_companies())::uuid[])
  or company_members.user_id = (select auth.uid())
$p$);
select app.__policy_tenant('company_members', $p$ company_members.company_id = any((select app.current_companies())::uuid[]) $p$);

select app.__policy_tenant('roles',                 $p$ roles.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('company_addresses',     $p$ company_addresses.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('company_services',      $p$ company_services.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('company_activities',    $p$ company_activities.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('counterparties',        $p$ counterparties.company_id = any((select app.current_companies())::uuid[]) $p$);

-- ─── Cuenta de usuario, no de arrendatario ───────────────────────────────────

-- Una dirección de usuario la **lee** su dueño y la lee el comercio al que se la dio para enviarle.
-- Sólo la escribe su dueño.
select app.__policy_read('user_addresses', $p$
      user_addresses.user_id = (select auth.uid())
  or exists (select 1 from checkouts c where c.ship_to_address_id = user_addresses.id)
$p$);
select app.__policy_tenant('user_addresses', $p$ user_addresses.user_id = (select auth.uid()) $p$);

select app.__policy_tenant('push_devices',            $p$ push_devices.user_id = (select auth.uid()) $p$);
select app.__policy_tenant('notification_preferences',$p$ notification_preferences.user_id = (select auth.uid()) $p$);
select app.__policy_tenant('sessions',                $p$ sessions.user_id = (select auth.uid()) $p$);

-- Un aviso lo lee su destinatario y la empresa cuya actividad lo originó. Lo escribe únicamente
-- quien es dueño de esa actividad: nadie se fabrica avisos a su propio nombre.
select app.__policy_read('notification_deliveries', $p$
      notification_deliveries.recipient_id = (select auth.uid())
  or exists (select 1 from company_activities a where a.id = notification_deliveries.activity_id)
$p$);
select app.__policy_tenant('notification_deliveries', $p$
      exists (select 1 from company_activities a where a.id = notification_deliveries.activity_id)
  or (select app.is_system())
$p$);

-- Credenciales de un solo uso e intentos de acceso: **ninguna petición de usuario los lee**. Se
-- consultan por su valor, antes de que haya identidad, desde la vía elevada. Tampoco los alcanza la
-- administración de plataforma: el requisito le concede el papel de propietario de una empresa, y
-- esto no son datos de ninguna empresa.
select app.__policy_tenant('one_time_credentials', $p$ false $p$);
select app.__policy_tenant('login_attempts',       $p$ false $p$);

-- ─── Catálogo de plataforma ──────────────────────────────────────────────────
--
-- Común a todos los arrendatarios: se lee sin restricción y sólo lo escribe la administración de
-- plataforma, a través de la política que se añade al final a todas las tablas.

select app.__policy_read('services',           $p$ true $p$);
select app.__policy_read('global_categories',  $p$ true $p$);
select app.__policy_read('subscription_plans', $p$ true $p$);
select app.__policy_read('pixit_boards',       $p$ true $p$);
select app.__policy_read('pixit_board_sizes',  $p$ true $p$);
select app.__policy_read('pixit_sheets',       $p$ true $p$);
select app.__policy_read('pixit_colors',       $p$ true $p$);
select app.__policy_read('pixit_rooms',        $p$ true $p$);
select app.__policy_read('pixit_terms',        $p$ true $p$);

-- ─── Archivos ────────────────────────────────────────────────────────────────
--
-- `uploads` no tiene vía hasta la empresa **a propósito**: una misma fila la referencian entidades
-- de empresas distintas y no tiene dueño. Se lee sin restricción y se da de alta sin restricción;
-- modificarla o borrarla queda para la administración de plataforma y la vía de sistema, que es
-- también quien retira el objeto del almacenamiento.
--
-- Lo que protege el contenido no es esta política sino la URL firmada: la fila sólo guarda su
-- dirección. Queda anotado como límite conocido en `IMPLEMENTATION.md`.
select app.__policy_read('uploads',   $p$ true $p$);
select app.__policy_insert('uploads', $p$ true $p$);

-- ─── Suscripción y cobro ─────────────────────────────────────────────────────

select app.__policy_tenant('company_subscriptions', $p$ company_subscriptions.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('subscription_payments', $p$ subscription_payments.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('merchant_profiles',     $p$ merchant_profiles.company_id = any((select app.current_companies())::uuid[]) $p$);

-- El comprador lee su propio cobro; escribirlo es del comercio.
select app.__policy_read('merchant_payments', $p$
      merchant_payments.company_id = any((select app.current_companies())::uuid[])
  or merchant_payments.buyer_id = (select auth.uid())
$p$);
select app.__policy_tenant('merchant_payments', $p$ merchant_payments.company_id = any((select app.current_companies())::uuid[]) $p$);

-- ─── Compra en tienda pública ────────────────────────────────────────────────

select app.__policy_tenant('checkouts', $p$
      checkouts.company_id = any((select app.current_companies())::uuid[])
  or checkouts.buyer_id = (select auth.uid())
$p$);

-- El comprador lee su pedido; no lo escribe. El pedido no lo crea nadie a mano: lo materializa el
-- cobro confirmado, con el alcance de la empresa declarado.
select app.__policy_read('buyer_orders', $p$
      buyer_orders.company_id = any((select app.current_companies())::uuid[])
  or buyer_orders.buyer_id = (select auth.uid())
$p$);
select app.__policy_tenant('buyer_orders', $p$ buyer_orders.company_id = any((select app.current_companies())::uuid[]) $p$);

-- Atraviesa hasta la empresa: si compusiera con `buyer_orders` a secas, el comprador —que lee su
-- pedido— podría añadirle líneas.
select app.__policy_tenant('buyer_order_lines', $p$ exists (select 1 from buyer_orders o join companies c on c.id = o.company_id where o.id = buyer_order_lines.order_id) $p$);

select app.__policy_read('payments', $p$
      payments.buyer_id = (select auth.uid())
  or exists (select 1 from checkouts c where c.id = payments.checkout_id)
$p$);
select app.__policy_tenant('payments', $p$
      exists (select 1 from checkouts c where c.id = payments.checkout_id)
  or (select app.is_system())
$p$);

-- El envío nace sin nada que lo enlace: el pedido lo apunta después. Se lee a través del pedido y
-- se escribe desde el sistema.
select app.__policy_read('shipments', $p$ exists (select 1 from buyer_orders o where o.shipment_id = shipments.id) $p$);
select app.__policy_tenant('shipments', $p$ (select app.is_system()) $p$);

-- El evento crudo del procesador es material de sistema: lo escribe el receptor de webhooks por la
-- vía elevada y ninguna petición de usuario lo necesita.
select app.__policy_tenant('payment_events', $p$ false $p$);

-- ─── Almacenes ───────────────────────────────────────────────────────────────
-- Vía: almacén → empresa. Todo lo demás cuelga del almacén.

select app.__policy_tenant('warehouses',             $p$ warehouses.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('warehouse_categories',   $p$ exists (select 1 from warehouses w where w.id = warehouse_categories.warehouse_id) $p$);
select app.__policy_tenant('warehouse_storages',     $p$ exists (select 1 from warehouses w where w.id = warehouse_storages.warehouse_id) $p$);
select app.__policy_tenant('warehouse_price_lists',  $p$ exists (select 1 from warehouses w where w.id = warehouse_price_lists.warehouse_id) $p$);
select app.__policy_tenant('warehouse_products',     $p$ exists (select 1 from warehouses w where w.id = warehouse_products.warehouse_id) $p$);
select app.__policy_tenant('warehouse_measurements', $p$ exists (select 1 from warehouse_products p where p.id = warehouse_measurements.product_id) $p$);
select app.__policy_tenant('warehouse_product_prices', $p$ exists (select 1 from warehouse_price_lists l where l.id = warehouse_product_prices.price_list_id) $p$);
select app.__policy_tenant('warehouse_stock_units',  $p$ exists (select 1 from warehouse_measurements m where m.id = warehouse_stock_units.measurement_id) $p$);
select app.__policy_tenant('warehouse_stock_events', $p$ exists (select 1 from warehouse_stock_units u where u.id = warehouse_stock_events.stock_unit_id) $p$);
select app.__policy_tenant('warehouse_stock_reservations', $p$ exists (select 1 from warehouse_stock_units u where u.id = warehouse_stock_reservations.stock_unit_id) $p$);

-- El pedido de almacén lo leen cuatro partes: quien lo surte, quien lo pidió como contraparte, y
-- quien lo originó desde una compra de tienda o desde una orden de compra de producción.
--
-- Escribirlo no es de la contraparte. Un cliente que pudiera escribir en el pedido que le hicieron
-- editaría el documento del proveedor.
select app.__policy_read('warehouse_orders', $p$
      exists (select 1 from warehouses w where w.id = warehouse_orders.warehouse_id)
  or (select app.is_my_counterparty(warehouse_orders.client_id))
  or exists (select 1 from buyer_orders bo where bo.id = warehouse_orders.buyer_order_id)
  or (select app.reaches_purchase_order(warehouse_orders.purchase_order_id))
$p$);
select app.__policy_tenant('warehouse_orders', $p$
      exists (select 1 from warehouses w where w.id = warehouse_orders.warehouse_id)
  or exists (select 1 from buyer_orders bo where bo.id = warehouse_orders.buyer_order_id)
  or (select app.reaches_purchase_order(warehouse_orders.purchase_order_id))
$p$);

-- La línea atraviesa hasta el almacén: el cliente lee el pedido, pero no compone su contenido.
select app.__policy_tenant('warehouse_order_lines', $p$ exists (select 1 from warehouse_orders o join warehouses w on w.id = o.warehouse_id where o.id = warehouse_order_lines.order_id) $p$);

-- **El mensaje sí compone con el pedido a secas, y es deliberado.** Es un chat: el cliente tiene
-- que poder escribir en él. Es el único sitio donde la contraparte escribe.
select app.__policy_tenant('warehouse_order_messages', $p$ exists (select 1 from warehouse_orders o where o.id = warehouse_order_messages.order_id) $p$);

-- La cotización la lee el almacén que la emite y el cliente al que va dirigida; la escribe sólo
-- quien la emite.
select app.__policy_read('warehouse_quotes', $p$
      exists (select 1 from warehouses w where w.id = warehouse_quotes.warehouse_id)
  or (select app.is_my_counterparty(warehouse_quotes.client_id))
$p$);
select app.__policy_tenant('warehouse_quotes', $p$ exists (select 1 from warehouses w where w.id = warehouse_quotes.warehouse_id) $p$);

select app.__policy_tenant('warehouse_quote_lines',    $p$ exists (select 1 from warehouse_quotes q join warehouses w on w.id = q.warehouse_id where q.id = warehouse_quote_lines.quote_id) $p$);
select app.__policy_tenant('warehouse_quote_payments', $p$ exists (select 1 from warehouse_quotes q join warehouses w on w.id = q.warehouse_id where q.id = warehouse_quote_payments.quote_id) $p$);
select app.__policy_tenant('warehouse_quote_payment_vouchers', $p$ exists (select 1 from warehouse_quote_payments p where p.id = warehouse_quote_payment_vouchers.payment_id) $p$);

-- ─── Producciones ────────────────────────────────────────────────────────────
-- Vía: producción → empresa.

select app.__policy_tenant('productions',            $p$ productions.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('production_scripts',     $p$ exists (select 1 from productions p where p.id = production_scripts.production_id) $p$);
select app.__policy_tenant('production_chapters',    $p$ exists (select 1 from productions p where p.id = production_chapters.production_id) $p$);
select app.__policy_tenant('production_scenes',      $p$ exists (select 1 from production_chapters c where c.id = production_scenes.chapter_id) $p$);
select app.__policy_tenant('production_characters',  $p$ exists (select 1 from productions p where p.id = production_characters.production_id) $p$);
select app.__policy_tenant('production_categories',  $p$ exists (select 1 from productions p where p.id = production_categories.production_id) $p$);
select app.__policy_tenant('production_sets',        $p$ exists (select 1 from productions p where p.id = production_sets.production_id) $p$);
select app.__policy_tenant('production_set_items',   $p$ exists (select 1 from production_sets s where s.id = production_set_items.set_id) $p$);
select app.__policy_tenant('production_videos',      $p$ exists (select 1 from productions p where p.id = production_videos.production_id) $p$);
select app.__policy_tenant('production_items',       $p$ exists (select 1 from productions p where p.id = production_items.production_id) $p$);
select app.__policy_tenant('production_item_images', $p$ exists (select 1 from production_items i where i.id = production_item_images.item_id) $p$);
select app.__policy_tenant('production_recordings',  $p$ exists (select 1 from productions p where p.id = production_recordings.production_id) $p$);
select app.__policy_tenant('production_recording_notes', $p$ exists (select 1 from production_recordings r where r.id = production_recording_notes.recording_id) $p$);
select app.__policy_tenant('production_continuities',$p$ exists (select 1 from production_recordings r where r.id = production_continuities.recording_id) $p$);
select app.__policy_tenant('production_props',       $p$ exists (select 1 from production_continuities c where c.id = production_props.continuity_id) $p$);
select app.__policy_tenant('production_workflows',   $p$ exists (select 1 from productions p where p.id = production_workflows.production_id) $p$);
select app.__policy_tenant('production_tasks',       $p$ exists (select 1 from production_workflows w where w.id = production_tasks.workflow_id) $p$);
select app.__policy_tenant('production_task_activities', $p$ exists (select 1 from production_tasks t where t.id = production_task_activities.task_id) $p$);
select app.__policy_tenant('production_anchors',     $p$ exists (select 1 from productions p where p.id = production_anchors.production_id) $p$);
select app.__policy_tenant('production_shoppings',   $p$ exists (select 1 from productions p where p.id = production_shoppings.production_id) $p$);
select app.__policy_tenant('production_deliveries',  $p$ exists (select 1 from productions p where p.id = production_deliveries.production_id) $p$);
select app.__policy_tenant('production_delivery_lines', $p$ exists (select 1 from production_deliveries d where d.id = production_delivery_lines.delivery_id) $p$);

-- Cuelgan de un padre u otro, y ninguno de los dos es obligatorio.
select app.__policy_tenant('production_comments', $p$
      exists (select 1 from production_tasks t where t.id = production_comments.task_id)
  or exists (select 1 from production_workflows w where w.id = production_comments.workflow_id)
$p$);

select app.__policy_tenant('production_attachments', $p$
      exists (select 1 from production_tasks t where t.id = production_attachments.task_id)
  or exists (select 1 from production_anchors a where a.id = production_attachments.anchor_id)
  or exists (select 1 from production_shoppings s where s.id = production_attachments.shopping_id)
  or exists (select 1 from production_task_activities v where v.id = production_attachments.activity_id)
$p$);

-- La orden de compra la **lee** la producción que compra y el almacén al que se le compró; la
-- escribe sólo la producción. Lo que el proveedor acepta o rechaza se registra en su propio pedido
-- de almacén, que sí es suyo.
--
-- Este lado usa `exists` y el otro la función; si ambos usaran `exists` se llamarían en círculo.
select app.__policy_read('production_purchase_orders', $p$
      exists (select 1 from productions p where p.id = production_purchase_orders.production_id)
  or exists (select 1 from warehouse_orders o where o.purchase_order_id = production_purchase_orders.id)
$p$);
select app.__policy_tenant('production_purchase_orders', $p$ exists (select 1 from productions p where p.id = production_purchase_orders.production_id) $p$);

select app.__policy_tenant('production_purchase_order_lines', $p$ exists (select 1 from production_purchase_orders o join productions p on p.id = o.production_id where o.id = production_purchase_order_lines.purchase_order_id) $p$);

-- ─── Pixit ───────────────────────────────────────────────────────────────────
-- Vía: tienda → empresa. La mercancía suelta lleva la empresa directa.

select app.__policy_tenant('pixit_stores',   $p$ pixit_stores.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('pixit_products', $p$ pixit_products.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('pixit_product_images', $p$ exists (select 1 from pixit_products p where p.id = pixit_product_images.product_id) $p$);
select app.__policy_tenant('pixit_inventory_definitions', $p$ exists (select 1 from pixit_stores s where s.id = pixit_inventory_definitions.store_id) $p$);
select app.__policy_tenant('pixit_inventory_movements', $p$ exists (select 1 from pixit_inventory_definitions d where d.id = pixit_inventory_movements.definition_id) $p$);
select app.__policy_tenant('pixit_cash_sessions', $p$ exists (select 1 from pixit_stores s where s.id = pixit_cash_sessions.store_id) $p$);
select app.__policy_tenant('pixit_sales',         $p$ exists (select 1 from pixit_stores s where s.id = pixit_sales.store_id) $p$);

-- ─── Sitios web ──────────────────────────────────────────────────────────────

select app.__policy_tenant('websites', $p$ websites.company_id = any((select app.current_companies())::uuid[]) $p$);
select app.__policy_tenant('website_customizations', $p$ exists (select 1 from websites w where w.id = website_customizations.website_id) $p$);

-- ─── Locaciones ──────────────────────────────────────────────────────────────
-- Vía: red → empresa. Escribir es de la red; **leer es de todos**, porque es un directorio: su
-- razón de ser es que otras empresas encuentren dónde rodar.

select app.__policy_tenant('location_networks', $p$ location_networks.company_id = any((select app.current_companies())::uuid[]) $p$);
-- La ficha y sus hijos se leen sin restricción; escribirlos atraviesa hasta la red. Componer con
-- `locations` a secas dejaría a cualquiera colgar fotos y etiquetas de la locación de otro, porque
-- la locación la ve todo el mundo.
select app.__policy_read('locations',       $p$ true $p$);
select app.__policy_read('location_images', $p$ true $p$);
select app.__policy_read('location_tags',   $p$ true $p$);

select app.__policy_tenant('locations',       $p$ exists (select 1 from location_networks n where n.id = locations.network_id) $p$);
select app.__policy_tenant('location_images', $p$ exists (select 1 from locations l join location_networks n on n.id = l.network_id where l.id = location_images.location_id) $p$);
select app.__policy_tenant('location_tags',   $p$ exists (select 1 from locations l join location_networks n on n.id = l.network_id where l.id = location_tags.location_id) $p$);

-- ─── Administración de plataforma ────────────────────────────────────────────
--
-- «Un usuario marcado como administrador de plataforma SHALL poder operar sobre cualquier empresa
-- como si fuese propietario de ella» (`access-control`). Una política por tabla, generada.
--
-- **Dos tablas quedan fuera a propósito**: las sesiones y las credenciales de un solo uso. El
-- requisito concede el papel de propietario *de una empresa*, y las credenciales de otra persona no
-- son datos de ninguna empresa. Excluirlas no contradice la spec, la lee con precisión.
do $$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('one_time_credentials', 'sessions')
    order by 1
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists plataforma on public.%I', t);
    execute format(
      'create policy plataforma on public.%I for all to authenticated '
      || 'using ((select app.is_platform_admin())) with check ((select app.is_platform_admin()))',
      t
    );
  end loop;
end $$;

-- ─── Comprobación ────────────────────────────────────────────────────────────
--
-- Que la migración falle si dejó una tabla sin cubrir. Una tabla sin política con las políticas
-- activadas no devuelve nada —falla cerrado, que es correcto— pero una tabla **sin políticas
-- activadas** queda abierta de par en par, y sin esta comprobación nadie se enteraría.
do $$
declare sin_rls text[]; sin_politica text[];
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

  if array_length(sin_rls, 1) is not null then
    raise exception 'Tablas sin RLS activado: %', sin_rls;
  end if;
  if array_length(sin_politica, 1) is not null then
    raise exception 'Tablas sin ninguna política: %', sin_politica;
  end if;
end $$;

-- ─── Retirada del andamiaje ──────────────────────────────────────────────────

drop function app.__policy_tenant(text, text);
drop function app.__policy_read(text, text);
drop function app.__policy_insert(text, text);
