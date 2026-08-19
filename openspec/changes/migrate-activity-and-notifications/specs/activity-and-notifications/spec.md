# Delta · 09 · Bitácora y notificaciones

Lo que esta rebanada **retira** del alcance. Ver `project.md` D-09 y el índice de
[`../../../README.md`](../../README.md), que asigna esta retirada a la rebanada 09.

`specs/activity-and-notifications/spec.md` describe el destino y por eso **no** contiene el
requisito de abajo: nunca fue algo que se pretendiera. Este delta existe para que quede constancia
de que la superficie se retiró **a propósito** y no se olvidó, que es la diferencia entre una
decisión y un hueco.

## REMOVED Requirements

### Requirement: Administración de plantillas de notificación por API

La implementación anterior expone endpoints que crean, listan, modifican y eliminan **plantillas de
notificación del proveedor**, operando sobre la cuenta real de producción.

Se retira entero, por dos razones que se suman:

- **Estaba abierto.** No exigía credencial alguna, así que cualquiera con la dirección podía
  reescribir el texto de los correos que la plataforma manda en su nombre —incluidos los de
  recuperación de contraseña— o borrarlos.
- **Duplica el panel del proveedor**, que ya administra sus plantillas con su propio control de
  acceso y su propio historial de cambios. Reimplementarlo sería mantener dos administraciones de lo
  mismo, y la que sobra es la que no tiene auditoría.

Las plantillas se administran desde el panel del proveedor. La pila nueva no expone ninguna ruta que
las toque, y eso lo vigila una prueba —no un acuerdo—: la tabla de rutas se recorre entera y ninguna
puede nombrarlas.

#### Scenario: No hay ninguna ruta de plantillas

- **WHEN** se recorre la tabla de rutas publicada
- **THEN** ninguna ruta administra plantillas de notificación

#### Scenario: Ninguna superficie de avisos queda abierta

- **WHEN** se recorren las rutas de bandeja, preferencias y dispositivos
- **THEN** todas exigen sesión
- **AND** ninguna es pública

## Lo que no se retira

Los **tipos** de notificación del catálogo de la spec siguen enteros: lo retirado es administrar sus
plantillas por API, no dejar de enviarlos.
