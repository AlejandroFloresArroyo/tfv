# 03 · Tiempo de ejecución de la API — trabajo

## Armazón

- [x] Registro explícito de rutas, con su régimen de acceso obligatorio
- [x] Valor por defecto del régimen: protegido
- [x] Enganche de validación de entrada
- [x] Enganche de serialización de salida
- [x] Manejador de errores con la correspondencia de códigos de la rebanada 01
- [x] Punto de enganche para permisos y arrendatario, aún sin lógica

## Arranque

- [x] Esquema de configuración por entorno, validado al arrancar
- [x] El servicio falla al arrancar si falta configuración obligatoria
- [x] El servicio falla al arrancar si la base de datos no responde
- [x] Apagado ordenado: dejar de aceptar peticiones y terminar las en curso

## Contrato publicado

- [x] Generación de la descripción a partir de los esquemas de ejecución
- [x] Superficie de consulta de la descripción
- [ ] Generación del cliente tipado — **pendiente**; hace falta antes de la interfaz (28)
- [ ] Comprobación de desfase en integración continua

## Operación

- [x] Endpoint de salud, con comprobación de la base de datos
- [x] Registro estructurado con identificador de correlación por petición
- [ ] Límite de tamaño de cuerpo por endpoint — **pendiente**
- [ ] Limitación de frecuencia, por credencial y por origen — existe la de inicio de sesión (rebanada 04); falta la genérica del armazón
- [x] Política de orígenes cruzados con lista explícita, sin comodín

## Retirada de alcance

- [x] Retirar la página de bienvenida
- [x] Retirar los endpoints de prueba
- [x] Delta de requisitos `REMOVED` en `api-conventions`

## Verificación

- [x] Prueba: una ruta sin régimen declarado responde `401` sin credencial
- [x] Prueba: la tabla de rutas coincide con la descripción publicada
- [ ] Prueba: un cuerpo que excede el límite responde `413`
- [ ] Prueba: superar la frecuencia responde `429`
