# 16 · Conversación de pedido en tiempo real — trabajo

## Autenticación

- [ ] Verificación criptográfica al establecer la conexión
- [ ] Comprobación de que quien conecta es parte del pedido
- [ ] Credencial fuera de la cadena de consulta
- [ ] Cierre de la conexión ante credencial inválida o caducada
- [ ] Cierre al caducar la sesión durante la conexión

## Distribución entre instancias

- [ ] Registro de participantes compartido, no en memoria de proceso
- [ ] Difusión que alcanza a los conectados a cualquier instancia
- [ ] Recolección de conexiones muertas
- [ ] **Corregir el destinatario del aviso de borrado**

## Protocolo

- [ ] Entrar: historial, participantes y estado de lectura
- [ ] Entrar marca como leído lo pendiente del lado
- [ ] Marcar leído
- [ ] Pedir mensajes
- [ ] Enviar, con devolución de la referencia temporal a quien envía
- [ ] Editar y borrar, sólo los propios
- [ ] Salir, con aviso de presencia
- [ ] Error descriptivo ante mensaje no reconocido, sin cerrar

## Acuses de lectura

- [ ] Estado por lado, no por persona
- [ ] Leer por un lado no afecta al otro
- [ ] Contador de no leídos por parte

## Lectura ordinaria

- [ ] **Corregir los manejadores que consultan la tabla equivocada**
- [ ] Historial paginado sin conexión persistente

## Cliente

- [ ] Envío optimista con referencia temporal
- [ ] Reconexión con espaciado progresivo
- [ ] Recuperación del historial al reconectar
- [ ] Indicación del estado de la conexión

## Mensajes del sistema

- [ ] Publicación de hitos del pedido
- [ ] No editables ni borrables

## Verificación

- [ ] Prueba: credencial no verificable no conecta
- [ ] Prueba: tercero ajeno no conecta
- [ ] **Prueba con dos instancias: los mensajes se ven entre ellas**
- [ ] Prueba: el aviso de borrado llega a todos
- [ ] Prueba: leer marca para todo el lado
- [ ] Prueba: reconectar recupera lo perdido
