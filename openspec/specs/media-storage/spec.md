# Almacenamiento de archivos

## Purpose

Toda imagen, video, documento y firma del sistema pasa por aquí. Unas cuarenta entidades
referencian archivos: usuarios, empresas, productos, artículos de producción, comprobantes de
gasto, firmas de entrega, guiones, láminas de mosaico.

El modelo es **subida directa**: el navegador sube el archivo al almacenamiento sin que los bytes
atraviesen la API. La API sólo emite una autorización temporal de escritura y registra el archivo.
Esto mantiene la API ligera y es la razón de que ningún endpoint necesite aceptar cargas grandes.

Un archivo de imagen no es un objeto sino cinco: el original y cuatro derivados de distinto tamaño.
Un video son cinco también: el video y cuatro fotogramas de portada.

### Clasificación por extensión

| Tipo | Extensiones |
|---|---|
| Imagen | jpg, jpeg, png, gif, svg, heic, heif, webp |
| Video | mp4, mov, m4v, avi, mkv, webm, ogv, wmv, flv, 3gp, 3g2, hevc |
| Documento | pdf |
| Archivo | doc, docx, xls, xlsx, ppt, pptx, txt, csv |
| Firma | producidas por el capturador de firma |

### Derivados

| Derivado | Uso |
|---|---|
| Miniatura | Avatares, celdas de tabla |
| Pequeño | Tarjetas de listado |
| Mediano | Vistas de detalle |
| Grande | Visor a pantalla completa, documentos generados |

## Requirements

### Requirement: Autorización temporal de escritura

La API SHALL emitir, a petición de un principal autenticado, una autorización de escritura de
vigencia limitada que permita subir un archivo directamente al almacenamiento.

La autorización SHALL caducar y SHALL permitir escribir **únicamente** en la ubicación asignada a
ese archivo concreto. No SHALL permitir listar, leer ni sobrescribir otros objetos.

#### Scenario: Se obtiene autorización y se sube

- **GIVEN** un principal autenticado
- **WHEN** solicita subir un archivo declarando su nombre, tipo de contenido y tamaño
- **THEN** recibe una autorización de escritura y el identificador del archivo registrado
- **AND** puede escribir el contenido directamente en el almacenamiento con esa autorización

#### Scenario: Una autorización caducada no sirve

- **GIVEN** una autorización de escritura emitida hace más tiempo del que dura su vigencia
- **WHEN** se intenta usar
- **THEN** el almacenamiento la rechaza
- **AND** el archivo permanece en estado pendiente

#### Scenario: Una autorización no alcanza a otros objetos

- **GIVEN** una autorización emitida para un archivo concreto
- **WHEN** se intenta usar para escribir en la ubicación de otro archivo
- **THEN** el almacenamiento la rechaza

### Requirement: El nombre del archivo debe ser válido

La API SHALL rechazar con `400` una solicitud de subida cuyo nombre de archivo carezca de nombre o
de extensión.

#### Scenario: Un nombre sin extensión se rechaza

- **WHEN** se solicita subir un archivo llamado `documento`
- **THEN** la respuesta es `400`

### Requirement: El tipo se deduce de la extensión

Cuando el solicitante no declare el tipo, la API SHALL deducirlo de la extensión según la tabla de
clasificación, y SHALL tratar como archivo genérico cualquier extensión no reconocida.

#### Scenario: Una extensión de imagen produce derivados

- **WHEN** se solicita subir un archivo con extensión de imagen sin declarar el tipo
- **THEN** se clasifica como imagen
- **AND** la respuesta incluye autorización para el original y para los cuatro derivados

#### Scenario: Una extensión desconocida es archivo genérico

- **WHEN** se solicita subir un archivo con una extensión no clasificada
- **THEN** se trata como archivo genérico
- **AND** la respuesta incluye una única autorización, sin derivados

### Requirement: Las imágenes generan cuatro derivados

Una subida de imagen SHALL registrar el original y cuatro derivados de tamaño decreciente, y SHALL
emitir autorización de escritura para los cinco.

Los derivados SHALL generarse antes de subirse, de modo que el almacenamiento reciba cada tamaño ya
redimensionado. Un derivado no SHALL ser mayor que el original: cuando el original sea más pequeño
que el tamaño objetivo, el derivado conserva las dimensiones del original.

#### Scenario: Una imagen pequeña no se agranda

- **GIVEN** una imagen original más pequeña que el tamaño del derivado mediano
- **WHEN** se sube
- **THEN** el derivado mediano conserva las dimensiones del original
- **AND** no se escala hacia arriba

