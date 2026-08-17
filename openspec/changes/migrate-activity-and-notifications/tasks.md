# 09 · Bitácora y notificaciones — trabajo

## Bitácora

- [ ] Modelo de asiento: acción, entidad, autor, instante, origen, referencia navegable
- [ ] Escritura en la misma transacción que la mutación
- [ ] Sólo anexado: revocar modificación y borrado
- [ ] Consulta paginada y filtrable por servicio, acción, autor y fechas
- [ ] Consulta de la actividad propia a través de todas las empresas

## Audiencia

- [ ] Selección por la clave de permiso declarada en la acción
- [ ] Propietarios siempre incluidos
- [ ] Varias claves exigen todas
- [ ] Excluir al autor de su propia notificación

## Entrega

- [ ] Cola de entrega, asíncrona respecto de la mutación
- [ ] Reintento ante fallo transitorio, sin duplicar lo ya entregado
- [ ] Un fallo del proveedor no hace fallar la operación de negocio
- [ ] Sincronización de los datos del destinatario al cambiar el perfil
- [ ] Alta del destinatario en el primer envío

## Bandeja

- [ ] Listado paginado, ordenado de más reciente a más antiguo
- [ ] Marcar leída y no leída
- [ ] Archivar y desarchivar
- [ ] Filtros por no leídas, leídas y archivadas
- [ ] Contador de no leídas y aviso de novedades

## Push

- [ ] Registro de dispositivo asociado a la cuenta
- [ ] Varios dispositivos sin duplicados
- [ ] Revocación de dispositivo
- [ ] Título, cuerpo y referencia del aviso
- [ ] Saneado del texto antes de mostrarlo
- [ ] Pulsar el aviso abre la entidad, enfocando una pestaña existente si la hay

## Preferencias

- [ ] Elección de canal por categoría
- [ ] Recuperación y verificación siempre por correo

## Retirada de alcance

- [ ] Retirar la administración de plantillas por API
- [ ] Delta de requisitos `REMOVED`

## Verificación

- [ ] Prueba: mutación revertida no deja asiento
- [ ] Prueba: acción denegada no registra ni notifica
- [ ] Prueba: sólo la audiencia correcta recibe
- [ ] Prueba: proveedor caído no rompe la operación
- [ ] Prueba: ninguna carga útil contiene una contraseña
