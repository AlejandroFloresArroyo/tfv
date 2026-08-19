# 16 · Conversación de pedido en tiempo real — trabajo

> **Sin conexión persistente.** Lo marcado es lo que se cerró contra una consulta periódica detrás
> de una costura (`ChatTransport`); lo que queda sin marcar depende del transporte que este entorno
> no tiene. El motivo y lo que entró en su lugar, en `HALLAZGOS.md` H-60.

## Autenticación

- [ ] Verificación criptográfica al establecer la conexión
- [x] Comprobación de que quien conecta es parte del pedido
- [x] Credencial fuera de la cadena de consulta
- [ ] Cierre de la conexión ante credencial inválida o caducada
- [ ] Cierre al caducar la sesión durante la conexión

## Distribución entre instancias

- [ ] Registro de participantes compartido, no en memoria de proceso
- [ ] Difusión que alcanza a los conectados a cualquier instancia
- [ ] Recolección de conexiones muertas
- [x] **Corregir el destinatario del aviso de borrado**

## Protocolo

- [ ] Entrar: historial, participantes y estado de lectura
- [x] Entrar marca como leído lo pendiente del lado
- [x] Marcar leído
- [x] Pedir mensajes
- [x] Enviar, con devolución de la referencia temporal a quien envía
- [x] Editar y borrar, sólo los propios
- [ ] Salir, con aviso de presencia
- [ ] Error descriptivo ante mensaje no reconocido, sin cerrar

## Acuses de lectura

- [x] Estado por lado, no por persona
- [x] Leer por un lado no afecta al otro
- [x] Contador de no leídos por parte

## Lectura ordinaria

- [x] **Corregir los manejadores que consultan la tabla equivocada**
- [x] Historial paginado sin conexión persistente

## Cliente

- [x] Envío optimista con referencia temporal
- [x] Reconexión con espaciado progresivo
- [x] Recuperación del historial al reconectar
- [x] Indicación del estado de la conexión

## Mensajes del sistema

- [x] Publicación de hitos del pedido
- [x] No editables ni borrables

## Verificación

- [x] Prueba: credencial no verificable no conecta
- [x] Prueba: tercero ajeno no conecta
- [ ] **Prueba con dos instancias: los mensajes se ven entre ellas**
- [x] Prueba: el aviso de borrado llega a todos
- [x] Prueba: leer marca para todo el lado
- [x] Prueba: reconectar recupera lo perdido
