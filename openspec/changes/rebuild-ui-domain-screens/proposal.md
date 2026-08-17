# 29 · Pantallas de dominio

## Por qué

Reconstruir todas las pantallas del panel y de las tiendas sobre los primitivos de la rebanada 28.

Es volumen, no dificultad: la mayoría son la misma pantalla —contenedor, búsqueda con filtros,
rejilla de tarjetas, paginación— aplicada a entidades distintas. Lo que la hace grande es que hay
decenas de ellas y unas cuantas excepciones con interfaz a medida.

Depende de la 28 y de que la rebanada de dominio correspondiente esté entregada, porque cada
pantalla consume su API.

## Sub-rebanadas

Independientes entre sí una vez cerrada la 28; se pueden repartir.

| | Contenido | Notas |
|---|---|---|
| **29a** | Núcleo y administración | Cuenta, perfil, empresas, miembros, roles con su matriz de permisos, direcciones, contrapartes, facturación, planes, bitácora, consola de administración de plataforma |
| **29b** | Almacenes | **La mayor.** Catálogo con su asistente de cinco pasos y el de variantes de cuatro, medidas, precios, unidades con sus etiquetas, ubicaciones como organigrama, constructor de cotizaciones, pedidos con su conversación en tiempo real |
| **29c** | Producciones | Guion, capítulos, escenas, personajes, jornadas con continuidad, inventario, entregas con firma, **calendario de planes de trabajo a medida**, presupuesto con gráficas, tienda interna |
| **29d** | Pixit | Catálogo, tiendas, inventario, sesiones de caja, **punto de venta con el generador de mosaicos**, ventas con recibo e instructivo |
| **29e** | Sitios y portada | Constructor de sitios con reordenación, las dos verticales de tienda pública, configurador público de mosaicos, portada de marketing y documentos legales |

## Interfaces a medida que no salen de un patrón

Estas cinco necesitan trabajo propio y conviene presupuestarlas aparte:

- El **calendario de planes de trabajo**, con sus cuatro vistas y su estado de fecha.
- El **organigrama de ubicaciones**, con desplazamiento y edición sobre el árbol.
- El **punto de venta**, con el lienzo del generador de mosaicos.
- El **constructor de sitios**, con reordenación por arrastre y vista previa en vivo.
- El **asistente de producto**, con nueve pasos entre el principal y el de variantes.

## Criterios de aceptación

- Cada pantalla consume el cliente tipado generado, no llamadas escritas a mano.
- Ninguna pantalla reimplementa búsqueda, filtros, paginación ni formularios: usan los primitivos.
- La actualización tras una mutación se declara por recurso.
- Las acciones no permitidas se omiten, no se muestran desactivadas sin explicación.
- Los textos de interfaz pasan por la capa de traducción, no van incrustados.
- Cada pantalla funciona en ancho de teléfono.

## Riesgos

**La cobertura de traducción es hoy de alrededor del diez por ciento**: el panel está en español
incrustado en el código. Reconstruir es el momento natural para resolverlo, pero **multiplica el
trabajo de cada pantalla**. Hay que decidir antes de empezar si el alcance es sólo español —con los
textos extraídos pero un solo idioma— o español e inglés completos.

## Specs

Todas las de dominio, más `app-shell`, `collection-browsing` y `forms-and-wizards` como contrato.
