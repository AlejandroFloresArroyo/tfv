# Clientes y proveedores

## Purpose

Con quién comercia una empresa. Un **cliente** es alguien a quien le vende o le renta; un
**proveedor** es alguien a quien le compra. Son la misma estructura vista desde los dos lados del
mostrador, por eso se especifican juntos.

Lo que los hace más que un CRM sencillo es que **se crean solos y en pareja**. Cuando una producción
de la empresa A le pide equipo a un almacén de la empresa B, el sistema registra automáticamente un
cliente en B —que representa a A— y un proveedor en A —que representa a B—. Las dos empresas ven la
relación desde su propio lado sin que nadie la haya dado de alta a mano.

Una contraparte puede representar a una persona suelta, a otra empresa del sistema, o a una empresa
externa de la que sólo se guardan datos sueltos. De ahí que conviva la referencia con la
información copiada.

## Requirements

### Requirement: Datos de una contraparte

Una contraparte SHALL registrar un alias, la referencia al usuario que la representa cuando exista,
la referencia a la empresa del sistema que representa cuando exista, y una copia de los datos de
contacto, de empresa y de domicilio.

La copia SHALL permitir registrar contrapartes que no corresponden a ningún usuario ni empresa del
sistema.

#### Scenario: Se registra una contraparte externa

- **WHEN** se crea un cliente aportando sólo nombre, correo y domicilio, sin referencia a usuario
- **THEN** queda registrado con esos datos copiados

#### Scenario: Se registra una contraparte del sistema

- **WHEN** se crea un proveedor referenciando a una empresa del sistema
- **THEN** queda registrado con esa referencia
- **AND** conserva además la copia de sus datos en el momento del alta

### Requirement: Las contrapartes pertenecen a una empresa

Toda contraparte SHALL pertenecer a exactamente una empresa, y SHALL ser visible únicamente para
sus miembros.

Que dos empresas tengan por contraparte a la misma persona no SHALL hacer que compartan el
registro.

#### Scenario: Dos empresas mantienen registros separados

- **GIVEN** la misma persona como cliente de la empresa A y de la empresa B
- **WHEN** la empresa A modifica el alias de su cliente
- **THEN** el registro de la empresa B no cambia

### Requirement: Gestión de clientes y proveedores

Un miembro con permiso SHALL poder crear, consultar, modificar y eliminar los clientes y los
proveedores de su empresa.

Ambas colecciones SHALL admitir paginación, búsqueda y filtros.

#### Scenario: Se busca un cliente por su alias

- **WHEN** un miembro busca por parte del alias de un cliente
- **THEN** aparece en los resultados

### Requirement: Aprovisionamiento automático en pareja

Cuando una empresa realice una compra a otra empresa del sistema, el sistema SHALL registrar
automáticamente la relación en ambos sentidos: un cliente en la empresa vendedora que representa a
la compradora, y un proveedor en la compradora que representa a la vendedora.

El aprovisionamiento SHALL ser idempotente: repetir la operación no SHALL duplicar los registros.

#### Scenario: Una compra entre empresas crea las dos contrapartes

- **GIVEN** una producción de la empresa A que pide equipo a un almacén de la empresa B
- **WHEN** se registra la orden de compra
- **THEN** la empresa B tiene un cliente que representa a la empresa A
- **AND** la empresa A tiene un proveedor que representa a la empresa B

#### Scenario: Una segunda compra no duplica

- **GIVEN** la relación ya establecida entre A y B
- **WHEN** la empresa A vuelve a pedir equipo a la empresa B
- **THEN** se reutilizan las contrapartes existentes
- **AND** no se crean registros nuevos

### Requirement: Una compra pública registra al comprador

Cuando alguien complete una compra en la tienda pública de una empresa, el sistema SHALL registrar
a ese comprador como cliente de esa empresa si aún no lo era.

#### Scenario: El comprador queda registrado como cliente

- **GIVEN** una persona que compra por primera vez en la tienda de una empresa
- **WHEN** el pago se confirma
- **THEN** figura como cliente de esa empresa

#### Scenario: Una segunda compra no crea otro cliente

- **GIVEN** un comprador ya registrado como cliente
- **WHEN** vuelve a comprar en la misma tienda
- **THEN** se reutiliza el cliente existente

### Requirement: Una contraparte en uso no se elimina sin más

El sistema SHALL impedir eliminar una contraparte referenciada por una cotización, un pedido o una
compra vigentes, e indicar qué la está usando.

Una contraparte que sólo aparezca en documentos históricos SHALL poder eliminarse con borrado
lógico, conservando esos documentos.

#### Scenario: Se rechaza eliminar una contraparte con pedidos vigentes

- **GIVEN** un cliente con un pedido en curso
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza
- **AND** se indica qué lo está usando

#### Scenario: El histórico sobrevive al borrado

- **GIVEN** un cliente que sólo figura en cotizaciones cerradas
- **WHEN** se elimina
- **THEN** deja de aparecer en los listados
- **AND** las cotizaciones cerradas siguen mostrándolo
