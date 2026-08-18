# Cálculo de cotizaciones

## Purpose

El motor que convierte las líneas de una cotización, sus condiciones de pago y su bloque de
impuestos en los importes que el cliente ve y firma.

Es la pieza más delicada del sistema por tres razones: encadena una docena de operaciones cuyo
**orden importa**, produce cifras con consecuencias fiscales, y hoy vive **entera en el navegador**,
sin que el servidor valide nada de lo que se cobra (ver `DEFECTS.md` M-06).

Esta spec transcribe la cadena de cálculo. No la parafrasea: las fórmulas están literales porque un
matiz de orden cambia el importe final.

### Cadena de cálculo

**Por línea:**

```
días            = fin − inicio, en días
frecuenciaDías  = diaria:  días
                  semanal: días ÷ 7
                  mensual: días ÷ 30            (2 decimales)
díasAplicados   = si se redondea → techo o piso de frecuenciaDías, según la dirección
                  si no          → frecuenciaDías

precioBase      = tarifa de venta, o precio del producto, o cero    (ver warehouse-catalog)
precioRenta     = si la tarifa de renta es fija → su importe fijo
                  si no                         → la tarifa de la frecuencia, o precioBase
precioPenaliz.  = si la penalización es fija    → su importe fijo
                  si no                         → la penalización de la frecuencia, o cero

costoUnitario   = renta → precioRenta ; venta → precioBase
descUnitario    = hay descuento por producto → round(costoUnitario × desc% ÷ 100, 2) ; si no → 0
totalUnitario   = (renta → round(precioRenta × díasAplicados, 2) ; venta → precioBase) − descUnitario

costo     = round(costoUnitario  × cantidad, 2)
descuento = round(descUnitario   × cantidad, 2)
total     = round(totalUnitario  × cantidad, 2)
penaliz.  = round(precioPenaliz. × cantidad, 2)
```

**Del documento:**

```
1.  subtotal        = Σ total de líneas + Σ conceptos adicionales
2.  descuentoGlobal = si hay descuento global → por porcentaje o por importe
3.  base            = subtotal − descuentoGlobal
4.  si hay precio fijo → base = precio fijo, con su descuento aplicado igual
5.  impuestos       = Σ de los que aumentan − Σ de los que disminuyen   (ver tabla)
6.  neto            = base + impuestos
7.  comisiones      = comisión por transferencia + comisión adicional, como porcentaje sobre el neto
8.  bruto           = neto + comisiones
9.  total           = bruto − anticipo, si lo hay
10. penalización    = si hay penalización → importe fijo, o Σ penalizaciones de línea
```

### Tratamiento de cada impuesto

| Concepto | Efecto sobre la base |
|---|---|
| IVA trasladado | Aumenta |
| IVA acreditable o exento | No interviene |
| Retención de IVA | Disminuye |
| ISR retenido | Disminuye |
| ISR directo | Aumenta |
| Retención de ISR | Disminuye |
| IEPS | Aumenta |
| ISN | Aumenta |
| Impuesto de hospedaje | Aumenta |
| Impuesto fronterizo | Aumenta |
| Contribución adicional | Según su tipo: porcentaje o importe, con el signo que declare |

> **Pendiente de confirmación (`DEFECTS.md` M-05).** La implementación anterior aplicaba **dos
> convenciones de signo distintas** según se repartieran o no las comisiones entre líneas: una
> pasada calculaba `IVA + ISR − retención` y la otra `IVA − ISR + retención`. Son incompatibles y
> una de las dos está mal. La tabla anterior recoge el criterio fiscal habitual; el tratamiento del
> **ISR directo** necesita confirmación de administración antes de darse por bueno.

## Requirements

### Requirement: El cálculo es autoridad del servidor

Los importes de una cotización SHALL calcularse en el servidor, y SHALL ser los únicos válidos.

El sistema no SHALL aceptar importes calculados por el cliente. Cualquier importe recibido SHALL
recalcularse y, si difiere, SHALL prevalecer el del servidor.

#### Scenario: Un importe manipulado no se acepta

- **WHEN** se envía una cotización con un total inferior al que corresponde a sus líneas
- **THEN** el sistema recalcula y almacena el importe correcto
- **AND** el importe enviado se descarta

#### Scenario: El cliente puede previsualizar

- **WHEN** la interfaz muestra los importes antes de guardar
- **THEN** coinciden con los que el servidor calculará
- **AND** proceden del mismo cálculo, no de una reimplementación

### Requirement: Conversión de días según la frecuencia

El sistema SHALL convertir el número de días del periodo a unidades de la frecuencia de cobro,
dividiendo entre uno para la diaria, entre siete para la semanal y entre treinta para la mensual, con
dos decimales.

