# Diseño — Generación de mosaicos

Estructura del generador y decisiones de procesamiento de imagen. Complementa a
[`spec.md`](./spec.md).

## Dónde se ejecuta

**En el navegador.** No por herencia del sistema anterior, sino porque encaja:

- El resultado hay que verlo mientras se ajusta. Un viaje al servidor por cada cambio de tamaño o de
  encuadre haría el mostrador inusable.
- La fotografía del cliente no necesita salir de su dispositivo hasta que decide comprar.
- La carga de trabajo es proporcional al número de clientes, no al de servidores.

Lo que **sí** es autoridad del servidor: los precios, las existencias y el cobro. El navegador
genera imágenes; no decide cuánto cuestan (ver `pixit-point-of-sale`).

Consecuencia de diseño: el generador vive en el paquete compartido y no depende de ninguna interfaz.
Es la misma pieza en el mostrador y en la tienda pública — requisito explícito de la spec.

## La rejilla

```
láminasX     = tamaño.x                     ladrillosX = tamaño.x × lámina.x
láminasY     = tamaño.y                     ladrillosY = tamaño.y × lámina.y
proporción   = tamaño.x ÷ tamaño.y
```

## Correspondencia índice–posición

**Una sola convención, orden por filas, en todas las etapas:**

```
x = índice mod anchoEnCeldas
y = piso(índice ÷ anchoEnCeldas)
```

Este es el punto donde falla la implementación anterior: dos de sus etapas usan correspondencias
distintas, lo que transpone filas y columnas entre la imagen que se muestra y la lista de materiales
que se cobra (ver `DEFECTS.md` F-09). Con rejillas cuadradas el error pasa desapercibido; con
rejillas rectangulares produce un instructivo que no corresponde al mosaico.

La conversión SHALL estar en **una sola función** que todas las etapas invoquen. Reimplementarla en
cada sitio es exactamente lo que causó el defecto.

## Etapas

### 1 · Teselado

La imagen se reparte entre las láminas. Cada recorte se dibuja en un lienzo de trabajo de tamaño
fijo, desplazando el origen según la posición de su lámina.

El tamaño de trabajo es una constante del generador: suficiente para que el pixelado tenga
resolución de sobra, y acotado para que el consumo de memoria sea previsible con tableros grandes.

### 2 · Pixelado

Reducción a la rejilla en dos pasos: se dibuja la imagen en un lienzo temporal del tamaño de la
rejilla en celdas, y se vuelve a ampliar al tamaño de trabajo.

**Con el suavizado desactivado en ambos pasos.** Es lo que produce celdas de color plano; con
suavizado activo cada celda saldría con degradado y la cuantización posterior daría resultados
distintos según de qué punto se muestrease.

### 3 · Cuantización

Cada celda se sustituye por el color de la paleta a menor distancia euclídea en el espacio de color:

```
distancia² = (Δr)² + (Δg)² + (Δb)²
```

La distancia euclídea en este espacio no se corresponde bien con la percepción humana del color —un
espacio perceptualmente uniforme daría mejores resultados—, pero **es la que produce los mosaicos
que hoy se venden**, y cambiarla alteraría el aspecto de un producto ya conocido por los clientes.
Se conserva deliberadamente; cambiarla sería una decisión de producto, no una mejora técnica.

Las correspondencias color→ladrillo se memorizan durante la generación: una fotografía tiene decenas
de miles de celdas y pocos cientos de colores distintos tras el pixelado.

### 4 · Recuento

Se muestrea **un punto por celda**, en su interior y no en su borde, para no leer el píxel de la
retícula superpuesta.

El muestreo se hace sobre la imagen **cuantizada** y no sobre la pixelada, de modo que lo que se
cuenta es exactamente el color asignado. Contar sobre la pixelada y volver a cuantizar abriría la
puerta a que la imagen mostrada y la lista de materiales discreparan.

## Caché

Dos niveles, ambos en memoria y de vida corta:

| Caché | Clave | Por qué |
|---|---|---|
| Recortes teselados | huella de la imagen + tablero + tamaño + lámina | Cambiar sólo la lámina no obliga a reteselar |
| Color → ladrillo | valor cromático | Se consulta decenas de miles de veces por lámina |

La clave incluye la lámina porque cambia la rejilla; incluye el tamaño porque cambia el teselado.
Omitir cualquiera de los dos produce resultados de una configuración anterior — un error sutil y
difícil de diagnosticar.

## Lo que se persiste al comprar

```
por cada lámina:
  imagen generada        → subida como archivo (media-storage)
  posición en el tablero
  recuento por color     → { color, piezas, bolsas }
```

La imagen **se sube antes de crear la sesión de pago**, no después. La spec de
`storefront-checkout` lo exige porque hoy la subida no llega a ocurrir y el diseño se pierde entre
el carrito y el pedido (ver `DEFECTS.md` F-08).

No se persiste la fotografía original ni los recortes intermedios: no hacen falta para fabricar ni
para armar, y son datos personales del cliente.

## Rendimiento

El caso peor es un tablero grande con láminas de rejilla fina: decenas de láminas y cientos de miles
de celdas.

Tres medidas: el trabajo se reparte por lámina y no se hace todo de golpe; el procesamiento ocurre
fuera del hilo de interfaz para que el mostrador no se congele; y hay un tope de rejilla total por
encima del cual se avisa al operador en lugar de intentarlo.

## Decisiones abiertas

- **F-09 — correspondencia índice–posición.** El diseño fija orden por filas. Falta confirmar contra
  un mosaico físico ya fabricado cuál de las dos convenciones corresponde al producto real.
- **Espacio de color.** Conservado deliberadamente. Si alguna vez se cambia, hay que regenerar los
  instructivos de los pedidos pendientes de armar.
