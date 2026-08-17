# Inventario de Pixit

## Purpose

El inventario de una tienda de mosaicos se lleva como un **libro mayor**: nada se modifica y nada se
borra, sólo se anexan asientos. Las entradas son positivas, las salidas negativas, y la existencia
es la suma.

Es un modelo distinto al de los almacenes —donde una fila es un objeto físico— y es el correcto
aquí: los ladrillos son fungibles, se manejan por miles, y lo que importa es el saldo y poder
reconstruir cómo se llegó a él.

Cada tipo de artículo tiene **dos entidades**:

| Definición | Movimiento |
|---|---|
| Que la tienda maneja cierto tamaño de tablero, y a qué precio | Cada entrada o salida de ese tamaño |
| Que la tienda maneja cierta lámina, y a qué precio | Cada entrada o salida de esa lámina |
| Que la tienda maneja cierto color, y a qué precio | Cada entrada o salida de ese color |

Los movimientos hacen doble trabajo: además de llevar el saldo, **son la estructura de un mosaico
vendido**. Un movimiento de tablero enlaza con los de sus láminas, y cada uno de éstos con los de
sus ladrillos. Ese árbol es exactamente lo que recorre el instructivo de armado.

```
Movimiento de tablero
   └── Movimiento de lámina  (ordenado por posición)
         └── Movimiento de ladrillo
```

Los ladrillos llevan **doble unidad**: bolsas y piezas sueltas, porque se compran por bolsa y se
consumen por pieza.

## Requirements

### Requirement: Definiciones de inventario por tienda

Una tienda SHALL poder declarar qué tamaños de tablero, qué láminas y qué colores maneja, cada uno
con su precio propio y su imagen.

Una definición SHALL pertenecer a una sola tienda, y dos tiendas SHALL poder manejar el mismo
artículo del catálogo con precios distintos.

#### Scenario: Dos tiendas fijan precios distintos

- **GIVEN** dos tiendas que manejan el mismo color
- **WHEN** cada una fija su precio
- **THEN** ambos se conservan de forma independiente

### Requirement: El inventario se lleva por movimientos

Toda variación de existencia SHALL registrarse como un movimiento nuevo asociado a su definición.

Un movimiento existente no SHALL modificarse ni eliminarse.

#### Scenario: Una entrada es un asiento nuevo

- **WHEN** se recibe mercancía de un color
- **THEN** se registra un movimiento con cantidad positiva
- **AND** los movimientos anteriores no cambian

#### Scenario: No se puede alterar un movimiento

- **WHEN** se intenta modificar un movimiento existente
- **THEN** la operación se rechaza

### Requirement: La existencia es la suma de los movimientos

La existencia de una definición SHALL ser la suma de las cantidades de todos sus movimientos,
conforme a `computed-fields`.

#### Scenario: Entradas y salidas se compensan

- **GIVEN** una definición con movimientos de `50`, `-12` y `30`
- **WHEN** se consulta su existencia
- **THEN** es `68`

#### Scenario: Una definición sin movimientos está a cero

- **GIVEN** una definición recién creada sin movimientos
- **WHEN** se consulta su existencia
- **THEN** es `0`

### Requirement: Alta de definición con existencia inicial

Al crear una definición SHALL poder indicarse una existencia inicial, y el sistema SHALL registrar
el movimiento de entrada correspondiente.

#### Scenario: El alta genera su primer asiento

- **WHEN** se crea una definición indicando una existencia inicial de cien
- **THEN** existe un movimiento de entrada de cien
- **AND** la existencia de la definición es cien

### Requirement: Doble unidad en los movimientos de ladrillo

Un movimiento de ladrillo SHALL registrar tanto las bolsas como las piezas, y ambas cantidades SHALL
llevar el mismo signo.

#### Scenario: Una salida de ladrillos registra ambas unidades

- **WHEN** se registra el consumo de ladrillos de un color
- **THEN** el movimiento registra las bolsas y las piezas consumidas
- **AND** ambas son negativas

#### Scenario: Signos incoherentes se rechazan

- **WHEN** se intenta registrar un movimiento con bolsas positivas y piezas negativas
- **THEN** la operación se rechaza

### Requirement: Conversión entre bolsas y piezas

El sistema SHALL conocer cuántas piezas contiene una bolsa y SHALL usarlo para derivar las bolsas
necesarias a partir de las piezas consumidas, redondeando hacia arriba.

El número de piezas por bolsa SHALL ser un dato configurable, no un valor fijado en el código.

#### Scenario: Las piezas se convierten a bolsas completas

- **GIVEN** una configuración de seis piezas por bolsa
- **WHEN** se consumen catorce piezas de un color
- **THEN** se derivan tres bolsas

