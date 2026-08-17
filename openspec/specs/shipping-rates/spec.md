# Cálculo de envío

## Purpose

Cuánto cuesta llevarle al comprador lo que acaba de comprar en una tienda pública. Se calcula en el
momento de pagar, a partir de las dimensiones y el peso de lo que lleva en el carrito y de la
distancia entre el almacén y su domicilio.

La regla que gobierna el cálculo es la del **peso facturable**: las paqueterías cobran por lo que
más pese entre el peso real y el peso volumétrico, porque un bulto grande y ligero ocupa sitio en el
camión igual que uno pequeño y pesado.

Hoy este cálculo está **duplicado literalmente** en el servidor y en el navegador, y las tarifas y
el tipo de cambio están escritos en el código (ver `DEFECTS.md` M-11). Ambas cosas cambian aquí: una
sola implementación, y tarifas configurables.

### Conversión de unidades

| De | A centímetros |
|---|---|
| Centímetro | × 1 |
| Metro | × 100 |
| Pulgada | × 2.54 |
| Pie | × 30.48 |

| De | A kilogramos |
|---|---|
| Gramo | ÷ 1000 |
| Kilogramo | × 1 |
| Libra | × 0.453592 |
| Onza | × 0.0283495 |

### Tarifas

| Modalidad | Base | Por kilogramo facturable |
|---|---|---|
| Local | 99 | 20 |
| Nacional | 199 | 30 |
| Internacional | 499 | 60 |
| Recolección | 0 | 0 |

| Recargo | Condición |
|---|---|
| +40 | Nacional a más de 500 km |
| +80 | Nacional a más de 1000 km |
| +20 | Más de 3 artículos |
| +50 | Más de 10 artículos |

Los recargos por distancia son excluyentes entre sí; los de cantidad, también.

## Requirements

### Requirement: Una sola implementación del cálculo

El costo de envío SHALL calcularse en el servidor, y SHALL ser el único válido.

Cuando la interfaz muestre una estimación antes de pagar, SHALL obtenerla del servidor y no
calcularla por su cuenta.

#### Scenario: La estimación coincide con lo cobrado

- **WHEN** el comprador ve el costo de envío estimado en el carrito
- **AND** después completa el pago
- **THEN** el importe cobrado por envío es el mismo que vio

### Requirement: Normalización de dimensiones y peso

El sistema SHALL convertir las dimensiones de cada artículo a centímetros y su peso a kilogramos,
según su unidad declarada, antes de cualquier otro cálculo.

#### Scenario: Se convierten pulgadas y libras

- **GIVEN** un artículo de `10` pulgadas de lado y `2` libras
- **WHEN** se normaliza
- **THEN** su lado es `25.4` centímetros
- **AND** su peso es `0.907184` kilogramos

### Requirement: Peso volumétrico por artículo

El sistema SHALL calcular el peso volumétrico de cada artículo dividiendo el producto de sus tres
dimensiones en centímetros entre cinco mil.

#### Scenario: Se calcula el volumétrico de una caja

- **GIVEN** un artículo de `50` por `40` por `30` centímetros
- **WHEN** se calcula su peso volumétrico
- **THEN** es `12` kilogramos

### Requirement: Peso facturable del envío

El peso facturable SHALL ser el mayor entre la suma de los pesos reales y la suma de los pesos
volumétricos de todos los artículos del envío.

#### Scenario: Manda el volumétrico cuando es mayor

- **GIVEN** un envío cuyo peso real suma `3` kilogramos y cuyo volumétrico suma `12`
- **WHEN** se determina el peso facturable
- **THEN** es `12` kilogramos

#### Scenario: Manda el real cuando es mayor

- **GIVEN** un envío cuyo peso real suma `20` kilogramos y cuyo volumétrico suma `8`
- **WHEN** se determina el peso facturable
- **THEN** es `20` kilogramos

### Requirement: Modalidades de envío

El sistema SHALL admitir cuatro modalidades: local, nacional, internacional y recolección en
tienda, cada una con su tarifa base y su tarifa por kilogramo.

La recolección en tienda SHALL tener costo cero y no SHALL requerir domicilio de entrega.

#### Scenario: La recolección no cuesta ni pide domicilio

- **WHEN** el comprador elige recoger en tienda
- **THEN** el costo de envío es cero
- **AND** no se le exige un domicilio de entrega

