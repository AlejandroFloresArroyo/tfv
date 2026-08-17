# Materialización del pedido

## Purpose

Lo que ocurre cuando se confirma un pago de tienda pública. Es el punto del sistema donde una sola
señal externa —el evento de pago confirmado— genera **ocho entidades relacionadas** de golpe.

| Se crea | Para quién |
|---|---|
| Pago | Registro del cobro |
| Envío | Seguimiento del transporte |
| Pedido de comprador | El comprobante del comprador |
| Líneas del pedido | El detalle de lo comprado |
| Cliente | Alta del comprador en la cartera del comercio |
| Cobro del comercio | La entrada en su libro de ingresos |
| Pedido operativo | La orden de trabajo del almacén o de la tienda de mosaicos |
| Movimientos de inventario | El cambio de estado de las unidades |

Los tres defectos que más importan del sistema anterior están aquí: la secuencia **no era
transaccional**, **no era idempotente** —un reintento del procesador duplicaba pedidos— y una de sus
ramas creaba entidades hijas **fuera del ciclo de vida**, sin esperar y tragándose los errores
(ver `DEFECTS.md` M-02 y M-03).

## Requirements

### Requirement: La materialización es una transacción

Todas las entidades derivadas de un pago confirmado SHALL crearse de forma atómica: o quedan todas,
o no queda ninguna.

Ninguna parte SHALL ejecutarse fuera del ámbito transaccional, y ningún error SHALL descartarse en
silencio.

#### Scenario: Un fallo a mitad no deja rastro

- **GIVEN** una materialización que falla al crear el pedido operativo
- **WHEN** se revierte
- **THEN** no existen el pago, el envío, el pedido de comprador ni sus líneas
- **AND** las unidades conservan el estado que tenían

#### Scenario: Las entidades hijas se crean dentro de la transacción

- **WHEN** se materializa un pedido de mosaico con varias láminas
- **THEN** todas sus láminas y sus desgloses de color quedan creados al confirmarse la transacción
- **AND** un fallo en cualquiera de ellos revierte el conjunto

### Requirement: La materialización ocurre una sola vez

La materialización SHALL ejecutarse exactamente una vez por compra, con independencia de cuántas
veces se reciba el evento que la dispara.

La marca que garantiza la unicidad SHALL confirmarse **junto con** el resto del trabajo, no antes.

#### Scenario: Un reintento no duplica el pedido

- **GIVEN** una compra ya materializada
- **WHEN** el procesador reenvía el evento de pago confirmado
- **THEN** no se crea un segundo pedido, ni un segundo pago, ni movimientos adicionales
- **AND** se responde con éxito

#### Scenario: Un fallo previo permite reintentar

- **GIVEN** una materialización que falló y se revirtió por completo
- **WHEN** el procesador reenvía el evento
- **THEN** la materialización se ejecuta
- **AND** el pedido queda creado

### Requirement: Se parte de la instantánea de la compra

La materialización SHALL usar los importes, precios y artículos de la instantánea persistida al
crear la sesión de pago, y no volver a resolverlos contra el catálogo.

#### Scenario: Un cambio de catálogo no altera el pedido

- **GIVEN** una compra cuya instantánea registra un precio determinado
- **WHEN** el precio del catálogo cambia antes de confirmarse el pago
- **THEN** el pedido se materializa con el precio de la instantánea

### Requirement: Registro del pago

El sistema SHALL registrar el pago con su importe, moneda, comisión de la plataforma, porcentaje
aplicado, importe neto, medio de pago, referencias del procesador y su comprobante.

#### Scenario: El pago conserva el desglose

- **WHEN** se materializa una compra
- **THEN** el pago registra el importe bruto, la comisión y el neto por separado
- **AND** conserva las referencias del procesador para conciliación

### Requirement: El total del pedido refleja lo pagado

El total del pedido de comprador SHALL ser el importe que el comprador pagó, y SHALL registrarse por
separado el subtotal, el envío y la comisión retenida.

La implementación anterior fijaba el total igual al subtotal, ignorando el reparto, de modo que el
comprobante del comprador no cuadraba con lo cobrado (ver `DEFECTS.md` M-01).

#### Scenario: El comprobante cuadra con el cargo

- **GIVEN** una compra con subtotal de `1000.00` y envío de `199.00`
- **WHEN** se materializa
- **THEN** el total del pedido es `1199.00`
- **AND** coincide con el importe cargado al comprador

### Requirement: Registro del envío

El sistema SHALL crear el registro de envío con su modalidad, su costo, su estado inicial, su fecha
estimada de entrega, el domicilio de origen y el de destino.

Una compra con recolección en tienda SHALL registrar el envío como recolección, sin domicilio de
destino.

#### Scenario: El envío nace pendiente con fecha estimada

- **WHEN** se materializa una compra con envío a domicilio
- **THEN** el envío queda en estado pendiente
- **AND** tiene fecha estimada de entrega
- **AND** registra el domicilio de origen y el de destino

