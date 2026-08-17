# Conversación de pedido

## Purpose

Un canal de conversación en tiempo real por cada pedido de almacén, entre **dos lados**: el cliente
que pidió el equipo y el proveedor que lo suministra. Sirve para lo que siempre acaba haciendo falta
—ajustar cantidades, avisar de un retraso, confirmar una recogida— sin salirse del pedido.

Es la única superficie en tiempo real de todo el sistema.

Dos particularidades que condicionan el diseño:

- **Los acuses de lectura son por lado, no por persona.** Si tres personas del almacén están en la
  conversación y una lee, queda leído para el lado del proveedor. Es lo correcto aquí: el cliente
  quiere saber si *el almacén* lo vio, no quién concretamente.
- **Los mensajes se envían de forma optimista.** Aparecen en pantalla antes de que el servidor los
  confirme, y se reconcilian cuando llega la confirmación.

### Protocolo

| Del cliente al servidor | Efecto |
|---|---|
| Entrar | Se une a la conversación y recibe el historial |
| Marcar leído | Marca como leídos los mensajes del otro lado |
| Pedir mensajes | Solicita el historial de nuevo |
| Enviar mensaje | Publica un mensaje |
| Editar mensaje | Modifica uno propio |
| Borrar mensaje | Elimina uno propio |
| Salir | Abandona la conversación |

| Del servidor al cliente | Cuándo |
|---|---|
| Entrada confirmada | Al entrar: historial, participantes y estado de lectura |
| Mensaje recibido | Confirmación del propio mensaje, con su referencia temporal |
| Mensaje nuevo | Otro participante envió algo |
| Mensaje editado | Otro participante editó |
| Mensaje borrado | Otro participante borró |
| Lecturas actualizadas | Cambió el estado de lectura |
| Participantes actualizados | Alguien entró o salió |
| Error | La operación no se pudo atender |

## Requirements

### Requirement: La conexión se autentica al establecerse

El sistema SHALL verificar la credencial del solicitante **al establecer la conexión**, y SHALL
rechazarla cuando no verifique, cuando haya caducado, o cuando quien la presenta no sea parte del
pedido.

La credencial SHALL viajar de forma que no quede registrada en los registros de servidor ni de
intermediarios.

La implementación anterior enviaba la credencial en la cadena de consulta, la comprobaba en cada
mensaje en lugar de al conectar, y **sólo la decodificaba sin verificar la firma**
(ver `DEFECTS.md` S-10).

#### Scenario: Una credencial no verificable no conecta

- **WHEN** se intenta abrir la conexión con una credencial cuya firma no valida
- **THEN** la conexión se rechaza y se cierra

#### Scenario: Un tercero no entra en la conversación

- **GIVEN** un usuario que no es parte del pedido
- **WHEN** intenta conectarse a su conversación
- **THEN** la conexión se rechaza

#### Scenario: La credencial no queda en los registros

- **WHEN** se establece una conexión
- **THEN** la credencial no aparece en la dirección solicitada

### Requirement: Entrar en la conversación

Al entrar, el sistema SHALL devolver a quien entra el historial de mensajes ordenado del más
reciente al más antiguo, la lista de participantes conectados y el estado de lectura.

SHALL marcar como leídos los mensajes pendientes dirigidos a su lado, y SHALL avisar al resto de que
alguien entró.

#### Scenario: Entrar entrega el contexto completo

- **WHEN** un participante entra en la conversación
- **THEN** recibe el historial, los participantes conectados y el estado de lectura

#### Scenario: Entrar marca lo pendiente como leído

- **GIVEN** tres mensajes del cliente sin leer por el proveedor
- **WHEN** un usuario del lado del proveedor entra
- **THEN** los tres quedan leídos
- **AND** el cliente recibe el aviso de lecturas actualizadas

#### Scenario: El resto ve que alguien entró

- **GIVEN** dos participantes conectados
- **WHEN** entra un tercero
- **THEN** los dos anteriores reciben la lista de participantes actualizada

### Requirement: Envío optimista con reconciliación

Al enviar un mensaje, quien lo envía SHALL poder incluir una referencia temporal propia, y el
servidor SHALL devolvérsela junto con el mensaje ya persistido.

Esto permite mostrar el mensaje en pantalla de inmediato y sustituirlo por el confirmado sin
duplicarlo.

#### Scenario: El mensaje propio no se duplica

- **WHEN** un participante envía un mensaje con su referencia temporal
- **THEN** recibe la confirmación con esa misma referencia y el mensaje persistido
- **AND** el mensaje aparece una sola vez en su pantalla

#### Scenario: Los demás reciben el mensaje nuevo

- **WHEN** un participante envía un mensaje
- **THEN** el resto de conectados lo recibe como mensaje nuevo
- **AND** sin la referencia temporal de quien lo envió

### Requirement: Acuses de lectura por lado

El estado de lectura de un mensaje SHALL registrarse por **lado** —cliente y proveedor— y no por
persona.

Que cualquier participante de un lado lea un mensaje SHALL marcarlo como leído para todo ese lado.