#### Scenario: Diez días en frecuencia semanal

- **GIVEN** un periodo de diez días y frecuencia semanal
- **WHEN** se convierte
- **THEN** el resultado es `1.43`

#### Scenario: Cuarenta y cinco días en frecuencia mensual

- **GIVEN** un periodo de cuarenta y cinco días y frecuencia mensual
- **WHEN** se convierte
- **THEN** el resultado es `1.50`

### Requirement: Redondeo opcional de los días aplicados

Cuando la cotización indique redondear los días, el sistema SHALL aplicar techo o piso al valor
convertido, según la dirección indicada.

Cuando el redondeo produzca cero, SHALL conservarse el valor sin redondear, para no cobrar cero por
un periodo real.

#### Scenario: Redondeo hacia arriba

- **GIVEN** una conversión de `1.43` semanas con redondeo hacia arriba
- **WHEN** se aplica
- **THEN** los días aplicados son `2`

#### Scenario: Redondeo hacia abajo

- **GIVEN** la misma conversión con redondeo hacia abajo
- **WHEN** se aplica
- **THEN** los días aplicados son `1`

#### Scenario: Un redondeo a cero conserva el valor real

- **GIVEN** una conversión de `0.43` meses con redondeo hacia abajo
- **WHEN** se aplica
- **THEN** los días aplicados son `0.43`
- **AND** no son `0`

### Requirement: Precio unitario de renta y de venta

El costo unitario SHALL ser el precio de renta cuando la cotización sea de renta, y el precio base
cuando sea de venta.

El precio de renta SHALL ser el importe fijo cuando la tarifa lo declare fijo, y en caso contrario
el correspondiente a la frecuencia. Cuando la frecuencia no tenga tarifa, la línea SHALL quedar
**sin precio**, y el sistema SHALL señalarlo para que se fije uno.

> **Corregido al implementarlo.** Decía «recurriendo al precio base cuando la frecuencia no tenga
> tarifa», y el precio base de un producto es su precio de **venta**. Multiplicado por los días de
> una renta de dos semanas, eso cobra el equipo catorce veces. No es un caso extremo: las listas de
> precios por día, semana y mes están sin llenar en la inmensa mayoría de los almacenes, así que
> ése era el camino normal. Un importe inventado con apariencia de cifra correcta es peor que la
> ausencia de importe. Ver `HALLAZGOS.md`.

#### Scenario: Una tarifa fija ignora los días

- **GIVEN** una línea de renta con tarifa fija de `500.00`
- **WHEN** se calcula
- **THEN** el costo unitario es `500.00` con independencia de la frecuencia

#### Scenario: Sin tarifa para la frecuencia la línea queda sin precio

- **GIVEN** una tarifa de renta sin importe mensual y una línea con frecuencia mensual
- **WHEN** se calcula
- **THEN** el total de la línea es `0.00`
- **AND** la línea queda señalada como sin precio

#### Scenario: Una venta sí usa el precio base

- **GIVEN** una cotización de venta y un producto con precio base `1500.00`
- **WHEN** se calcula
- **THEN** el costo unitario es `1500.00`
- **AND** la línea no queda señalada como sin precio

### Requirement: Precio negociado de una línea

Una línea SHALL poder declarar un **precio negociado** que sustituya a toda tarifa. Ese importe
SHALL ser el total de la línea **para el periodo completo**: no se multiplica por los días
aplicados ni por la cantidad.

Una línea con precio negociado no SHALL tener precio unitario: repartir el total entre sus unidades
no da un importe exacto, y un precio unitario que no multiplica hasta el total es un dato falso en
el documento que el cliente usa para discutir.

El precio negociado SHALL convivir con la tarifa de la línea sin borrarla, de modo que retirarlo
devuelva el cálculo por tarifa.

#### Scenario: El precio negociado sustituye a la tarifa y a los días

- **GIVEN** una línea de renta de tres unidades con tarifa de `100.00` diarios, diez días aplicados
  y un precio negociado de `3500.00`
- **WHEN** se calcula
- **THEN** el total de la línea es `3500.00`
- **AND** la línea no informa precio unitario

#### Scenario: Retirar el precio negociado devuelve la tarifa

- **GIVEN** la misma línea sin precio negociado
- **WHEN** se calcula
- **THEN** el total de la línea es `3000.00`

### Requirement: Total de una línea de renta

El total de una línea de renta SHALL ser el precio de renta multiplicado por los días aplicados,
menos su descuento unitario, todo multiplicado por la cantidad.

#### Scenario: Se multiplica por días y por cantidad

