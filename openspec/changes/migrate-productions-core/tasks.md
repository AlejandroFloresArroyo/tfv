# 20 · Núcleo de producciones — trabajo

## Producción

- [x] Creación con comprobación de habilitación del servicio
- [x] Validación de que la fecha de fin no precede al inicio
- [x] Publicación e identificador legible
- [x] Baja con borrado lógico, previa enumeración del alcance
- [x] Impedir la baja con órdenes en curso o equipo sin devolver
- [x] **Corregir la cascada que borra de la tabla de empresas**
- [x] Panel de resumen de la producción

## Catálogos

- [x] Personajes
- [x] Eliminar un personaje deja sin personaje sus continuidades
- [x] Sets con sus artículos; un artículo puede estar en varios
- [x] Eliminar un set no elimina sus artículos
- [x] Biblioteca de videos con reproducción
- [x] Eliminar un video retira las piezas de utilería que lo señalaban

## Desglose

- [ ] Guiones con su índice, archivo y marca de extracción
- [ ] Sustituir el archivo invalida la extracción
- [ ] Capítulos con índice único en la producción
- [ ] Escenas con índice único en el capítulo
- [ ] Consulta del último índice y comprobación de disponibilidad
- [ ] Recuentos de escenas y de planes
- [ ] Etiqueta compuesta de escena
- [ ] Eliminar un capítulo arrastra sus escenas
- [ ] **Eliminar una escena desvincula jornadas y planes, devolviéndolos a su estado inicial**
- [ ] Eliminar un guion desvincula sus capítulos
- [ ] Consulta de la estructura completa como índice navegable

## Continuidad

- [ ] Jornadas con tipo y estado
- [ ] Asignación de reparto que crea continuidades y pone en curso
- [ ] Sin duplicar personajes ya asignados
- [ ] Continuidad por personaje, con posibilidad de quedar sin personaje
- [ ] Utilería excluyente: artículo o video, nunca ambos ni ninguno
- [ ] Reconciliación de artículos, sin afectar a los videos
- [ ] Reconciliación de videos, sin afectar a los artículos
- [ ] Eliminar continuidad elimina su utilería, no lo referenciado
- [ ] Eliminar jornada arrastra sus continuidades
- [ ] Notas de jornada
- [ ] Consulta de la continuidad de un personaje
- [ ] Vista completa de una jornada
- [x] Consulta de dónde se ha usado un artículo — sets y jornadas, con la continuidad concreta

## Referencias

- [ ] Resolver la referencia del capítulo que apunta a la colección equivocada
- [ ] Resolver las referencias derivadas hacia colecciones inexistentes

## Lo que la rebanada 20 tiene fuera de su lista

La **taxonomía de la producción** —`category-trees`, requisito «Alcance de la taxonomía de
producción»— no figuraba aquí y es de esta rebanada: la 10 la dejó pendiente porque colgaba de una
entidad que todavía no existía. Está hecha, con el vínculo al rol que dirige el trabajo al equipo.

- [x] Categorías de producción, con su rol y su alcance de borrado

Y el **flujo básico de los planes de trabajo** —`production-workflows`—, que el panel necesita para
poder resumirlos por estado. Sólo el plan: sus tareas, actividades, comentarios, adjuntos, el
calendario y el documento son de la rebanada 22.

- [x] Planes de trabajo: alta, edición, estados, recuento de tareas y baja
