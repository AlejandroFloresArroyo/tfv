# 01 · Contratos de plataforma

## Por qué

Todo lo demás se apoya en esto. El contrato HTTP, el lenguaje de consulta y los campos calculados
son las tres cosas que **toda** capability consume, y las tres cambian de forma sustancial respecto
de la implementación anterior:

- Los errores de dominio salían como `500` porque se lanzaban sin código. No había `400`, `403`,
  `404` ni `409` en ninguna parte (`DEFECTS.md` O-02).
- La cadena de consulta **no se validaba en absoluto**, lo que permitía inyectar operadores de base
  de datos arbitrarios desde la URL (`DEFECTS.md` O-03).
- Los campos calculados eran virtuales del modelo de documentos y desaparecen al cambiar de motor.
  Si no se centralizan, cada endpoint los re-derivará con criterios distintos.

## Qué entra

- Forma común del recurso: identificador, marcas de tiempo, marca de borrado.
- Validación de entrada con recorte de claves no declaradas.
- Serialización de salida recortada al esquema declarado, como última barrera antes de responder.
- Contrato de error y correspondencia real de códigos de estado.
- Resolución por identificador o por identificador legible en las lecturas públicas.
- Claves de idempotencia en las mutaciones de dinero.
- Lenguaje de consulta completo: paginación, orden estable, gramática cerrada de filtros, tabla de
  coerción y registro de campos de búsqueda por recurso.
- Envolvente de paginación.
- Catálogo de campos calculados con su fórmula, y cómo se expresan sobre un motor relacional.

## Qué no entra

- La implementación de los endpoints concretos. Aquí sólo se definen los mecanismos compartidos.
- Las políticas de aislamiento entre arrendatarios, que llegan en la 06.

## Criterios de aceptación

- Un endpoint nuevo obtiene validación, serialización y publicación del contrato sin código
  específico.
- Una clave no declarada en el cuerpo nunca alcanza la capa de datos.
- Un campo ausente del esquema de salida nunca sale, aunque el manejador lo devuelva.
- Un filtro sobre un campo no declarado responde `400`.
- Ningún valor de la cadena de consulta puede alterar la estructura de la consulta ejecutada.
- Recorrer todas las páginas de una colección con valores empatados no repite ni omite elementos.
- Dos peticiones con la misma clave de idempotencia producen un solo efecto.

## Riesgos

**El registro de campos de búsqueda tiene unas cuarenta y cinco filas** repartidas hoy por otros
tantos archivos. Transcribirlo mal produce búsquedas que silenciosamente no encuentran nada. Se
verifica contra la tabla de `query-and-pagination`, fila por fila.

**Los campos calculados son la fuente probable de regresiones silenciosas.** No fallan: devuelven
un número distinto. Cada fórmula necesita su prueba con valores concretos.

## Specs

`api-conventions` · `query-and-pagination` · `computed-fields`