- **GIVEN** una línea de renta de tres unidades a `100.00` por semana, con dos semanas aplicadas y sin descuento
- **WHEN** se calcula
- **THEN** el total de la línea es `600.00`

### Requirement: Total de una línea de venta

El total de una línea de venta SHALL ser el precio base menos su descuento unitario, multiplicado
por la cantidad, sin intervenir los días.

#### Scenario: Los días no afectan a una venta

- **GIVEN** una línea de venta de dos unidades a `250.00`
- **WHEN** se calcula con cualquier ventana de fechas
- **THEN** el total de la línea es `500.00`

### Requirement: Descuento por producto

Cuando la cotización indique descuento por producto, el sistema SHALL aplicarlo sobre el costo
unitario de cada línea antes de multiplicar por la cantidad.

Cuando no lo indique, el descuento unitario SHALL ser cero y el descuento se aplicará de forma
global.

#### Scenario: El descuento por producto reduce cada línea

- **GIVEN** un descuento por producto del diez por ciento y una línea de cuatro unidades a `200.00`
- **WHEN** se calcula
- **THEN** el descuento de la línea es `80.00`
- **AND** su total es `720.00`

### Requirement: Redondeo por línea antes de sumar

Cada importe de línea SHALL redondearse a dos decimales **antes** de sumarse al subtotal, de modo
que las líneas mostradas siempre cuadren con el total.

#### Scenario: Las líneas impresas suman el subtotal

- **GIVEN** una cotización con cinco líneas de importes con decimales
- **WHEN** se calcula
- **THEN** la suma de los cinco importes mostrados es exactamente el subtotal mostrado

### Requirement: Conceptos adicionales en el subtotal

Los conceptos adicionales declarados en las condiciones de pago SHALL sumarse al subtotal junto con
los totales de línea.

#### Scenario: Un concepto adicional entra en el subtotal

- **GIVEN** líneas que suman `1000.00` y un concepto adicional de `150.00`
- **WHEN** se calcula
- **THEN** el subtotal es `1150.00`

### Requirement: Descuento global

Cuando la cotización declare un descuento global, el sistema SHALL aplicarlo sobre el subtotal, como
porcentaje o como importe según se indique.

#### Scenario: Descuento global por porcentaje

- **GIVEN** un subtotal de `1000.00` y un descuento global del quince por ciento
- **WHEN** se calcula
- **THEN** el descuento es `150.00` y la base es `850.00`

#### Scenario: Descuento global por importe

- **GIVEN** un subtotal de `1000.00` y un descuento global de `120.00`
- **WHEN** se calcula
- **THEN** la base es `880.00`

### Requirement: Precio fijo que sustituye a la base

Cuando la cotización declare un precio fijo, éste SHALL sustituir a la base calculada, y el
descuento global SHALL aplicarse igualmente sobre él.

Las líneas SHALL seguir mostrándose con sus importes, pero el documento SHALL dejar claro que el
importe acordado es el fijo.

#### Scenario: El precio fijo manda

- **GIVEN** líneas que suman `1000.00` y un precio fijo de `800.00`
- **WHEN** se calcula
- **THEN** la base es `800.00`

#### Scenario: El descuento se aplica sobre el precio fijo

- **GIVEN** un precio fijo de `800.00` y un descuento global del diez por ciento
- **WHEN** se calcula
- **THEN** la base es `720.00`

### Requirement: Aplicación de los impuestos

El sistema SHALL aplicar cada impuesto activo sobre la base, aumentándola o disminuyéndola conforme
a la tabla de tratamiento.

Un impuesto desactivado no SHALL intervenir, aunque tenga porcentaje registrado.

#### Scenario: El IVA trasladado aumenta la base

- **GIVEN** una base de `1000.00` con IVA trasladado del dieciséis por ciento
- **WHEN** se calcula
- **THEN** el neto es `1160.00`

#### Scenario: Una retención disminuye la base

- **GIVEN** una base de `1000.00` con una retención de IVA del diez punto seis siete por ciento
- **WHEN** se calcula
- **THEN** la retención resta `106.70`

#### Scenario: Un impuesto desactivado no interviene

- **GIVEN** una base de `1000.00` con un porcentaje de ISN registrado pero desactivado
- **WHEN** se calcula
- **THEN** el ISN no altera el neto

### Requirement: Una sola convención de signo

El sistema SHALL aplicar **la misma** convención de signo a los impuestos con independencia de si
las comisiones se reparten entre las líneas.

Los importes de una cotización no SHALL variar por activar o desactivar el reparto de comisiones más
allá de la redistribución de esas comisiones.

Este requisito existe porque la implementación anterior usaba dos convenciones incompatibles según
la modalidad (ver `DEFECTS.md` M-05).

