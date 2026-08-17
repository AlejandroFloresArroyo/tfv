# Convenciones de la API

## Purpose

Define el contrato uniforme que **toda** la superficie HTTP cumple, con independencia del dominio:
qué forma tiene un recurso, cómo se validan las entradas, qué se serializa en las salidas, cómo se
comunican los errores y cómo se identifican los recursos.

Estas reglas se especifican una sola vez aquí. Las specs de dominio las asumen y sólo describen
lo que es particular suyo.

Dos de estas reglas son de seguridad, no de estilo, y merecen atención especial:

- **La serialización de salida recorta al esquema declarado.** Un campo que no está en el esquema
  de respuesta no sale, aunque exista en la base y aunque el manejador lo devuelva. Es lo que
  impide que una contraseña o un campo interno se filtre por descuido.
- **La entrada se recorta a lo declarado.** Una clave que el esquema no contempla nunca llega
  a la capa de datos.

### Tabla de códigos de estado

La implementación anterior devolvía **500 para casi cualquier error de dominio**, porque los
errores se lanzaban sin código. Esta es la correspondencia que se exige:

| Situación | Código |
|---|---|
| Lectura o mutación correcta | `200` |
| Creación correcta | `201` |
| Mutación correcta sin cuerpo de respuesta | `204` |
| Cuerpo, ruta o consulta que no cumple el esquema | `400` |
| Falta credencial, o es inválida o está caducada | `401` |
| Credencial válida pero sin permiso, o fuera del arrendatario | `403` |
| El recurso no existe, o existe fuera del alcance del solicitante | `404` |
| Conflicto con el estado actual (unicidad, transición ilegal) | `409` |
| Semánticamente inválido pese a cumplir el esquema | `422` |
| Límite de peticiones excedido | `429` |
| Fallo no previsto | `500` |

## Requirements

### Requirement: Forma común del recurso

Toda entidad expuesta por la API SHALL incluir un identificador propio, una fecha de creación y
una fecha de última modificación, con los mismos nombres y el mismo formato en todos los dominios.

Las fechas SHALL expresarse en ISO 8601, en UTC y con la zona horaria explícita. El identificador
SHALL ser una cadena opaca; ningún consumidor puede depender de su estructura interna.

Las entidades con borrado lógico SHALL exponer además la fecha de borrado, con valor nulo mientras
no estén borradas.

#### Scenario: Una entidad recién creada expone su forma común

- **WHEN** se crea cualquier entidad a través de la API
- **THEN** la respuesta incluye su identificador, su fecha de creación y su fecha de modificación
- **AND** ambas fechas son iguales
- **AND** ambas terminan en indicador de UTC

#### Scenario: El identificador no revela estructura interna

- **WHEN** un consumidor recibe el identificador de un recurso
- **THEN** puede usarlo tal cual en rutas y filtros
- **AND** la API no garantiza ninguna longitud, alfabeto ni orden que el consumidor pueda asumir

### Requirement: La entrada se valida y se recorta

La API SHALL validar cuerpo, parámetros de ruta y cadena de consulta contra un esquema declarado,
y SHALL descartar cualquier clave que el esquema no contemple antes de que los datos alcancen la
capa de persistencia.

Una entrada que no cumpla el esquema SHALL rechazarse con `400` sin ejecutar efecto alguno.

#### Scenario: Se descarta una clave no declarada

- **GIVEN** un esquema de creación que declara `name` y `description`
- **WHEN** se envía un cuerpo que además incluye `isAdmin: true`
- **THEN** la entidad se crea únicamente con `name` y `description`
- **AND** el campo no declarado no se persiste ni aparece en la respuesta

#### Scenario: Un cuerpo inválido no produce efectos

- **GIVEN** una petición de creación a la que le falta un campo obligatorio
- **WHEN** se procesa
- **THEN** la respuesta es `400`
- **AND** no se ha creado ninguna entidad
- **AND** no se ha emitido ninguna notificación ni asiento de actividad

### Requirement: La salida se recorta al esquema declarado

La API SHALL serializar cada respuesta contra un esquema de salida declarado, omitiendo todo campo
que ese esquema no contemple, aunque el manejador lo haya incluido y aunque exista en la base.

Esta comprobación SHALL ser la última barrera antes de enviar la respuesta, de modo que un descuido
en un manejador no pueda filtrar datos.

#### Scenario: Un campo sensible no sale aunque el manejador lo devuelva

- **GIVEN** un esquema de salida de usuario que no declara la contraseña
- **WHEN** un manejador devuelve el registro completo, contraseña incluida
- **THEN** la respuesta no contiene la contraseña
- **AND** tampoco contiene ningún otro campo ausente del esquema

#### Scenario: Una salida que no cumple su esquema no se envía

- **GIVEN** un esquema de salida que declara un campo obligatorio
- **WHEN** el manejador devuelve un objeto sin ese campo
- **THEN** la petición falla con `500`
- **AND** el fallo queda registrado con detalle suficiente para diagnosticarlo
- **AND** no se envía una respuesta parcial al consumidor

### Requirement: Proyecciones seguras de usuario y empresa

La API SHALL exponer los datos de usuario y de empresa a través de proyecciones acotadas cuando
aparezcan **anidados** dentro de otro recurso, y SHALL omitir en ellas la contraseña, las
referencias de archivo internas y las colecciones de pertenencia.

#### Scenario: Un usuario anidado va recortado

- **WHEN** se lee una cotización cuyo responsable es un usuario
- **THEN** el usuario anidado incluye su nombre, su correo y su avatar
- **AND** no incluye contraseña, ni token, ni la lista de empresas a las que pertenece

### Requirement: Contrato uniforme de error

