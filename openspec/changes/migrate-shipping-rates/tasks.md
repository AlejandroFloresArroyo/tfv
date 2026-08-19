# 17 · Cálculo de envío — trabajo

## Implementación única

- [x] Cálculo en el servidor
- [x] Endpoint de estimación consumido por la interfaz
- [~] **Retirar la copia del algoritmo del código del navegador** — **no aplicable**: la copia vive
      en `tfv-frontend/`, que no está en este árbol y que la regla 1 prohíbe tocar. La pila nueva
      no tiene ninguna: el cálculo es `packages/contracts/src/shipping.ts` y el navegador pide la
      estimación al servidor
- [~] Retirar la copia del cálculo de distancia — **no aplicable**, por lo mismo: `haversineKm`
      existe una sola vez, en `packages/contracts/src/shipping.ts:214`, y `apps/web` no la importa

> Las dos copias viven en `tfv-frontend/`, que la regla 1 de `IMPLEMENTATION.md` deja intacto
> —es la referencia y sigue en producción—. En la pila nueva **no hay ninguna**: el navegador pide
> la estimación al servidor y no la calcula. Se cierran al retirar la pila anterior, rebanada 30.

## Configuración

- [x] Tarifas base y por kilogramo, como datos
- [x] Umbrales y recargos, como datos
- [x] Tipo de cambio, como dato
- [x] Superficie de administración de las tarifas

## Cálculo

- [x] Normalización de dimensiones a centímetros
- [x] Normalización de peso a kilogramos
- [x] Peso volumétrico por artículo
- [x] Peso facturable como el mayor entre real y volumétrico
- [x] Las cuatro modalidades
- [x] Recolección con costo cero y sin domicilio
- [x] Recargos por distancia, excluyentes
- [x] Recargos por cantidad, excluyentes
- [x] Distancia entre coordenadas
- [x] Sin coordenadas, sin recargo por distancia
- [x] Redondeo a dos decimales
- [x] Conversión de moneda con registro del tipo aplicado

## Resultado

- [x] Desglose: modalidad, pesos, artículos, base, variable, recargos y total
- [x] Rechazo con identificación del artículo y el dato que falta

## Verificación

- [x] Prueba por cada modalidad
- [x] Prueba: manda el volumétrico cuando es mayor
- [x] Prueba: manda el real cuando es mayor
- [x] Prueba: los recargos por distancia no se acumulan
- [x] Prueba: los recargos por cantidad no se acumulan
- [x] Prueba: la estimación coincide con lo cobrado
- [x] Prueba: artículo sin peso detiene el cálculo

## Entrega del pedido

Lo que `order-fulfillment` pide del envío para cerrar el ciclo de un pedido de almacén. El resto de
esa capability —la materialización de las ocho entidades— es la rebanada 18.

- [x] Máquina de estados del envío, compartida con la interfaz
- [x] Paquetería, guía y fecha estimada
- [x] La entrega queda fechada por el sistema
- [x] El comercio mueve su propio envío, y sólo el suyo

> **Queda fuera**: la estimación para un comprador **sin sesión** en una tienda pública. El cálculo
> ya está listo para ella —`estimateShipping` recibe la transacción y no la abre—, pero resolver la
> tienda por su subdominio y decidir qué se enseña sin sesión es la rebanada 19. Ver H-101.
