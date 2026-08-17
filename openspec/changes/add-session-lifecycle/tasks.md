# 04 · Ciclo de vida de la sesión — trabajo

## Sesiones

- [x] Modelo de sesión con vigencia, revocación y trazabilidad de dispositivo
- [x] Emisión con caducidad; ninguna credencial indefinida
- [x] Verificación criptográfica en cada petición, nunca decodificación
- [x] Renovación rotatoria: la credencial anterior se invalida al emitir la nueva
- [x] Detección de reutilización: invalidar la cadena completa
- [x] Cierre de sesión individual
- [x] Cierre de todas las sesiones
- [x] Almacenamiento de la credencial en cookie no accesible por script

## Retirada de la vía alternativa

- [x] Eliminar el encabezado alternativo de credencial
- [ ] Modelo de clave de integración: verificable, con empresa, permisos y revocación — **pendiente**; no hay integraciones automatizadas todavía
- [ ] Registro de uso de cada clave
- [ ] Prueba: una cadena con forma de credencial en cualquier otro encabezado no concede acceso

## Contraseñas

- [x] Función de derivación de clave con factor de trabajo ajustable
- [x] Longitud mínima y rechazo de contraseñas comunes
- [x] Cambio de contraseña con la actual, que invalida las demás sesiones
- [x] Plan de rehasheo progresivo de las contraseñas existentes al iniciar sesión

## Verificación de correo

- [x] El registro deja la cuenta sin verificar
- [x] Enlace de verificación de un solo uso y con caducidad
- [x] Sin verificar no se inicia sesión, con mensaje que lo explique
- [x] Reenvío de la verificación
- [ ] Decidir el trato de las cuentas existentes marcadas como verificadas — **decisión pendiente**, hace falta en la 30

## Recuperación

- [x] Token criptográfico, de un solo uso, con caducidad
- [x] Respuesta idéntica exista o no la cuenta
- [x] Restablecer invalida las sesiones anteriores
- [x] Retirar el token de la respuesta de la solicitud

## Invitación

- [x] Crear cuenta sin generar contraseña
- [x] Enlace de un solo uso para que el titular la establezca
- [x] Retirar la contraseña de las cargas útiles de notificación
- [ ] Prueba: ninguna notificación contiene una contraseña

## Defensa

- [x] Limitación de intentos por cuenta y por origen
- [x] Reinicio del contador tras un acceso correcto
- [x] Registro de intentos fallidos para su observación

## Verificación

- [x] Prueba: credencial caducada responde `401`
- [ ] Prueba: firma alterada responde `401` — hoy la credencial es opaca, así que no hay firma que alterar; vuelve con el servicio gestionado
- [x] Prueba: renovación consumida invalida la cadena
- [x] Prueba: recuperación de correo existente e inexistente son indistinguibles
