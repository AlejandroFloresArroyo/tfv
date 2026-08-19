# 25 · Cobro del mostrador en el servidor — trabajo

## Decisión previa

- [ ] Resolver el comportamiento ante fallo de red a mitad del cobro
- [ ] Definir la clave de operación que hace idempotente el reintento

## Sesión de caja

- [ ] Apertura con fondo inicial, responsable e instante
- [ ] Una sola sesión activa por tienda; la segunda responde `409`
- [ ] Consulta de la sesión activa
- [ ] Cierre con conteo obligatorio
- [ ] Registro de la diferencia contra el efectivo esperado
- [ ] Sesión cerrada no admite ventas ni se reabre
- [ ] Efectivo esperado calculado sólo con las ventas en efectivo
- [ ] Total de la sesión con todas las ventas

## Cobro

- [ ] Carrito con mosaicos, láminas, ladrillos y mercancía
- [ ] **Cálculo del importe en el servidor**
- [ ] Precios de la definición de inventario de la tienda
- [ ] Descarte de los importes recibidos del navegador
- [ ] Validación de existencia antes de registrar
- [ ] **Venta y todos sus movimientos en una sola transacción**
- [ ] Estructura completa del mosaico: tablero, láminas y ladrillos
- [ ] Medios de pago, incluido el mixto
- [ ] Importe recibido y cambio en las ventas en efectivo
- [ ] Rechazo si el importe recibido es menor que el total
- [ ] Responsable de la venta
- [~] Retirar del navegador la orquestación de escritura — **no aplicable**: la orquestación es
      `[web]` en su totalidad, o sea `tfv-frontend/`, que no está en este árbol y que la regla 1
      prohíbe tocar (`DEFECTS.md` M-06). Lo que esta rebanada sí puede hacer —que el servidor
      calcule y escriba— son las tareas de arriba, y siguen abiertas

## Documentos

- [ ] Recibo con desglose, datos de tienda, código y términos
- [ ] Enlace público del recibo
- [ ] Instructivo de armado recorriendo la estructura de movimientos

## Anulación

- [ ] Compensaciones de inventario
- [ ] Marca de anulada
- [ ] Descuento del total de la sesión

## Consulta

- [ ] Ventas y sesiones por tienda y por empresa
- [ ] Filtros por fecha, responsable, medio de pago y estado
- [ ] Venta con su estructura de mosaico resuelta

## Verificación

- [ ] Prueba: total manipulado se descarta
- [ ] Prueba: fallo a mitad no deja venta ni movimientos
- [ ] Prueba: mosaico de seis láminas produce su estructura completa
- [ ] Prueba: existencia insuficiente rechaza el cobro
- [ ] Prueba: dos sesiones activas responden `409`
- [ ] Prueba: la venta con tarjeta no altera el efectivo esperado
- [ ] Prueba: reintento tras fallo de red no cobra dos veces
