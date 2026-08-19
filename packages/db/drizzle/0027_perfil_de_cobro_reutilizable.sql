-- Un perfil de cobro dado de baja deja de ocupar su identificador externo.
--
-- ## Qué pasaba
--
-- `merchant_profiles` tiene dos únicos parciales, escritos uno debajo del otro:
--
--   * el de primaria excluye lo dado de baja —`is_primary = true AND deleted_at IS NULL`—,
--   * el de identificador externo **no** —sólo `external_account_id IS NOT NULL`—.
--
-- Así, un perfil eliminado se quedaba con su identificador ocupado para siempre. Con un procesador
-- de verdad eso casi no se nota, porque cada alta acuña un identificador distinto; con el suplente
-- local, que lo acuña **determinista por empresa** (`local_acct_<empresa>`), la segunda alta de la
-- misma empresa chocaba siempre. El síntoma era un `500` al crear el segundo perfil, y no había
-- forma de salir de él: borrar el perfil no liberaba nada.
--
-- Lo encontró la suite de extremo a extremo en su **segunda vuelta**, que es exactamente para lo
-- que sirve correrla dos veces: la primera dejó el perfil, la segunda intentó crearlo otra vez.
-- Ver `HALLAZGOS.md` H-139.
--
-- ## Por qué el predicado y no otra cosa
--
-- La unicidad sigue haciendo falta: dos perfiles vivos apuntando a la misma cuenta del procesador
-- serían dos empresas cobrando al mismo sitio. Lo que no hace falta es que la reserve un perfil que
-- ya no existe. Es el mismo criterio que su vecino de arriba, y la corrección es hacerlos coincidir.

drop index if exists "merchant_profiles_external_unique";--> statement-breakpoint

create unique index "merchant_profiles_external_unique"
  on "merchant_profiles" ("external_account_id")
  where external_account_id is not null and deleted_at is null;--> statement-breakpoint

-- ─── Comprobación ────────────────────────────────────────────────────────────
--
-- Que el índice quedó con el predicado nuevo. Sin esto, un `drop` que fallara en silencio dejaría
-- la tabla sin unicidad ninguna, que es peor que el defecto que se está corrigiendo.
do $$
declare predicado text;
begin
  select pg_get_expr(i.indpred, i.indrelid) into predicado
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  where c.relname = 'merchant_profiles_external_unique';

  if predicado is null or predicado not like '%deleted_at IS NULL%' then
    raise exception 'merchant_profiles_external_unique no excluye lo dado de baja: %', predicado;
  end if;
end $$;
