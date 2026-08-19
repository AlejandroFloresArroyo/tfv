-- Bitácora de la administración de plataforma.
--
-- Ver `openspec/specs/access-control/spec.md`, «El administrador de plataforma cruza empresas» y
-- «Toda acción de plataforma deja asiento». Rebanada 10.
--
-- Un administrador de plataforma puede mirar a través de todos los arrendatarios. Un poder así sin
-- rastro no lo puede auditar nadie: la única forma de responder «¿quién convirtió este prospecto en
-- cuenta?» es que la conversión lo haya escrito.
--
-- `company_activities` no sirve para esto y no debe adaptarse. Su `company_id` es **no nulo**, y de
-- ahí sale que su política pueda expresarse contra el alcance del arrendatario; aflojarlo a nulo
-- para que quepa una acción que no pertenece a ninguna empresa metería un caso especial dentro de
-- un predicado de aislamiento. Además hay acciones de plataforma que genuinamente no ocurren dentro
-- de una empresa —aceptar un prospecto crea una cuenta que aún no pertenece a nadie—, y atribuirlas
-- a una empresa cualquiera sería mentir en el asiento.
--
-- Escrita a mano: `drizzle-kit generate` no corre en este árbol (`HALLAZGOS.md` H-87), igual que
-- las 0018, 0019 y 0020.
CREATE TABLE "platform_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"action" "activity_action" NOT NULL,
	"entity" varchar(80) NOT NULL,
	"entity_id" uuid,
	"entity_label" varchar(200) DEFAULT '' NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"performed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_activities" ADD CONSTRAINT "platform_activities_performed_by_id_users_id_fk" FOREIGN KEY ("performed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_activities_created_idx" ON "platform_activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_activities_actor_idx" ON "platform_activities" USING btree ("performed_by_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_activities_entity_idx" ON "platform_activities" USING btree ("entity","entity_id");--> statement-breakpoint

-- ─── Quién alcanza esta bitácora ─────────────────────────────────────────────
--
-- **No hay política de arrendatario, y su ausencia es la decisión.** Esta tabla no pertenece a
-- ninguna empresa, así que no hay predicado de empresa que pueda acotarla: o la lee la
-- administración de plataforma, o no la lee nadie. Un miembro corriente recibe cero filas del
-- motor aunque la aplicación se equivocara y le dejara llamar a la ruta.
--
-- La política de plataforma **no se hereda**: el bucle que la repartió en `0005` corrió una sola
-- vez, así que una tabla nueva nace sin ella. Es lo que le pasó a `prospects` (`0014`), a
-- `background_jobs` (`0017`) y a `shipping_rates` (`0020`).
alter table public.platform_activities enable row level security;--> statement-breakpoint

drop policy if exists lectura on public.platform_activities;--> statement-breakpoint
create policy lectura on public.platform_activities
  for select to authenticated
  using ((select app.is_platform_admin()));--> statement-breakpoint

drop policy if exists alta on public.platform_activities;--> statement-breakpoint
create policy alta on public.platform_activities
  for insert to authenticated
  with check ((select app.is_platform_admin()));--> statement-breakpoint

-- ─── También aquí es de sólo anexado ─────────────────────────────────────────
--
-- Por el mismo motivo que la de la empresa (`0017`): una bitácora que quien la protagoniza puede
-- reescribir no sirve para lo único que sirve. Y aquí importa más, porque quien la protagoniza es
-- precisamente quien tiene la llave de todos los arrendatarios.
--
-- Se retira el permiso en vez de acotarlo con una política: sin permiso, el motor responde
-- «permission denied»; con una política que no deja pasar, el `update` no encuentra filas y calla.
-- Para un requisito que dice «se rechaza», el rechazo tiene que oírse.
revoke update, delete on public.platform_activities from authenticated;--> statement-breakpoint
revoke update, delete on public.platform_activities from service_role;--> statement-breakpoint

-- Y la comprobación de cobertura de la `0005`, para que una tabla sin aislamiento no llegue nunca a
-- producción en silencio.
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
