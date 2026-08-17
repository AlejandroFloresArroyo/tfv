# Consulta y paginación

## Purpose

Define el lenguaje con el que un consumidor pide una colección: qué página, cuántos elementos, en
qué orden, filtrada por qué y buscando qué texto. Y define la forma de la respuesta.

Es un contrato transversal: **toda** colección de la API lo habla, y la interfaz depende de él
—búsqueda, filtros y paginación viven en la URL, de modo que un listado filtrado es un enlace
que se puede compartir.

Un cambio importante respecto de la implementación anterior: allí la cadena de consulta no se
validaba en absoluto, lo que permitía **inyectar operadores de base de datos arbitrarios desde la
URL**. Aquí la gramática de filtros es cerrada y está declarada por recurso.

### Palabras reservadas

| Clave | Significado | Valor por defecto |
|---|---|---|
| `page` | Página solicitada, base 1 | `1` |
| `limit` | Elementos por página | `24` |
| `offset` | Desplazamiento explícito, alternativo a `page` | sin desplazamiento |
| `search` | Texto libre a buscar | sin búsqueda |
| `sort_<campo>` | Orden por ese campo: `1` ascendente, `-1` descendente | por recurso |

Cualquier otra clave se interpreta como filtro. Las claves que empiezan por guion bajo se
**descartan**: están reservadas para uso interno de la interfaz.

### Tabla de coerción de valores

Los valores llegan como texto y se convierten según su forma, de manera recursiva:

| Forma del valor | Se interpreta como |
|---|---|
| Dos valores repetidos, `campo=a&campo=b` | Rango cerrado: mayor o igual que `a` y menor o igual que `b` |
| `"true"` / `"false"` | Booleano |
| Cadena enteramente numérica | Número |
| `"null"` | Nulo |
| Lista separada por comas dentro de un filtro de conjunto declarado | Conjunto de valores |
| Cualquier otra cosa | Texto |

## Requirements

### Requirement: Paginación por página o por desplazamiento

La API SHALL aceptar `page` y `limit` para paginar, y SHALL aceptar `offset` como alternativa a
`page`. Cuando se reciban ambos, `offset` SHALL tener precedencia.

`page` SHALL tener valor por defecto `1` y `limit` valor por defecto `24`. Un `limit` que exceda el
máximo permitido SHALL acotarse al máximo en lugar de rechazarse.

#### Scenario: Se aplican los valores por defecto

- **WHEN** se solicita una colección sin parámetros de paginación
- **THEN** se devuelve la primera página con hasta 24 elementos

#### Scenario: Un límite excesivo se acota

- **WHEN** se solicita un límite muy por encima del máximo permitido
- **THEN** la respuesta se acota al máximo
- **AND** el sobre indica el límite realmente aplicado, no el pedido

#### Scenario: Una página más allá del final va vacía

- **WHEN** se solicita una página posterior a la última
- **THEN** la respuesta es correcta con una lista vacía
- **AND** el total de elementos y de páginas sigue siendo el real

### Requirement: Sobre de paginación uniforme

Toda respuesta paginada SHALL tener la misma forma: la lista de elementos más los metadatos de
página —total de elementos, límite aplicado, total de páginas, página actual, si hay página
anterior y siguiente, y cuáles son.

Cuando no exista página anterior o siguiente, su valor SHALL ser nulo, no cero ni ausente.

#### Scenario: La primera página no tiene anterior

- **WHEN** se solicita la primera página de una colección con varias
- **THEN** el indicador de página anterior es falso y su número es nulo
- **AND** el indicador de página siguiente es verdadero y su número es `2`

### Requirement: Orden explícito y estable

La API SHALL aceptar uno o varios criterios de orden mediante claves `sort_<campo>`, aplicándolos
en el orden en que aparecen en la cadena de consulta.

Todo orden SHALL ser **estable**: cuando varios elementos empaten en todos los criterios pedidos,
SHALL aplicarse un desempate determinista, de modo que paginar una colección no repita ni omita
elementos entre páginas.

Cada recurso SHALL declarar su orden por defecto.

#### Scenario: Se combinan dos criterios

- **WHEN** se solicita ordenar por prioridad descendente y luego por nombre ascendente
- **THEN** los elementos salen ordenados primero por prioridad
- **AND** los que empatan en prioridad salen ordenados por nombre

