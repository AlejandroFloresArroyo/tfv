# Control de acceso

## Purpose

Determina **quién puede hacer qué, sobre los datos de quién**. Reúne cuatro mecanismos que hoy se
confunden entre sí y que aquí quedan separados y todos vigentes:

1. **Autenticación** — quién es el solicitante.
2. **Pertenencia** — a qué empresa pertenecen los datos que pide.
3. **Permiso** — si su rol le autoriza la acción concreta.
4. **Habilitación** — si la empresa tiene contratado el servicio (se especifica en
   `subscriptions-and-entitlements`; aquí sólo se referencia).

Esta capability describe el cambio más profundo de todo el programa. En la implementación anterior:

- los 255 permisos existían pero **nunca se evaluaban como control de acceso** — su único uso era
  elegir a quién notificar;
- el alcance por arrendatario dependía **únicamente del parámetro de ruta**, y ningún manejador
  comprobaba pertenencia;
- 69 de 91 módulos no exigían credencial alguna.

Todo eso desaparece. Ver `DEFECTS.md` S-02, S-05, S-06 y S-07.

### Catálogo de permisos

Las claves son jerárquicas y se leen `<servicio>.<recurso>.<acción>`, **siempre tres niveles**.
El primer nivel coincide con la clave del servicio, salvo `companies`, que es el núcleo común y no
un servicio contratable.

Son **255**, en 45 recursos.

> **Corregido el 2026-08-17.** Esta sección decía 127 y enumeraba 130 claves, de las cuales 11 no
> existían en la implementación —`companies.create`, los `users.*` sin su prefijo de servicio,
> `warehouses.orders.create` y `warehouses.quotes.delete_payment`— y le faltaban 136, entre ellas
> **las 45 de lectura**: el eje `view` entero no figuraba. La tabla de abajo se extrajo del
> catálogo real reproduciendo su función de derivación, no se transcribió. Importa que sea exacta:
> los roles que hoy existen guardan estas cadenas literales, y una que falte deja a alguien sin un
> permiso que tenía el día del corte.

| Espacio | Acciones |
|---|---|
| `companies.companies` | `view`, `edit`, `delete` |
| `companies.clients` | `view`, `create`, `edit`, `delete` |
| `companies.providers` | `view`, `create`, `edit`, `delete` |
| `companies.addresses` | `view`, `create`, `edit`, `primary`, `delete` |
| `companies.roles` | `view`, `create`, `edit`, `change_permissions`, `delete` |
| `companies.users` | `view`, `create`, `invite`, `uninvite`, `change-role`, `recover-password`, `active`, `desactive` |
| `companies.billings` | `view`, `create`, `edit`, `delete`, `primary` |
| `locations.locations` | `view` |
| `pixit.stores` | `view`, `create`, `edit`, `delete`, `website` |
| `pixit.colors` | `view`, `create`, `edit`, `delete` |
| `pixit.boards` | `view`, `create`, `edit`, `delete`, `size_create`, `size_edit`, `size_delete` |
| `pixit.inventory` | `view`, `create`, `edit`, `delete`, `stock_create`, `stock_edit`, `stock_delete` |
| `pixit.sessions` | `view`, `create`, `edit`, `delete`, `close`, `change` |
| `pixit.sales` | `view`, `create`, `edit`, `delete` |
| `pixit.sheets` | `view`, `create`, `edit`, `delete` |
| `pixit.rooms` | `view`, `create`, `edit`, `delete` |
| `pixit.terms` | `view`, `create`, `edit`, `delete` |
| `pixit.products` | `view`, `create`, `edit`, `delete`, `website` |
| `productions.productions` | `view`, `create`, `edit`, `website`, `delete` |
| `productions.categories` | `view`, `create`, `edit`, `delete` |
| `productions.products` | `view`, `create`, `edit`, `status`, `select_status`, `select_category`, `delete` |
| `productions.characters` | `view`, `create`, `edit`, `delete` |
| `productions.pdfs` | `view`, `create`, `edit`, `sync`, `delete` |
| `productions.chapters` | `view`, `create`, `edit`, `delete` |
| `productions.scenes` | `view`, `create`, `edit`, `delete` |
| `productions.videos` | `view`, `create`, `select_category`, `edit`, `delete` |
| `productions.recordings` | `view`, `create`, `edit`, `characters`, `notes`, `close`, `open`, `delete` |
| `productions.continuities` | `view`, `create`, `character`, `products`, `videos`, `all_selectable`, `delete` |
| `productions.deliveries` | `view`, `create`, `info`, `products`, `delete`, `responsible`, `finished` |
| `productions.delivery_products` | `view`, `responsible`, `find`, `searching`, `delete` |
| `productions.sets` | `view`, `create`, `edit`, `products`, `delete` |
| `productions.budgets` | `view` |
| `productions.anchors` | `view`, `create`, `edit`, `delete` |
| `productions.shoppings` | `view`, `create`, `edit`, `products`, `select_category`, `delete` |
| `productions.orders` | `view`, `create`, `edit`, `quote_rented`, `quote_finished`, `reject`, `delete` |
| `productions.workflows` | `view`, `create`, `edit`, `status`, `comments`, `select_responsible`, `delete`, `task_create`, `task_edit`, `task_status`, `task_comments`, `task_select_responsible`, `task_select_category`, `task_delete`, `task_activity_create`, `task_activity_edit`, `task_activity_responsible`, `task_activity_status`, `task_activity_select_status`, `task_activity_comments`, `task_activity_delete` |
| `warehouses.warehouses` | `view`, `create`, `edit`, `website`, `delete` |
| `warehouses.categories` | `view`, `create`, `edit`, `delete` |
| `warehouses.prices` | `view`, `create`, `edit`, `delete` |
| `warehouses.storages` | `view`, `create`, `edit`, `products`, `delete` |
| `warehouses.products` | `view`, `create`, `website`, `edit_info`, `edit_payment`, `edit_location`, `edit_measurement`, `select_category`, `delete`, `measurement_create`, `measurement_edit`, `measurement_delete`, `price_create`, `price_edit`, `price_delete`, `stock_create`, `stock_edit`, `stock_delete` |
| `warehouses.quotes` | `view`, `create`, `responsible`, `edit_info`, `edit_contacts`, `edit_products`, `edit_status`, `edit_payment`, `edit_tax`, `rented`, `finished`, `delete` |
| `warehouses.orders` | `view`, `accept`, `edit`, `reject`, `delete` |
| `websites.websites` | `view`, `create`, `edit`, `delete` |
| `websites.customizes` | `view`, `create`, `edit`, `delete` |

