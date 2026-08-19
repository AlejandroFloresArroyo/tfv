# 09 · Bitácora y notificaciones — trabajo

## Bitácora

- [x] Modelo de asiento: acción, entidad, autor, instante, origen, referencia navegable
- [x] Escritura en la misma transacción que la mutación
- [x] Sólo anexado: revocar modificación y borrado
- [x] Consulta paginada y filtrable por servicio, acción, autor y fechas
- [x] Consulta de la actividad propia a través de todas las empresas

> **Emiten asiento seis operaciones**, las de empresa y membresía: es donde se probó el mecanismo
> entero. Las otras ~35 rutas de escritura lo añaden al pasar por su módulo, con la misma clave que
> protege la ruta (`HALLAZGOS.md` H-77).

## Audiencia

- [x] Selección por la clave de permiso declarada en la acción
- [x] Propietarios siempre incluidos
- [x] Varias claves exigen todas
- [x] Excluir al autor de su propia notificación

## Entrega

- [x] Cola de entrega, asíncrona respecto de la mutación
- [x] Reintento ante fallo transitorio, sin duplicar lo ya entregado
- [x] Un fallo del proveedor no hace fallar la operación de negocio
- [ ] Sincronización de los datos del destinatario al cambiar el perfil
- [ ] Alta del destinatario en el primer envío

> Las dos últimas sólo significan algo con un proveedor externo al que sincronizar, y no lo hay
> (`HALLAZGOS.md` H-75). La costura es `registerTransport`.

## Bandeja

- [x] Listado paginado, ordenado de más reciente a más antiguo
- [x] Marcar leída y no leída
- [x] Archivar y desarchivar
- [x] Filtros por no leídas, leídas y archivadas
- [x] Contador de no leídas y aviso de novedades

## Push

- [x] Registro de dispositivo asociado a la cuenta
- [x] Varios dispositivos sin duplicados
- [x] Revocación de dispositivo
- [ ] Título, cuerpo y referencia del aviso
- [x] Saneado del texto antes de mostrarlo
- [ ] Pulsar el aviso abre la entidad, enfocando una pestaña existente si la hay

> El sobre ya viaja con título, cuerpo y referencia —la bandeja los pinta—, pero un aviso **de
> empuje** no existe hasta que haya proveedor y trabajador de servicio. Las dos tareas quedan con lo
> que falta escrito.

## Preferencias

- [x] Elección de canal por categoría
- [x] Recuperación y verificación siempre por correo

## Retirada de alcance

- [ ] Retirar la administración de plantillas por API
- [ ] Delta de requisitos `REMOVED`

> No hay nada que retirar en la pila nueva: la administración de plantillas nunca se escribió aquí.
> El delta pertenece a la rebanada 30, junto con la retirada de la pila anterior.

## Verificación

- [x] Prueba: mutación revertida no deja asiento
- [x] Prueba: acción denegada no registra ni notifica
- [x] Prueba: sólo la audiencia correcta recibe
- [x] Prueba: proveedor caído no rompe la operación
- [x] Prueba: ninguna carga útil contiene una contraseña

## Despachador de trabajos en segundo plano

No estaba en esta lista y bloqueaba dos rebanadas.

- [x] Cola con estados explícitos, toma con bloqueo y salto de lo bloqueado
- [x] Reintentos acotados con espera creciente, y rendición visible
- [x] Un trabajo que falla no se lleva por delante a los demás
- [x] Recuperación del que quedó en curso al caerse el proceso
- [x] Trabajos periódicos, sin solaparse
- [x] Recolector de subidas abandonadas, con plazo configurable (rebanada 08)
- [x] Verificación de coherencia de existencias, programada (rebanada 13, H-11)
- [x] Entrega de avisos encolados

## Pantallas

- [x] Bandeja, con sus filtros en la dirección y su contador
- [x] Preferencias de canal, diciendo cuáles no tienen proveedor
- [x] Bitácora de la empresa, filtrable y de sólo lectura
- [x] Campana con el número de no leídas
