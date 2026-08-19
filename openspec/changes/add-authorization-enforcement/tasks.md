# 05 · Aplicación de los permisos — trabajo

Leyenda: `[x]` hecho y comprobado · `[~]` hecho en parte, con la parte que falta anotada.

## Catálogo

- [x] Trasladar las claves al servidor, verificándolas una a una. Son **255**, no 127: se
      extrajeron del catálogo anterior reproduciendo su función de derivación, no se transcribieron.
      La spec se corrigió — ver la nota del 2026-08-17 en `access-control`
- [x] Catálogo versionado y consultable — constante del servidor, publicada por `GET /permissions`.
      El porqué de constante y no tabla está escrito junto al catálogo
- [x] Rechazar la concesión de una clave ausente del catálogo
- [~] La interfaz construye su matriz desde el catálogo del servidor. El endpoint existe y la
      pantalla que lo consume es de la rebanada 29. **Faltan las etiquetas**: el catálogo no las
      trae porque la interfaz es bilingüe y fijar aquí un idioma obligaría a deshacerlo

## Comprobación

- [x] Declarar el permiso requerido en cada operación que lo tenga
- [x] Denegación por defecto para operaciones sin permiso declarado
- [x] Comprobar **antes** de cualquier efecto — la comprobación vive en el middleware, no en el
      manejador, así que no queda al criterio de cada uno hacerla antes o después de escribir
- [x] Elusión de los propietarios, acotada al permiso: no elude pertenencia
- [x] Administrador de plataforma con acceso equivalente a propietario, en las dos capas
- [~] Marcar en la bitácora las acciones ejercidas como administración de plataforma. El motivo de
      la concesión se resuelve y queda en el contexto de la petición (`grantReason`); **la bitácora
      que lo consume es la rebanada 09**
- [x] Consulta de permisos efectivos para la interfaz — en `GET /auth/me`, por empresa

## Roles

- [x] Los roles pertenecen a una empresa; una membresía sólo resuelve contra roles de la suya
- [x] Eliminar un rol deja a sus miembros sin rol, conservando la pertenencia
- [x] Un miembro sin rol conserva lectura y pierde escritura
- [ ] Escritura de roles por API — es la rebanada 10; el validador que rechaza claves desconocidas
      ya está y la espera

## Medición previa al corte

Sin empezar, y **es lo que falta para poder cerrar la rebanada**. Hoy la comprobación deniega desde
el primer día porque no hay tráfico real que romper; en el corte sí lo habrá, y los permisos nunca
se han evaluado, así que nadie sabe cuántas operaciones legítimas dependen de un rol mal poblado.

- [ ] Instrumentar la comprobación en modo observación, sin denegar
- [ ] Medir, por permiso, cuántas operaciones reales se rechazarían
- [ ] Corregir los roles afectados antes de activar la denegación
- [ ] Activar la denegación

## Verificación

- [x] Prueba: sin permiso, `403` y sin efecto alguno
- [x] Prueba: rol vacío no puede escribir
- [x] Prueba: propietario con rol vacío sí puede
- [x] Prueba: la elusión del propietario no alcanza a la pertenencia
- [x] Prueba: sin membresía en la empresa, `403` — el parámetro de ruta no concede nada
- [x] Prueba: administración de plataforma entra en una empresa a la que no pertenece, y queda
      marcado por qué
- [x] Prueba: clave desconocida al guardar un rol se rechaza
- [x] Prueba: el catálogo publicado coincide con el que hace cumplir el permiso
- [x] Prueba: el tamaño del catálogo está fijado en 255 — quitar una clave tiene que ser una
      decisión, no un descuido
- [ ] Prueba: sin permiso, no se registra actividad ni se envía notificación — necesita la bitácora
      de la rebanada 09
- [x] Prueba: propietario no elude la habilitación del servicio — `billing/merchants.test.ts:719`:
      quien crea la empresa es su propietario, tiene suscripción vigente y sin el servicio
      contratado recibe `403 service_not_enabled`. La elusión no llega a esta compuerta a
      propósito, y está escrito en `auth/middleware.ts:176-179`
- [ ] Cobertura: una prueba por cada permiso del catálogo que niegue y otra que conceda

## Hallazgo del andamiaje

Al escribir la primera ruta con `:companyId` apareció un defecto **silencioso** del propio registro
de rutas: el contrato nombra sus parámetros `{companyId}` y el enrutador los espera `:companyId`. El
manejador se registraba con la conversión hecha y el guardián se montaba sin ella, así que el camino
del guardián no coincidía con ninguna petición y **la ruta respondía sin guardián**.

No fallaba y no avisaba. No había ninguna ruta con parámetros cuando apareció, así que no expuso
nada; la primera lo habría heredado. Es la misma forma de S-05 —olvidar el gancho deja la ruta
abierta— cometida por el andamiaje que existe para impedirla. Arreglado, con prueba de regresión.
