# Extracción asistida del guion

## Purpose

La única funcionalidad de inteligencia artificial de la plataforma, y resuelve un problema real:
capturar a mano el desglose de un guion de noventa páginas es trabajo de horas, y es exactamente el
tipo de tarea que un modelo hace bien.

El proceso tiene **dos mitades que conviene entender por separado**, porque cada una falla de forma
distinta:

1. **El modelo extrae la estructura.** Se le entrega el guion y devuelve los datos del capítulo y la
   lista de escenas con su número y su encabezado. Nada más: no se le pide el cuerpo de las escenas.

2. **El sistema recupera los cuerpos.** Localiza en el texto del guion cada encabezado devuelto por
   el modelo, mediante coincidencia aproximada, y toma como cuerpo de la escena todo lo que hay
   hasta el encabezado siguiente.

El reparto es deliberado: pedirle al modelo que devuelva el texto íntegro sería caro, lento y
propenso a que reescriba lo que debería copiar. Localizar y recortar es determinista.

Los encabezados de escena siguen la convención del guion cinematográfico: interior o exterior, el
lugar, y el momento del día.

Hoy este proceso se lanza sin esperarlo, sin informar de su progreso y **tragándose los errores**:
el usuario pulsa sincronizar y no sabe si funcionó (ver `DEFECTS.md` O-07).

## Requirements

### Requirement: La extracción corre en segundo plano

La extracción SHALL ejecutarse como un trabajo durable en segundo plano, no dentro de la petición
que la solicita.

El trabajo SHALL sobrevivir al reinicio del servicio y SHALL reintentarse ante fallos transitorios.

#### Scenario: La petición no espera al modelo

- **WHEN** un miembro solicita extraer un guion
- **THEN** la respuesta llega de inmediato indicando que la extracción comenzó
- **AND** el trabajo continúa en segundo plano

#### Scenario: El trabajo sobrevive a un reinicio

- **GIVEN** una extracción en curso
- **WHEN** el servicio se reinicia
- **THEN** la extracción se retoma o se reintenta

### Requirement: El progreso es visible

El sistema SHALL exponer el estado de la extracción de un guion: pendiente, en curso, completada o
fallida, con el instante de su último cambio.

La interfaz SHALL reflejarlo sin que el usuario tenga que recargar.

#### Scenario: El usuario sigue el progreso

- **WHEN** una extracción está en curso
- **THEN** la interfaz lo indica
- **AND** al terminar lo refleja sin recargar

### Requirement: Los fallos llegan al usuario

Cuando la extracción falle, el sistema SHALL registrar el motivo y SHALL comunicarlo a quien la
solicitó, indicando si puede reintentarse.

Un fallo no SHALL descartarse en silencio.

#### Scenario: Un guion ilegible informa del problema

- **GIVEN** un guion cuyo contenido no puede extraerse
- **WHEN** falla la extracción
- **THEN** el guion queda marcado como fallido
- **AND** quien la solicitó recibe el motivo

#### Scenario: Se puede reintentar tras corregir

- **GIVEN** una extracción fallida
- **WHEN** se sustituye el guion y se vuelve a solicitar
- **THEN** la extracción se ejecuta de nuevo

### Requirement: Sólo se solicita al modelo la estructura

El sistema SHALL solicitar al modelo únicamente los datos del capítulo —título, número y sinopsis—
y la lista de escenas con su número y su encabezado.

No SHALL solicitarle el cuerpo de las escenas.

#### Scenario: La respuesta del modelo es estructura, no texto

- **WHEN** se procesa un guion
- **THEN** lo que el modelo devuelve son los datos del capítulo y una lista de encabezados de escena

### Requirement: La respuesta del modelo se valida

El sistema SHALL validar que la respuesta del modelo cumple la estructura esperada antes de usarla,
y SHALL tratar como fallo una respuesta que no la cumpla.

Una respuesta parcialmente válida no SHALL aplicarse a medias.

#### Scenario: Una respuesta mal formada no se aplica

- **GIVEN** una respuesta del modelo que no cumple la estructura esperada
- **WHEN** se valida
- **THEN** la extracción se marca como fallida
- **AND** no se crea ni se modifica ningún capítulo ni escena

### Requirement: La extracción es determinista

El sistema SHALL configurar el modelo para minimizar la variabilidad entre ejecuciones, de modo que
extraer dos veces el mismo guion produzca el mismo resultado.

#### Scenario: Dos extracciones coinciden

