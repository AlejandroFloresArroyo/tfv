# Direcciones

## Purpose

Dos libretas de direcciones con el mismo comportamiento y distinto dueño: las de un **usuario**
—donde recibe sus compras— y las de una **empresa** —desde donde envía, y que aparecen como
domicilio fiscal y punto de origen de los envíos.

Comparten el mismo conjunto de campos, el mismo selector en mapa y la misma regla de dirección
primaria, así que se especifican juntas. La única diferencia es de quién cuelgan y quién puede
verlas.

La dirección primaria de una empresa importa fuera de esta capability: es el origen desde el que se
calcula el costo de envío (`shipping-rates`) y el domicilio que aparece en la sesión de pago
(`storefront-checkout`).

## Requirements

### Requirement: Campos de una dirección

Una dirección SHALL registrar un nombre identificativo, calle, número, colonia, ciudad, estado,
país con su código, código postal y coordenadas geográficas.

Las coordenadas SHALL tener valores por defecto razonables cuando no se determinen.

#### Scenario: Se crea una dirección completa

- **WHEN** se crea una dirección con todos sus campos
- **THEN** queda registrada y es legible por su propietario

### Requirement: Libreta de direcciones del usuario

Un usuario SHALL poder crear, consultar, modificar y eliminar sus propias direcciones, y no SHALL
poder acceder a las de otro usuario.

#### Scenario: Un usuario no ve las direcciones de otro

- **WHEN** un usuario solicita una dirección que pertenece a otro
- **THEN** la respuesta es `404`

### Requirement: Libreta de direcciones de la empresa

Un miembro con permiso SHALL poder crear, consultar, modificar y eliminar las direcciones de su
empresa.

Estas direcciones SHALL ser visibles para todos los miembros de la empresa.

#### Scenario: Las direcciones son de la empresa, no del miembro

- **GIVEN** una dirección creada por un miembro
- **WHEN** otro miembro de la misma empresa consulta las direcciones
- **THEN** la ve

### Requirement: Sólo una dirección primaria por libreta

Cada libreta SHALL tener como máximo una dirección marcada como primaria.

Marcar una como primaria SHALL desmarcar automáticamente la que lo fuera.

#### Scenario: Marcar una desmarca la anterior

- **GIVEN** una libreta con la dirección A marcada como primaria
- **WHEN** se marca la dirección B como primaria
- **THEN** B queda como primaria
- **AND** A deja de estarlo

#### Scenario: La primera dirección se marca sola

- **GIVEN** una libreta vacía
- **WHEN** se crea la primera dirección
- **THEN** queda marcada como primaria

### Requirement: Eliminar la primaria promueve a otra

Al eliminar la dirección primaria de una libreta que conserve otras, el sistema SHALL marcar otra
como primaria de forma determinista.

Cuando no quede ninguna, la libreta SHALL quedar sin dirección primaria.

#### Scenario: Se promueve una sustituta

- **GIVEN** una libreta con tres direcciones, una de ellas primaria
- **WHEN** se elimina la primaria
- **THEN** una de las dos restantes queda marcada como primaria

#### Scenario: Al vaciar la libreta no queda primaria

- **GIVEN** una libreta con una única dirección, primaria
- **WHEN** se elimina
- **THEN** la libreta queda vacía y sin dirección primaria

### Requirement: Búsqueda de dirección con sugerencias

El sistema SHALL ofrecer sugerencias de direcciones al escribir, y SHALL rellenar los componentes de
la dirección y sus coordenadas a partir de la sugerencia elegida.

El usuario SHALL poder ajustar la posición exacta sobre el mapa y corregir manualmente cualquier
componente, y esas correcciones SHALL prevalecer.

#### Scenario: Elegir una sugerencia rellena la dirección

- **WHEN** el usuario elige una sugerencia
- **THEN** se rellenan los componentes de la dirección y sus coordenadas

#### Scenario: Ajustar el marcador actualiza las coordenadas

- **WHEN** el usuario arrastra el marcador en el mapa
- **THEN** las coordenadas se actualizan
- **AND** los componentes escritos manualmente no se sobrescriben

### Requirement: Una dirección en uso no se elimina sin más

El sistema SHALL impedir eliminar una dirección referenciada por un envío en curso o por un perfil
de facturación, e indicar qué la está usando.

#### Scenario: Se rechaza eliminar una dirección en uso

- **GIVEN** una dirección de empresa referenciada por un perfil de facturación
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza
- **AND** se indica qué la está usando
