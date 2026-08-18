# Diseño — Reserva de existencias

Modelo de datos e invariantes de la máquina que une cotizaciones e inventario. Complementa a
[`spec.md`](./spec.md), que describe el comportamiento observable.

> **Dos nombres corregidos al implementar.** La trazabilidad de acuñación son **dos** columnas y no
> una referencia: una marca booleana y la cotización que la motivó, esta última **sin clave
> foránea**, porque la cotización pertenece a un módulo que importa a éste y declararla cerraría un
> ciclo. Es metainformación de auditoría, no una relación estructural: si la cotización desaparece,
> la marca sigue siendo cierta. Y la tarifa de una línea apunta al precio de un producto en una
> lista (`product_price_id`), no a la lista entera.

## Tablas

```
warehouse_product_measurement
  id, product_id, ...                              ← el nivel al que se lleva existencia

warehouse_stock_unit                               ← una fila = un objeto físico
  id, measurement_id, code (unique), status, deleted_at
  created_by_reservation     boolean               ← trazabilidad de acuñación (M-04)
  created_by_quote_id        nullable, sin clave foránea
  INDEX (measurement_id, status) WHERE deleted_at IS NULL

warehouse_quote_line
  id, quote_id, measurement_id, product_price_id, frequency,
  position, position_product

warehouse_stock_reservation                        ← el vínculo que aparta
  id, quote_line_id, stock_unit_id, quote_id
  UNIQUE (stock_unit_id) WHERE released_at IS NULL ← una unidad, una reserva viva
  released_at nullable

warehouse_stock_unit_event                         ← historial de estados
  id, stock_unit_id, from_status, to_status,
  reason, actor_id, quote_id nullable, occurred_at
```

### Por qué el vínculo es una tabla y no una columna

Poner `quote_line_id` en la unidad parecería más simple, pero pierde dos cosas: el índice único
parcial que impide la doble reserva, y la posibilidad de conservar el histórico de reservas
liberadas. La tabla de vínculo da ambas.

El índice `UNIQUE (stock_unit_id) WHERE released_at IS NULL` es **la garantía estructural** de que
una unidad no se reserva dos veces. No depende de que la aplicación lo compruebe.

## Invariantes

| # | Invariante | Cómo se garantiza |
|---|---|---|
| I-1 | Una unidad tiene como máximo una reserva viva | Índice único parcial |
| I-2 | El estado de una unidad con reserva viva es el que proyecta su cotización | Verificación periódica |
| I-3 | Una línea con cantidad *n* tiene exactamente *n* reservas vivas | Transacción de reconciliación |
| I-4 | Una unidad en estado terminal no tiene reserva viva | Comprobación en la transición |

I-2 es el requisito de coherencia de la spec. Se comprueba con una consulta de reconciliación
programada, no en cada escritura.

**Enunciado corregido al implementarlo.** Decía «unidades `in_quote` de una medida = reservas vivas
de esa medida», y así no se sostiene: una cotización en renta conserva sus vínculos y sus unidades
están `rented`, no `in_quote`, de modo que la igualdad falla sin que nada esté mal. La comprobación
real es contra la **proyección**, que subsume la anterior y además detecta el caso contrario —una
unidad comprometida que ya nadie reclama—. Las dos formas de romperse se comunican identificando la
unidad.

## Transacciones

### Reservar (aumentar cantidad)

```sql
BEGIN;
  -- 1. Bloquear las candidatas. SKIP LOCKED evita que dos reservas
  --    concurrentes se bloqueen entre sí: la segunda toma otras filas.
  SELECT id FROM warehouse_stock_unit
   WHERE measurement_id = $1
     AND status = 'available'
     AND deleted_at IS NULL
   ORDER BY created_at
   LIMIT $delta
   FOR UPDATE SKIP LOCKED;

  -- 2. Si faltan y no hay autorización de acuñación → abortar.
  --    Si hay autorización → insertar unidades marcadas y con su cotización.

  -- 3. Insertar vínculos, actualizar estado, registrar eventos.
COMMIT;
```

`FOR UPDATE SKIP LOCKED` es la pieza clave del escenario de concurrencia: sin él, dos reservas
simultáneas sobre la misma medida se serializan y la segunda puede fallar por tiempo de espera en
lugar de tomar limpiamente otras unidades.

### Liberar (disminuir cantidad)

Marcar `released_at`, devolver las unidades a `available` y registrar el evento. Se liberan las
**más recientemente reservadas**, para que las que llevan más tiempo apartadas sigan estándolo.

### Proyectar el estado de la cotización

Una sola sentencia sobre todas las unidades de la cotización, más la inserción de eventos. La tabla
de proyección de la spec se traduce a una expresión condicional; conviene mantenerla en **un solo
lugar** del código y no repetirla por endpoint.

## Concurrencia con el checkout público

`storefront-checkout` también aparta unidades, con la misma tabla y el mismo índice único. Un
checkout es, a efectos de esta tabla, una reserva con caducidad:

```
warehouse_stock_reservation
  ...
  checkout_id  nullable          ← excluyente con quote_line_id
  expires_at   nullable          ← sólo en reservas de checkout
```

La restricción es que exactamente uno de `quote_line_id` y `checkout_id` esté presente. El
recolector de reservas caducadas libera las que superen `expires_at`.

## Decisiones abiertas

- **M-04 — acuñación de inventario.** La spec exige autorización explícita. Si negocio confirma que
  es una prestación deliberada, el cambio es el valor por defecto del parámetro, no el modelo:
  la marca de acuñación ya deja el rastro en cualquier caso.
- **Retorno de renta.** La spec introduce el retorno explícito, que no existía. Si se decide
  registrar además la fecha prevista de devolución, va en la cotización, no aquí.
