# 10 · Identidad y arrendatarios — trabajo

Leyenda: `[x]` hecho y comprobado · `[~]` hecho en parte, con la parte que falta anotada.

Hechas **empresas, membresías, roles, direcciones, contrapartes y la taxonomía global**. Faltan los
prospectos y las dos taxonomías que cuelgan de entidades que aún no existen.

## Cuentas

Casi todo esto ya existía desde la rebanada 04, que construyó el ciclo de vida de la sesión.

- [x] Registro y perfil — el avatar necesita almacenamiento (rebanada 08)
- [x] Cambio de correo con verificación de la dirección nueva
- [~] Nombre de usuario derivado y único. **Falta** la consulta de disponibilidad
- [x] Activación y desactivación, con invalidación de sesiones
- [x] Baja con borrado lógico y liberación del correo
- [ ] Impedir la baja del único propietario de una empresa activa
- [ ] Prospectos: captura pública, gestión y aceptación
- [ ] Corregir la retirada del prospecto aceptado
- [ ] Corregir la escritura de la marca de última actividad

## Empresas

- [x] Creación, con el creador como propietario
- [ ] Creación por administrador de plataforma, con propietario existente o nuevo
- [x] Edición; **la comisión sólo por administrador de plataforma**, y se rechaza en lugar de
      ignorarse — ignorar un campo hace creer que se guardó
- [x] Listados de empresas propias. El de invitadas necesita las invitaciones
- [x] Comprobación de pertenencia, en las dos capas
- [x] Baja con borrado lógico
- [ ] Enumeración previa del alcance en la confirmación — necesita la 28e
- [ ] Impedir la baja con suscripción activa — necesita la 11

## Membresías

- [~] Incorporación de persona **existente**. La creación de cuenta nueva por invitación existe en
      `accounts.ts` desde la 04; **falta atarla** a esta ruta
- [x] Retirada, activación y desactivación
- [x] Asignación de rol, rechazando roles de otra empresa
- [x] Transferencia y retirada de propiedad, **conservando siempre una**
- [x] Recuento de membresías por rol
- [x] Consulta de la propia membresía, con permisos efectivos — en `GET /auth/me`
- [ ] Incorporación y ampliación de suscripción en una sola transacción — necesita la 11

## Servicios

- [ ] Habilitación por conjunto, reconciliando altas y bajas
- [ ] Retirar un servicio conserva sus datos
- [ ] Corregir la cascada al eliminar un servicio
- [ ] Corregir la búsqueda de servicio por clave

## Direcciones

- [x] Libretas de usuario y de empresa
- [x] Una sola primaria; marcar desmarca la anterior. **Lo garantiza un índice único parcial**, no
      el código: la aplicación no puede dejar dos aunque se equivoque
- [x] La primera es primaria
- [x] Eliminar la primaria promueve otra, y la sustituta es **determinista** — la más antigua de las
      que quedan, no una cualquiera
- [ ] Búsqueda con sugerencias y ajuste en mapa — necesita el selector de mapa de la 28e
- [ ] Impedir eliminar una dirección en uso — necesita los envíos (17) y la facturación (11), que
      son quienes la referenciarían

## Contrapartes

- [x] Clientes y proveedores por empresa, **con permisos separados**: quien lleva las compras no ve
      por ello la cartera de clientes
- [x] Aprovisionamiento en pareja, idempotente **por restricción única** y no por comprobación
      previa — comprobar y luego insertar deja una ventana, y dos compras simultáneas crearían dos
      parejas
- [x] Alta del comprador como cliente tras una compra, también idempotente
- [x] Impedir eliminar una contraparte con documentos vigentes. Cotizaciones **abiertas** y pedidos
      **en curso** la retienen; los cerrados no, porque su copia de los datos del cliente vive en el
      propio documento

## Taxonomías

- [x] Árbol con padre e hijas, sin límite de profundidad
- [x] Listado de raíces por defecto
- [x] Re-parentado, con **rechazo de ciclos** — es lo único que el motor no puede impedir por sí
      solo, porque la consulta que lo detecta es recursiva
- [x] Eliminación recursiva. La hace la clave foránea en cascada; lo clasificado queda sin categoría
- [x] Identificador legible por alcance, derivado del nombre y con sufijo al colisionar
- [~] Los tres alcances. **La global está**; la de almacén y la de producción cuelgan de entidades
      que llegan con las rebanadas 12 y 20

## Cascadas

- [x] Sustituir las funciones escritas a mano por propagación declarativa — la baja de empresa no
      recorre nada: es una fecha, y el alcance lo aplica el motor
