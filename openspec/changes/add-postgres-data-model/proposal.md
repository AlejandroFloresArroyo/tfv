# 02 · Modelo de datos relacional

## Por qué

Noventa colecciones de documentos pasan a un esquema relacional. No es una traducción mecánica: el
modelo actual **es profundamente relacional y no tiene integridad referencial**, lo que se traduce
en nueve referencias que apuntan a colecciones que no existen o que se llaman de otra forma
(`DEFECTS.md` R-01 a R-09).

Al declarar claves foráneas reales, cada una de esas nueve tiene que resolverse explícitamente. No
se pueden migrar tal cual.

## Qué entra

- Esquema completo con claves foráneas, enumerados, restricciones de comprobación e índices.
- Resolución de las nueve referencias colgantes.
- Política de borrado: lógico en entidades de negocio, propagación declarativa en filas
  estructurales (`project.md`, D-02).
- Índices únicos **parciales** allí donde el borrado lógico libera un valor.
- Representación del dinero en decimal exacto (`project.md`, D-03).
- Vistas y columnas calculadas para los campos derivados de la rebanada 01.
- Migraciones versionadas y datos de siembra para desarrollo.

## Qué no entra

- El trasvase de los datos de producción, que es la rebanada 30.
- Las políticas de aislamiento, que llegan en la 06 — aunque el esquema debe dejar sitio para ellas:
  toda tabla de negocio necesita una vía inequívoca hasta su empresa.

## Decisiones que hay que cerrar aquí

| Decisión | Nota |
|---|---|
| Las nueve referencias colgantes | Cada una: ¿sobra, o apuntaba a otra cosa? |
| Qué tablas llevan borrado lógico | La lista de D-02 es el punto de partida, no la última palabra |
| Cómo llega cada tabla hasta su empresa | Columna directa o recorrido; condiciona la rebanada 06 |
| Estrategia de búsqueda por texto | Determina si el registro de campos es una lista o una definición de índice |

## Criterios de aceptación

- Ninguna referencia queda sin clave foránea o sin justificación escrita de por qué no la lleva.
- Un correo liberado por un borrado lógico vuelve a estar disponible para un registro nuevo.
- Ningún importe se almacena en coma flotante.
- Toda tabla de negocio tiene una vía documentada hasta su empresa.
- Las migraciones se aplican desde cero sobre una base vacía y producen el esquema completo.
- Los datos de siembra levantan un entorno de desarrollo utilizable.

## Riesgos

**Las restricciones van a rechazar datos que hoy existen.** Es la señal de que hacen su trabajo, y
también el motivo de que la rebanada 30 necesite una fase de limpieza previa. Conviene ejecutar
pronto una comprobación del volcado actual contra el esquema nuevo, para saber cuánta suciedad hay
antes de comprometerse con fechas.

## Specs

Todas. En particular `computed-fields`, para las vistas y columnas calculadas.
