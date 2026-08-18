-- Un archivo se puede confirmar, y recoger.
--
-- La tabla de archivos nació con tres políticas: leer, insertar, y todo para administración de
-- plataforma. Faltaban las dos que su propio ciclo de vida necesita:
--
--   * **Actualizar**, que es lo que hace la confirmación de una subida. Sin ella, quien sube un
--     archivo lo registra, escribe los objetos y **no puede decir que los escribió**: la fila se
--     queda pendiente para siempre y el recolector acaba borrándola. El síntoma era un `404` al
--     confirmar, que no se parece en nada a la causa.
--   * **Borrar**, que es lo que hace el recolector de subidas abandonadas.
--
-- El predicado es `true`, como el de lectura, y no es un descuido: **la fila de un archivo no lleva
-- empresa**. La referencian entidades que sí la llevan —un producto, un comprobante—, y el
-- aislamiento vive ahí. Lo que sí acota el archivo a un arrendatario es la clave de su objeto, que
-- empieza por el identificador de la empresa, y eso lo comprueba el servicio (`media/uploads.ts`).
--
-- Escribirlo aquí para que quien lo lea no lo tome por una política olvidada.

alter table public.uploads enable row level security;

drop policy if exists cambio on public.uploads;
create policy cambio on public.uploads
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists baja on public.uploads;
create policy baja on public.uploads
  for delete to authenticated
  using (true);
