# Suscripciones y habilitaciones

## Purpose

Cómo una empresa paga por usar la plataforma y qué obtiene a cambio.

Conviene no confundir los dos flujos de dinero del sistema. **Éste** es el que la plataforma le
cobra a sus empresas clientes. El otro —el que una empresa le cobra a sus propios compradores— vive
en `merchant-onboarding` y `storefront-checkout`.

La licencia es **por asiento**: se paga por cada miembro activo, de modo que incorporar personal
cuesta dinero y darlo de baja lo libera.

Y lo más importante para el resto del sistema: **el acceso a una funcionalidad depende de tres
compuertas independientes**, y ninguna implica a las otras.

| Compuerta | Pregunta | Dónde se especifica |
|---|---|---|
| Suscripción | ¿La empresa está al corriente? | Aquí |
| Habilitación | ¿Tiene contratado ese servicio? | Aquí |
| Permiso | ¿El rol de esta persona lo autoriza? | `access-control` |

El catálogo de planes describe además una lista de prestaciones con valores y límites. Hoy es
**material descriptivo**: nada en el sistema los hace cumplir. Esta spec lo declara explícitamente
para que no se asuma lo contrario.

### Estados de una suscripción

| Estado | Significado |
|---|---|
| En prueba | Periodo de prueba en curso |
| Activa | Al corriente de pago |
| Pago pendiente | Un cobro falló y se está reintentando |
| Incompleta | El primer cobro no llegó a completarse |
| Incompleta caducada | El primer cobro no se completó a tiempo |
| Impagada | Se agotaron los reintentos |
| Cancelada | Terminada |

## Requirements

### Requirement: Catálogo de planes

El sistema SHALL mantener un catálogo de planes, cada uno con su nivel, título, descripción, si es
individual, si es recomendado y su lista de prestaciones.

Los precios de cada plan SHALL provenir del procesador de pagos y no almacenarse por duplicado.

Un plan SHALL poder ofrecer varias periodicidades, y el catálogo SHALL exponerlas todas.

#### Scenario: El catálogo incluye los precios vigentes

- **WHEN** se consulta el catálogo de planes
- **THEN** cada plan incluye sus precios y periodicidades disponibles
- **AND** los importes coinciden con los del procesador de pagos

### Requirement: Las prestaciones del plan son descriptivas

La lista de prestaciones de un plan SHALL ser material informativo para la comparación de planes, y
no SHALL usarse como control de acceso ni como límite operativo.

Cuando en el futuro se desee hacer cumplir un límite, SHALL especificarse explícitamente como
requisito propio.

#### Scenario: Una prestación no bloquea una operación

- **GIVEN** un plan cuya lista de prestaciones menciona un límite numérico
- **WHEN** la empresa supera ese número
- **THEN** la operación no se bloquea por ese motivo

### Requirement: El plan gratuito está restringido

Un plan de nivel cero SHALL admitir como máximo un asiento, y un mismo usuario SHALL poder tener
como máximo una empresa suscrita a él.

#### Scenario: El plan gratuito no admite dos asientos

- **WHEN** se intenta suscribir una empresa al plan gratuito con dos asientos
- **THEN** la operación se rechaza

#### Scenario: Una segunda empresa gratuita se rechaza

- **GIVEN** un usuario que ya tiene una empresa en el plan gratuito
- **WHEN** intenta suscribir otra al mismo plan
- **THEN** la operación se rechaza
- **AND** se le indica que ya dispone de una

#### Scenario: Se puede consultar si ya se usó

- **WHEN** un usuario consulta si tiene disponible el plan gratuito
- **THEN** obtiene una respuesta booleana

### Requirement: Contratación de un plan

Un miembro con permiso SHALL poder suscribir su empresa a un plan indicando la periodicidad y el
número de asientos, y el sistema SHALL devolver la dirección de pago a la que redirigir.

Una empresa que ya tenga suscripción SHALL rechazar una contratación nueva; el camino es cambiar de
plan.

#### Scenario: Se obtiene la dirección de pago

