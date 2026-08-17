# Empresas y membresías

## Purpose

La empresa es **el arrendatario**: todo dato de negocio del sistema pertenece a exactamente una, y
el acceso a ese dato se decide por la membresía (ver `access-control`).

Una empresa se compone de tres cosas que se gestionan juntas y que aquí se especifican juntas: la
empresa en sí, quién pertenece a ella y con qué rol, y qué servicios tiene contratados.

Dos matices que tienen consecuencias en cascada:

- **Añadir un miembro puede costar dinero.** La licencia se factura por asiento, así que incorporar
  a alguien puede exigir ampliar la suscripción. Ese vínculo se describe en
  `subscriptions-and-entitlements`; aquí se referencia.
- **Una empresa puede tener varios propietarios**, y un propietario elude toda comprobación de
  permisos. Quitarle la propiedad al último propietario debe ser imposible.

## Requirements

### Requirement: Creación de una empresa

Un usuario autenticado SHALL poder crear una empresa aportando su nombre y su descripción, y SHALL
quedar automáticamente como su propietario con una membresía activa.

La empresa SHALL nacer sin servicios habilitados y sin suscripción.

#### Scenario: El creador queda como propietario

- **WHEN** un usuario crea una empresa
- **THEN** la empresa existe
- **AND** el creador tiene en ella una membresía activa marcada como propietaria

#### Scenario: Una empresa nueva no opera hasta suscribirse

- **GIVEN** una empresa recién creada
- **WHEN** un miembro abre sus pantallas
- **THEN** se le presenta la selección de plan de forma bloqueante

### Requirement: Un administrador puede crear la empresa y su dueño

Un administrador de plataforma SHALL poder crear una empresa designando como propietario a un
usuario existente, o creando la cuenta del propietario en el mismo acto.

#### Scenario: Se crea empresa y propietario a la vez

- **WHEN** un administrador de plataforma crea una empresa aportando los datos de un propietario sin cuenta
- **THEN** se crea la cuenta del propietario según lo previsto para las invitaciones
- **AND** la empresa queda creada con esa persona como propietaria

### Requirement: Edición de los datos de la empresa

Un miembro con permiso SHALL poder modificar el nombre, la descripción, el correo, la imagen y los
sectores de su empresa.

La comisión que la plataforma retiene sobre las ventas de la empresa SHALL ser modificable
**únicamente** por un administrador de plataforma.

#### Scenario: Un propietario no cambia su propia comisión

- **GIVEN** un propietario de una empresa
- **WHEN** intenta modificar el porcentaje de comisión de la plataforma
- **THEN** la operación se rechaza

#### Scenario: Un administrador de plataforma sí puede

- **WHEN** un administrador de plataforma modifica la comisión de una empresa
- **THEN** el cambio se aplica

### Requirement: Listado de empresas del usuario

Un usuario SHALL poder consultar las empresas de las que es propietario y, por separado, aquellas a
las que pertenece sin serlo.

Ambos listados SHALL admitir paginación y búsqueda.

#### Scenario: Se distinguen propias e invitadas

- **GIVEN** un usuario propietario de una empresa y miembro no propietario de otras dos
- **WHEN** consulta sus empresas
- **THEN** la primera aparece entre las propias
- **AND** las otras dos aparecen entre aquellas a las que pertenece

### Requirement: Comprobación de pertenencia

El sistema SHALL exponer una comprobación que indique si el solicitante puede operar en una empresa
concreta, resolviendo a favor cuando sea administrador de plataforma o tenga en ella una membresía
activa.

#### Scenario: Un administrador de plataforma siempre puede

- **GIVEN** un administrador de plataforma sin membresía en una empresa
- **WHEN** se comprueba su pertenencia
- **THEN** la comprobación resuelve a favor
- **AND** se le trata como propietario

#### Scenario: Una membresía inactiva no basta

- **GIVEN** un usuario con membresía desactivada
- **WHEN** se comprueba su pertenencia
- **THEN** la comprobación resuelve en contra

### Requirement: Invitación de un miembro existente

Un miembro con permiso SHALL poder incorporar a la empresa a una persona que ya tiene cuenta,
indicando su correo o su identificador, y asignándole un rol.

Invitar a alguien que ya es miembro SHALL rechazarse.

#### Scenario: Se incorpora a alguien con cuenta

- **WHEN** se invita por correo a una persona con cuenta
- **THEN** obtiene una membresía activa con el rol indicado
- **AND** recibe la notificación correspondiente

#### Scenario: Invitar a un miembro actual se rechaza

- **GIVEN** una persona que ya pertenece a la empresa
- **WHEN** se intenta invitarla
- **THEN** la respuesta es `409`

### Requirement: Incorporar un miembro consume un asiento

Incorporar a un miembro SHALL comprobar que la suscripción de la empresa tiene asientos
disponibles, y SHALL ampliarla cuando no los haya.

Cuando la ampliación no pueda completarse, la incorporación SHALL rechazarse y no SHALL quedar la
membresía a medias.

#### Scenario: Se amplía la suscripción al agotarse los asientos

- **GIVEN** una empresa cuya suscripción tiene todos los asientos ocupados
- **WHEN** se incorpora a un miembro más
- **THEN** la suscripción se amplía en un asiento
- **AND** la membresía queda creada

#### Scenario: Un fallo de facturación no deja membresía huérfana

- **GIVEN** una empresa sin asientos libres y con un fallo al ampliar la suscripción
- **WHEN** se intenta incorporar a un miembro
- **THEN** la operación se rechaza
- **AND** no se ha creado la membresía

### Requirement: Retirar a un miembro

