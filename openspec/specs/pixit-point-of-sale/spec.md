# Punto de venta de Pixit

## Purpose

El mostrador de una tienda física. Un cajero abre su turno con un fondo de caja, atiende clientes
durante el día y cierra cuadrando el efectivo contra lo que el sistema dice que debería haber.

Dos entidades:

| Entidad | Qué es |
|---|---|
| **Sesión de caja** | Un turno: quién, desde cuándo, con qué fondo y con qué conteo final |
| **Venta de mostrador** | Un ticket cobrado dentro de una sesión |

Una venta puede llevar mosaicos configurados en el momento (ver `mosaic-generation`), láminas o
ladrillos sueltos, y productos de mercancía. Cobrarla genera los movimientos de inventario
correspondientes (ver `pixit-inventory-ledger`).

El cambio más importante respecto del sistema anterior: **toda la ruta de escritura del cobro pasa
al servidor**. Hoy el navegador calcula los totales y encadena por su cuenta la creación de la venta
y de todos sus movimientos de inventario, sin transacción y sin que nadie valide ni los importes ni
las existencias (ver `DEFECTS.md` M-06).

## Requirements

### Requirement: Apertura de una sesión de caja

Un cajero SHALL poder abrir una sesión de caja en una tienda indicando el fondo inicial, y la sesión
SHALL registrar quién la abrió y cuándo.

#### Scenario: Se abre el turno

- **WHEN** un cajero abre una sesión con su fondo inicial
- **THEN** la sesión queda activa con su responsable y su instante de apertura

### Requirement: Una sola sesión activa por tienda

Una tienda SHALL tener como máximo una sesión de caja activa.

Abrir una sesión con otra ya activa SHALL rechazarse con `409`.

#### Scenario: No se abren dos cajas a la vez

- **GIVEN** una tienda con una sesión activa
- **WHEN** se intenta abrir otra
- **THEN** la respuesta es `409`
- **AND** se indica que hay una sesión abierta

#### Scenario: Se consulta la sesión activa

- **WHEN** se consulta la sesión activa de una tienda
- **THEN** se obtiene la que esté abierta, o ninguna si no hay

### Requirement: Cierre de una sesión con cuadre

Cerrar una sesión SHALL exigir el conteo real del efectivo, y el sistema SHALL registrar la
diferencia respecto del efectivo esperado.

El efectivo esperado SHALL calcularse conforme a `computed-fields`.

#### Scenario: Se registra un cuadre exacto

- **GIVEN** una sesión cuyo efectivo esperado es `1250.00`
- **WHEN** el cajero cierra declarando `1250.00`
- **THEN** la sesión queda cerrada con diferencia cero

#### Scenario: Se registra un descuadre

- **GIVEN** la misma sesión
- **WHEN** el cajero cierra declarando `1200.00`
- **THEN** la sesión queda cerrada con una diferencia de `-50.00`
- **AND** la diferencia queda visible en el historial de la tienda

#### Scenario: No se cierra sin conteo

- **WHEN** se intenta cerrar una sesión sin declarar el conteo
- **THEN** la operación se rechaza

### Requirement: Una sesión cerrada no admite ventas

El sistema SHALL rechazar registrar una venta contra una sesión cerrada.

Una sesión cerrada no SHALL poder reabrirse.

#### Scenario: No se vende con la caja cerrada

- **GIVEN** una sesión cerrada
- **WHEN** se intenta registrar una venta contra ella
- **THEN** la operación se rechaza

#### Scenario: No se reabre una sesión

- **WHEN** se intenta reabrir una sesión cerrada
- **THEN** la operación se rechaza

### Requirement: Composición del carrito

El carrito del punto de venta SHALL admitir mosaicos configurados, láminas sueltas, ladrillos
sueltos y productos de mercancía, cada uno con su cantidad.

#### Scenario: Se combinan artículos de distinto tipo

- **WHEN** el cajero añade un mosaico, dos láminas sueltas y un producto de mercancía
- **THEN** el carrito los conserva como líneas independientes

### Requirement: Cálculo del importe de la venta

El importe de una venta SHALL calcularse así:

```
subtotal  = Σ round(precio × cantidad, 2)   de todas las líneas
descuento = round(subtotal × descuento% ÷ 100, 2)
base      = subtotal − descuento
impuesto  = round(base × impuesto% ÷ 100, 2)
total     = base + impuesto
cambio    = importe recibido − total
```

Los precios SHALL ser los de la definición de inventario de esa tienda, no los del catálogo.

#### Scenario: Se calcula una venta con descuento e impuesto

- **GIVEN** un carrito con subtotal de `1000.00`, un descuento del diez por ciento y un impuesto del dieciséis
- **WHEN** se calcula
- **THEN** el descuento es `100.00`, la base `900.00`, el impuesto `144.00` y el total `1044.00`

#### Scenario: Se usa el precio de la tienda

- **GIVEN** una tienda cuyo precio para un color difiere del de otra tienda
- **WHEN** se calcula una venta en ella
- **THEN** se usa su precio

### Requirement: El cálculo es autoridad del servidor

