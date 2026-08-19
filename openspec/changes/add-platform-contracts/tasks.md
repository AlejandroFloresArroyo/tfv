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
- [ ] Correlación entre la respuesta y el registro del servidor — **implementada, sin prueba de la
      mitad que importa**: la respuesta lleva `x-request-id` y el registro estampa el mismo en
      cada línea (`runtime/app.ts:66-83`, `runtime/logger.ts:41-52`), pero `route.test.ts:238-250`
      sólo comprueba el encabezado. Que la línea del registro lleve ese identificador no lo
      afirma nadie

## Lenguaje de consulta

- [x] Palabras reservadas y sus valores por defecto
- [x] Tabla de coerción de valores
- [x] Declaración de campos filtrables por recurso, con su tipo — `QuerySchema.filters` con
      `FilterDefinition.type` en `packages/contracts/src/query.ts:19-40`; lo comprueban
      `query.test.ts:103` (campo no declarado), `:148` (texto en campo numérico) y `:170` (fuera
      del enumerado), y contra la API `companies/collections.test.ts:256`
- [ ] Filtros por atributo de entidad relacionada, declarados
- [x] Orden con desempate determinista
- [x] Expansión recursiva al filtrar por categoría — `categorySubtree` en
      `apps/api/src/warehouses/catalog.ts:1045-1052`; pruebas `catalog.test.ts:643` y, por la
      tienda pública, `websites/storefront.test.ts:423`
- [ ] Registro de campos de búsqueda: transcribir las cuarenta y cinco filas y verificarlas — el registro está en la spec; falta llevarlo al código
- [x] Búsqueda insensible a mayúsculas y acentos, con coincidencia parcial — `searchCondition`
      normaliza **los dos lados** con `app.norm` (`apps/api/src/runtime/collection.ts:156-162`,
      `drizzle/0009_search_normalization.sql`). Pruebas `companies/collections.test.ts:219`,
      `:226` y `:239`, que además fija que un comodín se busca como letra
- [x] Envolvente de paginación
- [x] Prueba: paginar una colección con valores empatados no repite ni omite —
      `companies/collections.test.ts:181`, con todos los rellenos empatados en prefijo y en fecha
      de alta al milisegundo, así que lo único que los separa es el desempate

## Idempotencia

- [x] Almacén de claves de idempotencia con su plazo de retención — tabla `idempotency_keys` (migración `0026`), acotada a **(actor, empresa, clave)**; la caducidad la barre el trabajo periódico `idempotencia.caducar-claves`
- [x] Repetición con el mismo cuerpo devuelve el resultado original
- [x] Repetición con cuerpo distinto responde `409`

> El mecanismo está entero y **aplicado en dos rutas** —`POST /companies` y `POST /companies/{companyId}/roles`—, no repartido por todos los módulos: los de dominio están en obras. Declararlo en una ruta es una línea (`idempotent: true`), y el encabezado aparece solo en el contrato publicado.

## Campos calculados

- [x] Recuentos: cómo se expresan y cuándo se calculan
- [x] Histogramas de estado, con todos los estados presentes en cero
- [x] Agregados monetarios
- [x] Identidad derivada
- [x] Selección: dirección primaria, personalización vigente, pago de la cotización
- [x] Declarar por recurso qué campos son siempre presentes y cuáles bajo petición — `COMPUTED_FIELDS`, un solo sitio que se puede leer entero
- [x] Prueba con valores concretos por cada fórmula — 49, transcritas de los escenarios

> Las fórmulas están en `packages/contracts/src/computed.ts`, que es lo que esta rebanada debe: **una sola definición** de cada campo derivado, pura y sin acceso a datos. **Que cada endpoint las consuma es de su dominio**, y la mayoría de esos dominios todavía no existen (Pixit, producciones, sitios). Ver `HALLAZGOS.md` H-129.

## Publicación del contrato

- [x] Generación de la descripción legible por máquina a partir de los esquemas de ejecución — `/openapi.json`, desde la rebanada 03
- [x] Generación del cliente tipado a partir de esa descripción — `pnpm --filter @tfv/api contract` emite `packages/contracts/src/api.generated.ts`, 186 endpoints
- [x] Comprobación de que no hay desfase — `apps/api/src/runtime/contract.test.ts` regenera y compara. Desde el 2026-08-19 corre además en integración continua, en el trabajo `pruebas` de `.github/workflows/ci.yml` (H-150)