#### Scenario: Paginar no duplica elementos empatados

- **GIVEN** una colección donde muchos elementos comparten el valor del único criterio de orden
- **WHEN** se recorren todas las páginas
- **THEN** cada elemento aparece exactamente una vez

### Requirement: Los campos de filtro están declarados por recurso

Cada recurso SHALL declarar qué campos admiten filtro y de qué tipo es cada uno. La API SHALL
rechazar con `400` un filtro sobre un campo no declarado.

No SHALL ser posible expresar operadores de consulta arbitrarios desde la cadena de consulta: la
gramática es cerrada y la traducción a la capa de datos ocurre del lado del servidor.

#### Scenario: Un filtro no declarado se rechaza

- **WHEN** se filtra por un campo que el recurso no declara filtrable
- **THEN** la respuesta es `400`
- **AND** el mensaje nombra el campo no admitido

#### Scenario: No se puede inyectar un operador

- **WHEN** el valor de un filtro contiene lo que parece un operador de base de datos
- **THEN** se trata como texto literal según la tabla de coerción
- **AND** no altera la estructura de la consulta ejecutada

### Requirement: Coerción de valores de filtro

La API SHALL convertir los valores textuales de los filtros según la tabla de coerción, y SHALL
validar el resultado contra el tipo declarado del campo.

Un valor que no pueda convertirse al tipo declarado SHALL producir `400`.

#### Scenario: Un par de valores repetidos forma un rango

- **WHEN** se filtra un campo de fecha declarado como rango con dos valores
- **THEN** se devuelven los elementos cuya fecha está entre ambos, inclusive

#### Scenario: Un texto en un campo numérico se rechaza

- **WHEN** se filtra un campo numérico con un valor no numérico
- **THEN** la respuesta es `400`

### Requirement: Filtro por atributo de una entidad relacionada

La API SHALL admitir filtrar por un atributo de una entidad relacionada mediante notación de punto,
únicamente para las relaciones que el recurso declare filtrables.

#### Scenario: Se filtra un producto por el nombre de su categoría

- **GIVEN** que el recurso de producto declara filtrable el nombre de su categoría
- **WHEN** se filtra por ese atributo
- **THEN** se devuelven los productos cuya categoría coincide

#### Scenario: Una relación no declarada se rechaza

- **WHEN** se filtra por un atributo de una relación que el recurso no declara
- **THEN** la respuesta es `400`

### Requirement: Registro de campos de búsqueda por recurso

Cada recurso SHALL declarar sobre qué campos actúa el parámetro `search`. La búsqueda SHALL ser
insensible a mayúsculas y a acentos, SHALL admitir coincidencia parcial, y SHALL devolver los
elementos que coincidan en **cualquiera** de los campos declarados.

Este es el registro; es parte del contrato y no un detalle de implementación:

| Recurso | Campos de búsqueda |
|---|---|
| Usuario, prospecto | nombre, apellido |
| Cliente, proveedor | alias y los datos copiados: nombre, apellido, correo, razón social |
| Empresa, envío, pago, checkout | nombre |
| Dirección | etiqueta, calle, ciudad |
| Rol | nombre |
| Actividad de empresa | nombre, descripción |
| Membresía | nombre y apellido del usuario, correo |
| Servicio | nombre, descripción, keycode |
| Almacén, lista de precios | nombre, descripción |
| Categoría de almacén, de producción | nombre, descripción, slug |
| Producto de almacén | nombre, descripción, slug, código, nombre de la categoría |
| Pedido de almacén | nombre, observaciones |
| Cotización | nombre, descripción, folio |
| Producción, capítulo, personaje, set, video, orden de compra | nombre, descripción |
| Escena | nombre, sinopsis |
| Jornada de rodaje | nombre, nombre de la escena |
| Nota y comentario | contenido |
| Plan de trabajo | nombre, observaciones |
| Tarea y actividad | título, descripción |
| Compra | nombre |
| Ancla | nombre, descripción, nombre de la categoría |
| Artículo de producción | nombre, descripción, slug, nombre de la categoría |
| Línea de nota de entrega | nombre, descripción, slug y categoría del artículo |
| Tablero, tamaño, lámina, sala, inventario de Pixit | nombre |
| Ladrillo de inventario | nombre y valor hexadecimal del color |
| Producto y tienda de Pixit | nombre, descripción |
| Términos de Pixit | nombre, slug |
| Sitio, personalización | nombre, descripción |
| Locación | nombre, descripción, nombre de la categoría |
| Tienda pública | nombre, descripción, slug, nombre de la categoría |

