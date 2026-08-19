-- El almacén de claves de idempotencia.
--
-- Ver `openspec/specs/api-conventions/spec.md`, requisito «Las mutaciones de dinero son
-- idempotentes», y la rebanada 01.
--
-- ## Qué corrige
--
-- Hoy no existe nada de esto: una petición de escritura que llega dos veces surte efecto dos veces.
-- No hace falta que nadie haga nada raro para que ocurra —el navegador reintenta lo que parece un
-- tiempo agotado, alguien pulsa dos veces, un proxy repite—, y la primera vez que importe de verdad
-- será un cobro duplicado. Es la misma forma del defecto `M-03`, que allí se describe del lado del
-- procesador de pagos y aquí del lado del cliente.
--
-- ## Escrita a mano
--
-- Como las 0004, 0005, 0008, 0009, 0014, 0015, 0018, 0019 y 0020. `drizzle-kit generate` **no puede
-- correr en este árbol**: los instantáneos 0016 y 0017 apuntan los dos al mismo padre y la
-- herramienta se detiene con «pointing to a parent snapshot … which is a collision».
-- Ver `HALLAZGOS.md` H-87.
--
-- ## Una sola tabla nueva
--
-- No toca ninguna existente. Lo único que cuelga de ella son dos claves foráneas hacia `users` y
-- `companies`, en la dirección que ya usan todas las demás.
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" varchar(200) NOT NULL,
	"actor_id" uuid NOT NULL,
	"company_id" uuid,
	"endpoint" text NOT NULL,
	"fingerprint" char(64) NOT NULL,
	"response_status" smallint,
	"response_body" jsonb,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- ─── La clave se acota al solicitante, y esto es lo importante ───────────────
--
-- En esta tabla se guarda **un cuerpo de respuesta ya calculado**. Si la unicidad fuera sobre la
-- clave sola, la clave sería un espacio de nombres global: quien acierte o adivine la de otro
-- recibiría su respuesta —el detalle de un pedido, los importes de un cobro, los datos de una
-- persona—, servida por el mismo mecanismo que existe para que nadie pague dos veces. Sería
-- convertir una protección en una fuga.
--
-- La terna es **(actor, empresa, clave)**. Repetir la clave de otro no encuentra nada: la petición
-- sigue su curso normal y se resuelve con los permisos de quien la manda, como cualquier otra.
--
-- `nulls not distinct` no es un detalle. La empresa es nula en las mutaciones que no cuelgan de
-- ninguna —las de la cuenta propia—, y con la regla de fábrica dos nulos se consideran distintos:
-- el índice existiría y **no deduplicaría nada justo en esas rutas**, en silencio. Postgres 15 en
-- adelante admite decirlo; el proveedor está en la 18.
CREATE UNIQUE INDEX "idempotency_keys_scope_unique"
  ON "idempotency_keys" USING btree ("actor_id","company_id","key") NULLS NOT DISTINCT;--> statement-breakpoint

CREATE INDEX "idempotency_keys_expiry_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_actor_idx" ON "idempotency_keys" USING btree ("actor_id","created_at");--> statement-breakpoint

-- ─── Quién alcanza una clave de idempotencia ────────────────────────────────
--
-- La segunda mitad de lo mismo. El índice único impide que dos actores compartan casilla; la
-- política impide que uno lea la casilla del otro aunque el manejador se equivocara de cláusula.
-- Son las dos capas que `access-control` exige que sean dos: si la aplicación falla, el motor no
-- devuelve la fila.
--
-- **La vía no es la empresa, es la persona.** No se escribe
-- `company_id = any(app.current_companies())` porque sería más ancho de lo que hace falta: dos
-- miembros de la misma empresa no tienen por qué poder repetir la petición del otro y recibir su
-- respuesta. Una clave de idempotencia es de quien la puso.
--
-- `app.uid()` y no `auth.uid()`: la identidad se resuelve viva, así que una sesión cerrada deja de
-- alcanzar sus propias claves. Es la regla de la `0006` y la comprobación del final la exige.
alter table public.idempotency_keys enable row level security;--> statement-breakpoint

drop policy if exists propietario on public.idempotency_keys;--> statement-breakpoint
create policy propietario on public.idempotency_keys
  for all to authenticated
  using (idempotency_keys.actor_id = (select app.uid()))
  with check (idempotency_keys.actor_id = (select app.uid()));--> statement-breakpoint

-- El barrido de lo vencido corre sin sesión de nadie —es un trabajo periódico— y tiene que alcanzar
-- las claves de todo el mundo para poder borrarlas. Mismo predicado que `background_jobs` en la
-- `0017`, y por el mismo motivo: `app.is_system()` pregunta por el alcance de empresas declarado, y
-- un barrido global no declara ninguna.
drop policy if exists sistema on public.idempotency_keys;--> statement-breakpoint
create policy sistema on public.idempotency_keys
  for all to authenticated
  using ((select app.declares_operation()))
  with check ((select app.declares_operation()));--> statement-breakpoint

-- La política de plataforma **no se hereda**: el bucle que la repartió en `0005` corrió una sola
-- vez, así que una tabla nueva nace sin ella. Le pasó a `prospects` (`0014`), a `background_jobs`
-- (`0017`) y a `shipping_rates` (`0020`), y el modo de fallo no es «cerrado» sino abierto de par en
-- par.
drop policy if exists plataforma on public.idempotency_keys;--> statement-breakpoint
create policy plataforma on public.idempotency_keys
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));--> statement-breakpoint

-- ─── Comprobación ────────────────────────────────────────────────────────────
--
-- Las dos guardas de siempre, sobre lo que esta migración acaba de tocar: que no quede tabla sin
-- política, y que ninguna política nombre la identidad cruda.
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
