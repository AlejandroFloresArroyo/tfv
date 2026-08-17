# 12 · Catálogo de almacén

## Por qué

Almacenes, árbol de ubicaciones, catálogo con variantes y accesorios, medidas con su ficha de
sastrería, listas de precios y unidades de existencia. Es el cimiento del servicio de almacenes y
abre la columna de comercio.

Reimplementación en su mayor parte, con un cambio de fondo: **la creación de un producto con toda su
estructura pasa a ser atómica**. Hoy crea de forma recursiva medidas, unidades, tarifas, variantes y
accesorios sin transacción, así que un fallo a mitad deja un producto incompleto y difícil de
detectar.

## Qué entra

- Almacén con su identificador legible, publicación y baja.
- Árbol de ubicaciones con código autogenerado y regeneración sólo al cambiar de tipo.
- Producto con variantes y accesorios como hijos, con herencia de clasificación.
- Propagación de la reclasificación a los hijos.
- Medidas con dimensiones, peso, unidades y ficha de sastrería.
- Listas de precios y tarifas de venta, renta y penalización.
- Precedencia de precio, declarada explícitamente.
- Unidades de existencia con sus once estados, alta y modificación individual y masiva.
- Etiquetas legibles por máquina, individuales y en lote.
- Historial de cambio de estado por unidad.

## Correcciones incluidas

| Ref | Corrección |
|---|---|
| C-08 | La baja de almacén deja de borrar de la tabla de empresas |
| L-04 | La asignación masiva a una lista de precios ejecuta las bajas |

## Criterios de aceptación

- Crear un producto con estructura falla sin dejar nada a medias.
- El código de una ubicación se regenera al cambiar de tipo y no al renombrarla.
- Los códigos de ubicación no se cruzan entre almacenes.
- Establecer el conjunto de productos de una lista de precios retira efectivamente los que sobran.
- Una unidad comprometida no cambia de estado a mano.
- Una unidad en estado terminal no vuelve a comprometerse.
- Eliminar una ubicación deja sus productos sin ubicación, sin eliminarlos.
- El historial permite reconstruir la vida de una unidad.

## Riesgos

**El historial por unidad no existe hoy.** Es un requisito nuevo de `stock-units` y hay que decidir
si se reconstruye retroactivamente en la rebanada 30 o si empieza en el corte. Reconstruirlo no es
posible con fidelidad: sólo se conoce el estado final.

## Specs

`warehouses-and-storage` · `warehouse-catalog` · `stock-units`
