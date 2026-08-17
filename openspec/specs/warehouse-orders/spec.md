# Pedidos de almacén

## Purpose

La unidad de trabajo del operador del almacén: *alguien quiere este equipo*. Es lo que aparece en su
bandeja por la mañana y lo que va empujando hasta cerrarlo.

Un pedido de almacén llega por **dos vías** que se comportan distinto:

| Origen | Cómo nace | Estado inicial |
|---|---|---|
| Compra en tienda pública | El pago ya se cobró; el pedido nace resuelto | Finalizado |
| Orden de compra de una producción | Es una solicitud; hay que valorarla y cotizarla | Pendiente |

La segunda es la interesante. Una producción de **otra empresa** pide equipo, y el almacén decide si
lo acepta. Aceptar no es un simple cambio de estado: **genera automáticamente una cotización** con
las líneas del pedido y con el inventario ya apartado, que es lo que el almacén enviará al cliente.

Ver `production-procurement` para el lado de quien pide, y `quotations` para el documento que
resulta.

### Estados

| Estado | Significado |
|---|---|
| Pendiente | Recibido, sin valorar |
| Aceptado | El almacén lo toma; existe su cotización |
| Entregado | El equipo salió |
| Finalizado | Cerrado |
| Cancelado | Rechazado o anulado |

## Requirements

### Requirement: Datos de un pedido de almacén

Un pedido SHALL pertenecer a un almacén y SHALL registrar su nombre, observaciones, código
identificativo único, su tipo —renta o venta—, su variante de origen, su cliente, su proveedor y su
estado.

SHALL poder referenciar el pedido de comprador o la orden de compra de producción que lo originó, y
la cotización que se generó al aceptarlo.

#### Scenario: Se registra un pedido con su origen

- **WHEN** se crea un pedido a partir de una orden de compra de producción
- **THEN** queda registrado con esa referencia y con variante de producción

### Requirement: Líneas de un pedido

Un pedido SHALL registrar sus líneas, cada una referenciando una medida de producto con su cantidad
y su orden de presentación.

Las líneas SHALL poder referenciar unidades concretas cuando el origen ya las hubiera determinado.

#### Scenario: Una compra pública trae sus unidades

- **GIVEN** una compra en tienda pública que reservó unidades concretas
- **WHEN** se materializa el pedido de almacén
- **THEN** sus líneas referencian esas unidades

### Requirement: Prioridad derivada del estado

Un pedido SHALL exponer una prioridad de presentación derivada de su estado, mayor cuanto más
temprano sea, y ligeramente superior cuando tenga cotización vinculada.

Los listados SHALL ordenarse por prioridad descendente por defecto, de modo que lo que requiere
atención aparezca primero.

#### Scenario: Lo pendiente encabeza la bandeja

- **GIVEN** un pedido pendiente, uno entregado y uno finalizado
- **WHEN** se listan
- **THEN** el pendiente aparece primero y el finalizado último

#### Scenario: La prioridad se recalcula al cambiar de estado

- **GIVEN** un pedido pendiente
- **WHEN** se acepta
- **THEN** su prioridad se recalcula conforme al estado nuevo

### Requirement: Aceptar un pedido genera su cotización

Aceptar un pedido SHALL pasarlo a aceptado y SHALL crear una cotización en progreso vinculada a él,
con el folio derivado del código del pedido y con una línea por cada línea del pedido.

La operación SHALL ser **atómica**: o quedan el pedido aceptado y su cotización creada con sus
reservas, o no cambia nada.

#### Scenario: Aceptar produce la cotización con el inventario apartado

- **WHEN** un operador acepta un pedido de tres líneas
- **THEN** el pedido queda aceptado
- **AND** existe una cotización en progreso vinculada con tres líneas
- **AND** las unidades correspondientes quedan en cotización

#### Scenario: Un fallo al reservar no acepta el pedido

- **GIVEN** un pedido cuya aceptación falla por existencia insuficiente
- **WHEN** se revierte
- **THEN** el pedido sigue pendiente
- **AND** no existe cotización
- **AND** no hay unidades apartadas

#### Scenario: Un pedido ya aceptado no se acepta dos veces

- **GIVEN** un pedido en estado aceptado
- **WHEN** se intenta aceptar de nuevo
- **THEN** la respuesta es `409`
- **AND** no se crea una segunda cotización

### Requirement: Aceptar con existencia insuficiente

Al aceptar, el sistema SHALL incluir por defecto sólo las líneas con existencia disponible
suficiente, e informar de las que quedaron fuera.

Quien acepta SHALL poder solicitar que se incluyan todas, en cuyo caso las líneas sin existencia
requieren la autorización explícita descrita en `stock-reservation`.

#### Scenario: Se informa de lo que no cabe

