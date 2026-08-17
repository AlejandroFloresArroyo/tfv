# 22 · Operación de producciones

## Por qué

Inventario de utilería, notas de entrega, planes de trabajo y presupuesto. Es la parte de
producciones que se usa a diario durante un rodaje.

Reimplementación casi pura. Los dos puntos que merecen cuidado:

- **Cerrar una nota de entrega mueve el estado de todos sus artículos**, y eso debe ser atómico con
  el cierre. Hoy no lo es.
- **El presupuesto no es una entidad**: es una resta que se calcula al consultarse. Conviene que
  siga sin serlo, para que no pueda quedar desincronizado.

## Qué entra

- Artículos de inventario con sus ocho estados, código único y etiqueta.
- Consulta de dónde se está usando un artículo, antes de moverlo o eliminarlo.
- Notas de entrega con verificación pieza por pieza, atribuida.
- Cierre que exige verificarlo todo y marca los artículos como entregados.
- Firmas de ambas partes, inmutables una vez registradas.
- Planes de trabajo, tareas y actividades, con sus recuentos por estado.
- Comentarios en planes y tareas, y archivos adjuntos.
- Calendario con vistas por año, mes, semana y día, con la fecha en la dirección.
- Filtrado de tareas dentro de los planes, por categoría y por personaje.
- Anclas y compras, con la reconciliación de artículos por compra.
- Presupuesto como lectura derivada, con totales filtrados junto a los generales.

## Criterios de aceptación

- No se cierra una nota con líneas pendientes de verificar; se indica cuántas faltan.
- El cierre marca todos sus artículos como entregados, de forma atómica.
- Un fallo en el cierre deja la nota en curso y ningún artículo movido.
- Eliminar una nota completada devuelve sus artículos a disponible.
- Deshacer una verificación borra su atribución.
- Una firma registrada no se puede modificar.
- Un artículo pertenece como máximo a una compra; asignarlo a otra lo retira de la anterior.
- Eliminar una compra deja sus artículos sin compra, sin eliminarlos.
- El presupuesto refleja un gasto nuevo de inmediato, sin ningún total persistido.
- Filtrar el calendario por categoría muestra cada plan sólo con sus tareas coincidentes.
- Una semana concreta del calendario se puede compartir por enlace.

## Specs

`production-inventory` · `production-workflows` · `production-budget`
