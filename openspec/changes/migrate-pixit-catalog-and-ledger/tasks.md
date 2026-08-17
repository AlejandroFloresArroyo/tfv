# 24 · Catálogo y libro de inventario de Pixit — trabajo

## Decisión previa

- [ ] Confirmar `DEFECTS.md` F-10: anulación por compensación

## Catálogo

- [ ] Tableros con sus tamaños; dimensiones de al menos uno
- [ ] Láminas con sus dimensiones en ladrillos
- [ ] Paleta de colores, con validación del valor cromático
- [ ] Salas con posición y escala
- [ ] Términos por idioma, con código único y texto enriquecido
- [ ] Productos de mercancía con existencia y descuento
- [ ] Tiendas, con comprobación de habilitación del servicio
- [ ] Identificadores legibles y publicación
- [ ] Consulta de qué falta por dar de alta en una tienda
- [ ] Impedir eliminar datos maestros en uso
- [ ] **Corregir las eliminaciones que borran de la tabla de colores**
- [ ] Impedir eliminar una tienda con la caja abierta

## Libro

- [ ] Definiciones por tienda, con precio propio
- [ ] Restricción única por tienda, tipo y referencia de catálogo
- [ ] **Revocar modificación y borrado sobre los movimientos**
- [ ] Existencia como vista de suma
- [ ] Alta con existencia inicial que genera su primer asiento
- [ ] Doble unidad en ladrillos, con restricción de signos coherentes
- [ ] Piezas por bolsa como configuración por tienda
- [ ] Derivación de bolsas desde piezas, redondeando hacia arriba
- [ ] **Corregir los manejadores que operan sobre la definición**
- [ ] **Retirar la cascada que filtra por un campo inexistente**

## Estructura del mosaico

- [ ] Referencia de movimiento padre y posición
- [ ] Reconstrucción del árbol tablero, lámina, ladrillo
- [ ] Referencia a la venta en todo movimiento que origine

## Anulación

- [ ] Asientos compensatorios de signo contrario
- [ ] Conservación de los originales
- [ ] Restricción única que impide compensar dos veces
- [ ] Operación atómica

## Existencia

- [ ] Rechazo de salida que dejaría existencia negativa
- [ ] Autorización explícita, con marca de incidencia
- [ ] Consulta de incidencias de inventario
- [ ] Umbral de existencia baja configurable por tienda
- [ ] Impedir eliminar una definición con existencia

## Referencias

- [ ] Resolver las tres referencias colgantes de los pedidos web

## Verificación

- [ ] Prueba: no se puede modificar un movimiento
- [ ] Prueba: la existencia es la suma
- [ ] Prueba: anular restituye la existencia y conserva el original
- [ ] Prueba: no se compensa dos veces
- [ ] Prueba: se reconstruye la estructura de un mosaico vendido
- [ ] Prueba: cambiar las piezas por bolsa surte efecto
