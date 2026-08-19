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
