# 30 · Trasvase de datos y corte — trabajo

## Decisiones previas

- [ ] Fijar la ventana de parada aceptable
- [ ] Decidir el trato de las credenciales existentes
- [ ] Decidir el trato de las cuentas verificadas sin verificación real
- [ ] Decidir si se reconstruye el historial de unidades
- [ ] Decidir el destino de las filas que no pasan las restricciones

## Análisis previo

- [ ] Comprobar el volcado actual contra el esquema nuevo
- [ ] Cuantificar las filas que fallan por cada restricción
- [ ] Inventariar las referencias rotas reales, no sólo las declaradas
- [ ] Inventariar las filas huérfanas de las cascadas defectuosas
- [ ] Documentar una decisión por cada caso

## Limpieza

- [ ] Corregir en origen lo que se pueda corregir
- [ ] Tabla de cuarentena para lo que no
- [ ] Informe de lo descartado, revisable por negocio

## Trasvase

- [ ] Rutina por dominio, repetible e idempotente
- [ ] Correspondencia de identificadores antiguos a nuevos, conservada
- [ ] Núcleo: cuentas, empresas, membresías, roles, direcciones, contrapartes, taxonomías
- [ ] Archivos y su metainformación
- [ ] Suscripciones, cobros y perfiles de facturación
- [ ] Almacenes y su catálogo
- [ ] Unidades, con su estado actual
- [ ] Cotizaciones y sus importes congelados
- [ ] Pedidos, compras, pagos y envíos
- [ ] Producciones y todo su contenido
- [ ] Pixit: catálogo, definiciones y libro de movimientos
- [ ] Sitios y personalizaciones
- [ ] Locaciones, sin reservas

## Archivos

- [ ] Copia de los objetos al proveedor nuevo
- [ ] **Reescritura de las direcciones persistidas en todas las tablas que las referencian**
- [ ] Verificación de que ninguna apunta al proveedor anterior
- [ ] Comprobación de que los enlaces compartidos anteriores siguen funcionando

## Compatibilidad

- [ ] Resolución de los identificadores de la pila anterior en URLs públicas
- [ ] Comprobación con una muestra de enlaces reales compartidos con clientes

## Verificación

- [ ] Recuentos por entidad, origen contra destino
- [ ] Cuadre de importes agregados de pagos, cobros y cotizaciones
- [ ] Muestreo manual de entidades representativas de cada dominio
- [ ] Recorrido de extremo a extremo sobre los datos migrados

## Ensayo

- [ ] Ejecución completa sobre una copia reciente
- [ ] Medición del tiempo real de cada fase
- [ ] Repetición hasta que el tiempo entre en la ventana acordada
- [ ] Plan de vuelta atrás, probado

## Corte

- [ ] Congelación de escrituras en la pila anterior
- [ ] Trasvase final
- [ ] Verificación
- [ ] Redirección del tráfico y de los subdominios de tienda
- [ ] Reapuntado de los eventos del procesador de pagos al destino nuevo
- [ ] Observación reforzada durante las primeras horas

## Después

- [ ] Periodo de observación con la pila anterior en sólo lectura
- [ ] Conservación de la base de origen intacta hasta cerrar el periodo
- [ ] Retirada de la pila anterior
- [ ] Archivo de las rebanadas completadas
