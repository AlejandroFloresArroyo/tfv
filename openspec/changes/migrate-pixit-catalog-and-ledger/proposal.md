# 24 · Catálogo y libro de inventario de Pixit

## Por qué

Los datos maestros del negocio de mosaicos y el inventario de las tiendas, que se lleva como un
libro mayor: nada se modifica, nada se borra, sólo se anexan asientos.

El cambio de fondo es hacer **efectiva** esa inmutabilidad. Hoy es una convención que el código no
respeta: anular una venta **borra los movimientos que generó** (`DEFECTS.md` F-10), lo que destruye
el libro y hace imposible reconstruir el histórico.

Hay además una corrección de precisión en las lecturas del inventario: los manejadores de
movimientos **operan sobre la definición en lugar de sobre el movimiento** (`DEFECTS.md` C-06).

## Qué entra

- Catálogo: tableros, tamaños, láminas, colores, salas, términos, productos y tiendas.
- Consulta de qué falta por dar de alta en una tienda.
- Definiciones de inventario por tienda, con precio propio.
- Movimientos inmutables, con la existencia como suma.
- Doble unidad en los ladrillos, con signos coherentes.
- Piezas por bolsa como configuración, no constante del código.
- Árbol de movimientos que compone la estructura de un mosaico vendido.
- Anulación por asientos compensatorios, con el original conservado.
- Existencia negativa sólo con autorización, señalada como incidencia.
- Aviso de existencia baja.

## Correcciones incluidas

| Ref | Corrección |
|---|---|
| F-10 | Anular una venta genera compensaciones en lugar de borrar el libro |
| C-06 | Las lecturas de movimientos consultan movimientos, no definiciones |
| C-07 | Las eliminaciones de tablero y tamaño dejan de borrar de la tabla de colores |
| L-07 | Se retira la cascada que filtra por un campo inexistente |
| R-01 · R-02 · R-03 | Se resuelven las referencias colgantes de los pedidos web |

## Decisión pendiente

**`DEFECTS.md` F-10 está marcado como `DECIDIR`.** La spec asume compensación, que es lo coherente
con un libro mayor, pero conviene confirmarlo con quien lleva la contabilidad de las tiendas.

## Criterios de aceptación

- Un movimiento existente no se puede modificar ni eliminar, ni siquiera por error de código.
- La existencia de una definición es la suma de sus movimientos.
- Anular una venta deja la existencia como estaba y conserva los movimientos originales.
- Un movimiento no se puede compensar dos veces.
- Una salida que dejaría existencia negativa se rechaza sin autorización.
- Con autorización, la existencia negativa queda señalada.
- Se puede reconstruir la estructura completa de un mosaico vendido desde sus movimientos.
- Cambiar las piezas por bolsa surte efecto sin desplegar.
- No se elimina una definición con existencia distinta de cero.
- No se elimina una tienda con la caja abierta.

## Specs

`pixit-catalog` · `pixit-inventory-ledger` (con su `design.md`)
