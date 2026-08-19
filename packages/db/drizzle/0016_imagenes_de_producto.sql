-- Las fotos de un producto, y quién puede borrar un archivo.
--
-- El almacén, la ubicación y la categoría llevan **una** imagen en su propia columna. El producto
-- no llevaba ninguna, y la spec de almacenamiento habla de «un producto con las imágenes A, B y C»:
-- necesita galería. Es la misma forma que `pixit_product_images`, con una marca de portada añadida
-- —reordenar y elegir portada son dos decisiones distintas— y su índice único parcial, que deja
-- **una portada por producto** garantizada por el motor.
--
-- La política atraviesa por el producto, igual que la de las medidas: la vía hasta la empresa es
-- producto → almacén → empresa, y el `exists` hereda la política del padre en lugar de repetir el
-- predicado de empresa.

CREATE TABLE "warehouse_product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warehouse_product_images" ADD CONSTRAINT "warehouse_product_images_product_id_warehouse_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."warehouse_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_product_images" ADD CONSTRAINT "warehouse_product_images_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_product_images_unique" ON "warehouse_product_images" USING btree ("product_id","upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_product_images_cover_unique" ON "warehouse_product_images" USING btree ("product_id") WHERE is_cover = true;--> statement-breakpoint
CREATE INDEX "warehouse_product_images_order_idx" ON "warehouse_product_images" USING btree ("product_id","position");--> statement-breakpoint

-- ─── ¿Lo referencia alguien más? ─────────────────────────────────────────────
--
-- «Sustituir un archivo elimina el anterior… **salvo que siga referenciado por otra entidad**».
-- Responder a eso desde la aplicación pediría enumerar a mano las **treinta y dos** columnas que
-- hoy apuntan a `uploads`, repartidas por once módulos del esquema — y la lista se quedaría vieja
-- en silencio la primera vez que alguien añada una entidad con foto. Lo que sí sabe la respuesta
-- siempre es el propio motor, que tiene las claves foráneas en el catálogo.
--
-- `security definer` porque la pregunta cruza tablas de **otros** arrendatarios: una foto compartida
-- por dos empresas se ve desde la política de ninguna de las dos, y una comprobación que no la ve
-- responde «no la referencia nadie» justo antes de borrarla. Lo que devuelve es un booleano sobre
-- un identificador que quien pregunta ya tiene; no expone qué entidad lo referencia ni de quién es.
--
-- `0015_confirmacion_de_archivos.sql` explica por qué la fila de un archivo no lleva empresa.
create or replace function app.upload_is_referenced(archivo uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  fk record;
  hay boolean;
begin
  for fk in
    select cl.relname as tabla, att.attname as columna
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    cross join lateral unnest(c.conkey) as k(attnum)
    join pg_attribute att on att.attrelid = cl.oid and att.attnum = k.attnum
    where c.contype = 'f'
      and c.confrelid = 'public.uploads'::regclass
      and n.nspname = 'public'
  loop
    execute format('select exists (select 1 from public.%I where %I = $1)', fk.tabla, fk.columna)
      into hay
      using archivo;
    if hay then return true; end if;
  end loop;

  return false;
end $$;--> statement-breakpoint

revoke execute on function app.upload_is_referenced(uuid) from public;--> statement-breakpoint
grant execute on function app.upload_is_referenced(uuid) to authenticated, service_role;--> statement-breakpoint

-- ─── Aislamiento ─────────────────────────────────────────────────────────────
--
-- Escrita a mano y no con las ayudas de la 0005: aquéllas eran andamiaje de aquella migración y se
-- retiran al final de ella. Para **una** tabla, decirlo entero se lee mejor que reconstruirlas.
--
-- Leer y escribir llevan el mismo predicado porque el producto también los lleva: el `exists`
-- hereda su política de lectura, y ahí lectura y escritura coinciden.
alter table public.warehouse_product_images enable row level security;--> statement-breakpoint

drop policy if exists arrendatario on public.warehouse_product_images;--> statement-breakpoint
create policy arrendatario on public.warehouse_product_images
  for all to authenticated
  using (
    exists (select 1 from warehouse_products p where p.id = warehouse_product_images.product_id)
  )
  with check (
    exists (select 1 from warehouse_products p where p.id = warehouse_product_images.product_id)
  );--> statement-breakpoint

-- Y el mismo bucle de la 0014, por el mismo motivo: la comprobación de cobertura de la 0005 corrió
-- una sola vez, así que una tabla añadida después queda sin la política de plataforma. Repetirlo
-- sobre **todas** cubre también cualquier otra que llegara sin ella, y volver a ejecutarlo no rompe
-- nada.
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
end $$;--> statement-breakpoint

-- La misma comprobación de la 0005 y la 0014: ninguna tabla sin RLS y ninguna sin política.
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
