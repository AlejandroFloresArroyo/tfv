-- Normalización de texto para la búsqueda de colecciones.
--
-- Ver `openspec/specs/query-and-pagination/spec.md`, requisito «Registro de campos de búsqueda por
-- recurso»: la búsqueda ha de ser insensible a mayúsculas **y a acentos**.
--
-- ## Por qué en el motor y no en la aplicación
--
-- Porque la comparación ocurre dentro de la consulta. Normalizar del lado de la aplicación sólo
-- normaliza el término buscado, no las mil filas contra las que se compara: quien busque «camara»
-- seguiría sin encontrar «Cámara». La única forma de comparar en igualdad de condiciones es
-- normalizar las dos partes en el mismo sitio, y ese sitio es la base.
--
-- ## Por qué `unaccent` de dos argumentos
--
-- `unaccent(text)` es `stable`, no `immutable`: resuelve el diccionario por el camino de búsqueda
-- vigente, que puede cambiar entre sesiones. Sirve en un `where`, pero **no se puede indexar**.
--
-- La forma de dos argumentos nombra el diccionario, así que es `immutable`. Hoy no hay ningún índice
-- que la use —los volúmenes no lo piden todavía—, pero elegir ahora la variante que no se puede
-- indexar obligaría a reescribir cada consulta el día que haga falta. La barata es la misma.

create extension if not exists unaccent with schema extensions;

-- Texto comparable: minúsculas y sin diacríticos.
--
-- `returns null on null input` la hace además más barata y evita que una columna nula produzca
-- una comparación con nulo dentro de un `or`.
create or replace function app.norm(value text)
returns text
language sql
immutable
parallel safe
returns null on null input
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, value))
$$;

comment on function app.norm(text) is
  'Texto normalizado para búsqueda: minúsculas y sin acentos. Inmutable, por si un día se indexa.';

grant execute on function app.norm(text) to authenticated, service_role;
