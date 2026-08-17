# Diseño — Cálculo de cotizaciones

Modelo de datos y estructura del motor. Complementa a [`spec.md`](./spec.md), que transcribe la
aritmética.

## Representación del dinero

Todo importe es `numeric(14,2)`. Nunca coma flotante — ni en la base, ni en el lenguaje, ni en el
transporte.

En el transporte, los importes viajan como **cadena decimal**, no como número, porque la
representación numérica de JSON es de coma flotante y `1234.56` no sobrevive intacto a un viaje de
ida y vuelta en todos los clientes.

Los porcentajes son `numeric(7,4)`: cuatro decimales bastan para retenciones como `10.6667` y evitan
arrastrar error al multiplicar.

## Tablas

```
warehouse_quote
  id, warehouse_id, client_id, type, status, folio, code,
  starts_on, ends_on, round_days, round_direction,
  payment      jsonb          ← condiciones de pago
  taxes        jsonb          ← bloque fiscal
  computed     jsonb nullable ← resultado congelado al cerrar
  computed_at  timestamptz nullable

warehouse_quote_line
  id, quote_id, measurement_id, price_list_id, frequency,
  position, position_product

warehouse_quote_additional
  id, quote_id, name, description, amount

warehouse_quote_payment
  id, quote_id, amount, method, description, paid_by_id, paid_at
```

### Por qué las condiciones y los impuestos son documentos

`payment` y `taxes` son estructuras de ~25 y ~20 campos que **siempre se leen enteras**, nunca se
consultan por un campo suelto y no se agregan entre cotizaciones. Normalizarlas produciría dos
tablas anchas de una fila cada una.

La contrapartida es que su forma no está garantizada por el esquema, así que se valida al escribir
y se versiona: cada documento lleva su versión de estructura, para poder evolucionarla sin migrar
todas las filas de golpe.

### Por qué el resultado se congela en una columna

`computed` guarda el desglose completo —cada importe intermedio de la cadena— en el momento de
cerrar la cotización. Es lo que hace posible el requisito de que una cotización cerrada no se mueva
aunque cambie el catálogo, y lo que permite explicar un importe de hace ocho meses.

Mientras la cotización esté abierta, `computed` es `NULL` y el desglose se calcula al vuelo.

## Estructura del motor

Una función pura, sin acceso a base de datos:

```
calcularCotización(entrada) → desglose
```

`entrada` reúne todo lo necesario: las líneas ya resueltas con su precio y su cantidad, las
condiciones de pago, el bloque fiscal y la ventana de fechas. `desglose` contiene cada paso
intermedio de la cadena.

Que sea pura es lo que permite:

- **Ejecutarla en los dos lados.** El navegador muestra el desglose mientras el usuario edita; el
  servidor lo recalcula al guardar. Misma función, mismo resultado — ese es el requisito de que la
  previsualización coincida con lo que el servidor calculará.
- **Probarla exhaustivamente.** Cada escenario de la spec es un caso de prueba directo, sin montar
  base de datos.

Vive en el paquete de contratos compartido, no en el servidor ni en el cliente.

## Orden de las operaciones

El orden **no es negociable** y está transcrito en la spec. Dos puntos donde es fácil equivocarse:

1. **Las comisiones van después de los impuestos**, sobre el neto. Aplicarlas antes cambia la base
   imponible y por tanto el importe de cada impuesto.
2. **El precio fijo sustituye a la base pero no al descuento.** El descuento global se aplica
   igualmente sobre él.

## Reparto de comisiones

Cuando se reparten entre líneas, la división rara vez es exacta. La regla de la spec —el residuo a
la última línea— se implementa repartiendo el suelo entre todas y asignando la diferencia a la
última:

```
porUnidad = piso(comisión ÷ unidadesTotales, 2)
repartido = porUnidad × unidadesTotales
residuo   = comisión − repartido        ← a la última línea
```

La prueba que importa: la suma de las líneas es exactamente igual al total, siempre.

## Índices

```
INDEX (warehouse_id, status, priority DESC)   ← la bandeja de trabajo
INDEX (client_id)
UNIQUE (folio) WHERE deleted_at IS NULL
```

La prioridad es una columna calculada a partir del estado, no un valor que la aplicación escriba —
así no puede quedar desincronizada.

## Decisiones abiertas

- **M-05 — convención de signo del ISR directo.** La spec fija la tabla de tratamiento y exige una
  sola convención. Falta que administración confirme el ISR directo. Es un cambio de una fila en la
  tabla del motor, no una reestructuración.
- **Alcance fiscal.** Si el bloque de impuestos aspira a cumplimiento CFDI, hará falta un catálogo
  de claves fiscales y validaciones que hoy no existen. La estructura documental lo admite sin
  migración.