### Requirement: Los videos generan fotogramas de portada

Una subida de video SHALL registrar el video y cuatro imágenes de portada de tamaño decreciente,
extraídas del propio video, y SHALL emitir autorización de escritura para los cinco.

Las portadas SHALL registrarse como imágenes con independencia del formato del video.

#### Scenario: Un video obtiene sus portadas

- **WHEN** se sube un video
- **THEN** se extrae un fotograma y se derivan cuatro tamaños
- **AND** cada portada se declara con tipo de contenido de imagen

### Requirement: Estado del archivo y confirmación de subida

Todo archivo registrado SHALL tener un estado: pendiente al registrarse, subido cuando se confirme
la escritura, o erróneo cuando la escritura falle.

El cliente SHALL confirmar el resultado de la subida, y la API SHALL reflejarlo en el estado.

#### Scenario: Una subida correcta se confirma

- **GIVEN** un archivo registrado en estado pendiente
- **WHEN** el cliente escribe el contenido y confirma el éxito
- **THEN** el archivo pasa a estado subido

#### Scenario: Una subida fallida queda marcada

- **GIVEN** un archivo registrado en estado pendiente
- **WHEN** el cliente informa de que la escritura falló
- **THEN** el archivo pasa a estado erróneo
- **AND** no se muestra como una imagen válida en ninguna superficie

### Requirement: Los archivos pendientes se recogen

El sistema SHALL eliminar periódicamente los archivos que permanezcan en estado pendiente más allá
de un plazo razonable, junto con cualquier objeto parcial en el almacenamiento.

Sin esta recolección, una subida interrumpida deja un registro huérfano para siempre
(ver `DEFECTS.md` O-05).

#### Scenario: Una subida abandonada se limpia

- **GIVEN** un archivo en estado pendiente desde hace más del plazo establecido
- **WHEN** se ejecuta la recolección
- **THEN** el registro se elimina
- **AND** se elimina cualquier objeto parcial asociado

#### Scenario: Un archivo referenciado nunca se recoge

- **GIVEN** un archivo en estado subido y referenciado por una entidad
- **WHEN** se ejecuta la recolección
- **THEN** el archivo permanece intacto

### Requirement: Marcadores de posición compartidos

El sistema SHALL disponer de un archivo marcador de posición por tipo —imagen, video y documento—
que se use cuando una entidad requiera un archivo y no se haya subido ninguno.

Los marcadores SHALL ser activos propios del sistema, no recursos alojados por terceros
(ver `DEFECTS.md` O-06), y **nunca** SHALL eliminarse, aunque dejen de estar referenciados.

#### Scenario: Una entidad sin imagen recibe el marcador

- **WHEN** se crea una entidad que exige imagen sin proporcionar ninguna
- **THEN** la entidad queda referenciando el marcador de posición de imagen
- **AND** la entidad se crea correctamente

#### Scenario: Reemplazar un marcador no lo borra

- **GIVEN** una entidad que referencia el marcador de posición
- **WHEN** se le asigna una imagen propia
- **THEN** la entidad pasa a referenciar la nueva imagen
- **AND** el marcador sigue existiendo para las demás entidades

### Requirement: Sustituir un archivo elimina el anterior

Cuando una entidad sustituya su archivo por otro, el sistema SHALL eliminar el anterior —su
registro y todos sus objetos, derivados incluidos— salvo que sea un marcador de posición o que
siga referenciado por otra entidad.

#### Scenario: La imagen anterior se elimina por completo

- **GIVEN** una entidad con una imagen propia y sus cuatro derivados
- **WHEN** se le asigna otra imagen
- **THEN** se eliminan el original y los cuatro derivados de la anterior
- **AND** se elimina su registro

#### Scenario: Un archivo aún referenciado se conserva

- **GIVEN** un archivo referenciado por dos entidades
- **WHEN** una de ellas lo sustituye
- **THEN** el archivo se conserva porque la otra lo sigue referenciando

### Requirement: Sustituir una colección de archivos

Cuando una entidad mantenga una colección de archivos y ésta se sustituya, el sistema SHALL
eliminar **exactamente los que dejaron de estar en la colección** y conservar los que permanecen.

Este requisito existe porque la implementación anterior hacía justo lo contrario: borraba los
conservados y dejaba huérfanos los retirados (ver `DEFECTS.md` L-01).

