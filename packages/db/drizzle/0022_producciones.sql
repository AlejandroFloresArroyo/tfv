-- Dos invariantes de la producción, puestos donde no se pueden saltar.
--
-- Ver `openspec/specs/production-management/spec.md`, requisitos «Una producción pertenece a una
-- empresa» y «Publicación de la producción». Rebanada 20.
--
-- Las tablas de producciones nacieron con la `0002` y sus políticas con la `0005`: aquí no se crea
-- ninguna. Lo que faltaba son las dos reglas que la spec enuncia como propiedades de la entidad y
-- que hasta ahora sólo podía sostener el manejador — es decir, sólo mientras se escribiera por él.
--
-- ## Por qué en el motor y no sólo en el servicio
--
-- Por lo mismo que el aislamiento va en dos capas. El manejador es la vía normal, no la única: la
-- siembra, el trasvase de la pila anterior y una corrección a mano escriben por debajo, y las tres
-- son exactamente los momentos en los que una fila incoherente entra sin que nadie mire. Una
-- producción que termina antes de empezar no da error en ninguna pantalla: da recuentos negativos
-- meses después.

-- ─── La fecha de fin no precede a la de inicio ───────────────────────────────
--
-- Es el escenario de frontera de la spec, literal. Las nulas se admiten: una producción se registra
-- muchas veces antes de que se sepan sus fechas, y exigirlas aquí obligaría a inventárselas.
alter table public.productions
  add constraint productions_dates_ordered
  check (starts_on is null or ends_on is null or ends_on >= starts_on);--> statement-breakpoint

-- ─── Publicada exige identificador legible ───────────────────────────────────
--
-- La spec une las dos cosas en una sola frase: «SHALL poder marcarse como publicada **y** SHALL
-- tener un identificador legible único, para aparecer en los directorios públicos». Sin `slug` no
-- hay dirección por la que llegar, así que una producción publicada sin él está publicada en un
-- sitio al que nadie puede ir — y el síntoma sería un `404` en el directorio público, lejísimos de
-- la casilla que alguien marcó.
--
-- `is false` y no `= false`: la columna es `not null`, pero escribirlo así deja la comprobación
-- correcta también el día que deje de serlo.
alter table public.productions
  add constraint productions_published_needs_slug
  check (is_published is false or slug is not null);--> statement-breakpoint

-- ─── Las dos guardas de siempre ──────────────────────────────────────────────
--
-- Esta migración no crea tablas, así que no puede dejar ninguna sin política. Se comprueba
-- igualmente, y sobre **todas**: el bucle de la `0005` corrió una sola vez y lo que se añade
-- después nace con las políticas desactivadas, que no es «falla cerrado» sino abierto de par en par
-- (le pasó a `prospects`, a `background_jobs` y a `shipping_rates`). Con siete árboles de trabajo
-- avanzando a la vez, la tabla que se cuele no tiene por qué ser de quien escribe esto.
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