Toda respuesta de error SHALL tener la misma forma: el código de estado, un identificador de tipo
de error, un mensaje legible y, opcionalmente, un detalle.

El mensaje SHALL ser una cadena cuando el error es único, y una lista de pares campo/mensaje cuando
proviene de una validación de varios campos. Los mensajes dirigidos al usuario final SHALL estar
en español.

#### Scenario: Un error de validación señala los campos

- **WHEN** una petición falla la validación en dos campos
- **THEN** la respuesta es `400`
- **AND** el mensaje es una lista con una entrada por campo
- **AND** cada entrada identifica la ruta del campo y explica el problema

#### Scenario: Un error de dominio devuelve su código propio

- **WHEN** se intenta leer una entidad que no existe
- **THEN** la respuesta es `404` y no `500`
- **AND** el mensaje explica qué no se encontró

### Requirement: El detalle técnico no sale en producción

La API SHALL omitir trazas de pila, consultas y cualquier detalle interno de las respuestas de
error cuando se ejecuta en un entorno productivo, e incluirlos en el resto de entornos.

#### Scenario: Un fallo interno en producción no revela detalles

- **GIVEN** un entorno productivo
- **WHEN** una petición provoca un fallo no previsto
- **THEN** la respuesta es `500` con un mensaje genérico
- **AND** no contiene traza de pila ni nombres de tabla
- **AND** el fallo sí queda registrado íntegro del lado del servidor, correlacionado con la petición

### Requirement: Las lecturas públicas aceptan slug o identificador

Todo endpoint de lectura pública que reciba la referencia de un recurso en la ruta SHALL aceptar
indistintamente su identificador o su slug en la misma posición.

Cuando la referencia tenga la forma de un identificador, SHALL resolverse como tal; en caso
contrario SHALL resolverse como slug.

#### Scenario: El mismo recurso se resuelve por ambas vías

- **GIVEN** un producto publicado con un slug conocido
- **WHEN** se solicita por su identificador y luego por su slug
- **THEN** ambas peticiones devuelven el mismo recurso

#### Scenario: Se admiten los identificadores de la pila anterior

- **GIVEN** una URL compartida antes de la migración, que incrusta un identificador de 24 caracteres hexadecimales
- **WHEN** se solicita ese recurso
- **THEN** se resuelve correctamente al recurso migrado

### Requirement: Las lecturas públicas exigen publicación

Un endpoint de lectura pública SHALL devolver `404` para un recurso que exista pero no esté
publicado, sin distinguirlo de un recurso inexistente.

#### Scenario: Un recurso despublicado se comporta como inexistente

- **GIVEN** un producto existente cuyo estado de publicación es falso
- **WHEN** se solicita desde un endpoint público
- **THEN** la respuesta es `404`
- **AND** el cuerpo no revela que el recurso exista

### Requirement: Las mutaciones de dinero son idempotentes

Todo endpoint que mueva dinero o materialice un pedido SHALL aceptar una clave de idempotencia y
SHALL garantizar que dos peticiones con la misma clave produzcan un solo efecto.

La segunda petición SHALL devolver el resultado de la primera, no un error.

#### Scenario: Un reintento no duplica el efecto

- **GIVEN** una petición de cobro ya procesada con una clave de idempotencia
- **WHEN** se repite la petición con la misma clave y el mismo cuerpo
- **THEN** la respuesta es la misma que la primera vez
- **AND** no se ha creado un segundo pedido, pago ni movimiento de inventario

#### Scenario: La misma clave con otro cuerpo se rechaza

- **GIVEN** una clave de idempotencia ya usada
- **WHEN** se envía una petición distinta con esa clave
- **THEN** la respuesta es `409`

### Requirement: La API publica su propia descripción

La API SHALL publicar una descripción legible por máquina de todos sus endpoints, con sus esquemas
de entrada y de salida, sus códigos de respuesta y sus requisitos de autenticación.

La descripción SHALL derivarse de los mismos esquemas que validan en tiempo de ejecución, de modo
que no pueda quedar desfasada.

#### Scenario: La descripción refleja un endpoint nuevo

- **WHEN** se añade un endpoint con su esquema
- **THEN** aparece en la descripción publicada sin ningún paso adicional
- **AND** los tipos que declara coinciden con los que valida en ejecución

### Requirement: Credenciales por encabezado y origen restringido

La API SHALL aceptar la credencial del solicitante mediante el encabezado estándar de autorización,
y SHALL rechazar con `401` toda petición a un recurso protegido que no la presente o cuya
credencial no verifique.

La política de orígenes cruzados SHALL enumerar los orígenes permitidos de forma explícita. No
SHALL combinarse un origen comodín con el envío de credenciales.

#### Scenario: Una credencial no verificable se rechaza

- **WHEN** se presenta una credencial cuya firma no valida
- **THEN** la respuesta es `401`
- **AND** la petición no se ejecuta

#### Scenario: Un origen no enumerado no obtiene permiso

- **WHEN** un navegador de un origen no enumerado realiza una petición previa de comprobación
- **THEN** la respuesta no autoriza el origen

### Requirement: El tamaño de las peticiones está acotado

La API SHALL imponer un límite de tamaño al cuerpo de las peticiones acorde a lo que cada endpoint
necesita, y SHALL responder `413` cuando se exceda.

Dado que los archivos se suben directamente al almacenamiento y no atraviesan la API
(ver `media-storage`), ningún endpoint necesita aceptar cargas grandes.

#### Scenario: Un cuerpo desproporcionado se rechaza pronto

- **WHEN** se envía un cuerpo que excede el límite del endpoint
- **THEN** la respuesta es `413`
- **AND** el servidor no ha almacenado el cuerpo completo en memoria
