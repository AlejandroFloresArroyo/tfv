# 17 · Cálculo de envío — trabajo

## Implementación única

- [ ] Cálculo en el servidor
- [ ] Endpoint de estimación consumido por la interfaz
- [ ] **Retirar la copia del algoritmo del código del navegador**
- [ ] Retirar la copia del cálculo de distancia

## Configuración

- [ ] Tarifas base y por kilogramo, como datos
- [ ] Umbrales y recargos, como datos
- [ ] Tipo de cambio, como dato
- [ ] Superficie de administración de las tarifas

## Cálculo

- [ ] Normalización de dimensiones a centímetros
- [ ] Normalización de peso a kilogramos
- [ ] Peso volumétrico por artículo
- [ ] Peso facturable como el mayor entre real y volumétrico
- [ ] Las cuatro modalidades
- [ ] Recolección con costo cero y sin domicilio
- [ ] Recargos por distancia, excluyentes
- [ ] Recargos por cantidad, excluyentes
- [ ] Distancia entre coordenadas
- [ ] Sin coordenadas, sin recargo por distancia
- [ ] Redondeo a dos decimales
- [ ] Conversión de moneda con registro del tipo aplicado

## Resultado

- [ ] Desglose: modalidad, pesos, artículos, base, variable, recargos y total
- [ ] Rechazo con identificación del artículo y el dato que falta

## Verificación

- [ ] Prueba por cada modalidad
- [ ] Prueba: manda el volumétrico cuando es mayor
- [ ] Prueba: manda el real cuando es mayor
- [ ] Prueba: los recargos por distancia no se acumulan
- [ ] Prueba: los recargos por cantidad no se acumulan
- [ ] Prueba: la estimación coincide con lo cobrado
- [ ] Prueba: artículo sin peso detiene el cálculo
