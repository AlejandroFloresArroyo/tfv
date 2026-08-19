-- La resolución de un sitio público, resuelta en el motor.
--
-- Ver `openspec/specs/websites/spec.md`, requisitos «Resolución por subdominio» y «Sitio inexistente
-- o no publicado». Rebanada 19.
--
-- No trae tablas: las dos de sitios existen desde `0002`. Trae **una función**, y existe por un
-- problema de orden que no se puede resolver en la aplicación.
--
-- ## El huevo y la gallina de la resolución
--
-- Toda política de aislamiento de esta casa compara contra `app.current_companies()`, que sale de
-- las membresías del solicitante más el alcance que declare una operación de sistema. Quien abre
-- una tienda **no tiene sesión**, así que no aporta membresías; y el alcance no se puede declarar
-- todavía, porque la empresa a la que pertenece el sitio es justo lo que se está averiguando. Con
-- las políticas puestas y sin nada que declarar, la consulta sale vacía: el sitio no se encuentra
-- nunca.
--
-- Hay tres salidas y dos son malas. Leer con el rol de la conexión —`withElevated`— **elude las
-- políticas para toda la operación**, y de ahí cuelga después el catálogo entero. Abrir una política
-- de lectura de `websites` a cualquiera pone la tabla —con su empresa, su almacén y su estado de
-- publicación— al alcance de cualquier arrendatario autenticado, que es más de lo que se pedía.
--
-- La tercera es ésta: **una función que responde a una sola pregunta**, con su predicado escrito
-- aquí y no en quien llama, y que devuelve un identificador y nada más. Con él, todo lo demás corre
-- por `withSystem` con esa empresa declarada, sujeto a las mismas políticas que cualquier petición
-- de usuario. Es la misma forma que el enlace público de un documento, donde el alcance sale del
-- sobre firmado; aquí sale del subdominio, verificado contra la tabla.
--
-- ## Por qué la publicación se comprueba aquí dentro
--
-- «Un sitio despublicado se comporta como inexistente **y no revela que exista**». Si el filtro
-- viviera en quien llama, la función devolvería la empresa de un sitio despublicado y la única
-- barrera sería que alguien se acordara de mirar `is_published` después. Aquí dentro, un sitio sin
-- publicar y un subdominio libre son literalmente el mismo `null`, y no hay forma de distinguirlos
-- desde fuera porque no hay nada que distinguir.
--
-- `security definer` con `search_path` fijado, como `app.member_of()` y por lo mismo: la consulta
-- que alimenta las políticas no puede quedar sujeta a ellas, y un esquema en el camino de búsqueda
-- no puede suplantar la tabla que se consulta.
create or replace function app.public_website(site_slug text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.company_id
  from websites w
  where w.slug = site_slug
    and w.is_published
    and w.deleted_at is null
$$;

-- Al alcance de quien atiende peticiones, y de nadie más. El rol `public` incluye a cualquiera que
-- llegue a hablar con la base, y esta función responde sin pedir identidad.
revoke execute on function app.public_website(text) from public;
grant execute on function app.public_website(text) to authenticated, service_role;

-- ─── Y la disponibilidad del identificador, por el mismo motivo ──────────────
--
-- «El sistema SHALL permitir comprobar la disponibilidad de un identificador antes de intentar
-- usarlo, y SHALL rechazar con `409` uno ya ocupado».
--
-- El identificador legible de un sitio es único **en toda la plataforma** —es el subdominio, y en
-- un nombre de host no hay empresa que acote nada—, pero la consulta que lo comprueba corre con las
-- políticas puestas y **sólo ve los sitios de quien pregunta**. Así, un identificador ocupado por
-- otra empresa se ve libre, se intenta insertar, y el índice único lo rechaza: la respuesta no es
-- el `409` con su motivo, es un `500` del motor que no dice nada.
--
-- Comprobado contra la base antes de escribir esto, y **el mismo hueco alcanza hoy a los
-- almacenes y a los productos**, cuyos identificadores también son únicos de plataforma: dos
-- empresas no pueden llamar «Nave central» a su almacén, y la segunda recibe un `500` al crearlo.
-- Queda anotado como `HALLAZGOS.md` H-90 — no se corrige aquí porque el catálogo es de otro
-- encargo, y esta función es la forma en que se corregirá cuando se haga.
--
-- Lo que la función revela es **si un subdominio está ocupado**, que es información pública por
-- naturaleza: cualquiera lo averigua abriendo la dirección. No dice de quién es, ni si está
-- publicado, ni nada más.
create or replace function app.website_slug_taken(site_slug text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from websites w where w.slug = site_slug and w.deleted_at is null
  )
$$;

revoke execute on function app.website_slug_taken(text) from public;
grant execute on function app.website_slug_taken(text) to authenticated, service_role;
