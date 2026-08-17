# 21 · Extracción durable del guion — trabajo

## Trabajo durable

- [ ] Encolado del trabajo, con persistencia que sobreviva al reinicio
- [ ] Respuesta inmediata de la petición
- [ ] Reintento ante fallo transitorio
- [ ] Comprobación de permiso antes de encolar

## Estado y comunicación

- [ ] Estado del guion: pendiente, en curso, completada, fallida
- [ ] Instante del último cambio
- [ ] Actualización de la interfaz sin recargar
- [ ] Comunicación del motivo del fallo a quien lo solicitó
- [ ] Indicación de si el fallo es reintentable

## Modelo

- [ ] Solicitud limitada a la estructura: capítulo y encabezados de escena
- [ ] Configuración determinista
- [ ] Validación de la respuesta antes de aplicarla
- [ ] Respuesta inválida marca fallo sin aplicar nada

## Recuperación de cuerpos

- [ ] **Búsqueda de cada encabezado a partir de la posición del anterior**
- [ ] Cuerpo entre el fin de un encabezado y el comienzo del siguiente
- [ ] La última escena llega hasta el final del texto
- [ ] Umbral mínimo de coincidencia
- [ ] Escena sin cuerpo localizable se crea igualmente, con cuerpo vacío
- [ ] Recuento de escenas sin cuerpo en el resultado

## Idempotencia y respeto del trabajo

- [ ] Identificación del capítulo por índice en la producción
- [ ] Identificación de la escena por índice en el capítulo
- [ ] Actualización en lugar de duplicación
- [ ] **Registro del origen de cada campo o del instante de la última edición manual**
- [ ] Una sinopsis editada a mano no se sobrescribe; se señala la propuesta
- [ ] Escenas ausentes de la nueva extracción se señalan, no se borran

## Bitácora

- [ ] Registro del resultado con capítulos y escenas creados y actualizados

## Verificación

- [ ] Prueba: la petición no espera al modelo
- [ ] Prueba: el trabajo sobrevive a un reinicio
- [ ] Prueba: respuesta mal formada no crea nada
- [ ] Prueba: encabezados repetidos no se confunden
- [ ] Prueba: volver a extraer no duplica
- [ ] Prueba: la escena ausente se conserva señalada
- [ ] Prueba: la sinopsis editada a mano sobrevive