#### Scenario: Activar el reparto no cambia los impuestos

- **GIVEN** una cotización con IVA, ISR y retenciones
- **WHEN** se activa el reparto de comisiones entre líneas
- **THEN** el importe total de impuestos es el mismo que sin repartir
- **AND** lo único que cambia es dónde aparecen las comisiones

### Requirement: Comisiones aplicadas sobre el neto

La comisión por transferencia y la comisión adicional SHALL aplicarse como porcentaje sobre el neto,
después de los impuestos.

#### Scenario: Las comisiones se calculan sobre el neto

- **GIVEN** un neto de `1160.00` y una comisión por transferencia del tres por ciento
- **WHEN** se calcula
- **THEN** la comisión es `34.80` y el bruto es `1194.80`

### Requirement: Reparto de comisiones entre líneas

Cuando la cotización indique repartir las comisiones, el sistema SHALL distribuirlas entre las
unidades cotizadas e incorporarlas al precio unitario de cada línea, en lugar de mostrarlas como
concepto aparte.

El reparto SHALL ser exacto: cuando la división no sea entera, el residuo SHALL asignarse a la
última línea, de modo que la suma de las líneas siga siendo igual al total.

#### Scenario: El reparto no altera el total

- **GIVEN** una cotización con comisiones y varias líneas
- **WHEN** se activa el reparto
- **THEN** el total es el mismo que sin repartir
- **AND** las comisiones ya no aparecen como concepto separado

#### Scenario: El residuo va a la última línea

- **GIVEN** una comisión de `10.00` a repartir entre tres unidades
- **WHEN** se reparte
- **THEN** la suma de lo repartido es exactamente `10.00`
- **AND** el residuo se asigna a la última línea

### Requirement: El anticipo se descuenta del total

Cuando la cotización declare un anticipo, el sistema SHALL descontarlo del bruto para obtener el
total pendiente de pago.

El documento SHALL mostrar el bruto, el anticipo y el pendiente por separado.

#### Scenario: El anticipo reduce lo pendiente

- **GIVEN** un bruto de `1194.80` y un anticipo de `500.00`
- **WHEN** se calcula
- **THEN** el total pendiente es `694.80`
- **AND** el documento muestra los tres importes

### Requirement: Penalización calculada aparte

La penalización SHALL calcularse de forma independiente del total, como importe fijo cuando se
declare fijo, y como suma de las penalizaciones de línea en caso contrario.

La penalización no SHALL sumarse al total: es un importe contingente que sólo se cobra si procede.

#### Scenario: La penalización no altera el total

- **GIVEN** una cotización con penalizaciones de línea
- **WHEN** se calcula
- **THEN** el total no las incluye
- **AND** se muestran como importe contingente aparte

#### Scenario: Una penalización fija ignora las líneas

- **GIVEN** una penalización declarada fija
- **WHEN** se calcula
- **THEN** su importe es el declarado, con independencia de las líneas

### Requirement: Los importes se congelan al cerrar

Cuando una cotización alcance un estado cerrado, sus importes calculados SHALL persistirse y no
SHALL recalcularse en lecturas posteriores.

Un cambio en el catálogo, en las tarifas o en la configuración fiscal no SHALL alterar una
cotización ya cerrada.

#### Scenario: Una cotización cerrada no se mueve

- **GIVEN** una cotización completada por un total determinado
- **WHEN** se duplican las tarifas de todos sus productos
- **THEN** su total sigue siendo el mismo

#### Scenario: Una cotización abierta sí se recalcula

- **GIVEN** una cotización en progreso
- **WHEN** cambia la tarifa de uno de sus productos
- **THEN** su total refleja el cambio

### Requirement: Agrupación por producto en la presentación

El cálculo SHALL exponer las líneas agrupadas por producto, con el subtotal de cada grupo, para que
el documento pueda presentarlas así.

El orden SHALL respetar el establecido en la cotización, según `quotations`.

#### Scenario: Las medidas se agrupan bajo su producto

- **GIVEN** una cotización con tres medidas de dos productos distintos
- **WHEN** se calcula
- **THEN** el resultado presenta dos grupos con su subtotal
- **AND** el orden es el establecido en la cotización

### Requirement: Trazabilidad del cálculo

El resultado del cálculo SHALL exponer cada paso intermedio —subtotal, descuentos, base, cada
impuesto por separado, comisiones, anticipo y total— para que cualquier importe sea explicable.

#### Scenario: Se puede explicar cada cifra

- **WHEN** se consulta el cálculo de una cotización
- **THEN** cada importe intermedio es consultable por separado
- **AND** puede reconstruirse la cadena desde las líneas hasta el total
