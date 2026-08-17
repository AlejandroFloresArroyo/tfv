# 16 · Conversación de pedido en tiempo real

## Por qué

La única superficie en tiempo real del sistema. Su protocolo —siete eventos entrantes, once
salientes, reconciliación optimista y acuses de lectura bilaterales— es rico y funciona; **se
conserva tal cual**.

Lo que cambia son tres defectos:

| Ref | Problema |
|---|---|
| S-10 | La credencial viaja en la cadena de consulta, se comprueba en cada mensaje en lugar de al conectar, y **sólo se decodifica sin verificar la firma** |
| O-08 | El registro de participantes vive en la memoria de un solo proceso: sólo funciona con una instancia |
| L-08 | El aviso de borrado se dirige a un destinatario equivocado, con lo que **nadie lo recibe** |
| C-05 | Los manejadores de lectura consultan la tabla de pedidos en lugar de la de mensajes |

## Qué entra

- Autenticación verificada **al establecer la conexión**, con la credencial fuera de la dirección.
- Registro de participantes compartido entre instancias.
- Corrección del destinatario del aviso de borrado.
- Corrección de las lecturas por consulta ordinaria.
- Conservación íntegra del protocolo de eventos.
- Reconexión automática con recuperación del historial.
- Mensajes del sistema para los hitos del pedido.

## Qué no entra

- La adopción del servicio de tiempo real gestionado (`project.md`). Obligaría a rehacer el
  protocolo alrededor de cambios de fila y perdería la reconciliación optimista. El problema real
  —el registro en memoria— se resuelve con notificación entre instancias del propio motor de datos.

## Criterios de aceptación

- Una credencial cuya firma no valida no establece conexión.
- Quien no es parte del pedido no establece conexión.
- La credencial no aparece en la dirección solicitada.
- Dos participantes conectados a instancias distintas se ven los mensajes.
- El aviso de borrado llega a todos los conectados.
- Leer marca como leído para todo el lado, no para la persona.
- Reconectar recupera los mensajes perdidos durante la desconexión.
- Un mensaje mal formado devuelve error sin cerrar la conexión.
- El historial se puede consultar sin abrir conexión persistente.

## Riesgos

**La prueba de dos instancias es imprescindible y fácil de omitir**, porque en desarrollo casi
siempre hay una sola. Debe formar parte de la verificación automatizada.

## Specs

`order-chat`
