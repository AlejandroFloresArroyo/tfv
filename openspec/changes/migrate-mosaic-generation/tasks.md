# 26 · Generador de mosaicos — trabajo

## Decisión previa

- [ ] Confirmar `DEFECTS.md` F-09 contra un mosaico físico ya fabricado

## Estructura

- [ ] Generador en el paquete compartido, sin dependencia de interfaz
- [ ] **Una sola función de conversión entre índice y posición**
- [ ] Todas las etapas la usan; ninguna la reimplementa
- [ ] Derivación de la rejilla desde tamaño de tablero y lámina
- [ ] Proporción expuesta para el recorte

## Etapas

- [ ] Ajuste previo con recorte que respeta la proporción
- [ ] Teselado contiguo, sin solapamiento ni hueco
- [ ] Cada recorte conoce su posición
- [ ] Pixelado sin suavizado, con celdas de color plano
- [ ] Cuantización por distancia en el espacio de color
- [ ] Paleta limitada al inventario de la tienda
- [ ] Rechazo si la tienda no tiene paleta
- [ ] Representación visual del ladrillo sobre cada celda
- [ ] Vista de conjunto del mosaico
- [ ] Previsualización en sala

## Recuento

- [ ] Muestreo de un punto interior por celda
- [ ] Muestreo sobre la imagen cuantizada, no sobre la pixelada
- [ ] Recuento por color y por lámina
- [ ] Derivación de bolsas desde piezas
- [ ] Agregación de la lista del mosaico completo

## Persistencia

- [ ] **Subida de la imagen de cada lámina antes de crear la sesión de pago**
- [ ] Conservación del recuento por lámina
- [ ] Rechazo de la venta sin diseño conservado
- [ ] No persistir la fotografía original ni los recortes intermedios

## Rendimiento

- [ ] Trabajo repartido por lámina
- [ ] Procesamiento fuera del hilo de interfaz
- [ ] Caché de recortes, con clave que incluya tablero, tamaño y lámina
- [ ] Caché de correspondencia color a ladrillo
- [ ] Tope de rejilla con aviso al operador

## Formatos

- [ ] Formatos habituales, incluidos los de cámara de teléfono
- [ ] Rechazo en el momento de la carga si no se puede procesar

## Verificación

- [ ] Prueba: los recortes cubren la imagen sin hueco ni solape
- [ ] Prueba: la suma del recuento es el número de celdas
- [ ] **Prueba con rejilla no cuadrada: imagen y recuento coinciden en orientación**
- [ ] Prueba: sólo se usan colores de la tienda
- [ ] Prueba: dos generaciones idénticas coinciden
- [ ] Prueba: mostrador y tienda pública producen lo mismo
- [ ] Prueba: sin diseño conservado no se vende