- **WHEN** un propietario contrata un plan para su empresa
- **THEN** recibe la dirección de la sesión de pago
- **AND** al completarla la suscripción queda activa

#### Scenario: No se contrata dos veces

- **GIVEN** una empresa con suscripción vigente
- **WHEN** se intenta contratar otro plan
- **THEN** la operación se rechaza

#### Scenario: Abandonar el pago no deja suscripción

- **GIVEN** una sesión de pago iniciada
- **WHEN** el usuario la abandona
- **THEN** la empresa sigue sin suscripción
- **AND** puede volver a intentarlo

### Requirement: Descuento por volumen de asientos

Cuando una contratación de plan de pago incluya asientos por encima del umbral establecido, el
sistema SHALL aplicar automáticamente el descuento por volumen correspondiente.

Por debajo del umbral, la sesión de pago SHALL permitir introducir un código promocional
manualmente.

#### Scenario: Se aplica el descuento por volumen

- **WHEN** se contrata un plan de pago con asientos por encima del umbral
- **THEN** la sesión de pago refleja el descuento aplicado

#### Scenario: Por debajo del umbral se admite código manual

- **WHEN** se contrata con menos asientos que el umbral
- **THEN** la sesión de pago admite introducir un código promocional

### Requirement: Cambio de plan

Un miembro con permiso SHALL poder cambiar el plan de su empresa, conservando el número de asientos
contratados.

El cambio SHALL prorratearse según el tiempo restante del periodo en curso, y la suscripción SHALL
quedar apuntando al plan nuevo.

#### Scenario: El cambio conserva los asientos

- **GIVEN** una suscripción con cinco asientos
- **WHEN** se cambia a otro plan
- **THEN** la suscripción nueva mantiene cinco asientos

### Requirement: Cancelación al final del periodo

Un miembro con permiso SHALL poder cancelar la suscripción de su empresa, y la cancelación SHALL
surtir efecto **al terminar el periodo pagado**, no de inmediato.

Mientras el periodo siga vigente, la empresa SHALL conservar todas sus funciones.

#### Scenario: La empresa opera hasta el final del periodo

- **GIVEN** una suscripción cancelada con periodo vigente
- **WHEN** un miembro usa la plataforma
- **THEN** todo funciona con normalidad
- **AND** se le informa de la fecha en que terminará

#### Scenario: Al terminar el periodo se bloquea

- **GIVEN** una suscripción cancelada cuyo periodo ha terminado
- **WHEN** un miembro abre el panel de la empresa
- **THEN** se le presenta la selección de plan de forma bloqueante

### Requirement: Reactivación antes del vencimiento

Un miembro con permiso SHALL poder revertir una cancelación mientras el periodo siga vigente, y la
suscripción SHALL volver a renovarse con normalidad.

#### Scenario: Se revierte la cancelación

- **GIVEN** una suscripción cancelada con periodo vigente
- **WHEN** se reactiva
- **THEN** deja de estar marcada para terminar
- **AND** se renovará al final del periodo

### Requirement: Los asientos siguen a los miembros activos

El número de asientos contratados SHALL ser al menos igual al número de membresías activas de la
empresa.

Incorporar a un miembro cuando no queden asientos libres SHALL ampliar la suscripción con
prorrateo. Retirar a un miembro SHALL liberar su asiento.

#### Scenario: Incorporar amplía cuando hace falta

- **GIVEN** una suscripción de tres asientos con tres miembros activos
- **WHEN** se incorpora un cuarto
- **THEN** la suscripción pasa a cuatro asientos con prorrateo

#### Scenario: Con asientos libres no se amplía

- **GIVEN** una suscripción de cinco asientos con tres miembros activos
- **WHEN** se incorpora un cuarto
- **THEN** la suscripción sigue en cinco asientos
- **AND** no se genera cargo adicional

### Requirement: La renovación conserva los descuentos

La sincronización de asientos que ocurre en cada renovación no SHALL eliminar los descuentos ni los
códigos promocionales aplicados a la suscripción.

Este requisito existe porque la implementación anterior los borraba en cada ciclo de facturación
(ver `DEFECTS.md` M-07).

#### Scenario: El descuento sobrevive a la renovación

