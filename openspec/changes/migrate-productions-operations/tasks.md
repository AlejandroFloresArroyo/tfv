# 22 · Operación de producciones — trabajo

## Inventario

- [x] Artículos con sus ocho estados y su código único
- [x] Etiqueta legible por máquina y localización por código — el símbolo lo dibuja la pantalla (29); el servidor garantiza el viaje de ida y vuelta
- [ ] Cambio de estado atribuido — **el cambio está hecho y probado contra su tabla de transiciones; la atribución no tiene dónde escribirse**: `production_items` no lleva columna de autor y no hay tabla de eventos del artículo. Cerrarlo es una migración y este árbol no tiene número. Ver `HALLAZGOS.md` H-171
- [ ] Consulta de dónde se usa: notas, sets y jornadas — **sets y jornadas hechas**, con la continuidad concreta; las **notas** esperan a que existan las notas de entrega, en esta misma rebanada
- [x] Eliminar retira de sets y continuidades, sin eliminarlos
- [ ] Impedir eliminar un artículo en una nota sin cerrar — **bloqueada**: las notas de entrega no existen todavía, así que no hay contra qué comprobarlo ni cómo probarlo. Y la red que parecía estar puesta no sujeta: el `ON DELETE restrict` de `production_delivery_lines` no se dispara nunca porque la baja del artículo es lógica (`HALLAZGOS.md` H-172)
- [x] Búsqueda y filtrado

## Notas de entrega

- [ ] Nota con sus cuatro estados
- [ ] Componer la lista de artículos pone la nota en curso
- [ ] Verificación por línea, con verificador e instante
- [ ] Deshacer la verificación borra la atribución
- [ ] **Impedir el cierre con líneas pendientes, indicando cuántas**
- [ ] **Cierre atómico que marca los artículos como entregados**
- [ ] Firmas de ambas partes, inmutables
- [ ] Documento y enlace público
- [ ] Eliminar la nota devuelve sus artículos a disponible

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

- [ ] Prueba: no se cierra la nota con pendientes
- [ ] Prueba: el cierre es atómico
- [ ] Prueba: eliminar la nota devuelve los artículos
- [ ] Prueba: un artículo cambia de compra y sale de la anterior
- [ ] Prueba: el presupuesto refleja un gasto nuevo de inmediato
- [ ] Prueba: una semana del calendario se comparte por enlace