### Requirement: Composición del costo

El costo SHALL ser la suma de la tarifa base de la modalidad, la tarifa por kilogramo multiplicada
por el peso facturable, y los recargos aplicables.

El resultado SHALL redondearse a dos decimales.

#### Scenario: Se compone un envío local

- **GIVEN** un envío local de `5` kilogramos facturables y `2` artículos
- **WHEN** se calcula
- **THEN** el costo es `199.00`

#### Scenario: Se compone un envío nacional lejano

- **GIVEN** un envío nacional de `10` kilogramos facturables, `4` artículos, a `1200` kilómetros
- **WHEN** se calcula
- **THEN** el costo es `599.00`

### Requirement: Recargo por distancia en envíos nacionales

Un envío nacional SHALL llevar un recargo cuando la distancia supere los quinientos kilómetros, y
un recargo mayor cuando supere los mil.

Los dos recargos SHALL ser excluyentes: se aplica sólo el que corresponda al tramo alcanzado.

#### Scenario: No se acumulan los recargos por distancia

- **GIVEN** un envío nacional a `1200` kilómetros
- **WHEN** se calcula
- **THEN** se aplica únicamente el recargo del tramo superior

#### Scenario: Bajo el umbral no hay recargo

- **GIVEN** un envío nacional a `300` kilómetros
- **WHEN** se calcula
- **THEN** no se aplica recargo por distancia

### Requirement: Recargo por número de artículos

El envío SHALL llevar un recargo cuando supere los tres artículos y uno mayor cuando supere los
diez, y ambos SHALL ser excluyentes entre sí.

#### Scenario: Un pedido grande lleva el recargo mayor

- **GIVEN** un envío de `15` artículos
- **WHEN** se calcula
- **THEN** se aplica únicamente el recargo correspondiente a más de diez

### Requirement: Distancia entre origen y destino

El sistema SHALL calcular la distancia entre el domicilio del comercio y el del comprador a partir
de sus coordenadas geográficas, sobre la superficie terrestre.

Cuando falten las coordenadas de cualquiera de los dos, no SHALL aplicarse recargo por distancia.

#### Scenario: Sin coordenadas no hay recargo por distancia

- **GIVEN** un envío nacional cuyo domicilio de destino carece de coordenadas
- **WHEN** se calcula
- **THEN** el costo se compone sin recargo por distancia

### Requirement: Las tarifas son datos configurables

Las tarifas base, las tarifas por kilogramo, los umbrales y los importes de los recargos SHALL ser
datos configurables, no valores fijados en el código.

Un cambio de tarifa SHALL surtir efecto sin desplegar código.

#### Scenario: Se cambia una tarifa sin desplegar

- **WHEN** se modifica la tarifa base de los envíos locales
- **THEN** los cálculos posteriores usan la tarifa nueva

### Requirement: El tipo de cambio es configurable y trazable

Cuando el costo deba expresarse en una moneda distinta de la de las tarifas, el sistema SHALL
convertirlo con un tipo de cambio configurable, y SHALL registrar junto al envío qué tipo se aplicó.

El tipo de cambio no SHALL estar fijado en el código.

#### Scenario: Se registra el tipo aplicado

- **WHEN** se calcula un envío en una moneda distinta de la de las tarifas
- **THEN** el desglose incluye el importe en la moneda de origen y el tipo de cambio usado

### Requirement: Desglose del costo

El resultado SHALL incluir el desglose del cálculo: la modalidad, el peso real total, el peso
volumétrico total, el peso facturable, el número de artículos, la tarifa base, la parte variable,
los recargos aplicados y el total.

#### Scenario: El desglose explica el importe

- **WHEN** se calcula un envío
- **THEN** el desglose permite reconstruir el total a partir de sus componentes

### Requirement: Faltan datos para calcular

Cuando un artículo carezca de dimensiones o de peso, el sistema SHALL rechazar el cálculo indicando
qué artículo y qué dato falta, en lugar de asumir un valor.

#### Scenario: Un artículo sin peso detiene el cálculo

- **GIVEN** un carrito con un artículo sin peso declarado
- **WHEN** se solicita el costo de envío
- **THEN** la operación se rechaza
- **AND** el mensaje identifica el artículo y el dato que falta