Un miembro con permiso SHALL poder retirar a otro de la empresa, lo que SHALL eliminar su membresía
sin afectar a su cuenta ni a su pertenencia a otras empresas.

Retirar a un miembro SHALL liberar el asiento correspondiente.

#### Scenario: Retirar no borra la cuenta

- **WHEN** se retira a un miembro de una empresa
- **THEN** pierde el acceso a esa empresa
- **AND** su cuenta y sus otras membresías siguen intactas

### Requirement: Activar y desactivar una membresía

Un miembro con permiso SHALL poder desactivar y reactivar la membresía de otro.

Una membresía desactivada SHALL impedir el acceso a los datos de esa empresa, conservando el
registro de la pertenencia y el rol.

#### Scenario: Desactivar corta el acceso a esa empresa

- **GIVEN** un miembro con membresía activa
- **WHEN** se desactiva su membresía
- **THEN** sus peticiones sobre esa empresa reciben `404`
- **AND** conserva el acceso a las demás empresas donde sí está activo

### Requirement: Asignación de rol a un miembro

Un miembro con permiso SHALL poder cambiar el rol de otro, entre los roles definidos en esa misma
empresa.

Un miembro SHALL poder quedarse sin rol, en cuyo caso conserva la lectura y pierde la escritura,
según lo establecido en `access-control`.

#### Scenario: Se cambia el rol de un miembro

- **WHEN** se asigna a un miembro un rol distinto de la misma empresa
- **THEN** sus permisos pasan a ser los del rol nuevo de inmediato

### Requirement: Transferencia y retirada de la propiedad

Un propietario SHALL poder conceder la propiedad a otro miembro y retirársela.

No SHALL poder retirarse la propiedad al **último** propietario de una empresa: toda empresa
conserva siempre al menos uno.

#### Scenario: Se concede la propiedad a otro miembro

- **WHEN** un propietario concede la propiedad a otro miembro activo
- **THEN** ambos son propietarios

#### Scenario: No se puede dejar la empresa sin propietario

- **GIVEN** una empresa con un único propietario
- **WHEN** se intenta retirarle la propiedad
- **THEN** la operación se rechaza
- **AND** se indica que debe haber al menos un propietario

#### Scenario: Con dos propietarios sí se puede retirar a uno

- **GIVEN** una empresa con dos propietarios
- **WHEN** se retira la propiedad a uno
- **THEN** la operación se completa y queda uno

### Requirement: Consulta de la propia membresía

Un usuario SHALL poder consultar su propia membresía en una empresa, incluyendo su rol y sus
permisos efectivos, para que la interfaz pueda adaptarse a ellos.

Un administrador de plataforma SHALL recibir una membresía equivalente a la de un propietario.

#### Scenario: La interfaz conoce los permisos efectivos

- **WHEN** un miembro consulta su propia membresía
- **THEN** obtiene su rol y el conjunto de permisos que tiene concedidos

#### Scenario: El administrador recibe membresía de propietario

- **GIVEN** un administrador de plataforma sin membresía real
- **WHEN** consulta su membresía en una empresa
- **THEN** obtiene una equivalente a la de propietario

### Requirement: Recuento de miembros activos

Una empresa SHALL exponer cuántas membresías activas tiene, que es la cifra con la que se contrasta
el número de asientos contratados.

#### Scenario: El recuento excluye las desactivadas

- **GIVEN** una empresa con cuatro membresías, una de ellas desactivada
- **WHEN** se consulta el recuento
- **THEN** es `3`

### Requirement: Habilitación de servicios de la empresa

Un administrador de plataforma SHALL poder establecer qué servicios tiene habilitados una empresa,
indicando el conjunto completo.

El sistema SHALL habilitar los que falten y retirar los que sobren respecto del conjunto indicado.

Retirar un servicio no SHALL eliminar los datos creados bajo él; SHALL dejarlos inaccesibles hasta
que vuelva a habilitarse.

#### Scenario: Se reconcilia el conjunto de servicios

- **GIVEN** una empresa con los servicios de almacenes y producciones
- **WHEN** se establece el conjunto a almacenes y sitios web
- **THEN** producciones queda retirado
- **AND** sitios web queda habilitado
- **AND** almacenes permanece

#### Scenario: Retirar un servicio conserva sus datos

- **GIVEN** una empresa con producciones habilitado y datos creados en él
- **WHEN** se retira el servicio
- **THEN** las pantallas de producciones dejan de estar disponibles
- **AND** al volver a habilitarlo los datos siguen ahí

### Requirement: Baja de una empresa con borrado lógico

Eliminar una empresa SHALL aplicarle borrado lógico junto con todo su contenido de negocio, de modo
que deje de ser accesible conservando su historial contable.

La baja SHALL exigir que la empresa no tenga una suscripción activa, y SHALL enumerar previamente
lo que quedará inaccesible.

#### Scenario: No se da de baja con suscripción activa

- **GIVEN** una empresa con suscripción vigente
- **WHEN** se intenta eliminarla
- **THEN** la operación se rechaza
- **AND** se indica que primero debe cancelarse la suscripción

#### Scenario: La baja arrastra el contenido del arrendatario

- **GIVEN** una empresa con almacenes, producciones y sitios
- **WHEN** se da de baja
- **THEN** ninguno de ellos sigue accesible
- **AND** los pagos y las facturas asociadas se conservan

#### Scenario: La baja no toca las cuentas de sus miembros

- **WHEN** se da de baja una empresa
- **THEN** las cuentas de sus miembros siguen existiendo
- **AND** conservan sus membresías en otras empresas