## Requirements

### Requirement: Denegación por defecto

Todo endpoint SHALL exigir autenticación salvo que figure de forma explícita en la lista de
superficies públicas.

Añadir un endpoint sin declarar su régimen de acceso SHALL dejarlo protegido, nunca abierto.

#### Scenario: Un endpoint nuevo nace protegido

- **GIVEN** un endpoint recién añadido sin declaración de régimen de acceso
- **WHEN** se solicita sin credencial
- **THEN** la respuesta es `401`

#### Scenario: Una superficie pública declarada permanece abierta

- **GIVEN** un endpoint declarado explícitamente como público
- **WHEN** se solicita sin credencial
- **THEN** se atiende con normalidad

### Requirement: Superficies públicas enumeradas

El sistema SHALL mantener una lista explícita y auditable de los endpoints accesibles sin
credencial. La lista SHALL limitarse a: inicio de sesión y registro, recuperación y restablecimiento
de contraseña, verificación de correo, catálogo de planes, lecturas de tienda pública, creación de
sesión de compra, recepción de eventos del procesador de pagos, documentos compartidos por enlace,
y comprobación de salud.

Ninguna operación de escritura sobre datos de una empresa SHALL figurar en esa lista.

#### Scenario: La creación de roles no es pública

- **WHEN** se intenta crear un rol sin credencial
- **THEN** la respuesta es `401`

#### Scenario: El catálogo de una tienda publicada sí lo es

- **WHEN** un visitante anónimo lista los productos publicados de una tienda
- **THEN** se atiende con normalidad

### Requirement: La credencial se verifica, no se decodifica

El sistema SHALL verificar criptográficamente la credencial presentada antes de derivar de ella
identidad alguna, y SHALL rechazar con `401` toda credencial cuya firma no valide o que haya
caducado.

No SHALL existir ninguna vía alternativa que conceda acceso por el mero hecho de que un valor
tenga la forma esperada.

#### Scenario: Una credencial con firma alterada se rechaza

- **WHEN** se presenta una credencial con la carga útil modificada
- **THEN** la respuesta es `401`
- **AND** la identidad que la carga útil declara no se toma en cuenta

#### Scenario: No hay puerta trasera por encabezado alternativo

- **WHEN** se presenta un valor con forma de credencial en cualquier encabezado distinto del estándar
- **THEN** no concede acceso a un recurso protegido

### Requirement: Las claves de servicio son credenciales reales

Cuando el sistema admita claves para integraciones automatizadas, SHALL almacenarlas de forma
verificable, asociarlas a una empresa y a un conjunto de permisos, permitir revocarlas, y
registrar su uso.

