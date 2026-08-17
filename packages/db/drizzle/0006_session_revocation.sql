-- Revocación inmediata en el motor.
--
-- Ver `openspec/specs/user-accounts/spec.md`, requisitos «Cierre de sesión y revocación» y
-- «Desactivar y reactivar una cuenta»; y `openspec/project.md` D-07.
--
-- ## Qué problema resuelve
--
-- Un token autocontenido sigue siendo válido hasta que caduca. Cerrar sesión o desactivar una
-- cuenta no surtiría efecto hasta una hora después —la vigencia por omisión del servicio
-- gestionado— y las specs exigen que se note en la petición siguiente.
--
-- La alternativa era aceptar esa ventana como requisito modificado. Se descartó por tres motivos,
-- comprobados contra el servicio real y no supuestos:
--
-- 1. **El propio servicio gestionado ya paga la consulta.** Su token es autocontenido y aun así
--    comprueba la sesión contra la base antes de responder: con un token sin caducar pero cerrado,
--    devuelve `403`. No comprobar nos dejaría más débiles que el servicio que estamos adoptando.
-- 2. **No hay viaje de ida y vuelta adicional.** Ya se abre una transacción en cada petición para
--    fijar los claims; la comprobación viaja dentro de ella. Medido: `0.023 ms`, un acierto de
--    memoria compartida.
-- 3. La ventana no era teórica: una hora.
--
-- ## Dónde se hace cumplir
--
-- En el motor, no en los manejadores. Todo pasa por `app.uid()`: **la identidad de una sesión
-- cerrada o de una cuenta desactivada es nula**, y a partir de ahí no hay empresas, no hay filas
-- propias y no hay administración de plataforma. Un solo punto que nadie puede saltarse por olvido.
--
-- Por eso este archivo termina reescribiendo toda política que nombrara `auth.uid()` y comprobando
-- que no queda ninguna. **Las políticas no llaman a la identidad cruda; llaman a `app.uid()`.**
--
-- ## Coste conocido
--
-- Esto ata el motor a `auth.sessions`, que es tabla del proveedor y esquema interno suyo. Es
-- acoplamiento real y conviene tenerlo anotado como tal, no como una frontera estable que hayamos
-- elegido. Se acepta porque vive en un único predicado de una única función.

-- ─── Identidad consciente de la revocación ───────────────────────────────────

-- El identificador de sesión que declara el token.
create or replace function app.session_id()
returns uuid
language sql
stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id',
    ''
  )::uuid
$$;

-- ¿Sigue viva la sesión que dice el token?
--
-- Sin usuario no hay sesión que comprobar: es un contexto de sistema, y su alcance lo declara y lo
-- hace cumplir `app.system_scope()`.
--
-- Se consultan dos registros porque durante la transición conviven dos: el del servicio gestionado
-- y el propio de la rebanada 04. **El segundo brazo desaparece** cuando se retire la maquinaria de
-- sesión propia; hasta entonces esta comprobación también le añade a ella una segunda capa que no
-- tenía.
create or replace function app.session_is_live()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select case
    when auth.uid() is null then true
    when app.session_id() is null then false
    else exists (select 1 from auth.sessions g where g.id = app.session_id())
      or exists (
        select 1 from public.sessions s
        where s.id = app.session_id()
          and s.revoked_at is null
          and s.expires_at > now()
      )
  end
$$;

-- **La identidad del sistema.** Nula si la sesión se cerró o la cuenta dejó de estar vigente.
--
-- Todo lo demás cuelga de aquí: las empresas, las filas propias y la administración de plataforma.
-- Ninguna política llama a `auth.uid()` directamente, y hay una comprobación al final que lo exige.
create or replace function app.uid()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when not app.session_is_live() then null::uuid
    else (select u.id from users u
          where u.id = auth.uid() and u.is_active and u.deleted_at is null)
  end
$$;

revoke execute on function app.session_id() from public;
revoke execute on function app.session_is_live() from public;
revoke execute on function app.uid() from public;
grant execute on function app.session_id() to authenticated, service_role;
grant execute on function app.session_is_live() to authenticated, service_role;
grant execute on function app.uid() to authenticated, service_role;

-- ─── Las ayudas existentes pasan por ella ────────────────────────────────────

-- Desactivar una cuenta o cerrar su sesión la deja sin empresas en la petición siguiente, porque
-- esto se resuelve vivo en cada transacción y no en el token.
create or replace function app.member_of()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(company_id), array[]::uuid[])
  from company_members
  where user_id = app.uid() and is_active
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select is_platform_admin from users where id = app.uid() and deleted_at is null),
    false
  )
$$;

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
        c.user_id = app.uid()
        or c.counterparty_company_id = any(app.current_companies())
      )
  )
$$;

-- ─── Las políticas dejan de llamar a la identidad cruda ──────────────────────
--
-- En lugar de repetir aquí los predicados de `0005` —que serían dos sitios donde leer la verdad—
-- se reescriben leyéndolos del catálogo. Así la sustitución es exhaustiva por construcción: alcanza
-- a toda política que nombre `auth.uid()`, esté donde esté.
do $$
declare r record;
begin
  for r in
    select p.polname,
           c.relname,
           pg_get_expr(p.polqual, p.polrelid) as usando,
           pg_get_expr(p.polwithcheck, p.polrelid) as comprobando
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (pg_get_expr(p.polqual, p.polrelid) like '%auth.uid()%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%auth.uid()%')
  loop
    if r.comprobando is null then
      execute format(
        'alter policy %I on public.%I using (%s)',
        r.polname, r.relname, replace(r.usando, 'auth.uid()', 'app.uid()')
      );
    else
      execute format(
        'alter policy %I on public.%I using (%s) with check (%s)',
        r.polname, r.relname,
        replace(r.usando, 'auth.uid()', 'app.uid()'),
        replace(r.comprobando, 'auth.uid()', 'app.uid()')
      );
    end if;
  end loop;
end $$;

-- ─── Comprobación ────────────────────────────────────────────────────────────

do $$
declare crudas text[];
begin
  select coalesce(array_agg(c.relname || '.' || p.polname order by c.relname, p.polname), '{}')
  into crudas
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (pg_get_expr(p.polqual, p.polrelid) like '%auth.uid()%'
      or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%auth.uid()%');

  if array_length(crudas, 1) is not null then
    raise exception 'Políticas que aún llaman a la identidad cruda: %', crudas;
  end if;
end $$;
