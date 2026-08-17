# 11 · Suscripciones y alta de comercio

## Por qué

Los dos flujos de dinero de la plataforma: lo que se le cobra a las empresas y lo que las empresas
pueden cobrar a sus clientes.

Depende de la rebanada 07, que garantiza que los eventos que sincronizan el estado de una
suscripción son legítimos. Sin ella, esta rebanada construye sobre datos que cualquiera puede
falsificar.

## Qué entra

- Catálogo de planes con sus precios y periodicidades del procesador.
- Contratación, cambio de plan, cancelación al vencimiento y reactivación.
- Licencia por asiento, con ampliación al incorporar y liberación al retirar.
- Restricciones del plan gratuito.
- Descuento por volumen y códigos promocionales.
- Registro de cobros de suscripción.
- Periodo de gracia ante un fallo de cobro.
- Las tres compuertas, comprobadas de forma independiente en el servidor.
- Perfiles de facturación con su alta de comercio, cuenta bancaria y representante legal.
- Enlace de verificación con el procesador y sincronización de estado.
- Libro de ingresos de la empresa.

## Correcciones incluidas

| Ref | Corrección |
|---|---|
| M-07 | La sincronización de asientos deja de borrar los descuentos en cada renovación |
| M-08 | Un fallo de cobro concede periodo de gracia en lugar de eliminar la suscripción |

## Criterios de aceptación

- Las prestaciones del plan quedan explícitamente declaradas como descriptivas: nada las hace
  cumplir.
- El plan gratuito admite un asiento y una sola empresa por usuario.
- Contratar con suscripción vigente se rechaza.
- Abandonar el pago no deja suscripción.
- Cambiar de plan conserva el número de asientos.
- Cancelar surte efecto al vencimiento, no de inmediato.
- Una renovación conserva los descuentos.
- Un fallo de cobro deja la suscripción en pago pendiente y la empresa operando durante la gracia.
- Una empresa sin perfil de facturación operativo no puede cobrar en su tienda.
- Un perfil limitado sí puede; un perfil activo que no sea el primario no habilita.
- La comprobación de habilitación de servicio ocurre en el servidor, en cada operación.

## Riesgos

**Las tres compuertas son independientes y es fácil colapsarlas por descuido.** Un propietario con
suscripción vigente puede no tener un servicio habilitado; un servicio habilitado no implica
permiso. Conviene una prueba por cada combinación.

## Specs

`subscriptions-and-entitlements` · `merchant-onboarding`
