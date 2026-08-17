-- La baja de una empresa deja su contenido inaccesible.
--
-- Ver `openspec/changes/migrate-identity-and-companies/proposal.md`: «Una baja de empresa deja su
-- contenido inaccesible y conserva su historial contable».
--
-- ## El hueco
--
-- `app.member_of()` leía las membresías activas **sin mirar si la empresa sigue vigente**. Como el
-- borrado de una empresa es lógico (`project.md` D-02), sus filas de membresía sobreviven a la
-- baja: la empresa quedaba dada de baja y sus miembros seguían alcanzando todos sus datos a través
-- de las políticas. El aislamiento funcionaba; lo que no se aplicaba era la baja.
--
-- La aplicación ya excluía las empresas dadas de baja al construir el perfil, así que **no se veían
-- en la interfaz**. Eso es precisamente lo que lo hacía difícil de notar: desaparecían de la
-- pantalla y seguían siendo accesibles para cualquier consulta que no pasara por ese filtro.
--
-- ## Por qué se arregla aquí y no en cada consulta
--
-- Porque es un predicado que hay que aplicar **en todas**. Repartido por los manejadores, se olvida
-- en el primero que se escriba con prisa, y el olvido no falla: devuelve datos de más. Aquí lo
-- aplica el motor una vez, y ningún camino puede saltárselo.
--
-- La función ya es `security definer`, así que leer `companies` desde dentro no vuelve a entrar en
-- sus políticas. Sin eso, esta consulta provocaría la recursión infinita que ya apareció en la
-- rebanada 06 con las políticas que se referenciaban entre sí.

create or replace function app.member_of()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(m.company_id), array[]::uuid[])
  from company_members m
  join companies c on c.id = m.company_id
  where m.user_id = app.uid()
    and m.is_active
    and c.deleted_at is null
$$;

comment on function app.member_of() is
  'Empresas vigentes en las que el usuario de la sesión tiene membresía activa. '
  'Excluye las dadas de baja: su borrado es lógico y sus membresías sobreviven.';
