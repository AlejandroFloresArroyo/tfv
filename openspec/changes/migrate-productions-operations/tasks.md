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

- [x] Plan con sus cinco estados, fecha y responsable — se adelantó con la rebanada 20 para que el panel pudiera resumirlos
- [x] Asociación opcional a escena, con desvinculación — `null` desvincula y omitir deja como estaba; la escena se resuelve **contra la producción**, así que una de otra empresa responde `404`
- [x] Tareas con sus cuatro estados, creador inmutable y responsable — el creador sale del actor y no aparece en ninguna entrada de edición
- [x] Actividades con sus dos estados
- [x] Recuentos y desgloses por estado — el desglose sólo cuando se pide, y **descontando las bajas lógicas**
- [x] Comentarios en planes y en tareas
- [x] Archivos adjuntos en tareas y actividades
- [x] Eliminación en cascada con enumeración previa — el alcance del plan cuenta las cuatro cosas que se pierden, no sólo las tareas
- [x] Documento y enlace público — reutiliza la referencia firmada; `work-plan` ya tenía su código de familia

## Calendario

- [x] Vistas por año, mes, semana y día — y **la fecha la resuelve el servidor** cuando no viene en la dirección, con el motivo (antes, durante, después, vacío) para que la pantalla nunca pinte una rejilla vacía sin explicarla
- [x] Vista y fecha en la dirección — sin fecha, la pantalla reescribe la dirección a la fecha resuelta
- [x] Cambio de vista conservando la fecha
- [x] Filtrado de tareas dentro de los planes, por categoría y personaje — los planes sin tareas coincidentes no aparecen
- [x] Consulta de planes por escena y por capítulo — el filtro de capítulo salta el tramo escena → capítulo con una expresión

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
- [x] Prueba: una semana del calendario se comparte por enlace — dos sesiones distintas de la misma empresa abren la misma dirección y obtienen el mismo rango y los mismos sucesos
