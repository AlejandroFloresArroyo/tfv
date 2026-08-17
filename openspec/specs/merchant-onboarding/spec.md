# Alta de comercio

## Purpose

Para que una empresa pueda **cobrar a sus propios clientes** a través de la plataforma, no basta con
que esté suscrita: tiene que darse de alta como comercio ante el procesador de pagos, aportando sus
datos fiscales, su cuenta bancaria y los datos de su representante legal.

El modelo de cobro es de **cargo con destino**: el comprador paga a la plataforma, la plataforma
retiene su comisión y transfiere el resto a la cuenta de la empresa vendedora. Sin cuenta de
comercio verificada no hay a dónde transferir, así que la tienda pública no puede vender.

El alta está orientada a México: la cuenta bancaria se identifica por CLABE y el representante
aporta su registro fiscal.

Una empresa puede tener varios perfiles de facturación —distintas razones sociales, distintas
cuentas—, pero **sólo uno es el primario**, y es el que recibe el dinero de las ventas.

### Estados de un perfil

| Estado | Significado |
|---|---|
| Pendiente | Recién creado, aún sin cuenta de comercio |
| Limitado | Cuenta creada; falta documentación para operar plenamente |
| Activo | Puede recibir cobros y transferencias |
| Inactivo | Deshabilitado |

## Requirements

### Requirement: Datos de un perfil de facturación

Un perfil SHALL registrar un alias, la dirección fiscal, los datos del negocio, los datos
bancarios, los datos del representante legal y su estado.

Los datos del negocio SHALL incluir su tipo —persona física, persona moral, entidad gubernamental o
sin ánimo de lucro—, su razón social, su registro fiscal, su régimen fiscal, su uso de comprobante
y sus datos de contacto.

Los datos del representante SHALL incluir su nombre, su registro fiscal, su fecha de nacimiento, su
domicilio, sus datos de contacto y su relación con el negocio.

#### Scenario: Se crea un perfil completo

- **WHEN** un miembro con permiso crea un perfil con todos sus datos
- **THEN** el perfil queda registrado en estado pendiente

### Requirement: Validación de la cuenta bancaria

El sistema SHALL validar que la cuenta bancaria aportada tenga el formato de una CLABE de dieciocho
dígitos antes de intentar registrarla.

#### Scenario: Una CLABE con longitud incorrecta se rechaza

- **WHEN** se aporta una cuenta bancaria que no tiene dieciocho dígitos
- **THEN** la respuesta es `400`
- **AND** no se intenta crear la cuenta de comercio

### Requirement: El representante debe ser mayor de edad

El sistema SHALL rechazar un perfil cuyo representante legal no alcance la mayoría de edad según su
fecha de nacimiento.

#### Scenario: Un representante menor de edad se rechaza

- **WHEN** se aporta una fecha de nacimiento que implica menos de dieciocho años
- **THEN** la respuesta es `400`

### Requirement: Creación de la cuenta de comercio

Al crear un perfil, el sistema SHALL dar de alta la cuenta de comercio correspondiente ante el
procesador de pagos, registrar en ella la cuenta bancaria y al representante legal, y guardar la
referencia resultante junto con sus indicadores de capacidad.

El perfil SHALL quedar en estado limitado tras el alta, hasta que el procesador confirme que puede
operar plenamente.

#### Scenario: El alta deja el perfil limitado

- **WHEN** se crea un perfil con datos válidos
- **THEN** se da de alta la cuenta de comercio
- **AND** el perfil pasa a estado limitado
- **AND** conserva la referencia de la cuenta

#### Scenario: Un fallo del procesador no deja el perfil a medias

- **GIVEN** un fallo al dar de alta la cuenta de comercio
- **WHEN** se procesa
- **THEN** el perfil no queda creado
- **AND** el error se comunica de forma comprensible

### Requirement: Aceptación de términos con trazabilidad

Al dar de alta la cuenta de comercio, el sistema SHALL registrar el instante y el origen desde el
que se aceptaron los términos del procesador de pagos.

#### Scenario: Queda constancia de la aceptación

- **WHEN** se crea un perfil
- **THEN** la cuenta de comercio registra cuándo y desde dónde se aceptaron los términos

### Requirement: Sólo un perfil primario por empresa

Una empresa SHALL tener como máximo un perfil de facturación marcado como primario.

Marcar uno como primario SHALL desmarcar al anterior. El primer perfil creado SHALL quedar marcado
automáticamente.

#### Scenario: Marcar uno desmarca el anterior

- **GIVEN** una empresa con el perfil A como primario
- **WHEN** se marca el perfil B como primario
- **THEN** B queda como primario y A deja de estarlo

#### Scenario: El primer perfil es primario

- **GIVEN** una empresa sin perfiles
- **WHEN** se crea el primero
- **THEN** queda marcado como primario

