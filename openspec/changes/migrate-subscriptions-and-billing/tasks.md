# 11 · Suscripciones y alta de comercio — trabajo

> **Marcadas el 2026-08-19, leyendo el código y no la memoria.** La rebanada se implementó y se
> fusionó con la lista intacta —quien la hizo no llegó a marcarla—, así que estas casillas se
> repasaron una a una contra `apps/api/src/billing/` y sus 61 pruebas. Las cuarenta están hechas.
>
> Lo único que faltaba de verdad era su otro extremo: los manejadores del **cobro en tienda
> pública**, que la 07 dejó anotados en H-88 esperando a que existieran las sesiones de pago del
> comprador. Llegaron con la rebanada 18, y con ellas el libro de ingresos dejó de estar vacío.
>
> Sigue faltando **el procesador real** (H-85), que es configuración externa y no código de aquí.

> **Revisadas el 2026-08-19, recorriendo el ciclo en un navegador.** Las cuarenta estaban hechas y
> aun así **contratar no cerraba el círculo**: el suplente devolvía la dirección de vuelta en lugar
> de una página de cobro, así que nadie activaba la suscripción y `company_subscriptions` se quedaba
> vacía (H-163). Con eso caían, sin que ninguna casilla lo dijera, todos los recorridos que cuelgan
> de tener suscripción — y, encadenada, la tienda pública.
>
> Es la lección de H-151 otra vez: una casilla marcada porque el código está escrito no dice que el
> recorrido se pueda hacer. Las tres de abajo se añaden para que **lo que se afirma sea el
> recorrido**, y no el código que lo haría posible.

## Catálogo

- [x] Planes con nivel, título, descripción y prestaciones
- [x] Precios y periodicidades desde el procesador, sin duplicar
- [x] Declarar las prestaciones como descriptivas, sin efecto operativo

## Suscripción

- [x] Contratación con periodicidad y asientos
- [x] Restricciones del plan gratuito: un asiento, una empresa por usuario
- [x] Consulta de disponibilidad del plan gratuito
- [x] Rechazo de contratación con suscripción vigente
- [x] Descuento por volumen y admisión de código promocional
- [x] Cambio de plan conservando asientos, con prorrateo
- [x] Cancelación al vencimiento
- [x] Reactivación antes del vencimiento
- [x] Registro de cobros consultable

## Asientos

- [x] Ampliación al incorporar sin asientos libres, con prorrateo
- [x] Sin ampliar si hay asientos libres
- [x] Liberación al retirar
- [x] **La sincronización conserva los descuentos**

## Gracia

- [x] Fallo de cobro pasa a pago pendiente, sin eliminar
- [x] Periodo de gracia configurable
- [x] Transición a impagada al agotarse
- [x] Restablecimiento tras cobro correcto

## Compuertas

- [x] Comprobación de suscripción vigente en el servidor
- [x] Comprobación de habilitación por clave de servicio, en cada operación
- [x] Independencia de las tres compuertas
- [x] Tienda pública deja de servirse sin suscripción vigente

## Alta de comercio

- [x] Perfil con datos fiscales, bancarios y de representante
- [x] Validación de la cuenta bancaria
- [x] Validación de mayoría de edad del representante
- [x] Alta de la cuenta de comercio, con su cuenta bancaria y su representante
- [x] Registro del instante y origen de la aceptación de términos
- [x] Un solo perfil primario; marcar desmarca
- [x] Enlace de verificación con el procesador
- [x] Sincronización de capacidades y estado
- [x] Consulta del perfil operativo, sin exponer datos fiscales ni bancarios
- [x] Impedir eliminar un perfil con transferencias pendientes
- [x] Libro de ingresos de la empresa

## Verificación

- [x] Prueba por cada combinación de las tres compuertas
- [x] Prueba: renovación conserva el descuento
- [x] Prueba: fallo de cobro no elimina la suscripción
- [x] Prueba: sin perfil operativo la tienda no cobra
- [x] Prueba: perfil activo no primario no habilita
- [x] **Prueba: el ciclo de contratación entero contra el suplente**, con el evento firmado
      entregado por HTTP al endpoint público y no por llamada interna
- [x] **Prueba de navegador: contratar, pagar, cambiar de plan, cancelar y reactivar**, sobre una
      empresa que la propia prueba crea y borra
- [x] **Prueba: la tienda pública pasa a servirse cuando la suscripción se activa** — el
      encadenamiento que demuestra que el círculo se cierra