- **WHEN** se extrae dos veces el mismo guion sin cambios
- **THEN** el resultado es el mismo

### Requirement: Recuperación del cuerpo de cada escena

El sistema SHALL localizar en el texto del guion el encabezado de cada escena mediante coincidencia
aproximada, y SHALL tomar como cuerpo de la escena el texto comprendido entre el final de su
encabezado y el comienzo del encabezado siguiente.

La búsqueda de cada encabezado SHALL comenzar **a partir de la posición del anterior**, de modo que
encabezados repetidos no se confundan entre sí.

La implementación anterior buscaba cada encabezado desde el principio del documento, lo que hacía
que un encabezado repetido anclara la escena en el lugar equivocado.

#### Scenario: Los encabezados repetidos no se confunden

- **GIVEN** un guion con dos escenas cuyo encabezado es idéntico
- **WHEN** se recuperan sus cuerpos
- **THEN** cada una recibe el texto que le corresponde por su posición

#### Scenario: La última escena llega hasta el final

- **WHEN** se recupera el cuerpo de la última escena
- **THEN** abarca hasta el final del texto del guion

### Requirement: Un encabezado no localizado deja el cuerpo vacío

Cuando el encabezado de una escena no alcance el umbral mínimo de coincidencia en el texto, la
escena SHALL crearse con su nombre y su número, y con el cuerpo vacío.

El sistema SHALL registrar cuántas escenas quedaron sin cuerpo, para que quien revise sepa dónde
mirar.

#### Scenario: La escena existe aunque no se localice su texto

- **GIVEN** una escena cuyo encabezado no se localiza en el texto
- **WHEN** termina la extracción
- **THEN** la escena existe con su número y su nombre
- **AND** su cuerpo está vacío

#### Scenario: Se informa de cuántas quedaron incompletas

- **WHEN** termina una extracción con escenas sin cuerpo
- **THEN** el resultado indica cuántas son

### Requirement: La extracción es idempotente por índice

El sistema SHALL identificar el capítulo por su índice dentro de la producción, y cada escena por su
índice dentro del capítulo.

Cuando ya existan, SHALL actualizarlos en lugar de duplicarlos.

#### Scenario: Volver a extraer no duplica

- **GIVEN** un guion ya extraído en un capítulo con ocho escenas
- **WHEN** se vuelve a extraer sin cambios
- **THEN** sigue habiendo un capítulo con ocho escenas
- **AND** sus datos se han actualizado, no duplicado

#### Scenario: Un guion corregido actualiza lo existente

- **GIVEN** un capítulo ya extraído
- **WHEN** se extrae una versión corregida del guion
- **THEN** los nombres y sinopsis existentes se actualizan

### Requirement: Las escenas retiradas se señalan, no se borran

Cuando una nueva extracción no incluya una escena que sí existía, el sistema SHALL conservarla y
SHALL señalarla como ausente en la última extracción.

Borrarla automáticamente destruiría el trabajo de programación asociado a ella; la decisión es del
usuario.

#### Scenario: Una escena desaparecida se conserva señalada

- **GIVEN** un capítulo con ocho escenas extraídas
- **WHEN** se extrae una versión del guion que sólo contiene siete
- **THEN** las ocho siguen existiendo
- **AND** la ausente queda señalada para que el usuario decida

### Requirement: El trabajo manual no se pierde

La extracción no SHALL sobrescribir la sinopsis de una escena que un usuario haya editado a mano
después de la última extracción.

#### Scenario: La edición manual prevalece

- **GIVEN** una escena cuya sinopsis se editó a mano tras extraerla
- **WHEN** se vuelve a extraer el guion
- **THEN** la sinopsis editada se conserva
- **AND** se señala que la extracción proponía otra

### Requirement: La extracción deja constancia

Al completarse, el sistema SHALL registrar la actividad correspondiente conforme a
`activity-and-notifications`, indicando cuántos capítulos y escenas se crearon y cuántos se
actualizaron.

#### Scenario: El resumen queda en la bitácora

- **WHEN** termina una extracción
- **THEN** la bitácora de la empresa registra el resultado con sus recuentos

### Requirement: La extracción requiere permiso

Solicitar la extracción de un guion SHALL exigir el permiso correspondiente, conforme a
`access-control`.

#### Scenario: Sin permiso no se extrae

- **GIVEN** un miembro sin el permiso de extracción de guiones
- **WHEN** intenta solicitarla
- **THEN** la respuesta es `403`
- **AND** no se encola ningún trabajo
