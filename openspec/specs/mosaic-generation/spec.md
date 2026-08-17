# Generación de mosaicos

## Purpose

Convertir la fotografía de un cliente en un mosaico de ladrillos: la imagen previa que le enseñas
para que compre, la lista de materiales con la que se cobra, y el instructivo con el que lo arma en
casa.

El proceso tiene **cuatro etapas** y conviene entenderlas por separado porque cada una produce un
artefacto distinto:

| Etapa | Qué hace | Artefacto |
|---|---|---|
| Teselado | Reparte la foto entre las láminas del tablero | Un recorte por lámina |
| Pixelado | Reduce cada recorte a una rejilla de celdas | Imagen pixelada por lámina |
| Cuantización | Sustituye cada celda por el ladrillo más parecido | Imagen final por lámina |
| Recuento | Cuenta cuántas piezas de cada color hacen falta | Lista de materiales |

La rejilla la determinan el tamaño del tablero y el tipo de lámina:

```
láminas del mosaico   = tamaño.x × tamaño.y
ladrillos por lámina  = lámina.x × lámina.y
ladrillos totales     = (tamaño.x × lámina.x) × (tamaño.y × lámina.y)
proporción            = tamaño.x ÷ tamaño.y
```

Un detalle que importa: **la paleta de cuantización es la de la tienda, no la del catálogo**. Sólo
se ofrecen colores que esa tienda tiene en existencia, porque si no el instructivo pediría ladrillos
que nadie puede vender.

## Requirements

### Requirement: La rejilla se deriva de tablero y lámina

El sistema SHALL derivar el número de láminas y el número de ladrillos por eje a partir del tamaño
de tablero y del tipo de lámina elegidos, y SHALL exponer la proporción resultante.

#### Scenario: Se calcula la rejilla completa

- **GIVEN** un tamaño de tablero de tres por dos láminas y una lámina de treinta y dos por treinta y dos ladrillos
- **WHEN** se deriva la rejilla
- **THEN** el mosaico tiene seis láminas
- **AND** noventa y seis ladrillos de ancho por sesenta y cuatro de alto

#### Scenario: La proporción guía el recorte

- **GIVEN** un tamaño de tablero de tres por dos
- **WHEN** se consulta la proporción
- **THEN** es `1.5`
- **AND** el recorte de la fotografía la respeta

### Requirement: Ajuste previo de la fotografía

El sistema SHALL permitir recortar y encuadrar la fotografía antes de procesarla, respetando la
proporción del tablero elegido.

#### Scenario: El recorte respeta la proporción

- **WHEN** el usuario ajusta el encuadre
- **THEN** el área seleccionable conserva la proporción del tablero

### Requirement: Teselado en láminas

El sistema SHALL dividir la fotografía en tantos recortes como láminas tenga el mosaico, repartiendo
la imagen de forma contigua y sin solapamiento ni hueco entre recortes.

Cada recorte SHALL corresponder a la posición de su lámina dentro del tablero.

#### Scenario: Los recortes cubren la imagen completa

- **GIVEN** un mosaico de seis láminas
- **WHEN** se tesela la fotografía
- **THEN** se producen seis recortes
- **AND** juntos reconstruyen la imagen sin solaparse ni dejar hueco

#### Scenario: Cada recorte conoce su posición

- **WHEN** se consulta un recorte
- **THEN** indica a qué lámina del tablero corresponde

### Requirement: Pixelado de cada recorte

El sistema SHALL reducir cada recorte a una rejilla con tantas celdas como ladrillos tenga la
lámina, tomando para cada celda un color representativo.

El pixelado SHALL realizarse sin suavizado, de modo que cada celda tenga un color plano.

#### Scenario: La rejilla coincide con los ladrillos

- **GIVEN** una lámina de treinta y dos por treinta y dos ladrillos
- **WHEN** se pixela su recorte
- **THEN** la imagen resultante tiene treinta y dos celdas por eje

#### Scenario: Las celdas son de color plano

- **WHEN** se pixela un recorte
- **THEN** dentro de cada celda no hay degradado

### Requirement: Cuantización a la paleta de la tienda

El sistema SHALL sustituir el color de cada celda por el del ladrillo **más cercano** de la paleta
de la tienda, midiendo la cercanía como distancia euclídea en el espacio de color.

La paleta SHALL limitarse a los colores que la tienda tenga dados de alta en su inventario.

#### Scenario: Sólo se usan colores de la tienda

- **GIVEN** una tienda con una paleta de doce colores
- **WHEN** se cuantiza una fotografía
- **THEN** todas las celdas usan alguno de esos doce
- **AND** ninguna usa un color del catálogo que la tienda no maneja

#### Scenario: Se elige el color más cercano

- **GIVEN** una celda cuyo color está entre dos de la paleta
- **WHEN** se cuantiza
- **THEN** se le asigna el de menor distancia

#### Scenario: Sin paleta no se puede generar

- **GIVEN** una tienda sin colores dados de alta
- **WHEN** se intenta generar un mosaico
- **THEN** la operación se rechaza indicando que falta configurar la paleta

### Requirement: Representación visual de los ladrillos

El sistema SHALL superponer sobre cada celda la representación visual de un ladrillo, de modo que la
imagen resultante se parezca al mosaico montado y no a una fotografía pixelada.

#### Scenario: El resultado parece un mosaico

- **WHEN** se genera la imagen final de una lámina
- **THEN** cada celda se presenta como un ladrillo, con su relieve visible

