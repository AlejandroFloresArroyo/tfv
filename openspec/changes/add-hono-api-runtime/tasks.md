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
- [x] Generación del cliente tipado — `pnpm --filter @tfv/api contract`; el comando ya estaba declarado y **el archivo no existía** (`HALLAZGOS.md` H-126)
- [x] Comprobación de desfase — regenera y compara; el mensaje del fallo dice el comando. Corre en `pnpm test` y, desde el 2026-08-19, en integración continua (H-150)

## Operación

- [x] Endpoint de salud, con comprobación de la base de datos
- [x] Registro estructurado con identificador de correlación por petición
- [x] Límite de tamaño de cuerpo por endpoint — techo general configurable y `maxBodyBytes` por ruta; va **antes** que el guardián
- [x] Limitación de frecuencia, por credencial y por origen — la genérica del armazón, en memoria y por proceso (`HALLAZGOS.md` H-130). Llega apagada en pruebas, con su motivo escrito
- [x] Política de orígenes cruzados con lista explícita, sin comodín

## Retirada de alcance

- [x] Retirar la página de bienvenida
- [x] Retirar los endpoints de prueba
- [x] Delta de requisitos `REMOVED` en `api-conventions`

## Verificación

- [x] Prueba: una ruta sin régimen declarado responde `401` sin credencial
- [x] Prueba: la tabla de rutas coincide con la descripción publicada
- [x] Prueba: un cuerpo que excede el límite responde `413` — y sin declarar la longitud también
- [x] Prueba: superar la frecuencia responde `429` — con reloj inyectado, más el desempate entre orígenes