### Requirement: Sólo un perfil operativo permite cobrar

Una empresa SHALL poder recibir cobros de su tienda pública únicamente cuando tenga un perfil
**primario** en estado activo o limitado y con cuenta de comercio registrada.

Cuando no lo tenga, la creación de una sesión de pago SHALL rechazarse con un mensaje que explique
qué falta.

#### Scenario: Sin perfil operativo no se vende

- **GIVEN** una empresa cuyo único perfil está en estado pendiente
- **WHEN** un comprador intenta pagar en su tienda
- **THEN** la operación se rechaza
- **AND** el mensaje indica que el comercio no está habilitado para cobros

#### Scenario: Un perfil limitado sí permite cobrar

- **GIVEN** una empresa con perfil primario en estado limitado y cuenta registrada
- **WHEN** un comprador paga en su tienda
- **THEN** la operación se completa

#### Scenario: Un perfil activo que no es el primario no habilita

- **GIVEN** una empresa cuyo perfil activo no es el primario y cuyo primario está pendiente
- **WHEN** un comprador intenta pagar
- **THEN** la operación se rechaza

### Requirement: Enlace de verificación con el procesador

El sistema SHALL poder generar un enlace de un solo uso que lleve al responsable de la empresa al
formulario del procesador de pagos para completar o corregir la documentación de su cuenta.

Al terminar, el procesador SHALL devolverlo a la pantalla de facturación de su empresa.

#### Scenario: Se obtiene el enlace de verificación

- **GIVEN** un perfil en estado limitado
- **WHEN** un miembro con permiso solicita verificarlo
- **THEN** recibe un enlace al formulario del procesador
- **AND** al completarlo vuelve a la pantalla de facturación de su empresa

### Requirement: El estado del perfil sigue al del procesador

El sistema SHALL actualizar el estado del perfil y sus indicadores de capacidad cuando el procesador
comunique un cambio en la cuenta de comercio.

Un perfil SHALL pasar a activo cuando la cuenta pueda aceptar cargos, y a limitado cuando no.
El estado de verificación SHALL reflejar si queda documentación pendiente.

#### Scenario: La cuenta habilitada activa el perfil

- **GIVEN** un perfil en estado limitado
- **WHEN** el procesador comunica que la cuenta ya acepta cargos y no queda documentación pendiente
- **THEN** el perfil pasa a activo
- **AND** su estado de verificación pasa a verificado

#### Scenario: Documentación pendiente mantiene el perfil limitado

- **WHEN** el procesador comunica que la cuenta tiene requisitos pendientes
- **THEN** el estado de verificación es pendiente
- **AND** el perfil no pasa a activo

### Requirement: Consulta del perfil operativo

El sistema SHALL exponer, para una empresa, cuál es su perfil de facturación operativo, tanto para
sus miembros como para la tienda pública que necesita saber si puede cobrar.

La consulta pública no SHALL revelar datos fiscales ni bancarios.

#### Scenario: La tienda sabe si puede cobrar

- **WHEN** la tienda pública consulta el perfil operativo de su empresa
- **THEN** obtiene si existe y está habilitado para cobros
- **AND** no obtiene la cuenta bancaria ni el registro fiscal

### Requirement: Modificación de un perfil

Un miembro con permiso SHALL poder modificar los datos de un perfil, y el sistema SHALL propagar al
procesador de pagos los cambios que le afecten.

#### Scenario: Un cambio bancario se propaga

- **WHEN** se actualiza la cuenta bancaria de un perfil
- **THEN** el cambio se registra en la cuenta de comercio

### Requirement: Eliminación de un perfil

Eliminar un perfil SHALL dar de baja su cuenta de comercio y, cuando fuese el primario, SHALL
promover otro a primario si lo hay.

El sistema SHALL impedir eliminar un perfil con transferencias pendientes de liquidar.

#### Scenario: Se promueve un sustituto

- **GIVEN** una empresa con dos perfiles, uno de ellos primario
- **WHEN** se elimina el primario
- **THEN** el otro queda marcado como primario

#### Scenario: No se elimina con dinero pendiente

- **GIVEN** un perfil con transferencias pendientes de liquidar
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza
- **AND** se indica el motivo

### Requirement: Registro de cobros recibidos por la empresa

Cada cobro que una empresa reciba de sus compradores SHALL registrarse con su importe, la comisión
retenida, el importe neto, el medio de pago, el comprador, el perfil de facturación y su estado.

Los miembros con permiso SHALL poder consultar ese historial.

#### Scenario: Un cobro deja su registro

- **WHEN** se confirma un cobro en la tienda de una empresa
- **THEN** queda un registro con el importe bruto, la comisión y el neto
- **AND** aparece en el historial de cobros de esa empresa