### Requirement: Vista de conjunto del mosaico

El sistema SHALL componer las imágenes de todas las láminas en una sola imagen del mosaico completo,
respetando la posición de cada una.

#### Scenario: Se compone la vista completa

- **GIVEN** un mosaico de seis láminas ya generadas
- **WHEN** se compone la vista de conjunto
- **THEN** se obtiene una sola imagen con las seis en su posición

### Requirement: Recuento de materiales por lámina

El sistema SHALL contar, por cada lámina, cuántas celdas corresponden a cada color, y SHALL derivar
de ahí las piezas y las bolsas necesarias conforme a `pixit-inventory-ledger`.

#### Scenario: El recuento cubre todas las celdas

- **GIVEN** una lámina de treinta y dos por treinta y dos ladrillos
- **WHEN** se cuentan sus materiales
- **THEN** la suma de todas las cantidades es mil veinticuatro

#### Scenario: Se derivan las bolsas necesarias

- **GIVEN** un color con catorce piezas en una lámina y seis piezas por bolsa
- **WHEN** se derivan las bolsas
- **THEN** son tres

### Requirement: Recorrido coherente de la rejilla

El sistema SHALL recorrer la rejilla con **la misma correspondencia entre índice y posición** en
todas las etapas del proceso.

Una celda situada en una posición determinada durante el pixelado SHALL ser la misma celda en esa
posición durante el recuento.

La implementación anterior recorría la rejilla transponiendo filas y columnas entre dos de sus
etapas, lo que desalineaba la lista de materiales y el instructivo impreso respecto de la imagen
mostrada (ver `DEFECTS.md` F-09).

#### Scenario: El recuento coincide con la imagen

- **GIVEN** una lámina cuya imagen generada tiene una zona claramente dominada por un color
- **WHEN** se cuenta el material
- **THEN** ese color es el más numeroso
- **AND** su cantidad se corresponde con el área que ocupa

#### Scenario: Una rejilla no cuadrada no se transpone

- **GIVEN** una lámina con distinto número de ladrillos a lo ancho y a lo alto
- **WHEN** se genera y se cuenta
- **THEN** la imagen y el recuento coinciden en su orientación

### Requirement: Lista de materiales del mosaico completo

El sistema SHALL agregar los recuentos de todas las láminas en una lista de materiales del mosaico
completo, con las piezas y las bolsas totales por color.

#### Scenario: El total agrega todas las láminas

- **GIVEN** un mosaico de seis láminas
- **WHEN** se agrega su lista de materiales
- **THEN** la cantidad de cada color es la suma de la de las seis

### Requirement: El resultado es reproducible

Generar dos veces el mismo mosaico —misma fotografía, mismo tablero, mismo tamaño, misma lámina y
misma paleta— SHALL producir el mismo resultado.

#### Scenario: Dos generaciones coinciden

- **WHEN** se genera dos veces el mismo mosaico sin cambiar nada
- **THEN** las imágenes y la lista de materiales son idénticas

#### Scenario: Cambiar la paleta cambia el resultado

- **GIVEN** un mosaico generado
- **WHEN** se añade un color al inventario de la tienda y se regenera
- **THEN** el resultado puede diferir, porque la paleta cambió

### Requirement: El resultado se conserva al comprar

Cuando un mosaico generado se lleve al carrito o a una venta, SHALL conservarse la imagen de cada
lámina y su lista de materiales.

Un mosaico no SHALL poder venderse sin su diseño, porque el diseño **es** el producto.

#### Scenario: El diseño acompaña a la venta

- **WHEN** se vende un mosaico generado
- **THEN** la venta conserva la imagen de cada lámina y su desglose de colores

#### Scenario: Sin diseño no se completa la venta

- **GIVEN** un mosaico cuyo diseño no pudo conservarse
- **WHEN** se intenta cobrar
- **THEN** la operación se rechaza
- **AND** se ofrece reintentar

### Requirement: Previsualización en sala

El sistema SHALL poder mostrar la vista de conjunto del mosaico sobre una sala del catálogo, en la
posición y escala que ésta configure.

#### Scenario: Se enseña el mosaico colgado

- **WHEN** el usuario elige una sala
- **THEN** el mosaico se muestra sobre ella para hacerse una idea del resultado

### Requirement: Formatos de imagen admitidos

El sistema SHALL admitir los formatos de imagen habituales, incluidos los de las cámaras de
teléfono, y SHALL rechazar en el momento de la carga cualquier archivo que no pueda procesar.

#### Scenario: Un formato de teléfono se procesa

- **WHEN** el usuario sube una fotografía en un formato propio de cámaras de teléfono
- **THEN** se procesa correctamente

#### Scenario: Un archivo no procesable se rechaza al subir

- **WHEN** el usuario sube un archivo que no es una imagen admitida
- **THEN** se le indica en el acto
- **AND** no se inicia la generación

### Requirement: Un solo generador para mostrador y tienda

El generador SHALL ser el mismo cuando lo usa un cajero en el punto de venta y cuando lo usa un
visitante en la tienda pública.

Un mosaico configurado por un cliente en la tienda pública SHALL ser indistinguible, en su
resultado, de uno configurado en el mostrador.

#### Scenario: Ambos caminos producen lo mismo

- **GIVEN** la misma fotografía, tablero, tamaño, lámina y tienda
- **WHEN** se genera desde el mostrador y desde la tienda pública
- **THEN** el resultado es idéntico
