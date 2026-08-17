# Presupuesto de producción

## Purpose

Lo que se esperaba gastar contra lo que se gastó de verdad. Dos colecciones y una resta:

| Concepto | Qué registra |
|---|---|
| **Ancla** | Una partida presupuestada: lo previsto |
| **Compra** | Un gasto realizado: lo ejecutado |

El presupuesto **no es una entidad**: es una lectura derivada que suma unas y otras y devuelve la
diferencia. No hay nada que guardar ni que mantener sincronizado.

Las compras llegan por dos vías: se registran a mano, o se generan solas al liquidar una compra a un
almacén (ver `production-procurement`), lo que hace que el presupuesto se mueva sin que nadie tenga
que anotarlo.

## Requirements

### Requirement: Anclas de una producción

Una producción SHALL poder registrar anclas, cada una con su nombre, descripción, importe,
categoría, responsable y comprobantes adjuntos.

#### Scenario: Se registra una partida presupuestada

- **WHEN** un miembro con permiso crea un ancla con su importe
- **THEN** queda registrada en la producción

### Requirement: Compras de una producción

Una producción SHALL poder registrar compras, cada una con su nombre, observaciones, importe, tipo,
método de pago, fecha, proveedor, si es deducible, sus facturas adjuntas, su responsable y los
artículos que incorporó al inventario.

Una compra SHALL poder referenciar el pedido de almacén que la originó.

#### Scenario: Se registra un gasto

- **WHEN** un miembro con permiso crea una compra con su importe y su método de pago
- **THEN** queda registrada en la producción

#### Scenario: Se identifica el pago con tarjeta

- **WHEN** se registra una compra pagada con tarjeta indicando su identificación parcial
- **THEN** se conserva sin almacenar el número completo

### Requirement: Artículos incorporados por una compra

Una compra SHALL poder referenciar los artículos del inventario que incorporó, y el sistema SHALL
permitir establecer ese conjunto de una vez.

Un artículo SHALL pertenecer como máximo a **una** compra: asignarlo a otra SHALL retirarlo de la
anterior.

#### Scenario: Un artículo cambia de compra

- **GIVEN** un artículo asignado a la compra A
- **WHEN** se asigna a la compra B
- **THEN** deja de figurar en A
- **AND** figura en B

#### Scenario: Se retira un artículo de una compra

- **GIVEN** una compra con tres artículos
- **WHEN** se establece su conjunto a dos de ellos
- **THEN** el tercero queda sin compra asignada
- **AND** sigue existiendo en el inventario

### Requirement: Eliminar una compra libera sus artículos

Eliminar una compra SHALL dejar sin compra asignada a sus artículos, sin eliminarlos, y SHALL
eliminar sus facturas adjuntas.

#### Scenario: Los artículos sobreviven a la compra

- **GIVEN** una compra con cinco artículos
- **WHEN** se elimina la compra
- **THEN** los cinco artículos siguen en el inventario sin compra asignada

### Requirement: Lectura del presupuesto

El sistema SHALL poder devolver el presupuesto de una producción como: sus anclas, sus compras, la
suma de cada colección y la diferencia entre ambas.

```
totalPresupuestado = Σ importe de las anclas
totalGastado       = Σ importe de las compras
diferencia         = totalPresupuestado − totalGastado
```

#### Scenario: Se obtiene la diferencia

- **GIVEN** una producción con anclas por `100000.00` y compras por `82500.00`
- **WHEN** se consulta su presupuesto
- **THEN** la diferencia es `17500.00`

#### Scenario: Un sobrecoste da diferencia negativa

- **GIVEN** una producción con anclas por `50000.00` y compras por `61000.00`
- **WHEN** se consulta su presupuesto
- **THEN** la diferencia es `-11000.00`
- **AND** se presenta señalada como desfavorable

#### Scenario: Una producción sin movimientos

- **GIVEN** una producción sin anclas ni compras
- **WHEN** se consulta su presupuesto
- **THEN** los tres importes son cero

### Requirement: Totales filtrados junto a los totales generales

La lectura del presupuesto SHALL devolver, junto a los totales de toda la producción, los totales
correspondientes a los filtros aplicados.

Así puede verse el peso de una categoría sin perder de vista el conjunto.

#### Scenario: Se compara una categoría con el total

- **GIVEN** una producción con anclas de varias categorías
- **WHEN** se consulta el presupuesto filtrando por una categoría
- **THEN** se obtienen los totales de esa categoría
- **AND** también los totales de la producción completa

### Requirement: El presupuesto no se almacena

El presupuesto SHALL calcularse en el momento de consultarse, a partir de las anclas y las compras
vigentes.

No SHALL existir un total persistido que pueda quedar desincronizado.

#### Scenario: Un gasto nuevo se refleja de inmediato

- **GIVEN** un presupuesto consultado
- **WHEN** se registra una compra nueva
- **AND** se vuelve a consultar
- **THEN** la diferencia refleja el gasto nuevo

### Requirement: Una liquidación mueve el presupuesto sola

Cuando se liquide una compra a un almacén, la compra resultante SHALL incorporarse al presupuesto
sin intervención manual, conforme a `production-procurement`.

#### Scenario: La liquidación se refleja en el gasto

- **GIVEN** un presupuesto con un gasto determinado
- **WHEN** se liquida una compra a un almacén por un importe
- **THEN** el gasto de la producción aumenta en ese importe

### Requirement: Documento del presupuesto

El presupuesto SHALL poder generarse como documento conforme a `pdf-documents`, mostrando anclas y
compras con sus totales y su diferencia.

#### Scenario: Se genera el documento del presupuesto

- **WHEN** se solicita el documento del presupuesto de una producción
- **THEN** contiene las anclas, las compras, ambos totales y la diferencia

### Requirement: Presentación gráfica del presupuesto

El sistema SHALL poder presentar el presupuesto de forma gráfica, comparando lo presupuestado con lo
gastado y desglosando por categoría.

#### Scenario: Se compara por categoría

- **WHEN** se consulta la presentación gráfica del presupuesto
- **THEN** muestra la comparación entre presupuestado y gastado
- **AND** el desglose por categoría

### Requirement: Búsqueda y filtrado

Las anclas SHALL poder buscarse por nombre, descripción y nombre de su categoría, y las compras por
su nombre.

Ambas SHALL poder filtrarse por categoría, responsable y rango de fechas, y las compras además por
tipo, método de pago, proveedor y si son deducibles.

#### Scenario: Se filtran las compras deducibles

- **WHEN** se filtran las compras por deducibles
- **THEN** aparecen sólo las marcadas como tales
