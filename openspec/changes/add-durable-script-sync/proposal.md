# 21 · Extracción durable del guion

## Por qué

La única funcionalidad de inteligencia artificial de la plataforma, y hoy es invisible cuando falla:
se lanza sin esperarla, no informa de su progreso y **descarta los errores** (`DEFECTS.md` O-07). El
usuario pulsa sincronizar y no sabe si funcionó.

Hay además dos defectos de precisión en la recuperación de los cuerpos de escena:

- Cada encabezado se busca **desde el principio del documento**, no desde la posición del anterior,
  así que un encabezado repetido ancla la escena en el lugar equivocado.
- Las escenas que desaparecen de una nueva versión del guion **se quedan sin tocar y sin señalar**,
  con lo que nadie sabe que sobran.

## Qué entra

- La extracción como trabajo durable en segundo plano, que sobrevive a un reinicio.
- Estado visible y actualizado sin recargar: pendiente, en curso, completada o fallida.
- Fallos comunicados a quien los solicitó, con indicación de si puede reintentarse.
- Validación de la respuesta del modelo antes de aplicarla; nada se aplica a medias.
- Configuración determinista del modelo.
- Búsqueda de cada encabezado a partir de la posición del anterior.
- Escenas sin cuerpo localizable creadas igualmente, con recuento de cuántas fueron.
- Idempotencia por índice: volver a extraer actualiza, no duplica.
- Escenas ausentes en una nueva extracción **señaladas, no borradas**.
- Respeto del trabajo manual: una sinopsis editada a mano no se sobrescribe.
- Registro del resultado en la bitácora, con sus recuentos.

## Criterios de aceptación

- La petición responde de inmediato y el trabajo continúa en segundo plano.
- Un reinicio del servicio no pierde la extracción.
- Un guion ilegible marca el guion como fallido y comunica el motivo.
- Una respuesta mal formada no crea ni modifica nada.
- Dos extracciones del mismo guion sin cambios producen el mismo resultado.
- Dos escenas con encabezado idéntico reciben cada una el texto que le corresponde.
- Volver a extraer no duplica capítulos ni escenas.
- Una escena ausente de la nueva versión se conserva señalada.
- Una sinopsis editada a mano sobrevive a una nueva extracción.
- Sin permiso no se encola ningún trabajo.

## Riesgos

**El respeto al trabajo manual exige distinguir qué editó una persona y qué el modelo.** Hoy no se
distingue. Hace falta registrar el origen de cada campo, o al menos el instante de la última edición
manual frente al de la última extracción.

## Specs

`script-ai-sync`