Los recursos que no aparecen en el registro **no admiten búsqueda por texto**: unidades de stock,
ubicaciones, ventas, sesiones de caja, sesiones de cuenta, categorías globales y mensajes de chat.

> **Cuatro entradas corregidas al implementarlas** (2026-08-17, rebanada 28d). Las tres primeras
> nombraban campos que en esta base no existen o no sirven; la cuarta faltaba.
>
> - **Cliente y proveedor** decían «nombre y apellido del usuario». Media cartera **no tiene
>   usuario** —son contrapartes externas, que es el caso que la entidad existe para admitir—, así
>   que buscar por el usuario dejaba fuera precisamente a quien no está en la plataforma. Se busca
>   sobre los datos copiados, que es donde vive el nombre en los dos casos.
> - **Dirección** decía «nombre». El «nombre» de una dirección es su etiqueta, y casi siempre está
>   vacía: nadie bautiza sus direcciones, y en cambio todo el mundo las reconoce por su calle y su
>   ciudad.
> - **Membresía** decía «nombre y apellido del usuario». El correo es como se incorpora a alguien y
>   lo que la pantalla muestra bajo su nombre; buscar una lista por lo que enseña es el mínimo.
> - **Rol** no aparecía, y no estaba entre las exclusiones deliberadas de abajo: era una omisión.

#### Scenario: La búsqueda ignora acentos y mayúsculas

- **GIVEN** un producto llamado "Cámara Réflex"
- **WHEN** se busca "camara reflex"
- **THEN** el producto aparece en los resultados

#### Scenario: Coincide por cualquiera de los campos declarados

- **GIVEN** una cotización cuyo folio contiene el texto buscado, pero cuyo nombre no
- **WHEN** se busca ese texto
- **THEN** la cotización aparece en los resultados

#### Scenario: Un recurso sin búsqueda declarada la ignora

- **WHEN** se envía `search` a una colección de unidades de stock
- **THEN** el parámetro se ignora y la respuesta no se filtra por texto

### Requirement: Filtro por categoría con descendientes

Cuando un recurso declare filtrable su categoría y esa categoría sea jerárquica, filtrar por una
categoría SHALL incluir también los elementos de **todas sus descendientes**, a cualquier
profundidad.

#### Scenario: Filtrar por una categoría raíz incluye las hojas

- **GIVEN** una categoría "Iluminación" con la subcategoría "LED", que a su vez tiene "Paneles"
- **AND** un producto clasificado en "Paneles"
- **WHEN** se filtra por "Iluminación"
- **THEN** el producto aparece en los resultados

### Requirement: Las claves internas se descartan

La API SHALL ignorar toda clave de la cadena de consulta que comience por guion bajo, sin aplicarla
como filtro y sin producir error.

#### Scenario: Una clave interna no filtra ni rompe

- **WHEN** se solicita una colección con una clave que empieza por guion bajo
- **THEN** la respuesta ignora esa clave
- **AND** el resto de parámetros se aplican con normalidad

### Requirement: Los filtros respetan el alcance del solicitante

Los filtros y la búsqueda SHALL aplicarse **dentro** del conjunto de datos que el solicitante ya
tiene permitido ver, nunca por encima de él.

Ningún parámetro de consulta SHALL poder ampliar el alcance determinado por la pertenencia a una
empresa o por la publicación de un recurso.

#### Scenario: Un filtro no cruza la frontera del arrendatario

- **GIVEN** un miembro de una empresa que consulta una colección
- **WHEN** filtra explícitamente por el identificador de otra empresa
- **THEN** la respuesta no incluye datos de esa otra empresa
- **AND** la respuesta es una lista vacía o `403`, nunca datos ajenos

### Requirement: La petición prevalece sobre lo predeterminado

Cuando un recurso declare valores por defecto de orden o de filtro, los parámetros de la petición
SHALL tener precedencia sobre ellos.

#### Scenario: El orden pedido sustituye al orden por defecto

- **GIVEN** un recurso cuyo orden por defecto es por fecha de creación descendente
- **WHEN** se solicita explícitamente orden por nombre ascendente
- **THEN** los resultados salen ordenados por nombre ascendente
