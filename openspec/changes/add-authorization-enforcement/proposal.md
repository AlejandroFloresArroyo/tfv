# 05 · Aplicación de los permisos

> Bloque crítico de seguridad. No exponer tráfico público sin esta rebanada.

## Por qué

El sistema tiene un catálogo de **ciento veintisiete permisos**, un editor de matriz de permisos por
rol, y roles asignados a cada miembro. Nada de eso restringe absolutamente nada.

El único consumidor de `role.permissions` en toda la implementación anterior decide **a quién
notificar** cuando ocurre una actividad (`DEFECTS.md` S-07). Un miembro cuyo rol no concede ningún
permiso puede eliminar cualquier cosa de su empresa.

Es un caso poco habitual y conviene nombrarlo con precisión: no es que falte el control de acceso,
es que **existe toda su apariencia** —el catálogo, la interfaz, la asignación— sin la comprobación.
Quien administra una empresa cree estar restringiendo a su equipo y no lo está.

## Qué entra

- Comprobación efectiva del permiso en toda operación que declare uno.
- Denegación por defecto: una operación sin permiso declarado queda protegida.
- La comprobación ocurre **antes** de cualquier efecto: sin permiso no hay escritura, ni actividad,
  ni notificación.
- Elusión de los propietarios, acotada: eluden el permiso, no la pertenencia ni la habilitación.
- El administrador de plataforma opera como propietario en cualquier empresa, y sus acciones quedan
  marcadas como tales.
- El catálogo de permisos pasa a ser dato del servidor, versionado y consultable. Hoy la lista
  canónica vive en el frontend y el backend sólo la referencia por cadena.
- Consulta de permisos efectivos, para que la interfaz se adapte sin que eso sea el control.

## Qué no entra

- El aislamiento entre arrendatarios, que es la rebanada 06. Son cosas distintas: el permiso dice
  *qué* puedes hacer, la pertenencia dice *sobre los datos de quién*.

## Criterios de aceptación

- Un miembro sin el permiso requerido recibe `403` y **no deja rastro**: ni entidad, ni actividad,
  ni notificación.
- Un miembro con rol vacío no puede escribir nada.
- Un propietario con rol vacío puede operar en su empresa.
- Un propietario no puede eludir la habilitación del servicio.
- Guardar un rol con una clave ausente del catálogo responde `400`.
- La matriz de permisos de la interfaz se construye desde el catálogo del servidor.
- Toda acción de un administrador de plataforma sobre una empresa ajena queda marcada en la
  bitácora.

## Riesgos

**Esta rebanada va a romper flujos que hoy funcionan.** Hay usuarios operando con roles que no
conceden lo que están haciendo, porque nadie lo comprobaba. Antes de activarla conviene medir: por
cada permiso, cuántas operaciones reales se rechazarían. Eso indica qué roles hay que corregir antes
del corte y evita descubrirlo en producción.

**El catálogo canónico se mueve de sitio.** Hoy vive en el frontend; pasa al servidor. Hay que
verificar que las ciento veintisiete claves se transcriben exactamente: una clave mal escrita
concede o deniega en silencio.

## Specs

`access-control` · `activity-and-notifications` (selección de audiencia por el mismo permiso)
