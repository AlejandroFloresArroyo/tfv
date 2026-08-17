-- Contexto de arrendatario para las políticas de aislamiento.
--
-- Ver `openspec/specs/access-control/spec.md`, requisito de aislamiento en dos capas.
--
-- Migración escrita a mano: define funciones y permisos, no tablas, así que no la genera Drizzle.

-- ─── Esquema de ayudas ──────────────────────────────────────────────────────

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ─── De dónde salen las empresas del solicitante ─────────────────────────────

-- Las que declara un contexto de sistema.
--
-- Un abanico de compras o la materialización de un pedido escriben legítimamente en empresas de las
-- que quien opera no es miembro. En lugar de eludir las políticas —que dejaría el aislamiento sin
-- efecto para toda la operación— declaran **el conjunto exacto** sobre el que van a trabajar, y las
-- políticas lo hacen cumplir igual que cualquier otro.
create or replace function app.system_scope()
returns uuid[]
language sql
stable
as $$
  select coalesce(
    (
      select array_agg(value::uuid)
      from jsonb_array_elements_text(
        coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_scope',
          '[]'::jsonb
        )
      )
    ),
    array[]::uuid[]
  )
$$;

-- Las empresas en las que el solicitante tiene membresía activa.
--
-- `security definer` para que la propia consulta de membresías no quede sujeta a las políticas que
-- alimenta, que sería recursivo. `search_path` fijado: sin él, un esquema en el camino de búsqueda
-- podría suplantar las tablas que la función consulta.
create or replace function app.member_of()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(company_id), array[]::uuid[])
  from company_members
  where user_id = auth.uid() and is_active
$$;

-- El conjunto efectivo: membresías más alcance de sistema.
--
-- **Sin claims devuelve vacío**, y una política que compara contra un conjunto vacío no deja pasar
-- nada. Es la propiedad que hace que olvidarse de propagar la identidad no filtre datos: la consulta
-- sale vacía en lugar de salir completa.
create or replace function app.current_companies()
returns uuid[]
language sql
stable
as $$
  select app.member_of() || app.system_scope()
$$;

-- ¿Es administrador de plataforma?
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select is_platform_admin from users where id = auth.uid() and deleted_at is null),
    false
  )
$$;

grant execute on all functions in schema app to authenticated, service_role;

-- ─── Permisos ────────────────────────────────────────────────────────────────

-- El rol `authenticated` es con el que la aplicación atiende peticiones de usuario. Necesita
-- permiso sobre las tablas para que las políticas lleguen a evaluarse: sin permiso, la consulta
-- falla antes con «permission denied», que es un error distinto y confuso.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Lo mismo para las tablas que se creen a partir de ahora.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