### Requirement: Pedido de comprador con sus líneas

El sistema SHALL crear el pedido de comprador vinculado a su pago y a su envío, con una línea por
cada artículo comprado, y con una referencia legible que el comprador pueda citar.

#### Scenario: El comprador obtiene su referencia

- **WHEN** se materializa una compra de tres artículos
- **THEN** el pedido tiene tres líneas
- **AND** tiene una referencia legible y única

### Requirement: Alta del comprador como cliente

El sistema SHALL registrar al comprador como cliente de la empresa vendedora si aún no lo era,
conforme a `clients-and-providers`.

#### Scenario: La primera compra da de alta al cliente

- **GIVEN** un comprador que compra por primera vez en una tienda
- **WHEN** se materializa la compra
- **THEN** figura como cliente de esa empresa

### Requirement: Entrada en el libro de ingresos del comercio

El sistema SHALL registrar el cobro en el libro de ingresos de la empresa vendedora, con su importe,
la comisión retenida, el neto, el medio de pago, el comprador y el perfil de facturación que lo
recibió.

#### Scenario: El comercio ve su ingreso

- **WHEN** se materializa una compra
- **THEN** aparece en el historial de cobros de la empresa vendedora con su desglose

### Requirement: Pedido operativo en la tienda de almacén

Una compra en tienda de almacén SHALL generar un pedido de almacén ya finalizado, con sus líneas y
las unidades concretas que se apartaron, conforme a `warehouse-orders`.

#### Scenario: El almacén recibe el pedido resuelto

- **WHEN** se materializa una compra de tienda de almacén
- **THEN** existe un pedido de almacén finalizado con sus líneas
- **AND** referencia las unidades apartadas

### Requirement: Las unidades pasan al estado de la modalidad

Las unidades apartadas SHALL pasar a vendidas cuando la compra sea de venta, y a rentadas cuando sea
de renta.

#### Scenario: Una venta marca las unidades vendidas

- **GIVEN** una compra de venta con tres unidades apartadas
- **WHEN** se materializa
- **THEN** las tres quedan vendidas

#### Scenario: Una renta marca las unidades rentadas

- **GIVEN** una compra de renta con dos unidades apartadas
- **WHEN** se materializa
- **THEN** las dos quedan rentadas
- **AND** se espera su retorno

### Requirement: Pedido operativo en la tienda de mosaicos

Una compra en tienda de mosaicos SHALL generar un pedido web de Pixit finalizado, con una línea por
artículo.

Un mosaico configurado SHALL materializarse con su estructura completa: sus láminas ordenadas, cada
una con su imagen generada, y el desglose de colores con sus cantidades.

#### Scenario: El mosaico llega completo al pedido

- **WHEN** se materializa la compra de un mosaico de seis láminas
- **THEN** el pedido contiene las seis láminas en su orden
- **AND** cada una referencia su imagen generada y su desglose de colores

#### Scenario: Un producto de catálogo descuenta existencia

- **WHEN** se materializa la compra de dos unidades de un producto de mosaicos
- **THEN** su existencia disminuye en dos

### Requirement: Un fallo se comunica y se puede reprocesar

Cuando la materialización falle de forma persistente, el sistema SHALL registrar la incidencia con
el detalle suficiente para diagnosticarla y SHALL avisar a la operación.

Un administrador de plataforma SHALL poder reprocesarla manualmente, conservando la garantía de
ejecución única.

#### Scenario: Una incidencia queda visible

- **GIVEN** una materialización que agota sus reintentos
- **WHEN** se registra la incidencia
- **THEN** identifica la compra, el pago y el motivo del fallo
- **AND** se avisa a la operación

#### Scenario: El reproceso no duplica

- **GIVEN** una incidencia resuelta en su causa
- **WHEN** un administrador la reprocesa
- **THEN** el pedido se materializa una sola vez

### Requirement: El comprador consulta sus pedidos

Un comprador SHALL poder consultar sus pedidos con su estado, sus artículos, su pago y el
seguimiento de su envío, a través de todas las tiendas en las que haya comprado.

Los endpoints de consulta SHALL devolver pedidos, no otra entidad. La implementación anterior
devolvía registros de envío en las lecturas de pedidos, pagos y compras
(ver `DEFECTS.md` C-01, C-02, C-03 y C-04).

#### Scenario: La lectura devuelve pedidos

- **WHEN** un comprador consulta sus pedidos
- **THEN** obtiene pedidos con sus artículos e importes
- **AND** no obtiene registros de envío en su lugar

#### Scenario: Los pedidos cruzan tiendas

- **GIVEN** un comprador con pedidos en dos tiendas distintas
- **WHEN** consulta sus pedidos
- **THEN** aparecen los de ambas

#### Scenario: Un comprador no ve los pedidos de otro

- **WHEN** un comprador solicita el pedido de otro por su identificador
- **THEN** la respuesta es `404`
