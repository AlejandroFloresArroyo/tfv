# Compra en tienda pública

## Purpose

El momento en que un visitante de una tienda pública decide pagar. Es el punto donde se cruzan el
inventario, el precio, el envío y el dinero de un tercero, y donde más caro sale equivocarse.

Hay **dos verticales** con la misma envolvente y distinto contenido del carrito:

| Vertical | Qué se compra |
|---|---|
| Tienda de almacén | Medidas de producto, en venta o en renta |
| Tienda de mosaicos | Productos de catálogo, o mosaicos configurados por el propio comprador |

El dinero fluye así: el comprador paga a la plataforma, la plataforma retiene su comisión y
transfiere el resto a la cuenta de comercio de la empresa vendedora (ver `merchant-onboarding`).

### Cálculo del importe

```
subtotal   = Σ round(precio × cantidad, 2)
comisión%  = porcentaje de comisión de la empresa vendedora
comisión   = round(subtotal × comisión% ÷ 100, 2)
neto       = subtotal − comisión          ← lo que recibe el comercio
envío      = ver shipping-rates
total      = subtotal + envío             ← lo que paga el comprador
```

Dos defectos graves de la implementación anterior se corrigen aquí: las existencias se
**seleccionaban sin marcarse**, de modo que dos compradores podían llevarse la misma unidad, y los
checkouts pendientes **no caducaban nunca** (ver `DEFECTS.md` M-10).

## Requirements

### Requirement: Requisitos previos para poder cobrar

El sistema SHALL rechazar la creación de una sesión de pago cuando la tienda no exista o no esté
publicada, cuando la empresa no tenga suscripción vigente, cuando no tenga habilitado el servicio de
sitios, o cuando no tenga un perfil de facturación operativo.

El motivo del rechazo SHALL ser comprensible para el comprador sin revelar la configuración interna
de la empresa.

#### Scenario: Sin perfil de facturación no se cobra

- **GIVEN** una tienda cuya empresa no tiene perfil de facturación operativo
- **WHEN** un comprador intenta pagar
- **THEN** la operación se rechaza
- **AND** se le indica que la tienda no puede procesar pagos en este momento

#### Scenario: Sin suscripción vigente la tienda no vende

- **GIVEN** una tienda cuya empresa tiene la suscripción vencida
- **WHEN** un comprador intenta pagar
- **THEN** la operación se rechaza

### Requirement: El comprador debe estar identificado

Crear una sesión de pago SHALL exigir un comprador identificado y un domicilio de entrega, salvo
que la modalidad de envío sea recolección en tienda.

#### Scenario: Sin domicilio no se paga un envío

- **WHEN** un comprador intenta pagar con modalidad de envío a domicilio y sin domicilio indicado
- **THEN** la operación se rechaza

#### Scenario: La recolección no exige domicilio

- **WHEN** un comprador elige recoger en tienda
- **THEN** la operación continúa sin domicilio de entrega

### Requirement: Validación de existencia antes de cobrar

El sistema SHALL comprobar que hay existencia disponible suficiente para cada línea del carrito
antes de crear la sesión de pago, y SHALL rechazar la operación indicando qué línea no puede
servirse y cuánto hay disponible.

#### Scenario: Una línea sin existencia detiene la compra

- **GIVEN** un carrito con una línea de tres unidades y sólo una disponible
- **WHEN** el comprador intenta pagar
- **THEN** la operación se rechaza
- **AND** se le indica qué artículo y cuántos quedan

### Requirement: Las existencias se reservan al crear la sesión

Al crear la sesión de pago, el sistema SHALL **apartar** las unidades concretas que se van a servir,
de modo que no puedan comprometerse en otra compra mientras la sesión esté vigente.

La implementación anterior las seleccionaba sin marcarlas, lo que permitía que dos compradores
pagaran por la misma unidad (ver `DEFECTS.md` M-10).

#### Scenario: Dos compradores no se llevan la misma unidad

- **GIVEN** una medida con una única unidad disponible
- **WHEN** dos compradores intentan pagarla a la vez
- **THEN** exactamente uno obtiene su sesión de pago
- **AND** el otro recibe el rechazo por existencia insuficiente

#### Scenario: La reserva se refleja en la disponibilidad

- **GIVEN** una medida con tres unidades disponibles
- **WHEN** un comprador inicia el pago de dos
- **THEN** la tienda muestra una unidad disponible

### Requirement: La reserva caduca con la sesión

Toda sesión de pago SHALL tener una vigencia limitada, y al caducar sin completarse el sistema SHALL
liberar las unidades apartadas y marcar la compra como caducada.

#### Scenario: Abandonar el pago libera el inventario

- **GIVEN** una sesión de pago con dos unidades apartadas
- **WHEN** la sesión caduca sin completarse
- **THEN** las dos unidades vuelven a estar disponibles
- **AND** la compra queda marcada como caducada

#### Scenario: Cancelar libera de inmediato

- **WHEN** el comprador cancela el pago explícitamente
- **THEN** las unidades apartadas se liberan sin esperar a la caducidad

### Requirement: Los precios se resuelven en el servidor

El sistema SHALL resolver el precio de cada línea en el servidor en el momento de crear la sesión,
conforme a la precedencia de `warehouse-catalog`.

No SHALL aceptar precios enviados por el navegador.

#### Scenario: Un precio manipulado se descarta