Una clave SHALL conceder como máximo los permisos que tenga asignados, nunca acceso total.

#### Scenario: Una clave revocada deja de servir

- **GIVEN** una clave de integración revocada
- **WHEN** se presenta en una petición
- **THEN** la respuesta es `401`

#### Scenario: Una clave no excede sus permisos

- **GIVEN** una clave con permiso únicamente de lectura de catálogo
- **WHEN** intenta modificar una unidad de stock
- **THEN** la respuesta es `403`

### Requirement: La pertenencia determina el alcance

El acceso a los datos de una empresa SHALL depender de que el solicitante tenga en ella una
membresía **activa**. El identificador de empresa presente en la ruta SHALL usarse para seleccionar
datos, nunca para conceder acceso.

Un solicitante autenticado que pida datos de una empresa a la que no pertenece SHALL recibir `404`,
de modo que no pueda inferir la existencia de esa empresa ni de sus recursos.

#### Scenario: Cambiar el identificador en la URL no abre datos ajenos

- **GIVEN** un usuario con membresía activa en la empresa A
- **WHEN** solicita una colección sustituyendo el identificador por el de la empresa B
- **THEN** la respuesta es `404`
- **AND** no se filtra ningún dato de la empresa B

#### Scenario: Una membresía desactivada pierde el acceso

- **GIVEN** un usuario cuya membresía en una empresa se ha desactivado
- **WHEN** solicita datos de esa empresa
- **THEN** la respuesta es `404`

#### Scenario: Un recurso hijo hereda el alcance de su empresa

- **GIVEN** una unidad de stock perteneciente a un almacén de la empresa A
- **WHEN** un miembro de la empresa B la solicita por su identificador directo
- **THEN** la respuesta es `404`

### Requirement: El aislamiento se cumple en dos capas

El aislamiento entre arrendatarios SHALL seguir vigente aunque la capa de aplicación falle en
aplicarlo. El motor de datos SHALL rechazar por sí mismo el acceso a filas de una empresa a la que
el solicitante no pertenece.

Para que esa segunda capa sea efectiva, la identidad del solicitante SHALL propagarse hasta el
motor de datos en cada operación; una conexión que opere con credenciales de servicio y sin
identidad propagada no SHALL usarse para atender peticiones de usuario.

#### Scenario: Un fallo de la aplicación no filtra datos

- **GIVEN** un manejador que, por error, omite el filtro por empresa
- **WHEN** un miembro de la empresa A lo invoca
- **THEN** el motor de datos devuelve únicamente filas de la empresa A
- **AND** no se exponen filas de otras empresas

#### Scenario: Las operaciones de sistema quedan segregadas

- **GIVEN** un proceso en segundo plano que debe operar sobre varias empresas
- **WHEN** se ejecuta
- **THEN** usa una vía de acceso distinta de la que atiende peticiones de usuario
- **AND** esa vía queda registrada de forma auditable

### Requirement: Los permisos autorizan la acción

Toda operación asociada a una clave de permiso SHALL comprobar que el rol del solicitante la tiene
concedida, y SHALL responder `403` cuando no sea así.

La comprobación SHALL ocurrir **antes** de cualquier efecto: no SHALL crearse ni modificarse nada,
ni emitirse notificación alguna, cuando el permiso falte.

#### Scenario: Sin permiso no hay efecto

- **GIVEN** un miembro cuyo rol no concede la eliminación de productos
- **WHEN** intenta eliminar un producto
- **THEN** la respuesta es `403`
- **AND** el producto sigue existiendo
- **AND** no se ha registrado actividad ni enviado notificación

#### Scenario: Un rol sin permisos no puede escribir

- **GIVEN** un miembro con un rol cuyo conjunto de permisos está vacío
- **WHEN** intenta cualquier operación de escritura sobre la empresa
- **THEN** la respuesta es `403`

#### Scenario: Una acción con permiso se ejecuta

- **GIVEN** un miembro cuyo rol concede la creación de cotizaciones
- **WHEN** crea una cotización en su empresa
- **THEN** la operación se completa

### Requirement: El propietario elude la comprobación de permisos

Un miembro marcado como propietario SHALL poder realizar cualquier operación dentro de su empresa
con independencia de los permisos de su rol.

Esta elusión SHALL aplicarse **sólo** a la comprobación de permisos: la pertenencia y la
habilitación del servicio siguen exigiéndose.

#### Scenario: El propietario actúa sin permisos explícitos

