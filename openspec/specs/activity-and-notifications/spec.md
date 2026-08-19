# Actividad y notificaciones

## Purpose

Cada vez que alguien crea, modifica o elimina algo dentro de una empresa, ocurren dos cosas
inseparables: queda un **asiento de bitácora** y se **avisa a quien corresponda**. Son la misma
carga útil vista desde dos ángulos, y por eso viven en la misma capability.

Lo interesante es cómo se decide a quién avisar. La audiencia **no** son todos los miembros: se
determina por permiso. Si una acción está asociada al permiso de editar cotizaciones, sólo la
reciben los miembros cuyo rol lo tenga concedido, más los propietarios, que reciben siempre todo.

Esto crea un vínculo importante con `access-control`: la misma clave de permiso que **autoriza** una
acción **selecciona** a quién se le notifica. En la implementación anterior sólo hacía lo segundo;
ahora hace ambas cosas, y deben coincidir.

La entrega llega por tres canales que el usuario controla: bandeja dentro de la aplicación,
notificación push al navegador y correo.

### Tipos de notificación

| Tipo | Cuándo | Destinatario |
|---|---|---|
| Bienvenida | Alta de una cuenta, por registro propio o por invitación | El nuevo usuario |
| Invitación | Un administrador crea la cuenta de un miembro | El invitado |
| Acceso temporal | Un prospecto se convierte en cuenta | El nuevo usuario |
| Recuperación de contraseña | Se solicita restablecer la contraseña | El titular de la cuenta |
| Prospecto recibido | Alguien deja sus datos en el formulario público | El prospecto |
| Actividad | Cualquier acción sobre una empresa | La audiencia por permiso |
| Factura pagada | Se cobra un periodo de suscripción | El titular de la suscripción |
| Factura próxima | Se acerca el cobro de un periodo | El titular de la suscripción |
| Fallo de cobro | No se pudo cobrar un periodo | El titular de la suscripción |
| Suscripción modificada | Cambia el plan, la cantidad o el periodo | El titular de la suscripción |
| Suscripción terminada | La suscripción se da de baja | El titular de la suscripción |

## Requirements

### Requirement: Toda mutación deja un asiento de actividad

Toda operación de creación, modificación o eliminación sobre datos de una empresa SHALL registrar
un asiento de actividad que identifique **qué** se hizo, **sobre qué entidad**, **quién** lo hizo,
**cuándo** y **desde qué origen**.

El asiento SHALL incluir una referencia navegable a la entidad afectada y un nombre legible que
permita identificarla sin abrirla.

#### Scenario: Una creación queda registrada

- **WHEN** un miembro crea una cotización
- **THEN** se registra un asiento con acción de creación
- **AND** identifica la cotización, a su autor y el instante
- **AND** incluye una referencia que lleva a esa cotización

#### Scenario: El origen queda diferenciado

- **WHEN** la misma acción se realiza desde la aplicación web y desde una integración automatizada
- **THEN** los asientos resultantes se distinguen por su origen

### Requirement: El asiento es transaccional con la mutación

El asiento de actividad SHALL escribirse en la misma transacción que la mutación que lo origina.

Si la mutación se revierte, el asiento no SHALL existir. Si el asiento no puede escribirse, la
mutación no SHALL confirmarse.

#### Scenario: Una mutación revertida no deja rastro

- **GIVEN** una operación que falla después de haber modificado datos
- **WHEN** la transacción se revierte
- **THEN** no queda asiento de actividad de esa operación

#### Scenario: Una acción denegada no registra nada

- **GIVEN** un miembro sin el permiso requerido
- **WHEN** intenta la operación
- **THEN** no se registra asiento alguno

### Requirement: La audiencia se determina por permiso

La audiencia de la notificación de una actividad SHALL ser el conjunto de miembros cuyo rol tenga
concedido el permiso asociado a esa acción, más **todos los propietarios**, que la reciben siempre.

Cuando una acción declare varios permisos, un miembro SHALL pertenecer a la audiencia sólo si los
tiene **todos** concedidos.

#### Scenario: Sólo los autorizados reciben el aviso

- **GIVEN** una empresa con un propietario, un miembro con permiso de cotizaciones y otro sin él
- **WHEN** se crea una cotización
- **THEN** el propietario y el miembro con permiso reciben la notificación
- **AND** el tercero no la recibe

#### Scenario: El propietario recibe todo

- **GIVEN** un propietario cuyo rol no concede ningún permiso
- **WHEN** ocurre cualquier actividad en su empresa
- **THEN** la recibe

