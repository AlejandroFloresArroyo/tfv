# Inventario de producción

## Purpose

Los objetos físicos que una producción maneja: utilería, vestuario, mobiliario, material de arte.
Cada uno es una pieza concreta con su etiqueta, no un contador — igual que en los almacenes, y por
la misma razón: hay que saber dónde está cada cosa y quién la tiene.

Junto al catálogo va la **nota de entrega**, que es el documento con el que un lote de artículos
cambia de manos. Su particularidad es que se verifica **pieza por pieza**: alguien recorre la lista
marcando lo que efectivamente encuentra, y sólo cuando está todo se cierra con firma de ambas
partes.

Los artículos entran al inventario por dos vías: se dan de alta a mano, o se materializan al
liquidar una compra a un almacén (ver `production-procurement`).

### Estados de un artículo

| Estado | Significado |
|---|---|
| Disponible | En poder de la producción, listo para usarse |
| Almacenado | Guardado, no en uso |
| Entregado | Traspasado mediante una nota de entrega |
| Devuelto | Regresado a su origen |
| Dañado | Deteriorado |
| Incompleto | Le faltan partes |
| Perdido | No se encuentra |
| Robado | Sustraído |

## Requirements

### Requirement: Artículos del inventario de una producción

Una producción SHALL poder registrar artículos, cada uno con su nombre, descripción, imágenes,
categoría, estado y un código identificativo único.

Un artículo SHALL indicar si es inventariable, y SHALL poder referenciar la compra que lo originó.

#### Scenario: Se da de alta un artículo

- **WHEN** un miembro con permiso crea un artículo en una producción
- **THEN** queda registrado con un código identificativo único generado por el sistema
- **AND** su estado inicial es disponible

### Requirement: Etiqueta legible por máquina

Cada artículo SHALL poder presentar su código como etiqueta legible por máquina, apta para imprimir
y para localizarlo escaneándolo.

#### Scenario: Se localiza un artículo escaneado

- **WHEN** se busca por el código de una etiqueta
- **THEN** se obtiene el artículo con su estado y su producción

### Requirement: Cambio de estado de un artículo

Un miembro con permiso SHALL poder cambiar el estado de un artículo, y el cambio SHALL quedar
registrado con su autor y su instante.

#### Scenario: Se marca un artículo como dañado

- **WHEN** un miembro con permiso marca un artículo como dañado
- **THEN** el artículo queda en ese estado
- **AND** el cambio queda atribuido

### Requirement: Dónde se está usando un artículo

El sistema SHALL poder indicar, para un artículo, en qué notas de entrega figura, en qué sets está
asignado y en qué jornadas de rodaje se usó.

Esto SHALL consultarse **antes** de eliminarlo o de cambiar su estado, para no romper trabajo en
curso.

#### Scenario: Se comprueba el uso antes de eliminar

- **GIVEN** un artículo asignado a dos sets y presente en una nota de entrega
- **WHEN** se consulta dónde se usa
- **THEN** se obtienen los dos sets y la nota

### Requirement: Eliminar un artículo libera sus referencias

Eliminar un artículo SHALL retirarlo de los sets y de las continuidades que lo referenciaban, sin
eliminar ni los sets ni las continuidades.

El sistema SHALL impedir eliminar un artículo que figure en una nota de entrega sin cerrar.

#### Scenario: No se elimina un artículo en una entrega abierta

- **GIVEN** un artículo en una nota de entrega en curso
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza indicando la nota que lo retiene

#### Scenario: Los sets sobreviven al artículo

- **GIVEN** un artículo asignado a un set
- **WHEN** se elimina el artículo
- **THEN** el set sigue existiendo con el resto de sus artículos

### Requirement: Notas de entrega de una producción

Una producción SHALL poder registrar notas de entrega, cada una con su nombre, descripción, estado,
responsable y su lista de artículos.

#### Scenario: Se crea una nota de entrega

- **WHEN** un miembro con permiso crea una nota de entrega
- **THEN** queda registrada en estado pendiente

### Requirement: Estados de una nota de entrega

Una nota SHALL pasar por cuatro estados: pendiente mientras se prepara, en curso mientras se
verifica, completada al cerrarse y cancelada si se descarta.