- **GIVEN** un pedido de cuatro líneas, una de ellas sin existencia suficiente
- **WHEN** se acepta sin solicitar incluir todas
- **THEN** la cotización se crea con tres líneas
- **AND** se informa de cuál quedó fuera y por qué

#### Scenario: Incluir todo exige autorizar la creación

- **GIVEN** el mismo pedido
- **WHEN** se acepta solicitando incluir todas las líneas
- **THEN** se requiere autorización explícita para crear el inventario faltante

### Requirement: Rechazar un pedido

Rechazar un pedido SHALL pasarlo a cancelado registrando quién lo rechazó, cuándo y por qué motivo.

El motivo SHALL ser obligatorio, porque lo lee quien hizo la solicitud desde otra empresa.

#### Scenario: El rechazo exige motivo

- **WHEN** se intenta rechazar un pedido sin indicar motivo
- **THEN** la operación se rechaza

#### Scenario: El rechazo queda atribuido

- **WHEN** un operador rechaza un pedido indicando el motivo
- **THEN** el pedido queda cancelado con ese motivo, su autor y su instante

### Requirement: El rechazo se propaga a la orden de compra

Cuando se rechace un pedido derivado de una orden de compra de producción, el sistema SHALL
comprobar si **todos** los pedidos hermanos de esa orden están cancelados, y en tal caso SHALL
cancelar también la orden de compra indicando que todos sus pedidos fueron rechazados.

#### Scenario: El último rechazo cancela la orden

- **GIVEN** una orden de compra con tres pedidos, dos ya cancelados
- **WHEN** se rechaza el tercero
- **THEN** la orden de compra queda cancelada
- **AND** su motivo indica que todos sus pedidos fueron rechazados

#### Scenario: Un rechazo parcial no cancela la orden

- **GIVEN** una orden de compra con tres pedidos, ninguno cancelado
- **WHEN** se rechaza uno
- **THEN** la orden de compra sigue vigente
- **AND** los otros dos pedidos siguen su curso

### Requirement: Cancelar la orden de compra cancela sus pedidos

Cuando se cancele o se elimine una orden de compra de producción, todos sus pedidos de almacén
SHALL quedar cancelados con el motivo correspondiente, y SHALL liberarse el inventario que
tuvieran apartado.

#### Scenario: La cancelación baja a todos los almacenes

- **GIVEN** una orden de compra con pedidos en tres almacenes distintos
- **WHEN** la producción la cancela
- **THEN** los tres pedidos quedan cancelados
- **AND** el inventario apartado en los tres se libera

### Requirement: Transiciones de estado permitidas

El sistema SHALL admitir únicamente las transiciones previstas y SHALL rechazar el resto con `409`.

Un pedido cancelado o finalizado no SHALL volver a un estado abierto.

#### Scenario: No se reabre un pedido cancelado

- **GIVEN** un pedido cancelado
- **WHEN** se intenta aceptar
- **THEN** la respuesta es `409`

### Requirement: Un pedido de compra pública nace resuelto

Un pedido derivado de una compra en tienda pública SHALL crearse ya finalizado, con sus unidades en
el estado que corresponda a la modalidad de la compra, sin pasar por aceptación ni cotización.

#### Scenario: Una compra pública no requiere aceptación

- **WHEN** se confirma el pago de una compra en tienda
- **THEN** el pedido de almacén resultante está finalizado
- **AND** no tiene cotización vinculada
- **AND** sus unidades quedan vendidas o rentadas según la modalidad

### Requirement: Eliminar un pedido

Eliminar un pedido SHALL eliminar sus líneas y su conversación, desvincular su cotización y liberar
el inventario que tuviera apartado por ella.

El sistema SHALL impedir eliminar un pedido con equipo entregado y sin devolver.

#### Scenario: No se elimina con equipo fuera

- **GIVEN** un pedido entregado con unidades rentadas
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza indicando que hay equipo pendiente de retorno

### Requirement: Indicador de mensajes sin leer

Un pedido SHALL exponer cuántos mensajes de su conversación no ha leído la parte que lo consulta,
para que la bandeja señale los que requieren respuesta.

#### Scenario: El contador es por parte

- **GIVEN** una conversación con tres mensajes del cliente sin leer por el proveedor
- **WHEN** el proveedor consulta su bandeja
- **THEN** el pedido indica tres mensajes sin leer
- **AND** para el cliente indica cero

### Requirement: Búsqueda y filtrado de pedidos

Los pedidos de un almacén SHALL poder buscarse por nombre y observaciones, y filtrarse por estado,
tipo, variante de origen, cliente y rango de fechas.

#### Scenario: Se filtran los pendientes

- **WHEN** se listan los pedidos filtrando por pendientes
- **THEN** sólo aparecen los que están en ese estado