- [x] **Ninguna cascada borra de la tabla de empresas** (C-08): no hay ninguna cascada escrita a
      mano que pueda hacerlo
- [x] Toda cascada en una transacción
- [ ] Enumeración previa del alcance en la confirmación — necesita la 28e

## Verificación

- [x] La primera dirección de una libreta nace primaria; marcar otra desmarca la anterior
- [x] Eliminar la primaria promueve otra; vaciar la libreta la deja sin primaria, que es válido
- [x] Un usuario no ve las direcciones de otro — `404`, no `403`
- [x] Las direcciones de empresa son de la empresa, no de quien las escribió
- [x] Clientes y proveedores no comparten permiso
- [x] La baja de una contraparte es lógica: los documentos emitidos conservan su nombre
- [x] Una compra entre empresas crea las dos contrapartes, y **una segunda no duplica**
- [x] Un comprador de tienda queda como cliente, y sólo una vez
- [x] La taxonomía global se lee sin sesión y sólo la escribe la plataforma
- [x] Una categoría no puede ser su propio padre ni colgar de su descendiente
- [x] Eliminar recorre el subárbol entero, y el alcance se advierte antes
- [x] Sólo se ofrecen las categorías del servicio pertinente
- [x] Quien crea una empresa queda como propietaria, en la misma transacción
- [x] Una empresa ajena no aparece en el listado y responde `403` por su dirección
- [x] La administración de plataforma entra en cualquier empresa
- [x] La comisión no la mueve quien la paga, y el rechazo no escribe nada
- [x] La baja conserva la fila y su fecha, y retira el acceso
- [x] **El motor deja de contar una empresa dada de baja aunque su membresía sobreviva**
- [x] No se puede retirar la propiedad, desactivar ni expulsar a la última propietaria
- [x] Con dos propietarias sí se puede retirar una
- [x] Sólo una propietaria mueve la propiedad, ni siquiera con el permiso que protege esa ruta
- [x] Un rol concede exactamente lo que declara, y nada más
- [x] Un rol de otra empresa no se puede asignar
- [x] Eliminar un rol deja al miembro sin rol y conserva su pertenencia
- [x] Cambiar el conjunto de permisos exige su propia clave, distinta de renombrar
- [x] **Las políticas siguen en pie sin la compuerta**: una consulta al motor con la identidad de
      quien no pertenece devuelve cero filas
- [ ] Pruebas de las partes sin empezar

## Hallazgos

**La baja de una empresa no retiraba el acceso.** `app.member_of()` leía las membresías activas sin
mirar si la empresa seguía vigente, y como el borrado es lógico sus membresías sobreviven: la
empresa quedaba dada de baja y sus miembros seguían alcanzando todos sus datos por las políticas.
La aplicación ya la excluía al construir el perfil, así que **desaparecía de la pantalla y seguía
siendo accesible** — que es lo que lo hacía difícil de notar. Arreglado en el motor
(`0008_company_soft_delete_scope.sql`), no en cada consulta.

**La propiedad no tiene clave de permiso.** El catálogo no trae ninguna para transferirla, así que
no se puede exigir como permiso: se exige **ser propietaria**, que es una regla y no un permiso. Si
el negocio quiere poder delegarla a un rol, hace falta una clave nueva y el catálogo deja de
coincidir con el de la implementación anterior. Queda pendiente de decisión.

**Crear una empresa es la única operación que no se puede resolver contra el alcance del
solicitante**: la política exige que la empresa ya esté entre las suyas, y al crearla no lo está.
Se resuelve con la vía de sistema, que declara el alcance de forma explícita y **no elude las
políticas**. La alternativa —apagarlas con la vía elevada— se descartó: apagar el aislamiento para
escribir dos filas es desproporcionado y no deja rastro de qué alcance se pretendía.

**La taxonomía global no tiene clave de permiso, y no puede tenerla.** Es común a todas las
empresas, así que un permiso *de empresa* no puede autorizarla: sus rutas cuelgan de `:companyId`
porque la compuerta lo exige, pero lo que decide es una comprobación de administración de
plataforma. Es el mismo caso que la transferencia de propiedad, y se apunta a la misma decisión
pendiente.

**Buscar una cuenta por correo no cabe dentro de la transacción del solicitante.** Al dar de alta un
cliente atado a una cuenta existente, la fila de esa persona está fuera de su alcance —no comparten
empresa— y las políticas la ocultan, así que la consulta salía vacía y la contraparte quedaba
suelta. Se resuelve fuera, y de ahí sólo sale el identificador: lo único que revela es si ese correo
tiene cuenta, que ya lo sabe quien lo está escribiendo. Es la misma situación que al incorporar a un
miembro, y ahora las dos lo hacen igual.