#### Scenario: Varios permisos exigen todos

- **GIVEN** una acción que declara dos permisos
- **AND** un miembro que sólo tiene concedido uno
- **WHEN** ocurre la acción
- **THEN** ese miembro no pertenece a la audiencia

### Requirement: El autor no se notifica a sí mismo

Quien realiza la acción no SHALL recibir la notificación de su propia actividad, aunque pertenezca
a la audiencia por permiso.

El asiento de bitácora sí SHALL registrarse y ser visible para él.

#### Scenario: El autor ve el asiento pero no recibe aviso

- **WHEN** un propietario crea un producto
- **THEN** el asiento aparece en la bitácora de la empresa
- **AND** ese propietario no recibe notificación
- **AND** el resto de la audiencia sí

### Requirement: La entrega no bloquea ni hace fallar la mutación

La entrega de notificaciones SHALL ser asíncrona respecto de la mutación que las origina.

Un fallo del proveedor de notificaciones no SHALL hacer fallar la operación de negocio, y SHALL
quedar registrado y ser reintentable.

#### Scenario: El proveedor caído no rompe la operación

- **GIVEN** el proveedor de notificaciones no disponible
- **WHEN** un miembro crea una cotización
- **THEN** la cotización se crea correctamente
- **AND** la respuesta no informa de error
- **AND** la entrega pendiente queda encolada para reintento

#### Scenario: Una entrega fallida se reintenta

- **GIVEN** una notificación cuya entrega falló de forma transitoria
- **WHEN** se ejecuta el reintento
- **THEN** se entrega
- **AND** no se duplica si la primera había llegado

### Requirement: Los avisos nunca contienen credenciales

Ninguna notificación SHALL incluir una contraseña, ni temporal ni definitiva, en su carga útil.

Cuando haya que dar acceso inicial a una cuenta creada por un tercero, SHALL enviarse un enlace de
un solo uso y vigencia limitada para que el titular establezca su propia contraseña
(ver `DEFECTS.md` S-09).

#### Scenario: Una invitación no lleva contraseña

- **WHEN** un administrador crea la cuenta de un nuevo miembro
- **THEN** el invitado recibe un enlace para establecer su contraseña
- **AND** la notificación no contiene ninguna contraseña
- **AND** el enlace caduca y sólo puede usarse una vez

### Requirement: Bandeja de notificaciones por usuario

Cada usuario SHALL disponer de una bandeja con sus notificaciones, ordenadas de más reciente a más
antigua, y SHALL poder marcarlas como leídas o no leídas y archivarlas o desarchivarlas.

La bandeja SHALL permitir filtrar por no leídas, leídas y archivadas, y SHALL cargarse por páginas.

#### Scenario: Marcar como leída actualiza el contador

- **GIVEN** un usuario con tres notificaciones sin leer
- **WHEN** marca una como leída
- **THEN** el contador de no leídas pasa a dos
- **AND** la notificación sigue estando en la bandeja

#### Scenario: Archivar la saca de las activas

- **WHEN** el usuario archiva una notificación
- **THEN** deja de aparecer entre las leídas y las no leídas
- **AND** aparece entre las archivadas

### Requirement: Contador de no leídas y aviso de novedades

El sistema SHALL exponer el número de notificaciones sin leer de un usuario, y SHALL poder indicar
cuántas han llegado desde la última vez que abrió la bandeja.

El indicador de novedades SHALL reiniciarse **al abrir la bandeja**, no al disminuir el contador de
no leídas. Son dos preguntas distintas: haberlas visto pasar no es haberlas leído, y con la regla
anterior —«se reinicia cuando el contador disminuya»— marcar una sola como leída borraba el aviso de
las otras cuatro que acababan de llegar (ver `HALLAZGOS.md` H-78).

#### Scenario: Llegan avisos mientras la bandeja está cerrada

- **GIVEN** un usuario que cerró la bandeja con dos no leídas
- **WHEN** llegan tres notificaciones más
- **THEN** el contador indica cinco
- **AND** el indicador de novedades señala tres

### Requirement: Notificación push al navegador

Un usuario SHALL poder autorizar notificaciones push en su navegador, y el sistema SHALL registrar
el dispositivo asociándolo a su cuenta.

Un mismo usuario SHALL poder tener varios dispositivos registrados, sin duplicados, y SHALL poder
revocarlos.

#### Scenario: Se registra un segundo dispositivo

