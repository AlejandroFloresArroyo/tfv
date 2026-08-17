# 01 · Contratos de plataforma — trabajo

## Forma del recurso

- [x] Fijar el tipo de identificador y su generación
- [ ] Compatibilidad de lectura con los identificadores de veinticuatro caracteres hexadecimales — la columna existe en el esquema; falta el resolutor por recurso
- [x] Marcas de tiempo con zona horaria, en el tipo adecuado del motor
- [x] Convención de marca de borrado lógico

## Validación y serialización

- [ ] Esquemas de entrada compartidos en el paquete de contratos
- [ ] Recorte de claves no declaradas antes de la capa de datos
- [ ] Esquemas de salida y recorte al serializar
- [ ] Proyecciones seguras de usuario y de empresa
- [ ] Prueba: un campo sensible devuelto por el manejador no sale en la respuesta

## Errores

- [x] Tipos de error de dominio con su código de estado asociado
- [x] Forma uniforme de la respuesta de error
- [x] Mensajes de validación por campo, en español
- [ ] Detalle técnico suprimido en producción y registrado del lado del servidor — el manejador ya distingue; falta la prueba
- [ ] Correlación entre la respuesta y el registro del servidor

## Lenguaje de consulta

- [x] Palabras reservadas y sus valores por defecto
- [x] Tabla de coerción de valores
- [ ] Declaración de campos filtrables por recurso, con su tipo
- [ ] Filtros por atributo de entidad relacionada, declarados
- [x] Orden con desempate determinista
- [ ] Expansión recursiva al filtrar por categoría
- [ ] Registro de campos de búsqueda: transcribir las cuarenta y cinco filas y verificarlas — el registro está en la spec; falta llevarlo al código
- [ ] Búsqueda insensible a mayúsculas y acentos, con coincidencia parcial
- [x] Envolvente de paginación
- [ ] Prueba: paginar una colección con valores empatados no repite ni omite

## Idempotencia

- [ ] Almacén de claves de idempotencia con su plazo de retención
- [ ] Repetición con el mismo cuerpo devuelve el resultado original
- [ ] Repetición con cuerpo distinto responde `409`

## Campos calculados

- [ ] Recuentos: cómo se expresan y cuándo se calculan
- [ ] Histogramas de estado, con todos los estados presentes en cero
- [ ] Agregados monetarios
- [ ] Identidad derivada
- [ ] Selección: dirección primaria, personalización vigente, pago de la cotización
- [ ] Declarar por recurso qué campos son siempre presentes y cuáles bajo petición
- [ ] Prueba con valores concretos por cada fórmula

## Publicación del contrato

- [ ] Generación de la descripción legible por máquina a partir de los esquemas de ejecución
- [ ] Generación del cliente tipado a partir de esa descripción
- [ ] Comprobación en integración continua de que no hay desfase
