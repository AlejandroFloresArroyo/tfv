# Cuentas de usuario

## Purpose

Todo lo relativo a una persona en el sistema: cómo obtiene una cuenta, cómo demuestra que es ella,
cómo recupera el acceso y cómo se da de baja.

El padrón es **único** (decisión D-01): la misma cuenta sirve para trabajar en el panel de una
empresa y para comprar en la tienda pública de otra. El correo es único a nivel global.

Hay **tres vías** por las que nace una cuenta, y difieren en algo importante — quién elige la
contraseña:

| Vía | Quién inicia | Contraseña |
|---|---|---|
| Registro propio | La persona | La elige ella al registrarse |
| Invitación | Un administrador de empresa | La elige ella con un enlace de un solo uso |
| Prospecto aceptado | Un administrador de plataforma, tras un contacto público | La elige ella con un enlace de un solo uso |

En las dos últimas, **el sistema nunca genera ni envía una contraseña**. La implementación anterior
generaba una contraseña temporal y la mandaba en texto claro por notificación
(ver `DEFECTS.md` S-09); eso desaparece.

Los requisitos de sesión están escritos como **comportamiento observable** —vigencia, rotación,
un solo uso— y no como mecanismo, de modo que delegar la autenticación en un servicio gestionado
más adelante sea una decisión de implementación y no un cambio de contrato (ver D-07).

## Requirements

### Requirement: Registro propio

Cualquier persona SHALL poder crear una cuenta aportando su nombre, su correo y una contraseña.

El correo SHALL normalizarse a minúsculas y SHALL ser único entre las cuentas no borradas. Una
cuenta recién registrada SHALL quedar **sin verificar**.

#### Scenario: Se crea una cuenta nueva

- **WHEN** una persona se registra con un correo no utilizado
- **THEN** la cuenta se crea sin verificar
- **AND** recibe la notificación de bienvenida y el correo de verificación

#### Scenario: Un correo ya usado se rechaza

- **WHEN** alguien se registra con un correo que ya tiene cuenta
- **THEN** la respuesta es `409`
- **AND** no se crea una segunda cuenta

#### Scenario: El correo se normaliza

- **GIVEN** una cuenta existente con el correo en minúsculas
- **WHEN** alguien intenta registrarse con el mismo correo en mayúsculas
- **THEN** se rechaza por duplicado

### Requirement: La verificación de correo es efectiva

Una cuenta creada por registro propio SHALL permanecer sin verificar hasta que su titular confirme
la dirección mediante un enlace enviado a ella.

Una cuenta sin verificar no SHALL poder iniciar sesión. La implementación anterior marcaba las
cuentas como verificadas en el propio registro, lo que anulaba el mecanismo
(ver `DEFECTS.md` S-15).

#### Scenario: Sin verificar no se entra

- **GIVEN** una cuenta recién registrada y no verificada
- **WHEN** intenta iniciar sesión con credenciales correctas
- **THEN** el acceso se deniega
- **AND** el mensaje indica que falta verificar el correo
- **AND** se ofrece reenviar la verificación

#### Scenario: El enlace verifica la cuenta

- **WHEN** el titular abre el enlace de verificación vigente
- **THEN** la cuenta queda verificada
- **AND** puede iniciar sesión

#### Scenario: El enlace de verificación es de un solo uso

- **GIVEN** un enlace de verificación ya utilizado
- **WHEN** se abre de nuevo
- **THEN** no surte efecto y se informa de que ya está verificada

### Requirement: Inicio de sesión

Una persona SHALL poder iniciar sesión con su correo y su contraseña, y el sistema SHALL registrar
el instante del último acceso.

El acceso SHALL denegarse cuando las credenciales no coincidan, cuando la cuenta esté desactivada o
cuando no esté verificada.

Un intento fallido no SHALL revelar **cuál** de esas condiciones se incumplió, salvo la falta de
verificación, que sí SHALL indicarse para que el titular pueda resolverla.

#### Scenario: Credenciales correctas abren sesión