Los importes de una venta SHALL calcularse y validarse en el servidor.

El sistema no SHALL aceptar los importes que el navegador proponga.

#### Scenario: Un total manipulado se descarta

- **WHEN** se envía una venta con un total inferior al que corresponde
- **THEN** el sistema registra el total correcto

### Requirement: El cobro es una sola transacción

Registrar una venta SHALL crear, de forma atómica, la venta y todos los movimientos de inventario
que consume.

Ninguna parte SHALL crearse fuera del ámbito transaccional.

#### Scenario: Un fallo no deja venta a medias

- **GIVEN** un cobro que falla al registrar el consumo de uno de los colores
- **WHEN** se revierte
- **THEN** no existe la venta
- **AND** ningún movimiento de inventario se ha registrado

#### Scenario: El cobro genera la estructura completa

- **WHEN** se cobra un mosaico de seis láminas
- **THEN** existe la venta
- **AND** existen su movimiento de tablero, los seis de lámina y los de ladrillo de cada una
- **AND** todos referencian la venta

### Requirement: La existencia se valida antes de cobrar

El sistema SHALL comprobar que hay existencia suficiente de cada artículo antes de registrar la
venta, y SHALL rechazarla indicando qué falta.

#### Scenario: Existencia insuficiente detiene el cobro

- **GIVEN** un carrito que requiere más piezas de un color de las que hay
- **WHEN** se intenta cobrar
- **THEN** la operación se rechaza
- **AND** se indica qué color falta y cuánto hay

### Requirement: Medios de pago

Una venta SHALL registrar su medio de pago: efectivo, tarjeta, transferencia u otro medio previsto,
y SHALL admitir el pago mixto.

Una venta en efectivo SHALL registrar el importe recibido y el cambio devuelto.

#### Scenario: Se registra el cambio de una venta en efectivo

- **GIVEN** una venta de `344.00` cobrada con `400.00`
- **WHEN** se registra
- **THEN** el cambio es `56.00`

#### Scenario: El importe recibido no puede ser menor que el total

- **WHEN** se intenta cobrar en efectivo con un importe recibido inferior al total
- **THEN** la operación se rechaza

### Requirement: Sólo el efectivo cuenta para el cuadre

Únicamente las ventas cobradas en efectivo SHALL intervenir en el efectivo esperado de la sesión.

#### Scenario: Una venta con tarjeta no altera el cuadre

- **GIVEN** una sesión con un efectivo esperado determinado
- **WHEN** se registra una venta cobrada con tarjeta
- **THEN** el efectivo esperado no cambia
- **AND** el total de la sesión sí aumenta

### Requirement: Responsable de la venta

Toda venta SHALL registrar el cajero responsable, que por defecto SHALL ser quien la cobra.

#### Scenario: La venta queda atribuida

- **WHEN** un cajero cobra una venta
- **THEN** figura como su responsable

### Requirement: Recibo de la venta

Una venta SHALL poder generar su recibo conforme a `pdf-documents`, con su desglose, los datos de la
tienda, un código legible por máquina que la identifique y los términos vigentes.

El recibo SHALL poder compartirse por enlace público de sólo lectura.

#### Scenario: El cliente recibe su comprobante

- **WHEN** se cobra una venta
- **THEN** puede generarse e imprimirse su recibo
- **AND** compartirse por enlace

### Requirement: Instructivo de armado de un mosaico vendido

Una venta que incluya un mosaico SHALL poder generar su instructivo de armado conforme a
`pdf-documents`, recorriendo la estructura de movimientos que la venta produjo.

#### Scenario: El cliente se lleva su instructivo

- **WHEN** se cobra un mosaico
- **THEN** puede generarse su instructivo con una página por lámina y su leyenda de colores

### Requirement: Anulación de una venta

Una venta SHALL poder anularse, lo que SHALL generar los asientos compensatorios de inventario
conforme a `pixit-inventory-ledger` y SHALL dejar la venta marcada como anulada.

Una venta anulada SHALL dejar de contar en los totales de su sesión.

#### Scenario: La anulación restituye el inventario

- **GIVEN** una venta que consumió inventario
- **WHEN** se anula
- **THEN** la existencia vuelve a su valor anterior
- **AND** la venta queda marcada como anulada

#### Scenario: La sesión deja de contarla

- **GIVEN** una sesión con un total determinado
- **WHEN** se anula una de sus ventas
- **THEN** el total de la sesión disminuye en ese importe

### Requirement: Consulta de ventas y sesiones

El sistema SHALL poder listar las ventas y las sesiones de una tienda, y también las de toda la
empresa, de forma paginada y filtrable por fecha, responsable, medio de pago y estado.

Una venta SHALL poder consultarse con su estructura completa de mosaico resuelta.

#### Scenario: Se consulta el histórico de una tienda

- **WHEN** se listan las ventas de una tienda filtrando por un rango de fechas
- **THEN** se obtienen las de ese periodo con sus importes

#### Scenario: Se consulta la venta con su detalle

- **WHEN** se abre una venta que incluyó un mosaico
- **THEN** se ven sus láminas en su orden y los colores de cada una