- **GIVEN** una suscripción con un descuento por volumen aplicado
- **WHEN** se renueva el periodo y se sincronizan los asientos
- **THEN** el descuento sigue aplicado en el periodo nuevo

### Requirement: Registro de los cobros de suscripción

Cada cobro de un periodo SHALL registrarse con su importe, moneda, periodo cubierto, número de
asientos y resultado.

Los miembros con permiso SHALL poder consultar el historial de cobros de su empresa.

#### Scenario: Un cobro correcto queda registrado

- **WHEN** se cobra un periodo de suscripción
- **THEN** queda un registro con su importe, su periodo y su resultado

### Requirement: Un fallo de cobro concede un periodo de gracia

Cuando falle el cobro de un periodo, la suscripción SHALL pasar a pago pendiente y SHALL conservar
sus funciones durante un periodo de gracia mientras se reintenta el cobro.

La suscripción no SHALL eliminarse ante un fallo de cobro. La implementación anterior la borraba de
inmediato, lo que dejaba fuera de servicio a la empresa y tumbaba sus tiendas públicas ante un fallo
transitorio de tarjeta (ver `DEFECTS.md` M-08).

#### Scenario: Un fallo transitorio no corta el servicio

- **GIVEN** una suscripción activa cuyo cobro falla
- **WHEN** se procesa el fallo
- **THEN** la suscripción pasa a pago pendiente
- **AND** la empresa sigue operando durante el periodo de gracia
- **AND** se avisa a quien corresponde

#### Scenario: Al agotarse la gracia se bloquea

- **GIVEN** una suscripción en pago pendiente cuyo periodo de gracia ha terminado sin cobro
- **WHEN** se evalúa su estado
- **THEN** pasa a impagada
- **AND** la empresa queda bloqueada

#### Scenario: Un cobro posterior restablece

- **GIVEN** una suscripción en pago pendiente
- **WHEN** un reintento cobra correctamente
- **THEN** vuelve a estar activa

### Requirement: Habilitación de servicios por clave

El acceso a un servicio SHALL depender de que la empresa lo tenga habilitado, identificado por su
clave de servicio.

La comprobación SHALL realizarse en el servidor en cada operación del servicio, no sólo al construir
la navegación.

#### Scenario: Un servicio no habilitado se rechaza

- **GIVEN** una empresa sin el servicio de almacenes habilitado
- **WHEN** un propietario intenta crear un almacén
- **THEN** la operación se rechaza por falta de habilitación

#### Scenario: La comprobación es por clave, no por identificador

- **WHEN** se consulta si una empresa tiene habilitado un servicio indicando su clave
- **THEN** la respuesta es correcta

### Requirement: Las tres compuertas son independientes

Superar una de las tres compuertas —suscripción, habilitación y permiso— no SHALL implicar superar
las otras. Toda operación de un servicio SHALL comprobarlas las tres.

#### Scenario: La suscripción no sustituye a la habilitación

- **GIVEN** una empresa con suscripción activa pero sin el servicio de producciones habilitado
- **WHEN** un propietario intenta crear una producción
- **THEN** la operación se rechaza

#### Scenario: La habilitación no sustituye al permiso

- **GIVEN** una empresa con almacenes habilitado y un miembro sin permiso de crear productos
- **WHEN** intenta crear uno
- **THEN** la respuesta es `403`

#### Scenario: El permiso no sustituye a la suscripción

- **GIVEN** un propietario de una empresa sin suscripción vigente
- **WHEN** intenta cualquier operación de negocio
- **THEN** se le presenta la selección de plan de forma bloqueante

### Requirement: La suscripción condiciona las tiendas públicas

Una tienda pública SHALL dejar de servirse cuando la suscripción de su empresa no esté vigente, y
SHALL indicarlo con una página propia en lugar de un error genérico.

#### Scenario: Una tienda sin suscripción muestra su aviso

- **GIVEN** una empresa cuya suscripción no está vigente
- **WHEN** un visitante abre su tienda pública
- **THEN** ve una página que indica que el sitio no está disponible
- **AND** no ve el catálogo