- **WHEN** una persona con cuenta verificada y activa introduce sus credenciales correctas
- **THEN** obtiene una sesión
- **AND** se registra su último acceso

#### Scenario: Una contraseña incorrecta no revela si el correo existe

- **WHEN** se intenta entrar con un correo existente y contraseña incorrecta
- **AND** se intenta entrar con un correo inexistente
- **THEN** ambos intentos producen el mismo mensaje

#### Scenario: Una cuenta desactivada no entra

- **GIVEN** una cuenta desactivada
- **WHEN** intenta iniciar sesión con credenciales correctas
- **THEN** el acceso se deniega

### Requirement: Los intentos de acceso están limitados

El sistema SHALL limitar los intentos fallidos de inicio de sesión por cuenta y por origen, y SHALL
responder `429` al superarse el límite.

#### Scenario: Los intentos repetidos se frenan

- **WHEN** se realizan intentos fallidos consecutivos sobre la misma cuenta por encima del límite
- **THEN** los siguientes reciben `429` durante un periodo
- **AND** un inicio de sesión correcto reinicia el contador

### Requirement: Las sesiones caducan

Toda sesión SHALL tener una vigencia limitada y SHALL dejar de ser válida al expirar.

No SHALL emitirse credenciales de duración indefinida. La implementación anterior firmaba
credenciales sin caducidad, de modo que una filtración era permanente y no había forma de revocar
(ver `DEFECTS.md` S-03).

#### Scenario: Una credencial caducada se rechaza

- **GIVEN** una credencial cuya vigencia ha expirado
- **WHEN** se presenta
- **THEN** la respuesta es `401`

### Requirement: Renovación rotatoria de la sesión

El sistema SHALL permitir renovar una sesión activa sin volver a pedir credenciales, y SHALL
invalidar la credencial de renovación anterior al emitir la nueva.

Reutilizar una credencial de renovación ya consumida SHALL invalidar toda la cadena de sesión, por
tratarse de un indicio de robo.

#### Scenario: La renovación entrega credenciales nuevas

- **GIVEN** una sesión activa
- **WHEN** se renueva
- **THEN** se emiten credenciales nuevas
- **AND** las anteriores dejan de ser válidas

#### Scenario: Reutilizar una renovación consumida corta la sesión

- **GIVEN** una credencial de renovación ya usada
- **WHEN** se presenta de nuevo
- **THEN** la respuesta es `401`
- **AND** todas las sesiones derivadas de esa cadena quedan invalidadas

### Requirement: Cierre de sesión y revocación

Una persona SHALL poder cerrar su sesión, y SHALL poder cerrar todas sus sesiones activas a la vez.

Una sesión cerrada SHALL dejar de ser válida de inmediato.

#### Scenario: Cerrar sesión invalida la credencial

- **WHEN** el usuario cierra sesión
- **THEN** su credencial deja de ser aceptada de inmediato

#### Scenario: Se pueden cerrar todas las sesiones

- **GIVEN** un usuario con sesiones abiertas en tres dispositivos
- **WHEN** cierra todas las sesiones
- **THEN** los tres dispositivos quedan sin acceso

### Requirement: Recuperación de contraseña

Una persona SHALL poder solicitar el restablecimiento de su contraseña indicando su correo, y el
sistema SHALL enviar a esa dirección un enlace de un solo uso y vigencia limitada.

La respuesta a la solicitud SHALL ser la misma exista o no la cuenta, para no permitir averiguar
qué correos están registrados.

El token SHALL generarse con un procedimiento criptográficamente seguro. La implementación anterior
usaba una función de dispersión no criptográfica y sin caducidad (ver `DEFECTS.md` S-08).

#### Scenario: La respuesta no revela si la cuenta existe

- **WHEN** se solicita recuperación para un correo registrado
- **AND** se solicita para un correo no registrado
- **THEN** ambas respuestas son idénticas
- **AND** sólo en el primer caso se envía un correo

#### Scenario: El enlace restablece la contraseña una sola vez

