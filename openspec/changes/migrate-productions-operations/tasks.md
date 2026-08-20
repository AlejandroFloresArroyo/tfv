# 22 · Operación de producciones — trabajo

## Inventario

- [x] Artículos con sus ocho estados y su código único
- [x] Etiqueta legible por máquina y localización por código — el símbolo lo dibuja la pantalla (29); el servidor garantiza el viaje de ida y vuelta
- [x] Cambio de estado atribuido — cerrado por la `0030` con `production_item_events`, calcada de `warehouse_stock_events`. El alta, el cambio a mano y el cierre de una nota firman su paso **dentro de la transacción que lo provocó**. Cierra `HALLAZGOS.md` H-171
- [x] Consulta de dónde se usa: notas, sets y jornadas — los tres sitios, con la continuidad concreta
- [x] Eliminar retira de sets y continuidades, sin eliminarlos
- [x] Impedir eliminar un artículo en una nota sin cerrar — la comprobación vive en la aplicación, **enumera las notas que lo retienen** y responde `409`. El `ON DELETE restrict` sigue sin sujetar nada y por eso no se usa. Cierra `HALLAZGOS.md` H-172
- [x] Búsqueda y filtrado

## Notas de entrega

- [x] Nota con sus cuatro estados, y su dirección: salida o devolución
- [x] Componer la lista de artículos pone la nota en curso — se diferencia en lugar de rehacer, así que una línea que sigue conserva su verificación
- [x] Verificación por línea, con verificador e instante
- [x] Deshacer la verificación borra la atribución
- [x] **Impedir el cierre con líneas pendientes, indicando cuántas** — la cuenta va dentro del mensaje
- [x] **Cierre atómico que marca los artículos como entregados** — y en una devolución, en el estado que declaró cada línea. `canDeliver` es el único camino a «entregado»; `changeItemStatus` sigue sin llegar ahí
- [x] Firmas de ambas partes, inmutables — **y no bloquean el cierre**, que es decisión de producto contra la lectura literal de la spec: en un set se firma en papel y una nota que no se pudiera cerrar dejaría artículos atrapados en `delivered` para siempre. Razonado en la cabecera de `deliveries.ts`
- [x] Documento y enlace público — el servidor compone la hoja y firma la referencia, reutilizando entera la maquinaria de la cotización. **La pantalla que lo dibuja no existe todavía**: `HALLAZGOS.md` H-201
- [x] Eliminar la nota devuelve sus artículos a disponible — sólo los que **esta** nota dejó entregados y siguen estándolo, lo cual se lee de su historial

## Planes de trabajo

- [ ] Plan con sus cinco estados, fecha y responsable
- [ ] Asociación opcional a escena, con desvinculación
- [ ] Tareas con sus cuatro estados, creador inmutable y responsable
- [ ] Actividades con sus dos estados
- [ ] Recuentos y desgloses por estado
- [ ] Comentarios en planes y en tareas
- [ ] Archivos adjuntos en tareas y actividades
- [ ] Eliminación en cascada con enumeración previa
- [ ] Documento y enlace público

## Calendario

- [ ] Vistas por año, mes, semana y día
- [ ] Vista y fecha en la dirección
- [ ] Cambio de vista conservando la fecha
- [ ] Filtrado de tareas dentro de los planes, por categoría y personaje
- [ ] Consulta de planes por escena y por capítulo

## Presupuesto

- [ ] Anclas con importe, categoría y comprobantes
- [ ] Compras con importe, tipo, método, proveedor y facturas
- [ ] Identificación parcial del pago con tarjeta, sin el número completo
- [ ] Reconciliación de artículos por compra; uno pertenece como máximo a una
- [ ] Eliminar una compra libera sus artículos
- [ ] **Lectura derivada, sin total persistido**
- [ ] Totales filtrados junto a los generales
- [ ] Documento y presentación gráfica

## Verificación

- [x] Prueba: no se cierra la nota con pendientes
- [x] Prueba: el cierre es atómico — comprobada además por mutación: separando las escrituras en transacciones propias, la prueba se pone roja
- [x] Prueba: eliminar la nota devuelve los artículos
- [ ] Prueba: un artículo cambia de compra y sale de la anterior
- [ ] Prueba: el presupuesto refleja un gasto nuevo de inmediato
- [ ] Prueba: una semana del calendario se comparte por enlace