- **GIVEN** un usuario con un dispositivo ya registrado
- **WHEN** autoriza las notificaciones en otro navegador
- **THEN** ambos dispositivos quedan registrados
- **AND** las notificaciones llegan a los dos

#### Scenario: Registrar el mismo dispositivo no duplica

- **WHEN** el mismo dispositivo se registra de nuevo
- **THEN** sigue habiendo un solo registro para él

### Requirement: El aviso push resume la actividad

Una notificación push de actividad SHALL llevar un título con el nombre de la entidad afectada, un
cuerpo que indique quién hizo qué, y una referencia que lleve a la entidad al pulsarla.

El cuerpo SHALL estar en español y SHALL sanearse de cualquier marcado antes de mostrarse.

#### Scenario: Pulsar el aviso abre la entidad

- **WHEN** un usuario pulsa una notificación push de una cotización creada
- **THEN** la aplicación se abre en esa cotización
- **AND** si ya estaba abierta en otra pestaña, se enfoca esa

#### Scenario: El texto no arrastra marcado

- **GIVEN** una entidad cuya descripción contiene marcado enriquecido
- **WHEN** se genera el aviso push
- **THEN** el cuerpo muestra el texto plano, sin etiquetas

### Requirement: Los datos del destinatario se mantienen al día

El sistema SHALL mantener sincronizados con el proveedor de notificaciones el nombre, el correo, el
teléfono y el avatar de cada usuario, y SHALL actualizarlos cuando cambien en el perfil.

El destinatario SHALL crearse en el proveedor la primera vez que se le envíe algo, sin exigir un
alta previa.

#### Scenario: Cambiar el nombre se propaga

- **WHEN** un usuario actualiza su nombre en el perfil
- **THEN** el proveedor de notificaciones refleja el nombre nuevo

#### Scenario: El primer envío crea al destinatario

- **GIVEN** un usuario que nunca ha recibido notificaciones
- **WHEN** se le envía la primera
- **THEN** el destinatario se crea automáticamente y la recibe

### Requirement: Bitácora de la empresa consultable

Los miembros de una empresa SHALL poder consultar su bitácora de actividad de forma paginada,
filtrable por servicio, por tipo de acción, por autor y por rango de fechas.

Un usuario SHALL poder consultar además su propia actividad a través de todas las empresas a las
que pertenece.

#### Scenario: Se filtra la bitácora por servicio

- **WHEN** un miembro consulta la bitácora filtrando por el servicio de almacenes
- **THEN** sólo aparecen asientos originados en ese servicio

#### Scenario: La actividad propia cruza empresas

- **GIVEN** un usuario miembro de dos empresas con actividad en ambas
- **WHEN** consulta su actividad personal
- **THEN** aparecen los asientos de ambas empresas

### Requirement: La bitácora es de sólo anexado

Un asiento de actividad no SHALL poder modificarse ni eliminarse una vez escrito.

#### Scenario: No se puede alterar un asiento

- **WHEN** se intenta modificar un asiento de la bitácora
- **THEN** la operación se rechaza

### Requirement: Preferencias de canal por usuario

Un usuario SHALL poder elegir por qué canales **salientes** —empuje y correo— desea recibir cada
categoría de notificación, y el sistema SHALL respetar esa elección.

La bandeja no SHALL poder apagarse. Es el registro de lo ocurrido, no un aviso: lo que se elige es
si además se avisa hacia fuera. Un requisito anterior la trataba como un canal más y, con ella
apagada, una actividad de la que alguien forma parte de la audiencia no dejaría rastro **para él**
en ninguna parte, mientras el resto de la empresa sí la vería — el mismo hecho, visible para unos e
inexistente para otros (ver `HALLAZGOS.md` H-77).

Las notificaciones críticas de cuenta —recuperación de contraseña y verificación de correo— SHALL
entregarse siempre por correo, con independencia de las preferencias.

#### Scenario: La bandeja no se apaga

- **WHEN** un usuario intenta desactivar el canal de bandeja para una categoría
- **THEN** la operación se rechaza
- **AND** se le dice que la bandeja es el registro de lo ocurrido

#### Scenario: Se desactiva el push de actividad

- **GIVEN** un usuario que ha desactivado el canal push para las actividades
- **WHEN** ocurre una actividad de la que forma parte de la audiencia
- **THEN** aparece en su bandeja
- **AND** no recibe aviso push

#### Scenario: La recuperación siempre llega por correo

- **GIVEN** un usuario que ha desactivado todos los canales que puede desactivar
- **WHEN** solicita recuperar su contraseña
- **THEN** recibe el correo