#### Scenario: Un lado lee por todos los suyos

- **GIVEN** dos usuarios conectados por el lado del proveedor
- **WHEN** uno de ellos lee los mensajes del cliente
- **THEN** quedan leídos para el lado del proveedor
- **AND** el cliente ve que se leyeron

#### Scenario: Leer no afecta al otro lado

- **GIVEN** mensajes de ambos lados sin leer
- **WHEN** el proveedor lee los del cliente
- **THEN** los del proveedor siguen sin leer para el cliente

### Requirement: Editar y borrar los mensajes propios

Un participante SHALL poder editar y borrar únicamente los mensajes que él envió, y el cambio SHALL
comunicarse a todos los conectados a esa conversación.

Un mensaje editado SHALL indicar que lo fue.

#### Scenario: No se editan mensajes ajenos

- **WHEN** un participante intenta editar un mensaje de otro
- **THEN** la operación se rechaza

#### Scenario: El borrado llega a todos

- **GIVEN** tres participantes conectados
- **WHEN** uno borra un mensaje suyo
- **THEN** los otros dos reciben el aviso de borrado
- **AND** el mensaje desaparece de su pantalla

### Requirement: La difusión llega a todos los participantes

Todo aviso derivado de un mensaje SHALL entregarse a **todos** los participantes conectados a esa
conversación, con independencia de a qué instancia del servidor esté conectado cada uno.

La implementación anterior mantenía el registro de participantes en la memoria de un solo proceso,
de modo que sólo funcionaba con una instancia (ver `DEFECTS.md` O-08), y además dirigía el aviso de
borrado a un destinatario equivocado, con lo que nadie lo recibía (ver `DEFECTS.md` L-08).

#### Scenario: Dos instancias comparten la conversación

- **GIVEN** dos participantes conectados a instancias distintas del servidor
- **WHEN** uno envía un mensaje
- **THEN** el otro lo recibe

#### Scenario: El borrado alcanza a los conectados

- **GIVEN** participantes conectados a instancias distintas
- **WHEN** uno borra un mensaje
- **THEN** todos reciben el aviso

### Requirement: Salir de la conversación

Al salir, el sistema SHALL retirar al participante de la conversación y SHALL avisar al resto de que
la lista de participantes cambió.

Una desconexión inesperada SHALL tratarse igual que una salida.

#### Scenario: Una desconexión actualiza la presencia

- **GIVEN** tres participantes conectados
- **WHEN** uno pierde la conexión sin avisar
- **THEN** los otros dos ven la lista de participantes actualizada

### Requirement: Reconexión automática

Cuando la conexión se pierda de forma inesperada, el cliente SHALL intentar restablecerla y, al
lograrlo, SHALL recuperar el historial para no perder los mensajes recibidos mientras estuvo
desconectado.

Los intentos SHALL espaciarse progresivamente y SHALL informar del estado de la conexión.

#### Scenario: Se recupera lo perdido al reconectar

- **GIVEN** un participante que pierde la conexión
- **AND** mensajes enviados durante ese lapso
- **WHEN** la conexión se restablece
- **THEN** el participante ve esos mensajes

#### Scenario: El estado de la conexión es visible

- **WHEN** la conexión se pierde
- **THEN** la interfaz indica que está reconectando
- **AND** al lograrlo indica que la conexión se restableció

### Requirement: Un mensaje mal formado no rompe la conexión

El sistema SHALL responder con error a un mensaje que no reconozca o que no cumpla el protocolo, y
SHALL mantener la conexión abierta.

#### Scenario: Un tipo desconocido devuelve error sin cortar

- **WHEN** se envía un mensaje de un tipo no previsto en el protocolo
- **THEN** se recibe un error descriptivo
- **AND** la conexión sigue abierta

### Requirement: La conversación pertenece al pedido

Toda conversación SHALL pertenecer a exactamente un pedido de almacén, y sus mensajes SHALL ser
accesibles únicamente a las partes de ese pedido.

Eliminar el pedido SHALL eliminar su conversación.

#### Scenario: La conversación es privada del pedido

- **WHEN** un miembro de una empresa ajena al pedido intenta leer su conversación
- **THEN** la respuesta es `404`

### Requirement: Historial consultable sin conexión persistente

El historial de una conversación SHALL poder consultarse mediante una lectura ordinaria, de forma
paginada, sin necesidad de establecer una conexión en tiempo real.

#### Scenario: Se lee el historial sin conectarse

- **WHEN** una parte del pedido solicita el historial de la conversación
- **THEN** lo recibe paginado
- **AND** no ha hecho falta abrir una conexión persistente

### Requirement: Mensajes del sistema

El sistema SHALL poder publicar mensajes propios en la conversación para reflejar hitos del pedido
—aceptación, rechazo, entrega—, distinguibles de los de las personas.

Un mensaje del sistema no SHALL poder editarse ni borrarse.

#### Scenario: La aceptación deja constancia en la conversación

- **WHEN** un operador acepta el pedido
- **THEN** aparece un mensaje del sistema que lo indica
- **AND** no puede editarse ni borrarse
