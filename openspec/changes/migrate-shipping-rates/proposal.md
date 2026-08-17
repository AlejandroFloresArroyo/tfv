# 17 · Cálculo de envío

## Por qué

El algoritmo está **duplicado palabra por palabra** en el servidor y en el navegador, y las tarifas
y el tipo de cambio están escritos en el código (`DEFECTS.md` M-11).

Dos consecuencias prácticas: cambiar una tarifa exige desplegar dos veces, y las dos copias pueden
divergir sin que nadie lo note hasta que un cliente ve una estimación distinta de lo que se le
cobra.

Es una rebanada pequeña, pero bloquea a la 18.

## Qué entra

- Una sola implementación, en el servidor, consumida también por la interfaz.
- Tarifas, umbrales y recargos como datos configurables.
- Tipo de cambio configurable, con registro del que se aplicó a cada envío.
- Normalización de unidades y peso volumétrico.
- Recargos por distancia y por número de artículos, excluyentes dentro de su grupo.
- Desglose completo del cálculo.
- Rechazo explícito cuando falten dimensiones o peso, en lugar de asumir un valor.

## Criterios de aceptación

- La estimación que ve el comprador es exactamente lo que se le cobra.
- Cambiar una tarifa surte efecto sin desplegar código.
- Los recargos por distancia no se acumulan entre sí.
- Los recargos por cantidad no se acumulan entre sí.
- La recolección en tienda cuesta cero y no exige domicilio.
- Sin coordenadas no se aplica recargo por distancia.
- Un artículo sin peso detiene el cálculo indicando cuál y qué falta.
- Cada envío registra el tipo de cambio aplicado.
- No queda ninguna copia del algoritmo en el código del navegador.

## Specs

`shipping-rates` · `storefront-checkout`
