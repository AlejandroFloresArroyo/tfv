# 20 · Núcleo de producciones

## Por qué

Producción, guion, capítulos, escenas, personajes, sets, videos y continuidad de rodaje. Abre la
columna de producciones, que avanza en paralelo a la de comercio.

Reimplementación casi pura. Lo que merece cuidado son las **cascadas de desvinculación**, que son
más sutiles que las de borrado: eliminar una escena no debe destruir el trabajo de programación
asociado a ella, así que las jornadas y los planes de trabajo sobreviven sin escena y vuelven a su
estado inicial.

## Qué entra

- Producción con sus fechas, publicación y baja.
- Personajes, sets y biblioteca de videos.
- Guiones, capítulos y escenas, con sus índices únicos y su consulta del siguiente libre.
- Etiqueta compuesta que identifica una escena dentro de la producción completa.
- Jornadas de rodaje, con la asignación de reparto que las pone en curso.
- Continuidades por personaje, con utilería que es artículo **o** video, nunca ambos.
- Reconciliación de artículos y de videos, independientes entre sí.
- Notas de jornada.
- Consulta de dónde se ha usado un artículo.

## Correcciones incluidas

| Ref | Corrección |
|---|---|
| C-08 | La baja de producción deja de borrar de la tabla de empresas |
| R-08 | Se resuelve la referencia del capítulo que apunta a la colección equivocada |
| R-09 | Se resuelven las referencias derivadas hacia colecciones inexistentes |

## Criterios de aceptación

- Eliminar una escena deja las jornadas y los planes sin escena, en su estado inicial, sin
  eliminarlos.
- Eliminar un capítulo arrastra sus escenas.
- Eliminar un guion desvincula sus capítulos sin tocar sus escenas.
- Un índice de capítulo repetido en la misma producción responde `409`.
- El mismo índice de escena en otro capítulo sí se admite.
- Asignar reparto crea una continuidad por personaje y pone la jornada en curso.
- Asignar un personaje ya asignado no duplica su continuidad.
- Una pieza de utilería con ambas referencias, o sin ninguna, se rechaza.
- Reconciliar artículos no afecta a las piezas que referencian videos.
- Eliminar una continuidad no elimina los artículos ni los videos referenciados.
- No se elimina una producción con equipo rentado sin devolver.

## Specs

`production-management` · `script-breakdown` · `continuity-tracking`
