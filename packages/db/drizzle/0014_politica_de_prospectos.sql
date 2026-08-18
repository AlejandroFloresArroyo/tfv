-- Política de la tabla de prospectos.
--
-- La 0005 cubrió las noventa y una tablas de entonces y **comprobó** que no quedara ninguna suelta,
-- pero esa comprobación corrió una sola vez: una tabla añadida después queda con las políticas
-- desactivadas, que no es «falla cerrado» sino abierta de par en par. Lo que sí vigila cada
-- ejecución es la prueba de cobertura de `rls-policies.test.ts` — y es la que cazó ésta.
--
-- Un prospecto es una persona que dejó su teléfono en un formulario público. No pertenece a ningún
-- arrendatario, así que no hay predicado de empresa que lo acote: lo administra la plataforma y
-- nadie más. La captura pública escribe por la vía sin sesión, igual que el registro de una cuenta.
--
-- El bucle repite el de la 0005 sobre **todas** las tablas en lugar de nombrar una: así vuelve a
-- cubrir cualquier otra que se hubiera añadido sin política, y volver a ejecutarlo no rompe nada.
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

-- Y la misma comprobación de la 0005, para que este fallo no llegue nunca a producción en silencio.
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
