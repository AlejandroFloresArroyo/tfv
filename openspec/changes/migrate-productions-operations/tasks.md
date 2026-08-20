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
- [x] Documento y enlace público — el servidor compone la hoja y firma la referencia, reutilizando entera la maquinaria de la cotización, y **la pantalla que lo dibuja llegó con el presupuesto**: cierra `HALLAZGOS.md` H-201
- [x] Eliminar la nota devuelve sus artículos a disponible — sólo los que **esta** nota dejó entregados y siguen estándolo, lo cual se lee de su historial

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

- [x] Anclas con importe, categoría y comprobantes — clasificarlas va con la clave gruesa: el catálogo no tiene `anchors.select_category` (`HALLAZGOS.md` H-230)
- [x] Compras con importe, tipo, método, proveedor y facturas — la referencia al pedido de almacén se lee y se devuelve; escribirla es de la 23
- [x] Identificación parcial del pago con tarjeta, sin el número completo — `PartialCardId` es una marca de tipo: el número completo **no se puede convertir**
- [x] Reconciliación de artículos por compra; uno pertenece como máximo a una — el movimiento entre dos compras va en transacción, comprobado por mutación
- [x] Eliminar una compra libera sus artículos — escrito a mano: la baja es lógica y ninguna cascada declarada se dispara (H-172, H-203)
- [x] **Lectura derivada, sin total persistido** — se suma al consultar, con la misma función pura que usa el navegador
- [x] Totales filtrados junto a los generales — los generales salen de dos sumas del motor, no de recorrer las filas filtradas
- [x] Documento y presentación gráfica — cuarta familia del enlace público; las gráficas son SVG en línea, sin librería, y la hoja va sin ellas porque el papel no tiene color

## Verificación

- [x] Prueba: no se cierra la nota con pendientes
- [x] Prueba: el cierre es atómico — comprobada además por mutación: separando las escrituras en transacciones propias, la prueba se pone roja
- [x] Prueba: eliminar la nota devuelve los artículos
- [x] Prueba: un artículo cambia de compra y sale de la anterior
- [x] Prueba: el presupuesto refleja un gasto nuevo de inmediato
- [x] Prueba: una semana del calendario se comparte por enlace — dos sesiones distintas de la misma empresa abren la misma dirección y obtienen el mismo rango y los mismos sucesos
