# 09 · Bitácora y notificaciones

## Por qué

Unos cuarenta módulos emiten actividades, así que esta rebanada también bloquea a las de dominio.

Dos cambios de fondo respecto de la implementación anterior:

- **El asiento de bitácora pasa a ser transaccional con la mutación que lo origina.** Hoy se emite
  sin esperarlo y sus errores se descartan, de modo que una operación puede completarse sin dejar
  rastro.
- **La misma clave de permiso que autoriza la acción selecciona la audiencia.** Hasta la rebanada 05
  sólo hacía lo segundo; ahora hace las dos cosas y deben coincidir.

Y una corrección que importa: **las notificaciones dejan de llevar contraseñas** (`DEFECTS.md`
S-09). Eso ya entra por la rebanada 04; aquí se verifica que ninguna carga útil las contenga.

## Qué entra

- Asiento de actividad transaccional con su mutación.
- Selección de audiencia por permiso, con los propietarios siempre incluidos.
- El autor no se notifica a sí mismo.
- Entrega asíncrona y reintentable; un fallo del proveedor no rompe la operación de negocio.
- Bandeja por usuario con estados de lectura y archivo.
- Notificación push al navegador, con varios dispositivos por usuario.
- Sincronización de los datos del destinatario.
- Preferencias de canal por usuario, con las notificaciones críticas de cuenta siempre por correo.
- Bitácora consultable, de sólo anexado.

## Delta de requisitos

`REMOVED` — Se retira la administración de plantillas de notificación por API (`project.md`, D-09).
Era una herramienta expuesta sin autenticación que operaba sobre la cuenta real del proveedor. Se
administra desde su panel.

## Criterios de aceptación

- Una mutación revertida no deja asiento.
- Una acción denegada por permiso no registra nada ni notifica.
- Sólo los miembros con el permiso, más los propietarios, reciben la notificación.
- El autor no recibe la suya.
- Con el proveedor caído, la operación de negocio se completa y la entrega queda encolada.
- Ninguna carga útil de notificación contiene una contraseña.
- Un asiento no puede modificarse ni eliminarse.

## Specs

`activity-and-notifications`