- **GIVEN** un enlace de recuperación vigente
- **WHEN** el titular lo usa para fijar una contraseña nueva
- **THEN** la contraseña queda cambiada
- **AND** el enlace deja de ser válido

#### Scenario: Un enlace caducado no sirve

- **GIVEN** un enlace de recuperación emitido hace más tiempo del que dura su vigencia
- **WHEN** se intenta usar
- **THEN** se rechaza
- **AND** se ofrece solicitar uno nuevo

#### Scenario: Restablecer cierra las demás sesiones

- **WHEN** el titular restablece su contraseña
- **THEN** las sesiones abiertas anteriormente quedan invalidadas

### Requirement: Cambio de contraseña con sesión iniciada

Un usuario con sesión SHALL poder cambiar su contraseña aportando la actual.

Un cambio correcto SHALL invalidar **todas** las sesiones del titular, **incluida aquella desde la
que se cambia**: quien acaba de cambiarla vuelve a identificarse con la contraseña nueva. Es lo
mismo que hace el restablecimiento por enlace, y por el mismo motivo — quien tuviera la contraseña
anterior deja de tener acceso, sin excepciones que haya que razonar.

La pantalla que ofrece el cambio SHALL advertir de esa consecuencia **antes** de confirmarlo.

#### Scenario: Se exige la contraseña actual

- **WHEN** el usuario intenta cambiar su contraseña sin aportar la actual correcta
- **THEN** la operación se rechaza

#### Scenario: El cambio cierra también la sesión desde la que se hace

- **GIVEN** un usuario con sesión abierta en dos dispositivos
- **WHEN** cambia su contraseña desde uno de ellos
- **THEN** ninguno de los dos conserva el acceso
- **AND** el que la cambió lo sabía antes de confirmar

### Requirement: Requisitos mínimos de contraseña

El sistema SHALL exigir una longitud mínima a las contraseñas y SHALL rechazar las que figuren
entre las más comunes conocidas.

Las contraseñas SHALL almacenarse mediante una función de derivación de clave con factor de trabajo
ajustable, nunca en claro ni con una función de dispersión simple.

#### Scenario: Una contraseña demasiado corta se rechaza

- **WHEN** se intenta fijar una contraseña por debajo de la longitud mínima
- **THEN** la respuesta es `400` indicando el requisito

#### Scenario: Una contraseña común se rechaza

- **WHEN** se intenta fijar una contraseña que figura entre las más comunes
- **THEN** se rechaza y se explica el motivo

### Requirement: Creación de cuenta por invitación

Un administrador de una empresa SHALL poder crear la cuenta de una persona indicando su nombre y su
correo, sin fijar contraseña.

La cuenta SHALL quedar verificada —la invitación llega a un correo que el administrador afirma
conocer— y activa, y su titular SHALL recibir un enlace de un solo uso para establecer su
contraseña.

#### Scenario: El invitado establece su propia contraseña

- **WHEN** un administrador crea la cuenta de un nuevo miembro
- **THEN** el invitado recibe un enlace para establecer su contraseña
- **AND** la notificación no contiene ninguna contraseña
- **AND** puede iniciar sesión una vez la ha establecido

#### Scenario: Invitar a alguien con cuenta no la duplica

- **GIVEN** una persona que ya tiene cuenta
- **WHEN** un administrador la invita a su empresa
- **THEN** no se crea una segunda cuenta
- **AND** se le añade la membresía a la cuenta existente

### Requirement: Nombre de usuario único derivado

El sistema SHALL asignar a cada cuenta un nombre de usuario derivado de su nombre y apellido, y
SHALL garantizar que sea único añadiendo un sufijo cuando el derivado ya esté ocupado.

El nombre de usuario SHALL poder consultarse en cuanto a su disponibilidad antes de intentar usarlo.

#### Scenario: Un nombre ocupado recibe sufijo

- **GIVEN** un nombre de usuario ya existente
- **WHEN** se crea otra cuenta que derivaría el mismo
- **THEN** se le asigna una variante única

### Requirement: Perfil editable

