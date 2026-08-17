# 30 · Trasvase de datos y corte

## Por qué

La última rebanada, y la única que no se puede reintentar sin consecuencias. Mueve los datos de
producción de un motor de documentos a uno relacional, redirige el tráfico y retira la pila
anterior.

Tres cosas la hacen delicada:

- **Las restricciones del esquema nuevo van a rechazar datos que hoy existen.** Nueve referencias
  apuntan a colecciones inexistentes, hay campos obligatorios que en la práctica están vacíos, y hay
  filas huérfanas de las cascadas que borran de la tabla equivocada.
- **Las direcciones públicas de los archivos cambian de host**, y están persistidas en unas cuarenta
  tablas, incrustadas en documentos ya generados y en enlaces compartidos con clientes.
- **Las credenciales actuales no caducan.** Al introducir la caducidad hay que decidir si se
  invalidan todas en el corte o se aceptan durante una ventana.

## Qué entra

- Análisis previo de calidad de los datos, contra el esquema nuevo.
- Limpieza de lo que no pasa las restricciones, con decisión documentada por cada caso.
- Trasvase por dominio, verificable y repetible.
- Reescritura de las direcciones de archivo persistidas.
- Verificación de integridad: recuentos, sumas de control e importes cuadrados.
- Ensayo completo sobre una copia, con medición del tiempo de parada.
- Corte con plan de vuelta atrás.
- Retirada de la pila anterior, tras un periodo de observación.

## Qué hay que decidir antes

| Decisión | Por qué importa |
|---|---|
| Ventana de parada aceptable | Determina si el trasvase puede ser en frío o hace falta doble escritura |
| Trato de las credenciales existentes | Invalidar en el corte o aceptar durante una ventana |
| Trato de las cuentas hoy marcadas como verificadas sin haberlo hecho | Darlas por buenas o forzar verificación |
| Reconstrucción del historial de unidades | No es posible con fidelidad: sólo se conoce el estado final |
| Qué se hace con las filas que no pasan las restricciones | Corregir, descartar o migrar a una tabla de cuarentena |

## Criterios de aceptación

- El análisis previo cuantifica cuántas filas no pasan cada restricción.
- Cada caso de dato rechazado tiene una decisión escrita.
- El trasvase es repetible: ejecutarlo dos veces sobre la misma copia da el mismo resultado.
- Los recuentos por entidad coinciden entre origen y destino, salvo lo descartado a propósito.
- Los importes agregados de pagos, cobros y cotizaciones cuadran.
- Ninguna dirección de archivo persistida apunta al proveedor anterior.
- Un enlace compartido con un cliente antes del corte sigue funcionando.
- Un identificador de la pila anterior incrustado en una URL pública sigue resolviéndose.
- El ensayo completo se ha ejecutado al menos una vez con su tiempo medido.
- Existe un plan de vuelta atrás probado.

## Riesgos

**El ensayo es lo que separa un corte de una incidencia.** Debe ejecutarse sobre una copia reciente
y completa, midiendo el tiempo real, antes de comprometer una fecha.

**La observación posterior importa tanto como el corte.** La pila anterior no se retira el mismo
día: se conserva en sólo lectura durante un periodo, con la base de datos de origen intacta, hasta
que haya confianza.

## Specs

Ninguna en particular. Su criterio es que el sistema nuevo cumpla las cuarenta y cinco.