#### Scenario: Sólo se elimina lo retirado

- **GIVEN** un producto con las imágenes A, B y C
- **WHEN** se actualiza para que tenga las imágenes A y D
- **THEN** se eliminan B y C
- **AND** A se conserva intacta
- **AND** D queda referenciada

#### Scenario: Una colección sin cambios no borra nada

- **GIVEN** un producto con las imágenes A y B
- **WHEN** se actualiza con esas mismas dos imágenes
- **THEN** no se elimina ningún archivo

### Requirement: Eliminar una entidad elimina sus archivos

Al eliminar una entidad, el sistema SHALL eliminar los archivos que le pertenecían en exclusiva, y
SHALL conservar los marcadores de posición y los archivos aún referenciados.

Cuando la entidad tenga borrado lógico, sus archivos SHALL conservarse mientras la entidad sea
recuperable.

#### Scenario: Un borrado lógico conserva los archivos

- **GIVEN** un producto con imágenes propias
- **WHEN** se borra lógicamente
- **THEN** sus imágenes siguen existiendo
- **AND** vuelven a mostrarse si el producto se restaura

### Requirement: Las direcciones públicas de lectura son estables

Todo archivo en estado subido SHALL tener una dirección pública de lectura estable para el original
y para cada derivado.

Un cambio de proveedor de almacenamiento SHALL contemplar la actualización de las direcciones ya
persistidas, porque están incrustadas en documentos generados y en enlaces compartidos.

#### Scenario: La dirección no cambia entre lecturas

- **WHEN** se lee dos veces la entidad que referencia un archivo
- **THEN** la dirección pública del archivo es la misma

#### Scenario: Un cambio de proveedor mueve las direcciones ya guardadas

- **GIVEN** archivos cuyas direcciones apuntan al almacenamiento anterior
- **WHEN** se cambia de proveedor y se ejecuta la actualización de direcciones
- **THEN** cada archivo apunta al almacenamiento nuevo, conservando su clave
- **AND** los archivos que no colgaban del almacenamiento anterior quedan intactos
- **AND** volver a ejecutarla no cambia nada
- **AND** los marcadores de posición se actualizan como cualquier otro archivo

### Requirement: El almacenamiento queda puesto al montarlo

Montar el sistema SHALL dejar el almacenamiento de objetos listo para recibir subidas, sin pasos
manuales: sirviendo **lectura pública** de lo escrito y admitiendo **escritura directa desde el
origen de la aplicación**.

La operación SHALL ser idempotente y reparadora —se ejecuta en cada despliegue— y SHALL fallar con
el motivo cuando alguna de las dos condiciones no se cumpla, en lugar de darlas por buenas.

Las dos condiciones son las que sostienen los requisitos anteriores y no se pueden dar por
supuestas: sin lectura pública, las direcciones que este sistema persiste no responden; sin permiso
de escritura desde el origen de la aplicación, el modelo de subida directa no llega a intentarse,
porque quien escribe es el navegador (ver `HALLAZGOS.md` H-136).

#### Scenario: Una instalación nueva admite la primera subida

- **GIVEN** una instalación en la que nadie ha preparado el almacenamiento a mano
- **WHEN** se monta el sistema
- **THEN** el almacenamiento queda listo
- **AND** la primera subida se escribe y se lee sin ningún paso adicional

#### Scenario: Un almacenamiento que no sirve lectura pública se rechaza

- **GIVEN** un almacenamiento que acepta escrituras y no sirve lo escrito sin credencial
- **WHEN** se monta el sistema
- **THEN** la operación falla diciendo qué falta
- **AND** no se informa de que el almacenamiento esté listo

#### Scenario: Volver a montarlo no cambia nada

- **GIVEN** un almacenamiento ya puesto
- **WHEN** se repite la operación
- **THEN** termina correctamente
- **AND** no se altera lo que ya estaba

### Requirement: Sólo se aceptan tipos de contenido conocidos

La API SHALL rechazar con `400` una solicitud de subida cuyo tipo de contenido declarado no figure
entre los admitidos, o que no se corresponda con la extensión del nombre.

#### Scenario: Un tipo no admitido se rechaza

- **WHEN** se solicita subir un archivo ejecutable
- **THEN** la respuesta es `400`
- **AND** no se emite autorización de escritura

#### Scenario: Un tipo incoherente con la extensión se rechaza

- **WHEN** se solicita subir un archivo con extensión de imagen declarando tipo de contenido de documento
- **THEN** la respuesta es `400`
