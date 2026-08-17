# Diseño — Materialización del pedido

Cómo se garantizan la atomicidad y la ejecución única de la secuencia que convierte un pago
confirmado en ocho entidades. Complementa a [`spec.md`](./spec.md).

## El problema

Un evento externo del que no controlamos la entrega dispara ocho escrituras relacionadas. El
procesador de pagos **reintenta ante cualquier respuesta que no sea de éxito**, y puede entregar el
mismo evento dos veces aunque la primera fuese bien.

Sin protección, un reintento duplica pedidos, pagos y movimientos de inventario. Eso es exactamente
lo que ocurre hoy (ver `DEFECTS.md` M-03).

## Tablas de control

```
payment_event                                ← todo evento recibido
  id, provider_event_id UNIQUE, type, payload jsonb,
  signature_verified, received_at,
  processed_at nullable, failed_at nullable,
  attempts, last_error

checkout                                     ← la instantánea de la compra
  id, website_id, company_id, buyer_id, type, status,
  snapshot jsonb,                            ← artículos, precios, importes congelados
  session_ref, expires_at,
  fulfilled_at nullable
```

`provider_event_id UNIQUE` es la barrera de deduplicación. No es una comprobación de la aplicación:
es una restricción de la base, y por tanto resistente a la concurrencia.

## La secuencia

```
BEGIN;
  -- 1. Reclamar el evento. Si ya existe, la inserción falla por
  --    la restricción única → se responde éxito sin hacer nada.
  INSERT INTO payment_event (provider_event_id, ...) VALUES (...);

  -- 2. Bloquear el checkout y comprobar que no está materializado.
  SELECT * FROM checkout WHERE id = $1 FOR UPDATE;
  -- si fulfilled_at IS NOT NULL → salir, ya está hecho

  -- 3. Crear pago, envío, pedido de comprador y sus líneas.
  -- 4. Alta del comprador como cliente (idempotente por (buyer, company)).
  -- 5. Entrada en el libro de ingresos del comercio.
  -- 6. Pedido operativo y sus hijos.
  -- 7. Convertir las reservas de checkout en el estado definitivo
  --    de cada unidad (vendida o rentada).

  -- 8. Marcar el checkout como materializado — AL FINAL, no al principio.
  UPDATE checkout SET fulfilled_at = now(), status = 'completed' WHERE id = $1;

  UPDATE payment_event SET processed_at = now() WHERE ...;
COMMIT;
```

**El punto crítico es el orden del paso 8.** La implementación anterior marcaba el checkout como
completado *antes* de hacer el trabajo, de modo que un fallo posterior dejaba una compra marcada
como resuelta y sin pedido, y el reintento no la reparaba porque la guarda ya estaba puesta.

## Dos barreras, no una

| Barrera | Qué protege |
|---|---|
| `provider_event_id` único | Que el mismo evento no se procese dos veces |
| `checkout.fulfilled_at` | Que la misma compra no se materialice desde dos eventos distintos |

Hacen falta las dos: el procesador puede emitir eventos con identificadores distintos que apunten a
la misma sesión de pago.

## Respuesta al procesador

| Situación | Respuesta | Por qué |
|---|---|---|
| Materialización correcta | Éxito | — |
| Evento duplicado | Éxito | Ya está hecho; reintentar no aporta |
| Tipo no atendido | Éxito | Un error provocaría reintentos indefinidos y la desactivación del endpoint |
| Firma inválida | `400` | No reintentar; es un evento que no reconocemos como legítimo |
| Fallo transitorio | `5xx` | Provocar el reintento |

## Plazo de respuesta y trabajo en segundo plano

El procesador espera la confirmación en un plazo corto. La secuencia completa puede excederlo cuando
hay muchas líneas.

El reparto: la transacción **reclama el evento y persiste su carga útil**, responde, y encola el
resto. El trabajo encolado conserva las dos barreras, así que la garantía de ejecución única no
depende de que la cola no duplique.

## Concurrencia con las reservas

Las unidades ya están apartadas desde que se creó la sesión de pago (ver `stock-reservation`), así
que la materialización **no compite por inventario**: sólo convierte reservas en estados
definitivos. Es lo que hace que este paso no pueda fallar por existencia insuficiente.

El recolector de reservas caducadas debe respetar `FOR UPDATE` sobre el checkout, para no liberar
unidades de una compra que se está materializando en ese instante.

## Trazabilidad

`payment_event` conserva la carga útil íntegra de todo evento recibido, con el resultado de su
verificación y de su procesamiento. Es lo que permite el requisito de reproceso manual y, en la
práctica, lo que permite reconstruir qué pasó cuando un cobro no cuadra.

## Decisiones abiertas

- **Retención de las cargas útiles.** Contienen datos personales del comprador. Hay que fijar un
  plazo de conservación y un procedimiento de purga.
- **Conciliación.** No existe hoy un proceso que contraste periódicamente los pagos registrados
  contra los del procesador. Debería existir.
