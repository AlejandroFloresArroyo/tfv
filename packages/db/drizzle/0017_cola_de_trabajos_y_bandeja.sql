-- La cola de trabajos, la bandeja, y una bitácora que no se puede reescribir.
--
-- Ver `openspec/specs/activity-and-notifications/spec.md` y la rebanada 09.
--
-- Cuatro cosas. La primera la generó Drizzle; las otras tres están escritas a mano porque son
-- políticas y reglas del motor, no tablas:
--
--   1. `background_jobs`, la cola de trabajos en segundo plano, con su política de sistema.
--   2. El estado de lectura y de archivo de la bandeja, y la marca de cuándo se abrió por última
--      vez —de donde sale el aviso de novedades—.
--   3. **La bitácora pasa a ser de sólo anexado de verdad**: se le retira el permiso de modificar y
--      de borrar. No se confía en que nadie lo haga.
--   4. Un archivo referenciado deja de poder borrarse, que es lo que el recolector de subidas
--      abandonadas daba por supuesto y no era cierto.
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" varchar(80) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"dedupe_key" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "inbox_opened_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "background_jobs_due_idx" ON "background_jobs" USING btree ("run_at") WHERE status = 'queued';--> statement-breakpoint
CREATE INDEX "background_jobs_kind_idx" ON "background_jobs" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_dedupe_unique" ON "background_jobs" USING btree ("dedupe_key") WHERE dedupe_key is not null and status in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "notification_deliveries_inbox_idx" ON "notification_deliveries" USING btree ("recipient_id","created_at") WHERE channel = 'inbox';--> statement-breakpoint

-- ─── Quién alcanza la cola de trabajos ───────────────────────────────────────
--
-- **La tabla no lleva empresa, y no es un descuido.** Un trabajo es infraestructura del servicio:
-- el recolector de subidas abandonadas recorre todas las empresas, y la verificación de coherencia
-- nombra un almacén en su carga útil sin pertenecer a nadie. Ponerle `company_id` obligaría a
-- inventar una empresa dueña de un trabajo que no es de ninguna, y ese valor inventado acabaría
-- comportándose como un dato —que es exactamente cómo la cadena `"unknown"` del limitador de
-- intentos frenó a media plataforma (`0007`)—.
--
-- Lo escribo aquí, como en `0015`, para que quien lea esto no lo tome por una política olvidada.
--
-- Ahora bien: que no sea de nadie no significa que sea de todos. Encolar
-- `archivos.recoger-abandonados` con un plazo de cero horas borraría las subidas en curso de todo
-- el mundo, así que **ninguna sesión de usuario la alcanza**. La alcanzan dos:
--
--   * las transacciones que declaran una operación de sistema —`withSystem`, que es por donde corre
--     el despachador—;
--   * la administración de plataforma, que es quien tiene que poder mirar por qué un trabajo se
--     rindió.
--
-- El predicado de la primera no puede ser `app.is_system()`: esa función pregunta por el **alcance
-- de empresas** declarado, y un trabajo global no declara ninguno. Lo que distingue a una operación
-- de sistema de una petición de usuario es haber declarado la operación, que es lo que se
-- comprueba.
create or replace function app.declares_operation()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_operation',
    ''
  ) <> ''
$$;

revoke execute on function app.declares_operation() from public;
grant execute on function app.declares_operation() to authenticated, service_role;

alter table public.background_jobs enable row level security;

drop policy if exists sistema on public.background_jobs;
create policy sistema on public.background_jobs
  for all to authenticated
  using ((select app.declares_operation()))
  with check ((select app.declares_operation()));

-- La política de plataforma **no se hereda**: el bucle que la repartió en `0005` corrió una sola
-- vez, así que una tabla nueva nace sin ella. Es lo que le pasó a `prospects` (`0014`), y el modo
-- de fallo no fue «cerrado» sino abierto de par en par.
drop policy if exists plataforma on public.background_jobs;
create policy plataforma on public.background_jobs
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));

-- ─── La bandeja la marca su destinatario ─────────────────────────────────────
--
-- La política de escritura de las entregas era «quien es dueño de la actividad que la originó, o el
-- sistema», con el motivo escrito al lado: nadie se fabrica avisos a su propio nombre. Correcto
-- para el alta, y **deja fuera lo único que el destinatario tiene que poder hacer**: marcar la suya
-- como leída o archivarla. Con la bandeja delante, ninguno de los dos botones habría funcionado —y
-- el síntoma sería una fila que no cambia, sin error, porque una política que no deja pasar no
-- falla: no encuentra la fila.
--
-- Sólo `update`, y sólo sobre las suyas. El alta sigue siendo de quien la origina: si esto fuera
-- `for all`, cualquiera podría escribirse una notificación.
--
-- Lo que esta capa **no** puede acotar son las columnas —una política es por fila—, así que que
-- sólo se toquen `read_at` y `archived_at` lo sostiene el manejador. Queda anotado como lo que es:
-- una regla que vive en un solo sitio.
drop policy if exists bandeja on public.notification_deliveries;
create policy bandeja on public.notification_deliveries
  for update to authenticated
  using (notification_deliveries.recipient_id = (select app.uid()))
  with check (notification_deliveries.recipient_id = (select app.uid()));