#### Scenario: Una nota nace pendiente

- **WHEN** se crea una nota de entrega
- **THEN** su estado es pendiente

### Requirement: Componer la lista de artículos

El sistema SHALL permitir establecer de una vez el conjunto completo de artículos de una nota,
creando las líneas que falten y eliminando las que sobren.

Esta acción SHALL poner la nota en curso, porque componer la lista es el inicio de la verificación.

#### Scenario: Componer la lista abre la verificación

- **GIVEN** una nota pendiente
- **WHEN** se establece su conjunto de artículos
- **THEN** la nota pasa a en curso
- **AND** cada artículo figura como línea pendiente de verificar

### Requirement: Verificación pieza por pieza

Cada línea de una nota SHALL tener su propio estado de verificación —pendiente o verificada— y, al
verificarse, SHALL registrar quién la verificó y cuándo.

Una línea verificada SHALL poder volver a pendiente, y al hacerlo SHALL borrarse quién la verificó y
cuándo.

#### Scenario: Se verifica una pieza

- **WHEN** un miembro con permiso marca una línea como verificada
- **THEN** la línea registra su verificador y el instante

#### Scenario: Deshacer una verificación borra su atribución

- **GIVEN** una línea verificada
- **WHEN** se devuelve a pendiente
- **THEN** deja de tener verificador e instante

### Requirement: Cerrar una nota exige verificarlo todo

El sistema SHALL impedir completar una nota de entrega mientras alguna de sus líneas siga pendiente
de verificar, e indicar cuántas faltan.

#### Scenario: No se cierra con líneas pendientes

- **GIVEN** una nota con diez líneas, tres sin verificar
- **WHEN** se intenta completarla
- **THEN** la operación se rechaza
- **AND** se indica que faltan tres

### Requirement: Completar la nota entrega los artículos

Al completarse una nota de entrega, todos sus artículos SHALL pasar al estado de entregado.

El cambio SHALL aplicarse de forma atómica junto con el cierre de la nota.

#### Scenario: El cierre marca los artículos

- **GIVEN** una nota en curso con ocho artículos verificados
- **WHEN** se completa
- **THEN** los ocho artículos quedan en estado entregado

#### Scenario: Un fallo no cierra a medias

- **GIVEN** un cierre que falla al actualizar los artículos
- **WHEN** se revierte
- **THEN** la nota sigue en curso
- **AND** ningún artículo ha cambiado de estado

### Requirement: Firmas de la entrega

Una nota completada SHALL registrar la firma de quien entrega y la de quien recibe, junto con el
nombre de quien recibe y la fecha.

Una firma registrada no SHALL poder modificarse.

#### Scenario: El cierre recoge ambas firmas

- **WHEN** se completa una nota de entrega
- **THEN** se registran las dos firmas con su nombre y su fecha

### Requirement: Documento y enlace de la nota

Una nota de entrega SHALL poder generarse como documento conforme a `pdf-documents` y SHALL poder
compartirse por enlace público de sólo lectura.

El documento SHALL agrupar los artículos por su estado de verificación.

#### Scenario: Quien recibe consulta la nota sin cuenta

- **WHEN** se comparte el enlace de una nota de entrega
- **THEN** el destinatario ve el documento con sus artículos y sus firmas

### Requirement: Eliminar una nota

Eliminar una nota de entrega SHALL eliminar sus líneas y sus firmas, sin eliminar los artículos.

Los artículos que hubieran quedado en estado entregado por esa nota SHALL volver a disponible.

#### Scenario: Los artículos vuelven al inventario

- **GIVEN** una nota completada que dejó cinco artículos entregados
- **WHEN** se elimina la nota
- **THEN** los cinco artículos vuelven a estar disponibles

### Requirement: Búsqueda del inventario

Los artículos SHALL poder buscarse por nombre, descripción, identificador legible y nombre de su
categoría, y filtrarse por estado, categoría y compra de origen.

Las líneas de una nota SHALL poder buscarse por los mismos datos del artículo que referencian.

#### Scenario: Se localiza un artículo por su categoría

- **WHEN** se busca por el nombre de una categoría
- **THEN** aparecen los artículos clasificados en ella
