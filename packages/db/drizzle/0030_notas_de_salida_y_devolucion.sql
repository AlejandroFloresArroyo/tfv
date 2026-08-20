-- El objeto físico de una producción: su historial y la dirección de la nota que lo mueve.
--
-- Ver `openspec/specs/production-inventory/spec.md` y `production-deliveries`. Rebanada 22.
--
-- Trae tres cosas, y las tres son del mismo asunto: **saber dónde estuvo una cosa y en qué estado
-- salió de cada sitio**.

-- ─── Los tres enumerados ─────────────────────────────────────────────────────

CREATE TYPE "public"."production_delivery_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."production_item_event_reason" AS ENUM('manual', 'delivery', 'return', 'created');--> statement-breakpoint
CREATE TYPE "public"."production_return_condition" AS ENUM('returned', 'damaged', 'incomplete', 'lost', 'robbed');--> statement-breakpoint

-- ─── El historial del artículo · cierra H-171 ────────────────────────────────
--
-- Hasta aquí el cambio de estado de un artículo estaba implementado y probado contra su tabla de
-- transiciones, y **no tenía dónde firmarse**: `production_items` lleva `updated_at` —el instante—
-- y ninguna columna de autor. El almacén sí lo tenía resuelto, `warehouse_stock_events`, y esta
-- tabla es esa misma calcada.
--
-- **Tabla y no columna de atribución**, que era la otra salida. Con columna se sabe quién hizo el
-- último cambio; con tabla se reconstruye el recorrido entero. Cuando una chamarra vuelve rota lo
-- que se pregunta no es quién la marcó rota, es por dónde pasó y en qué estado salió de cada sitio,
-- y eso la columna no lo contesta nunca. La spec del almacén ya eligió lo segundo para el mismo
-- problema, y dos modelos distintos para «el objeto cambió de estado» es la asimetría que después
-- cuesta el doble: dos consultas, dos pantallas y dos explicaciones.
CREATE TABLE "production_item_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	-- Nulo **sólo en el alta**: antes de existir, el artículo no estaba en ningún estado. Escribir
	-- ahí `available` afirmaría un cambio que no ocurrió.
	"from_status" "production_item_status",
	"to_status" "production_item_status" NOT NULL,
	"reason" "production_item_event_reason" NOT NULL,
	"actor_id" uuid,
	-- La nota de entrega que lo causó, cuando la hubo. Sin clave foránea, como
	-- `warehouse_stock_units.created_by_quote_id`: es auditoría, no estructura. Si la nota se da de
	-- baja, que el artículo saliera por ella sigue siendo cierto.
	"cause_id" uuid,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_item_events" ADD CONSTRAINT "production_item_events_item_id_production_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."production_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_item_events" ADD CONSTRAINT "production_item_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- La consulta que existe es «la vida de este artículo, en orden». El índice es esa consulta.
CREATE INDEX "production_item_events_item_idx" ON "production_item_events" USING btree ("item_id","occurred_at");--> statement-breakpoint

-- ─── La dirección de la nota ────────────────────────────────────────────────
--
-- Hasta aquí `production_deliveries` no distinguía salida de devolución, y la vuelta se hacía a
-- mano artículo por artículo — que es el paso que se olvida cuando la nota trae doce.
--
-- **Una columna y no una segunda entidad**: es el mismo documento y el mismo motor de cierre. Se
-- compone una lista, se verifica pieza por pieza, se firma y se cierra. Lo único que cambia es a
-- qué estado deja el artículo. Duplicar la entidad duplicaría el cierre atómico, la verificación,
-- las firmas y el documento, y ahí es donde las dos copias acaban separándose.
--
-- Por omisión `outbound`, que es lo que era toda nota existente antes de esta migración.
ALTER TABLE "production_deliveries" ADD COLUMN "direction" "production_delivery_direction" DEFAULT 'outbound' NOT NULL;--> statement-breakpoint

-- En qué estado vuelve **esta pieza**, no la nota entera.
--
-- Nulo en una nota de salida, y nulo en una línea de devolución todavía sin verificar: la condición
-- se declara al verificar, que es el momento en que alguien tiene el objeto en la mano. Un valor
-- por omisión aquí afirmaría que volvió entera antes de que nadie la mirara.
ALTER TABLE "production_delivery_lines" ADD COLUMN "return_condition" "production_return_condition";--> statement-breakpoint

-- ─── Aislamiento de la tabla nueva ──────────────────────────────────────────
--
-- La vía es la de siempre: evento → artículo → producción → empresa. No se nombra ninguna empresa
-- aquí; se apoya en la política del artículo, que se apoya en la de la producción. Es exactamente
-- la forma que usa `warehouse_stock_events` sobre `warehouse_stock_units` en la `0005`.
--
-- Escrita a mano y no con `app.__policy_tenant`: ese ayudante era andamiaje de la `0005` y se
-- elimina al final de ella, así que no existe en tiempo de ejecución. Lo que se copia es la forma,
-- no la llamada.
alter table public.production_item_events enable row level security;--> statement-breakpoint

drop policy if exists arrendatario on public.production_item_events;--> statement-breakpoint
create policy arrendatario on public.production_item_events
  for all to authenticated
  using (exists (select 1 from production_items i where i.id = production_item_events.item_id))
  with check (exists (select 1 from production_items i where i.id = production_item_events.item_id));--> statement-breakpoint

-- La política de plataforma **no se hereda**: el bucle que la repartió en la `0005` corrió una sola
-- vez, así que una tabla nueva nace sin ella. Le pasó a `prospects` (`0014`), a `background_jobs`
-- (`0017`), a `shipping_rates` (`0020`) y a `idempotency_keys` (`0026`), y el modo de fallo no es
-- «cerrado» sino abierto de par en par.
drop policy if exists plataforma on public.production_item_events;--> statement-breakpoint
create policy plataforma on public.production_item_events
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));--> statement-breakpoint

-- ─── Comprobación ────────────────────────────────────────────────────────────
--
-- Las tres guardas de siempre: que no quede tabla sin aislamiento, que no quede tabla sin política,
-- y que ninguna política nombre la identidad cruda en lugar de resolverla viva.
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
