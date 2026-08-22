# Diseño de `@tfv/trasvase`

El trasvase de los datos de la pila anterior (MongoDB + Mongoose, `~/dev/tfv-leg/tfv-backend`) a
la nueva (Postgres + Drizzle, `@tfv/db`). No es un volcado y una restauración: es un cruce de
motor, de identificadores (`ObjectId` → UUID), de forma (documentos anidados → filas con claves
foráneas) y de garantías (Mongo no comprobaba nada de lo que Postgres exige).

## Dirigido por volcado

Las rutinas **nunca hablan con Mongo**. Leen de un directorio de exportación —`mongoexport`, un
archivo JSON extendido por colección— y escriben en Postgres. Consecuencias buscadas:

- **Repetible**: la misma entrada produce la misma salida; el ensayo con una copia y la corrida
  real son el mismo programa.
- **Probable**: los accesorios de prueba son un volcado pequeño escrito a disco, derivado de los
  esquemas de Mongoose reales y con los defectos de `DEFECTS.md` representados
  (`src/accesorios/ensayo.ts`, cada defecto con su cita).
- **Sin credenciales del origen** en ninguna parte del paquete.

## Las piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Lectura del volcado | `src/volcado/` | JSON extendido → valores JS. `$numberDecimal` queda como cadena: los importes no pasan por coma flotante. |
| Modelo del origen | `src/modelo/colecciones.ts` | Las colecciones viejas declaradas a mano desde los esquemas de Mongoose, con sus referencias y cuál es la del **dueño**. |
| Análisis previo | `src/analisis/` | El comprobador: recuentos, filas que fallarían cada restricción nueva, referencias rotas resueltas contra los `_id` presentes, huérfanas. Con informe legible. |
| Registro | `src/destino/registro.ts` | El esquema Postgres **`trasvase`**, propiedad de este paquete: `correspondencia`, `cuarentena`, `incidencias`. `packages/db` no se toca. |
| Rutinas | `src/trasvase/` | `archivos` → `nucleo` → `facturacion`, cada una transaccional e idempotente. |
| Verificación | `src/verificacion/` | Recuentos por dos vistas, cuadre de importes en centavos, muestreo con semilla, informe de cuarentena. |
| CLI | `src/cli.ts` | `analizar`, `trasvasar`, `verificar`, `cuarentena`. |

## Idempotencia: cómo exactamente

- `trasvase.correspondencia` guarda `(colección, id_viejo) → id_nuevo`. El identificador se acuña
  una vez (`newId()` de `@tfv/contracts`) y **se conserva entre corridas**.
- Toda escritura destino es `insert … on conflict (id) do update`: repetir corrige, no duplica.
- La cuarentena y las incidencias de una colección **se limpian y reconstruyen en cada corrida**:
  repetir no acumula, y una fila corregida en el origen sale de la cuarentena sola.
- Las filas sintetizadas (membresía de dueño faltante) tienen correspondencia propia bajo una
  colección sintética (`trasvase_membresia_dueño`, clave: el id viejo de la empresa), así que
  tampoco se duplican.

Límite documentado: si un documento **desaparece** del volcado entre corridas, su fila destino no
se retira; y si una fila migrada pasa a cuarentena en una corrida posterior, su fila destino y su
correspondencia quedan (la verificación lo delata: `origen ≠ migradas + cuarentena`). El trasvase
converge sobre el mismo volcado, que es el contrato de la corrida real.

## El invariante de población

**Cada fila del origen acaba migrada o en cuarentena.** Nada se tira en silencio y nada revienta
la corrida. La verificación lo mide por colección (`origen = migradas + cuarentena`) y por tabla
destino (`filas = lo que la correspondencia predice`). Las degradaciones que no impiden migrar
—un avatar roto, un slug repetido que se suelta, una primaria demovida— quedan en
`trasvase.incidencias` con campo y detalle.

## Qué condiciona esto para las secciones que hoy no se pueden empezar

- **«Archivos» (copia de objetos al proveedor nuevo).** La rutina de archivos migra las URL del
  proveedor viejo **tal cual** en `uploads.url`/`variants`/`storage_path`, y ninguna otra tabla
  guarda direcciones: la reescritura futura es **un solo barrido sobre `uploads`**, usando
  `trasvase.correspondencia` para localizar objetos por su identificador viejo. Además, cuando la
  meta se perdió, `byte_size` queda en `0` y el `content_type` genérico: la copia de objetos es el
  momento natural de rellenarlos con el tamaño y tipo reales del objeto copiado.
- **«Compatibilidad» (URLs viejas).** `trasvase.correspondencia` es exactamente la tabla que la
  resolución de identificadores viejos en URLs públicas necesita; `companies.legacy_id` ya migra
  poblado. No hay que construir un mapa nuevo el día del corte: ya existe y se prueba en cada
  corrida.
- **«Ensayo».** La CLI corre las tres fases contra cualquier directorio; medir tiempos es
  cronometrar `trasvasar` sobre la copia real. No hay pasos manuales que ensayar aparte.

## Decisiones de forma que no son obvias

- **`core_meta` se absorbe** en `uploads` (el destino fundió archivo y metainformación); en los
  recuentos aparece con `tabla: null`, no se esconde.
- **`core_user.password` viaja tal cual** a `password_hash` — supuesto de la decisión de
  credenciales, ver `DECISIONES.md` §2.
- **El importe de los cobros de suscripción está en centavos** en el origen (H-320); la conversión
  a pesos es aritmética entera y el cuadre se hace en centavos por las dos puntas.
- Los **permisos de rol** pasan de objeto `{clave: booleano}` a la lista de claves concedidas que
  el destino valida contra su catálogo; las claves apagadas no viajan.
- El núcleo **carga sus colecciones a memoria** (son las chicas: cuentas, empresas, catálogos).
  Los dominios de volumen —unidades, pedidos, movimientos— deben recorrer el volcado en flujo,
  como ya hace la lectura; la firma de `Volcado.documentos` es un generador precisamente por eso.
- El comprobador construye un índice de `_id` por colección para resolver referencias reales;
  con el volumen esperado de la pila vieja cabe holgado en memoria. Si un volcado real lo
  desmintiera, el índice puede pasarse a disco sin tocar a los llamadores.

## Lo que queda fuera de esta corrida, y por qué

Las rutinas de almacenes y catálogo, unidades, cotizaciones, pedidos, producciones, Pixit, sitios
y locaciones **no están construidas**: el plazo alcanzó para el comprobador, el registro, tres
dominios completos y la verificación, todo probado, y eso vale más que trece rutinas a medias. El
patrón está fijado: cada dominio nuevo es un módulo en `src/trasvase/` que se registra en
`DOMINIOS` (orden de dependencia), sigue el invariante de población y añade sus recuentos y su
cuadre. Las secciones «Archivos», «Compatibilidad», «Ensayo» y «Corte» piden infraestructura o
datos que hoy no existen; lo que este diseño ya les condiciona está escrito arriba.