#### Scenario: Se puede cambiar la conversión sin desplegar

- **WHEN** se modifica el número de piezas por bolsa
- **THEN** los cálculos posteriores usan el valor nuevo

### Requirement: Los movimientos componen el mosaico vendido

Un movimiento de lámina SHALL poder referenciar el movimiento de tablero al que pertenece y su
posición dentro de él, y un movimiento de ladrillo SHALL poder referenciar el movimiento de lámina
al que pertenece.

Este árbol SHALL ser el que recorran el recibo y el instructivo de armado.

#### Scenario: Se reconstruye la estructura de un mosaico

- **GIVEN** una venta de un mosaico de seis láminas
- **WHEN** se consulta su movimiento de tablero
- **THEN** se obtienen sus seis movimientos de lámina en su orden
- **AND** cada uno con los movimientos de ladrillo de esa lámina

#### Scenario: Las láminas conservan su posición

- **WHEN** se consultan las láminas de un mosaico vendido
- **THEN** aparecen en la posición en que se montan

### Requirement: Los movimientos de una venta la referencian

Todo movimiento originado por una venta SHALL referenciarla, de modo que pueda reconstruirse qué
salió del inventario por cada ticket.

#### Scenario: Se localiza lo consumido por una venta

- **WHEN** se consulta una venta
- **THEN** se obtienen todos los movimientos que originó

### Requirement: Anular una venta genera asientos compensatorios

Anular una venta SHALL registrar movimientos **de signo contrario** por cada uno de los que
originó, dejando la existencia como estaba antes.

Los movimientos originales SHALL conservarse.

La implementación anterior eliminaba los movimientos, lo que destruía el libro mayor y hacía
imposible reconstruir el histórico (ver `DEFECTS.md` F-10).

#### Scenario: La anulación restituye la existencia

- **GIVEN** una venta que consumió doce piezas de un color
- **WHEN** se anula
- **THEN** existe un movimiento compensatorio de doce piezas
- **AND** la existencia vuelve a su valor anterior

#### Scenario: El histórico sobrevive a la anulación

- **GIVEN** la misma venta anulada
- **WHEN** se consultan los movimientos de la definición
- **THEN** figuran tanto el consumo original como su compensación

#### Scenario: Anular es atómico

- **GIVEN** una anulación que falla al compensar uno de los movimientos
- **WHEN** se revierte
- **THEN** no se ha registrado ninguna compensación

### Requirement: Existencia negativa

El sistema SHALL rechazar un movimiento de salida que dejaría la existencia por debajo de cero,
salvo autorización explícita de quien lo registra.

Cuando se autorice, la existencia negativa SHALL señalarse como incidencia de inventario.

#### Scenario: Una salida excesiva se rechaza

- **GIVEN** una definición con existencia de cinco
- **WHEN** se intenta registrar una salida de ocho sin autorización
- **THEN** la operación se rechaza indicando la existencia disponible

#### Scenario: Con autorización queda señalada

- **GIVEN** la misma situación
- **WHEN** se registra la salida autorizándola explícitamente
- **THEN** la existencia queda en menos tres
- **AND** se señala como incidencia

### Requirement: Aviso de existencia baja

El sistema SHALL poder señalar las definiciones cuya existencia caiga por debajo de un umbral
configurable por tienda.

#### Scenario: Se avisa de lo que se está agotando

- **GIVEN** un umbral configurado y una definición por debajo de él
- **WHEN** se consulta el inventario de la tienda
- **THEN** esa definición aparece señalada

### Requirement: Consulta del inventario de una tienda

El sistema SHALL poder listar las definiciones de una tienda por tipo, de forma paginada, con su
existencia y su precio.

Los tableros SHALL ordenarse por su tamaño, las láminas por su superficie descendente y los colores
por su nombre.

#### Scenario: Se consulta el inventario de colores

- **WHEN** se listan las definiciones de color de una tienda
- **THEN** se obtienen con su existencia y su precio, ordenadas por nombre

### Requirement: Eliminar una definición

Eliminar una definición SHALL aplicarle borrado lógico junto con sus movimientos, conservando el
historial de las ventas que los originaron.

El sistema SHALL impedir eliminar una definición con existencia distinta de cero.

#### Scenario: No se elimina con existencia

- **GIVEN** una definición con existencia positiva
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza indicando la existencia pendiente

#### Scenario: Las ventas conservan su detalle

- **GIVEN** una definición sin existencia, presente en ventas anteriores
- **WHEN** se elimina
- **THEN** deja de aparecer en el inventario
- **AND** las ventas siguen mostrando lo que se vendió