- **GIVEN** un propietario cuyo rol no concede ningún permiso
- **WHEN** elimina un producto de su empresa
- **THEN** la operación se completa

#### Scenario: El propietario no cruza a otra empresa

- **GIVEN** un propietario de la empresa A
- **WHEN** intenta operar sobre datos de la empresa B
- **THEN** la respuesta es `404`

#### Scenario: El propietario no elude la habilitación del servicio

- **GIVEN** un propietario de una empresa sin el servicio de almacenes habilitado
- **WHEN** intenta crear un almacén
- **THEN** la operación se rechaza por falta de habilitación

### Requirement: Los roles pertenecen a una empresa

Un rol SHALL pertenecer siempre a exactamente una empresa. No SHALL existir roles globales ni
compartidos entre empresas.

Crear, modificar o eliminar un rol SHALL exigir pertenencia a esa empresa y el permiso
correspondiente.

#### Scenario: Un rol no se aplica fuera de su empresa

- **GIVEN** un rol definido en la empresa A
- **WHEN** se intenta asignar a una membresía de la empresa B
- **THEN** la operación se rechaza

### Requirement: Eliminar un rol deja a sus miembros sin permisos

Al eliminar un rol, las membresías que lo tuvieran asignado SHALL quedar sin rol, conservando su
pertenencia.

Una membresía sin rol SHALL conservar el acceso de lectura que la pertenencia concede, y SHALL
carecer de todo permiso de escritura salvo que sea propietaria.

#### Scenario: El miembro conserva la pertenencia y pierde la escritura

- **GIVEN** un miembro no propietario con un rol asignado
- **WHEN** se elimina ese rol
- **THEN** el miembro sigue perteneciendo a la empresa
- **AND** sus intentos de escritura reciben `403`

### Requirement: El catálogo de permisos es la fuente de autoridad

El sistema SHALL mantener el catálogo de claves de permiso como dato del servidor, versionado y
consultable, y SHALL rechazar la concesión de una clave que no figure en él.

#### Scenario: No se concede una clave desconocida

- **WHEN** se intenta guardar un rol con una clave de permiso ausente del catálogo
- **THEN** la respuesta es `400`
- **AND** el mensaje nombra la clave no reconocida

#### Scenario: La interfaz construye la matriz desde el catálogo

- **WHEN** se abre el editor de permisos de un rol
- **THEN** las claves que ofrece proceden del catálogo del servidor

### Requirement: El administrador de plataforma cruza empresas

Un usuario marcado como administrador de plataforma SHALL poder operar sobre cualquier empresa como
si fuese propietario de ella.

Toda acción realizada bajo esa condición SHALL registrarse identificando que se ejerció como
administrador de plataforma.

#### Scenario: El administrador entra en una empresa ajena

- **GIVEN** un administrador de plataforma sin membresía en la empresa A
- **WHEN** consulta los datos de la empresa A
- **THEN** obtiene acceso equivalente al de un propietario

#### Scenario: Su intervención queda registrada

- **WHEN** un administrador de plataforma modifica datos de una empresa ajena
- **THEN** el asiento de actividad refleja que la acción se ejerció como administrador de plataforma

### Requirement: El comprador accede sólo a lo suyo

Un principal que actúe como comprador en una tienda pública SHALL poder leer y modificar
únicamente sus propias direcciones y sus propios pedidos de comprador.

Actuar como comprador no SHALL conceder acceso alguno al panel de ninguna empresa.

#### Scenario: Un comprador no ve los pedidos de otro

- **GIVEN** dos compradores con pedidos en la misma tienda
- **WHEN** uno solicita el pedido del otro por su identificador
- **THEN** la respuesta es `404`

#### Scenario: Comprar no abre el panel

- **GIVEN** un principal que ha comprado en la tienda de una empresa y no es miembro de ella
- **WHEN** intenta acceder a los datos de gestión de esa empresa
- **THEN** la respuesta es `404`

### Requirement: Los enlaces compartidos conceden sólo lectura

Un documento accesible por enlace público SHALL ser de sólo lectura y SHALL limitarse al documento
referido, sin exponer navegación ni datos de la empresa más allá de lo que el propio documento
muestra.

La referencia del enlace SHALL ser suficientemente impredecible como para no poder adivinarse.

#### Scenario: Un enlace no permite escribir

- **WHEN** se accede a una cotización por su enlace público
- **THEN** el documento se muestra
- **AND** todo intento de modificarlo recibe `401`

#### Scenario: Un enlace no permite enumerar

- **WHEN** se altera la referencia de un enlace público
- **THEN** la respuesta es `404`
- **AND** no revela si existe otro documento