-- ─── La bitácora es de sólo anexado ──────────────────────────────────────────
--
-- «Un asiento de actividad no SHALL poder modificarse ni eliminarse una vez escrito.»
--
-- Se hace cumplir **retirando el permiso**, no con una política. Son dos garantías distintas: una
-- política que no deja pasar hace que el `update` no encuentre filas —silencio—, mientras que sin
-- permiso el motor responde `permission denied`. Para un requisito que dice «se rechaza», el
-- rechazo tiene que oírse.
--
-- Y se retira también a la administración de plataforma. Su papel es el de propietario de una
-- empresa, y una propietaria tampoco puede reescribir su propia bitácora: si pudiera, la bitácora
-- dejaría de servir para lo único que sirve.
revoke update, delete on public.company_activities from authenticated;
revoke update, delete on public.company_activities from service_role;

-- El permiso por omisión de las tablas futuras se concedió entero en `0004`. Esta tabla queda fuera
-- de ese trato, y `alter default privileges` no alcanza a lo que ya existe, así que la retirada de
-- arriba es la que manda.

-- Las políticas se parten en dos para que lo que se puede hacer esté escrito y no sólo permitido:
-- se lee lo de la propia empresa, se anexa lo de la propia empresa, y no hay más caras.
drop policy if exists arrendatario on public.company_activities;
drop policy if exists plataforma on public.company_activities;

drop policy if exists lectura on public.company_activities;
create policy lectura on public.company_activities
  for select to authenticated
  using (
    company_activities.company_id = any((select app.current_companies())::uuid[])
    or (select app.is_platform_admin())
  );

drop policy if exists alta on public.company_activities;
create policy alta on public.company_activities
  for insert to authenticated
  with check (
    company_activities.company_id = any((select app.current_companies())::uuid[])
    or (select app.is_platform_admin())
  );

-- ─── El recolector no toca un archivo referenciado ───────────────────────────
--
-- `collectAbandoned` (rebanada 08) borra las subidas pendientes que nadie confirmó pasado un plazo.
-- Lo que no miraba es **si alguien las referencia**, y las referencias a un archivo no son
-- inofensivas: de las treinta y dos claves foráneas que apuntan aquí, cinco propagan el borrado
-- —una foto de utilería, una imagen de locación, **un comprobante de pago**— y el resto dejan la
-- referencia en nulo. Es decir: un archivo pendiente que ya está referenciado —porque la entidad se
-- guardó antes de que la confirmación llegara, o porque la confirmación se perdió— se llevaba por
-- delante la fila que lo referenciaba, veinticuatro horas después y sin que nadie lo relacionara.
--
-- La guarda va aquí y no en el recolector por dos razones. La primera es que aquí es una garantía y
-- allí sería una convención: cualquier otro camino que borre un archivo la hereda. La segunda es
-- que la lista de quién referencia un archivo **la lleva el catálogo**, no un comentario: una tabla
-- nueva con una foto queda protegida el día que se crea, sin que nadie tenga que acordarse.
--
-- Se **omite** el borrado en lugar de fallar. Fallar revertiría la recogida entera y dejaría un
-- trabajo que se rinde sin haber recogido nada, de modo que un solo archivo referenciado bastaría
-- para que la limpieza no volviera a ocurrir jamás.
create or replace function app.is_referenced_upload(archivo uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  existe boolean;
begin
  for r in
    select k.conrelid::regclass as tabla, a.attname as columna
    from pg_constraint k
    join lateral unnest(k.conkey) as u(attnum) on true
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum
    where k.contype = 'f' and k.confrelid = 'public.uploads'::regclass
  loop
    execute format('select exists (select 1 from %s where %I = $1)', r.tabla, r.columna)
      into existe
      using archivo;
    if existe then
      return true;
    end if;
  end loop;

  return false;
end
$$;

-- `security definer` no es un adorno: quien recoge es una sesión cualquiera, y la fila que
-- referencia el archivo puede ser de otra empresa y quedarle oculta por las políticas. Sin esto, un
-- archivo referenciado desde una empresa ajena parecería libre — y el modo de fallo sería borrar.
revoke execute on function app.is_referenced_upload(uuid) from public;
grant execute on function app.is_referenced_upload(uuid) to authenticated, service_role;

create or replace function app.skip_referenced_upload()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- El marcador de posición no se elimina nunca, aunque deje de estar referenciado: es la fila a la
  -- que apuntan las entidades que exigen archivo y no tienen ninguno.
  if old.is_placeholder then
    return null;
  end if;

  if app.is_referenced_upload(old.id) then
    return null;
  end if;

  return old;
end
$$;

drop trigger if exists protege_archivos_referenciados on public.uploads;
create trigger protege_archivos_referenciados
  before delete on public.uploads
  for each row execute function app.skip_referenced_upload();

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