- **WHEN** el carrito llega con un precio inferior al del catálogo
- **THEN** la sesión se crea con el precio del catálogo
- **AND** el importe cobrado es el correcto

### Requirement: Comisión de la plataforma

El sistema SHALL calcular la comisión aplicando el porcentaje configurado para la empresa vendedora
sobre el subtotal, y SHALL transferir al comercio el importe neto resultante.

Cuando la empresa no tenga porcentaje propio, SHALL aplicarse el porcentaje por defecto de la
plataforma.

#### Scenario: Se retiene la comisión configurada

- **GIVEN** una empresa con un porcentaje de comisión del diez por ciento y un subtotal de `1000.00`
- **WHEN** se crea la sesión de pago
- **THEN** la comisión es `100.00`
- **AND** el importe destinado al comercio es `900.00`

### Requirement: El envío se cobra al comprador

El costo de envío SHALL calcularse conforme a `shipping-rates`, SHALL añadirse al total que paga el
comprador y SHALL presentarse como concepto separado en la sesión de pago.

#### Scenario: El envío aparece como línea aparte

- **WHEN** se crea una sesión de pago con envío
- **THEN** la sesión incluye el envío como concepto identificable
- **AND** el total es la suma del subtotal y el envío

### Requirement: Instantánea de la compra

Al crear la sesión de pago, el sistema SHALL persistir una instantánea completa de lo comprado:
artículos con su nombre, precio y cantidad, unidades apartadas, importes, desglose del envío,
domicilios y referencia de la sesión.

Esta instantánea SHALL ser la fuente para materializar el pedido, de modo que un cambio posterior en
el catálogo no altere lo comprado.

#### Scenario: Un cambio de precio posterior no altera la compra

- **GIVEN** una sesión de pago creada
- **WHEN** el comercio cambia el precio del producto antes de que se confirme el pago
- **THEN** el pedido se materializa con el precio de la instantánea

### Requirement: Estados de la compra

Una compra SHALL tener un estado: pendiente al crearse, completada al confirmarse el pago, cancelada
si el comprador desiste, o caducada si la sesión expira.

Todos los estados SHALL alcanzarse efectivamente; ninguno SHALL quedar inalcanzable.

#### Scenario: Los cuatro estados son alcanzables

- **WHEN** se recorren los caminos de pago confirmado, cancelación y caducidad
- **THEN** la compra alcanza el estado correspondiente en cada caso

### Requirement: Carrito de la tienda de almacén

En una tienda de almacén, cada línea del carrito SHALL referenciar una medida de producto con su
cantidad, y la compra SHALL declarar si es venta o renta.

El sistema SHALL rechazar añadir un producto que no esté disponible para la modalidad elegida.

#### Scenario: Un producto sólo de renta no se vende

- **GIVEN** un producto disponible para renta y no para venta
- **WHEN** se intenta pagarlo como venta
- **THEN** la operación se rechaza

### Requirement: Carrito de la tienda de mosaicos

En una tienda de mosaicos, cada línea SHALL ser un producto de catálogo o un mosaico configurado.

Un mosaico configurado SHALL referenciar su tablero, su tamaño y su lámina, y SHALL conservar por
cada lámina su imagen generada y el desglose de colores con sus cantidades.

Las compras de esta vertical SHALL ser siempre de tipo venta.

#### Scenario: Un mosaico conserva su diseño

- **WHEN** un comprador paga un mosaico que configuró
- **THEN** la instantánea conserva la imagen generada de cada lámina
- **AND** conserva el desglose de colores y cantidades de cada una

#### Scenario: Un producto de catálogo valida su existencia

- **GIVEN** un producto de mosaicos con dos unidades en existencia
- **WHEN** se intentan pagar tres
- **THEN** la operación se rechaza

### Requirement: El diseño generado no se pierde

Cuando el carrito contenga un mosaico configurado, sus imágenes generadas SHALL subirse y quedar
asociadas a la compra **antes** de crear la sesión de pago.

Una compra no SHALL completarse sin el diseño que el cliente configuró, porque es el producto que
compró. La implementación anterior no llegaba a subirlo y el diseño se perdía entre el carrito y el
pedido (ver `DEFECTS.md` F-08).

#### Scenario: Sin diseño no se cobra un mosaico

- **GIVEN** un mosaico configurado cuya imagen no pudo subirse
- **WHEN** se intenta crear la sesión de pago
- **THEN** la operación se rechaza
- **AND** se ofrece reintentar

#### Scenario: El diseño llega al pedido

- **WHEN** se completa la compra de un mosaico configurado
- **THEN** el pedido resultante referencia las imágenes generadas de todas sus láminas

### Requirement: La creación de la sesión es idempotente

Crear una sesión de pago SHALL admitir una clave de idempotencia conforme a `api-conventions`, de
modo que un reintento del comprador no genere dos sesiones ni aparte inventario dos veces.

#### Scenario: Un doble clic no aparta dos veces

- **WHEN** el comprador pulsa pagar dos veces seguidas
- **THEN** se crea una sola sesión
- **AND** se aparta el inventario una sola vez

### Requirement: Direcciones de retorno del pago

La sesión de pago SHALL indicar a dónde volver tras completarse y tras cancelarse, dentro del
dominio de la propia tienda.

#### Scenario: El comprador vuelve a la tienda

- **WHEN** el comprador completa el pago
- **THEN** vuelve a una página de la tienda que confirma la compra
