# 02 · Modelo de datos relacional — trabajo

## Preparación

- [x] Inventariar las noventa colecciones con sus campos y sus referencias
- [x] Resolver, una por una, las nueve referencias colgantes de `DEFECTS.md` R-01 a R-09
- [x] Decidir qué tablas llevan borrado lógico
- [x] Documentar la vía de cada tabla de negocio hasta su empresa
- [ ] Ejecutar una comprobación del volcado actual contra el esquema propuesto y medir la suciedad — **pendiente**, y hace falta antes de la 30

## Esquema por dominio

- [x] Núcleo: usuarios, empresas, membresías, roles, direcciones, contrapartes, taxonomías
- [x] Archivos y su metainformación
- [x] Bitácora de actividad
- [x] Suscripciones, planes, cobros, perfiles de facturación
- [x] Compras de tienda, pagos, envíos, pedidos de comprador
- [x] Almacenes: almacén, ubicaciones, catálogo, medidas, unidades, precios
- [x] Almacenes: pedidos, cotizaciones, líneas, reservas, pagos, conversación
- [x] Producciones: producción, guion, capítulos, escenas, personajes, sets, videos
- [x] Producciones: jornadas, continuidad, utilería, inventario, entregas
- [x] Producciones: planes de trabajo, tareas, actividades, comentarios
- [x] Producciones: anclas, compras, órdenes de compra
- [x] Pixit: catálogo, tiendas, definiciones de inventario, movimientos, sesiones, ventas
- [x] Sitios: sitio, personalización, secciones
- [x] Locaciones: redes y locaciones

## Integridad

- [x] Claves foráneas con su comportamiento de propagación
- [x] Enumerados como tipos del motor, no como texto libre
- [x] Restricciones de comprobación: signos coherentes, exclusividad entre columnas, rangos
- [x] Índices únicos parciales donde el borrado lógico libera el valor
- [x] Índices de las consultas de listado más frecuentes

## Dinero

- [x] Todos los importes en decimal exacto de dos posiciones
- [x] Porcentajes con precisión suficiente para las retenciones
- [x] Transporte de importes como cadena decimal

## Campos calculados

- [ ] Vistas para los recuentos y los histogramas de estado — aplazado a la 01, que es donde vive el contrato de campos calculados
- [x] Columnas calculadas para la identidad derivada
- [x] Prioridad derivada del estado, como columna calculada
- [ ] Verificar cada fórmula contra las pruebas de la rebanada 01

## Herramientas

- [x] Migraciones versionadas, reversibles donde tenga sentido
- [ ] Datos de siembra para desarrollo
- [ ] Comprobación en integración continua de que el esquema y las migraciones no divergen