Un usuario SHALL poder consultar y modificar su nombre, apellido, teléfono y avatar.

Cambiar el correo SHALL exigir verificar la dirección nueva antes de que sustituya a la anterior.

#### Scenario: El correo nuevo se verifica antes de aplicarse

- **WHEN** el usuario solicita cambiar su correo
- **THEN** se envía una verificación a la dirección nueva
- **AND** el correo de la cuenta sigue siendo el anterior hasta que se confirme

#### Scenario: Los cambios de perfil se propagan

- **WHEN** el usuario cambia su nombre
- **THEN** el cambio se refleja donde su nombre aparezca y en el proveedor de notificaciones

### Requirement: Desactivar y reactivar una cuenta

Un administrador SHALL poder desactivar y reactivar una cuenta.

Una cuenta desactivada SHALL conservar todos sus datos y sus membresías, y no SHALL poder iniciar
sesión. Desactivarla SHALL invalidar sus sesiones abiertas.

#### Scenario: Desactivar corta el acceso inmediatamente

- **GIVEN** un usuario con sesión abierta
- **WHEN** se desactiva su cuenta
- **THEN** su siguiente petición se rechaza

#### Scenario: Reactivar restaura el acceso

- **WHEN** se reactiva una cuenta desactivada
- **THEN** su titular puede volver a iniciar sesión
- **AND** conserva sus membresías

### Requirement: Baja de cuenta con borrado lógico

Eliminar una cuenta SHALL aplicarle borrado lógico, conservando su historial y las referencias que
otras entidades hagan a ella.

Las membresías de la cuenta SHALL eliminarse, y las empresas de las que sea **único propietario**
SHALL requerir la transferencia de la propiedad antes de permitir la baja.

El correo y el nombre de usuario SHALL quedar disponibles para una cuenta nueva.

#### Scenario: No se puede dar de baja al único propietario

- **GIVEN** un usuario que es único propietario de una empresa activa
- **WHEN** intenta darse de baja
- **THEN** la operación se rechaza
- **AND** se indica que debe transferir la propiedad primero

#### Scenario: El historial sobrevive a la baja

- **GIVEN** un usuario con cotizaciones creadas a su nombre
- **WHEN** su cuenta se da de baja
- **THEN** las cotizaciones siguen existiendo y siguen atribuidas a él

#### Scenario: El correo se libera

- **GIVEN** una cuenta dada de baja
- **WHEN** alguien se registra con ese mismo correo
- **THEN** el registro se completa

### Requirement: Captura pública de prospectos

Cualquier visitante SHALL poder dejar sus datos de contacto y un mensaje desde el formulario
público, sin crear una cuenta.

El prospecto SHALL recibir un acuse, y los administradores de plataforma SHALL poder consultarlos,
editarlos y descartarlos.

#### Scenario: Se registra un contacto sin cuenta

- **WHEN** un visitante envía el formulario público de contacto
- **THEN** el prospecto queda registrado
- **AND** el visitante recibe un acuse
- **AND** no se ha creado ninguna cuenta

### Requirement: Aceptación de un prospecto

Un administrador de plataforma SHALL poder convertir un prospecto en cuenta.

La cuenta resultante SHALL quedar verificada y activa, su titular SHALL recibir un enlace de un solo
uso para establecer su contraseña, y el prospecto SHALL desaparecer de la bandeja de pendientes.

La implementación anterior no llegaba a eliminar el prospecto aceptado (ver `DEFECTS.md` L-02).

#### Scenario: El prospecto se convierte y sale de la bandeja

- **WHEN** un administrador acepta un prospecto
- **THEN** se crea la cuenta verificada y activa
- **AND** el titular recibe el enlace para establecer su contraseña
- **AND** el prospecto ya no figura entre los pendientes

#### Scenario: Un prospecto con correo ya registrado no duplica

- **GIVEN** un prospecto cuyo correo ya tiene cuenta
- **WHEN** se intenta aceptar
- **THEN** la operación se rechaza indicando que la cuenta ya existe
