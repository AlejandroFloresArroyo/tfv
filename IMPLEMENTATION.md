# Plan de implementación

Documento de trabajo. Se actualiza a medida que avanza la construcción — el estado de aquí es la
verdad sobre dónde estamos.

El **qué** vive en [`openspec/specs/`](./openspec/specs/). El **por qué y en qué orden** vive en
[`openspec/changes/`](./openspec/changes/). Esto es el **cómo y el ahora**.

Lo que aparece al construir —specs que no se sostenían, huecos, claves sin ruta— se registra en
[`openspec/HALLAZGOS.md`](./openspec/HALLAZGOS.md), para que una corrección no quede sólo en el
diff.

## Reglas de trabajo

1. **No se toca `tfv-backend/` ni `tfv-frontend/`.** Son la referencia y siguen en producción. Todo
   lo nuevo vive en `apps/` y `packages/`.
2. **Cada incremento cierra tareas de una rebanada concreta**, y se anota aquí cuáles.
3. **Nada se da por hecho sin verificarlo**: compila, arranca, y sus pruebas pasan.
4. Cuando una spec resulte estar equivocada al implementarla, **se corrige la spec** y se anota. Las
   specs son el contrato, no un documento de una sola dirección.
5. Las decisiones marcadas pendientes en `openspec/DEFECTS.md` **bloquean su rebanada**. No se
   inventa la respuesta: se implementa el criterio adoptado y se deja señalado en el código.

## Estructura

```
tfv/
├── openspec/            Contrato: 45 capabilities, 30 rebanadas
├── tfv-backend/         Referencia, no se toca
├── tfv-frontend/        Referencia, no se toca
├── apps/
│   ├── api/             Hono · Drizzle · PostgreSQL
│   └── web/             Next · React · Tailwind
└── packages/
    ├── contracts/       Esquemas compartidos, errores, consulta, cálculo puro
    ├── db/              Esquema Drizzle y migraciones
    └── ui/              Sistema de diseño
```

## Cómo levantarlo

```sh
pnpm install
pnpm db:up          # Pila de Supabase en Docker
pnpm db:migrate     # Esquema y políticas
pnpm db:seed        # Datos con los que se puede entrar
pnpm dev            # API en :5000, web en :3000
```

Y las pruebas:

```sh
pnpm test           # Contratos, datos, API y transporte — vacía la base de desarrollo
pnpm test:e2e       # Navegador, sobre un build de producción en el :3100
```

La primera vez, `pnpm --filter @tfv/e2e exec playwright install chromium`.

Las tres cuentas que deja la siembra comparten contraseña, `Desarrollo.2026`:

| Cuenta | Para ver |
|---|---|
| `admin@tfv.dev` | Administración de plataforma, y **dos** empresas: ejerce el selector y el cambio |
| `duena@tfv.dev` | Propietaria de **una** empresa: se salta el selector y elude los permisos |
| `almacenista@tfv.dev` | Rol acotado: **5 de 255** permisos. Es la cuenta con la que se ve que la compuerta hace algo |
| `compradora@tfv.dev` | **Sin** membresías: el caso del padrón único |

Todo lo que difiere entre ellas difiere a propósito: las dos empresas tienen servicios distintos
—sin eso no se puede ver fallar la guarda de habilitación ni la equivalencia al cambiar de
empresa—, y las cuatro cuentas cubren las cuatro vías por las que se concede o se niega.

> `pnpm test` **vacía la base de desarrollo**: las pruebas de la API truncan sus tablas. Hay que
> volver a sembrar después. Separar la base de pruebas de la de desarrollo está pendiente.

## Decisiones de herramientas

| Pieza | Elección | Motivo |
|---|---|---|
| Gestor de paquetes | pnpm con espacios de trabajo | Lo que ya usaba el frontend |
| Orquestador | Turborepo | Caché de tareas entre paquetes |
| Lenguaje | TypeScript en modo estricto | — |
| API | Hono con OpenAPI | Registro explícito de rutas y contrato publicado |
| Datos | Drizzle sobre PostgreSQL | Migraciones versionadas, SQL tipado |
| Base local | Pila de Supabase (`pnpm db:up`) | Trae Postgres con el esquema `auth`, GoTrue y el resto |
| Pruebas | Vitest, más Playwright para extremo a extremo | Adoptado el 2026-08-17; corre contra el build de producción |
| Formato y análisis | Biome | Sustituye a ESLint y Prettier, una herramienta menos |

## Convenciones de código

- **Los importes nunca son coma flotante.** Decimal exacto en la base, cadena decimal en el
  transporte.
- **Toda operación de escritura declara su permiso**, aunque la comprobación llegue en la
  rebanada 05. Sin declararlo, la ruta queda protegida sin permiso concedible.
- **Toda tabla de arrendatario declara su vía hasta la empresa**, y tiene su política. Una tabla
  nueva sin política hace fallar la migración.
- **Ninguna política llama a la identidad cruda.** Se llama a `app.uid()`, que devuelve nulo si la
  sesión se cerró o la cuenta dejó de estar vigente. La migración falla si alguna se salta la regla.
- **Leer y escribir no llevan el mismo predicado** cuando no deben. Un `exists` hereda la política de
  lectura del padre, así que un hijo cuyo padre se lee más ancho de lo que se escribe atraviesa hasta
  una tabla de política simétrica.
- El cálculo de dinero vive en `packages/contracts` como **función pura**, sin acceso a datos, para
  que servidor y navegador usen exactamente la misma.
- Los mensajes dirigidos al usuario final van en español.
- Nada de secretos en el código. Configuración validada al arrancar.

## Progreso

Lo construido hasta ahora, medido y no estimado:

| | |
|---|---|
| Rebanadas | 10 de 30 empezadas, **ninguna cerrada del todo** |
| Código sin pruebas | 31 130 líneas |
| Código de prueba | 9 973 líneas |
| Pruebas | **489** — 99 contratos, 59 datos, 258 API, 29 web, 44 de extremo a extremo |
| Esquema | 91 tablas · 270 índices · 62 enumerados · 6 comprobaciones · 48 únicos parciales |
| Aislamiento | 195 políticas · 91/91 tablas · 0 con identidad cruda |
| Migraciones | 11, replicadas desde cero en cada verificación |
| Rutas | **104** registradas, 81 con permiso declarado, 10 públicas y enumeradas |
| Permisos | **255** claves, comprobadas antes de cualquier efecto |
| Pantallas | 23, en español e inglés (426 mensajes, sin desalinear) |

**Dónde estamos de verdad**: los cimientos, la seguridad, la interfaz con formularios que escriben,
**los datos maestros** —empresas, membresías, roles, direcciones, contrapartes y taxonomía—, **las
colecciones explorables** y **el almacén entero, del catálogo a las existencias**. La parte ancha
del trabajo siguen siendo las rebanadas 08 a 27; la 10 está casi entera y las demás sin tocar.

**El inventario ya es comercio, y se puede mirar.** Hay cotizaciones, y reservan equipo de verdad:
unidades concretas apartadas con bloqueo, reconciliadas por diferencia, proyectadas sobre el
inventario al cambiar de estado y devueltas con un retorno explícito. El importe lo calcula el
servidor con la misma función pura que usará el navegador, y se congela al cerrar. Es la corrección
de los tres defectos más caros del servicio: la reserva sin atomicidad, la acuñación silenciosa de
inventario y el motor de cálculo viviendo en el cliente. La bandeja de trabajo y la ficha ya
enseñan todo eso; falta el editor, que es la parte que escribe.

**Las colecciones ya se comportan como colecciones.** Los seis listados hablan el lenguaje de
consulta —búsqueda insensible a acentos, filtros de gramática cerrada, orden estable, sobre de
paginación uniforme— y la interfaz guarda su estado **en la dirección**: un listado filtrado se
comparte por enlace, retroceder deshace el último filtro y recargar no pierde nada.

**La interfaz ya tiene red.** Treinta y nueve pruebas de extremo a extremo con Playwright, en unos
doce segundos, sobre un build de producción. Cubren tema, idioma, las tres guardas, la renovación
transparente, el cierre de sesión sin recarga, el recorrido de escritura completo y la exploración
de colecciones entera. Lo que aún no cubren está enumerado en el `tasks.md` de la 28.

## Estado

Leyenda: ⬜ sin empezar · 🟡 en curso · ✅ terminada

### Cimientos

| # | Rebanada | Estado | Tareas | Nota |
|---|---|---|---|---|
| 00 | Andamiaje del espacio de trabajo | ✅ | — | Raíz, herramientas, base local |
| 01 | `add-platform-contracts` | 🟡 | 10/37 | Dinero, errores, consulta, paginación, identificadores. Falta idempotencia, campos calculados, cliente tipado y el registro de búsqueda |
| 02 | `add-postgres-data-model` | 🟡 | 29/34 | 91 tablas, 229 claves foráneas, 48 únicos parciales. Falta medir el volcado real, la siembra y el desfase en integración continua |
| 03 | `add-hono-api-runtime` | 🟡 | 20/26 | Registro explícito, validación, contrato de error, contrato publicado, salud. Falta cliente tipado, límite de cuerpo y limitación de frecuencia genérica |

> **Corregido el 2026-08-16.** La 02 y la 03 figuraban como terminadas y no lo estaban: sus listas
> de tareas nunca se habían marcado, y al repasarlas contra el código aparecieron huecos reales.
> Ninguno bloquea lo que viene, pero decir «✅» de algo con cinco tareas abiertas es justamente el
> tipo de cosa que este documento existe para no hacer.

### Bloque crítico de seguridad

| # | Rebanada | Estado | Tareas | Nota |
|---|---|---|---|---|
| 04 | `add-session-lifecycle` | 🟡 | 31/36 | Sesiones revocables, rotación con detección de reutilización, y revocación exigida por el motor. Falta sustituir la maquinaria propia por el servicio gestionado |
| 05 | `add-authorization-enforcement` | 🟡 | 21/29 | Catálogo de **255** claves, resolución de rol, elusión acotada de propietario y de plataforma, permisos efectivos para la interfaz. Falta la medición previa al corte, que es lo que impide cerrarla |
| 06 | `add-tenant-scoping` | 🟡 | 24/29 | **Las dos capas en pie**: 195 políticas sobre las 91 tablas, y los manejadores corriendo bajo `withRequester`. Faltan las de los dominios que aún no existen |
| 07 | `add-verified-payment-webhooks` | ⬜ | 0 | Lo último del bloque crítico |

### Servicios de plataforma

| # | Rebanada | Estado | Nota |
|---|---|---|---|
| 08 | `migrate-media-storage` | ⬜ | |
| 09 | `migrate-activity-and-notifications` | ⬜ | |
| 10 | `migrate-identity-and-companies` | 🟡 | Empresas, membresías, roles, direcciones, contrapartes y taxonomía global. Faltan los prospectos y las dos taxonomías que cuelgan de entidades que aún no existen |
| 11 | `migrate-subscriptions-and-billing` | ⬜ | |

### Columna de comercio

| # | Rebanada | Estado | Nota |
|---|---|---|---|
| 12 | `migrate-warehouse-catalog` | 🟡 | Entera salvo lo que depende de documentos que no existen: las comprobaciones de compromiso necesitan las rebanadas 14 y 15 |
| 13 | `add-transactional-stock-reservation` | 🟡 | Entera, 29/31. Falta sólo la ejecución programada de la verificación de coherencia, que espera al despachador de la 09. M-04 sigue sin confirmar: se implementó el criterio de la spec |
| 14 | `add-server-side-quotation-pricing` | 🟡 | Motor, autoridad del servidor y congelación al cerrar, 27/36. Falta el documento comercial —espera a `pdf-documents`— y que la interfaz consuma la misma función. M-05 sigue sin confirmar: se implementó el criterio de la spec |
| 15 | `migrate-warehouse-orders` | ⬜ | |
| 16 | `migrate-order-chat-realtime` | ⬜ | |
| 17 | `migrate-shipping-rates` | ⬜ | |
| 18 | `add-transactional-checkout` | ⬜ | |
| 19 | `migrate-websites-and-site-builder` | ⬜ | |

### Columna de producciones

| # | Rebanada | Estado | Nota |
|---|---|---|---|
| 20 | `migrate-productions-core` | ⬜ | |
| 21 | `add-durable-script-sync` | ⬜ | |
| 22 | `migrate-productions-operations` | ⬜ | |
| 23 | `add-transactional-procurement` | ⬜ | Converge las dos columnas |

### Pixit y locaciones

| # | Rebanada | Estado | Nota |
|---|---|---|---|
| 24 | `migrate-pixit-catalog-and-ledger` | ⬜ | **Bloqueada**: decisión F-10 |
| 25 | `add-server-side-pos-sales` | ⬜ | |
| 26 | `migrate-mosaic-generation` | ⬜ | **Bloqueada**: decisión F-09 |
| 27 | `migrate-locations-directory` | ⬜ | |

### Interfaz y corte

| # | Rebanada | Estado | Nota |
|---|---|---|---|
| 28 | `rebuild-ui-foundation` | 🟡 | Tokens, primitivos, superficies, transporte y **formularios que escriben** (28a·b·c·e·f, parcial). Falta la exploración de colecciones (28d) y, de la 28e, el asistente por pasos y los controles ricos |
| 29 | `rebuild-ui-domain-screens` | 🟡 | Acceso, miembros, roles, contrapartes y direcciones (29a); catálogo, árbol de ubicaciones, ficha de producto y **cotizaciones** de sólo lectura (29b). Falta la parte que escribe: asistentes de producto y constructor de cotizaciones. 29c–29e esperan a sus rebanadas de servidor |
| 30 | `add-data-migration-and-cutover` | ⬜ | |

## Lo siguiente

En este orden, y con el motivo de que sea ése:

1. **El constructor de cotizaciones** (29b): el editor de líneas con la disponibilidad delante, el
   cambio de estado y el registro del retorno. Es la parte que **escribe**, y es la que cierra las
   dos tareas que le quedan a la 14 —que la interfaz consuma la misma función de cálculo para
   previsualizar mientras se edita, en vez de reimplementarla—. La de sólo lectura ya está.
2. **Pedidos de almacén** (rebanada 15). Es lo que da entrada a las cotizaciones desde fuera:
   aceptar un pedido crea su cotización con las líneas y el inventario ya apartado, que es la
   transición central del servicio. Se apoya entera en lo que acaba de quedar construido.
3. **Lo que queda de la 10**: los prospectos. Las comprobaciones de «en uso» siguen esperando a los
   documentos que aún no existen.
4. **Base de pruebas separada de la de desarrollo.** Sigue estorbando: `pnpm test` borra los datos
   con los que se está mirando la aplicación, y con ellos la siembra de volumen y las cotizaciones.
5. **Sustituir la maquinaria de sesión propia por el servicio gestionado** (cierra la 04), y
   **recepción verificada de eventos de cobro** (07), que cierra el bloque crítico.

Dos cosas que no van en esta lista porque no dependen de nosotros: la **medición previa al corte**
de la 05, que necesita tráfico real de la pila anterior, y la **medición de importes** de la 14
—cuántas cotizaciones abiertas cambian y en cuánto—. Su sitio es junto a la rebanada 30.

## Decisiones pendientes que bloquean

Ninguna bloquea el trabajo en curso. Por orden de cuándo harán falta:

| Cuándo | Decisión | Quién |
|---|---|---|
| Rebanada 13 | Si acuñar inventario inexistente es prestación o defecto (M-04) | Negocio |
| Rebanada 14 | Convención de signo del ISR directo y alcance fiscal (M-05) | Administración |
| Rebanada 24 | Anulación de venta por compensación (F-10) | Contabilidad |
| Rebanada 26 | Cuál indexación del mosaico es la real (F-09) | Comprobación física |
| Rebanada 10 | Si transferir la propiedad debe poder delegarse a un rol. Hoy no tiene clave en el catálogo y se exige el papel; concederla añadiría una clave que la implementación anterior no tiene | Producto |
| Rebanada 28e | Si la licencia del editor de imagen es transferible (F-13) | Legal |
| Rebanada 30 | Qué se hace con las cuentas existentes marcadas como verificadas | Producto |

Las de la 13 y la 14 ya están implementadas con el criterio de la spec y señaladas en el código,
según la regla 5. Confirmar la de la 14 es cambiar una fila de la tabla de tratamiento; confirmar la
de la 13, el valor por defecto de un parámetro. Ninguna de las dos toca el modelo, y la marca de
trazabilidad de las unidades acuñadas se conserva se decida lo que se decida.

Resueltas: **cómo se propaga la identidad al motor** (rebanada 06, ver D-07 y la bitácora del
2026-08-16), **si se acepta la ventana de revocación** —no se acepta, se paga la consulta— y
**el alcance de traducción**: español e inglés desde el primer componente, sin prefijo de idioma
en la dirección.

## Bitácora

Se anota cada incremento con lo que cerró y lo que quedó abierto.

### 2026-08-16 · Andamiaje, contratos y primeras tablas

**Cerrado**

- Espacio de trabajo con pnpm y Turborepo, TypeScript en modo estricto, Biome, base local en Docker.
- `@tfv/contracts`: dinero en decimal exacto, contrato de error con códigos reales, lenguaje de
  consulta con gramática cerrada, envolvente de paginación, identificadores ordenables por tiempo,
  forma común del recurso. **51 pruebas**, transcritas de los escenarios de las specs.
- `@tfv/db`: convenciones compartidas, identidad y arrendatarios, archivos, servicios. Migración
  generada y aplicada. **7 pruebas** contra una base real.

**Verificado, no supuesto**

- El borrado lógico libera el correo: un alta duplicada se rechaza mientras la cuenta está vigente y
  se acepta tras la baja, conservando el historial. Es el criterio de aceptación de D-02, ahora
  comprobado por el motor y no por convención.
- La baja de una empresa propaga a membresías y roles, y no toca las cuentas de sus miembros.
- Eliminar un rol deja al miembro sin rol y conserva su pertenencia.
- La aritmética de dinero no pierde precisión donde la coma flotante la perdería.

**Hallazgos que corrigen supuestos del plan**

- **TypeScript 7 ya está publicado** (7.0.2). El plan asumía la serie 5. Compila el código sin
  cambios; se adopta. Requiere `types: ["node"]` explícito en cada paquete.
- **Postgres 18 cambió el punto de montaje** de su imagen: hay que montar en `/var/lib/postgresql`,
  no en su subdirectorio `data`. Con el montaje antiguo el contenedor no arranca.
- Drizzle envuelve los errores del controlador y su mensaje no nombra la restricción. Las
  comprobaciones de unicidad inspeccionan la causa, no el texto.

**Abierto**

- La propagación de identidad al motor está sólo esbozada en `withRequester`, con su marca
  pendiente. Hasta cerrar la rebanada 06, **el aislamiento depende sólo de la aplicación**.
- Falta el resto del esquema.

### 2026-08-16 · Tiempo de ejecución de la API

**Cerrado — rebanada 03**

- `apps/api`: registro explícito de rutas, validación enganchada, contrato de error con códigos
  reales, correlación por petición, orígenes enumerados, contrato publicado y endpoint de salud.
  **13 pruebas.**
- Se retiran la página de bienvenida y los endpoints de prueba (D-09).

**Verificado contra el servicio en marcha**

- `/health` responde con el estado real de la base, no sólo con que el proceso vive.
- Una ruta inexistente devuelve la forma del contrato de error, no una página de Hono.
- El contrato publicado se deriva de los esquemas de ejecución; una prueba comprueba que **toda
  ruta declarada aparece en él**, de modo que no puedan divergir.
- Un origen no enumerado no recibe permiso; el enumerado sí.
- **Sin `DATABASE_URL` el servicio no arranca**, y lo dice con un mensaje accionable.
- **Con la base caída tampoco arranca**, con el código de error y la pista para resolverlo.

**La decisión de diseño que sostiene la rebanada**

El régimen de acceso es obligatorio *en el tipo*: `defineRoute` no compila sin él. Y abrir una ruta
al público exige escribir el motivo, que aparece en la tabla. Encima hay una prueba que fija la
lista de rutas públicas: abrir una nueva rompe la compilación de las pruebas hasta que se añada de
forma deliberada.

Así fue como la pila anterior acabó con sesenta y nueve de noventa y un módulos sin autenticación
—olvidar el gancho dejaba la ruta abierta y nada lo señalaba—. Ahora olvidarlo es imposible.

**Hallazgo**

Node no reescribe `.js` a `.ts` al despojar tipos. Como ningún paquete emite —se consumen como
fuente— los importes relativos usan extensión `.ts`, con `allowImportingTsExtensions` en la base.

**Abierto**

- El punto de enganche de permisos y arrendatario está preparado y **vacío**: lo llenan las
  rebanadas 05 y 06.
- Falta la generación del cliente tipado a partir del contrato publicado.
- Faltan límites de tamaño por endpoint y limitación de frecuencia.

### 2026-08-16 · Esquema de datos completo

**Cerrado — rebanada 02**

**91 tablas, 229 claves foráneas, 49 índices parciales, 6 restricciones de comprobación.**

Por dominio: identidad y sesiones, archivos, servicios, direcciones, taxonomías, contrapartes,
bitácora, suscripciones y comercio, almacenes con su catálogo y existencias, pedidos y
cotizaciones, producciones con guion y continuidad, operación de producciones, Pixit con su libro
mayor, sitios, locaciones, y compra pública con materialización.

**Lo que ahora garantiza el motor, y antes dependía de código**

| Garantía | Cómo |
|---|---|
| Una unidad no se reserva dos veces | Índice único parcial sobre la reserva viva |
| Un movimiento no se compensa dos veces | Índice único parcial sobre la compensación |
| Una tienda no abre dos cajas | Índice único parcial sobre la sesión activa |
| La utilería es artículo **o** video, nunca ambos | Restricción de comprobación |
| Un correo liberado por baja vuelve a estar libre | Índices únicos parciales |
| Eliminar una categoría se lleva su subárbol | Autorreferencia en cascada |
| La prioridad no se desincroniza del estado | Columna calculada |
| El mismo evento de pago no se procesa dos veces | Único sobre el identificador externo |

**22 pruebas** contra una base real cubren esos invariantes, escritas para fallar si alguien
relaja una restricción.

**Decisiones de modelado que se apartan de la pila anterior**

- **Archivo y metainformación son una sola tabla.** Se leían siempre juntas y nunca se consultaba
  la segunda por su cuenta.
- **El inventario de Pixit usa una tabla con discriminador**, no tres idénticas: triplicarlas
  obligaría a triplicar cada consulta de existencia.
- **Las tres taxonomías sí son tres tablas**, porque cuelgan de padres distintos y los productos
  referencian una en concreto.
- Los bloques de condiciones de pago e impuestos van como documento, versionado: se leen enteros y
  nunca se consultan por campo suelto.

**Dos referencias sin clave foránea, a propósito**

`warehouse_stock_units.created_by_quote_id` y `production_shoppings.warehouse_order_id` cierran
ciclos entre módulos. Ambas son trazabilidad, no propiedad, y lo documentan en su sitio.

**Hallazgos**

- Veintidós nombres autogenerados de clave foránea se truncan a 63 caracteres. Comprobado que no
  colisionan; Postgres los exige únicos por tabla.
- El orden de las reexportaciones del barril **no importa**: lo que determina la evaluación es el
  grafo de importaciones de cada módulo. El comentario que decía lo contrario estaba equivocado.

### 2026-08-16 · Ciclo de vida de la sesión

**Cerrado — rebanada 04**

- Credenciales **opacas**, no tokens autocontenidos: es lo único que permite revocar.
- Par de acceso y renovación; la de renovación **rota en cada uso** con detección de reutilización.
- Verificación de correo efectiva, recuperación con enlace de un solo uso, invitación sin
  contraseña generada, cambio de contraseña, cierre global, listado de sesiones.
- Derivación con scrypt, formato versionado y rehasheo transparente al iniciar sesión.
- Limitación de intentos por cuenta y por origen.
- **27 pruebas** de extremo a extremo sobre la API real.

**Verificado**

- Sin verificar el correo no se entra — la verificación dejó de ser decorativa.
- Cerrar sesión invalida la credencial **en la petición siguiente**, no al caducar.
- Desactivar la cuenta corta el acceso de inmediato.
- Reutilizar una credencial de renovación consumida **corta la cadena entera**, incluida la sesión
  legítima que estuviera en curso.
- La recuperación responde idéntico exista o no la cuenta, y **el token nunca sale en el cuerpo**.
- Las credenciales van en cookies no accesibles por script.
- Restablecer o cambiar la contraseña cierra las sesiones anteriores.

**Decisiones que conviene conocer**

**La credencial de acceso se busca en la base en cada petición.** Es un coste real y es lo que
compra la revocación inmediata que la spec exige. No es trabajo extra: esa misma consulta carga el
contexto del solicitante que el aislamiento por arrendatario necesitará.

**El inicio de sesión deriva una contraseña aunque la cuenta no exista.** Sin eso, un correo
desconocido responde en microsegundos y uno registrado tarda lo que cuesta la derivación: la
diferencia basta para enumerar cuentas cronometrando la respuesta.

**scrypt en lugar de argon2id**, para no arrastrar una dependencia nativa. El formato lleva versión
de algoritmo, así que migrar es cambiar la función de derivación y dejar que `needsRehash` haga el
resto en el próximo inicio de sesión de cada usuario.

**El guardián corre antes que la validación**, así que una ruta autenticada con cuerpo inválido
responde `401` y no `400`. Es deliberado: no se filtran detalles de validación a quien no se ha
identificado.

**Abierto**

- El guardián de permiso **sólo deja pasar al administrador de plataforma**. Es deliberado: así
  ninguna ruta con permiso queda efectivamente abierta mientras la rebanada 05 no exista. Es el
  único punto que hay que completar.
- La entrega de los enlaces por correo queda **encolada**, no enviada: la realiza la rebanada 09.


### 2026-08-16 · Propagación de identidad y aislamiento en el motor

**Cambio de decisión: D-07 revertida.** Se adopta el servicio de autenticación gestionado. La
versión anterior lo posponía.

**Lo que el experimento corrigió**

Antes de tocar nada, comprobé contra la base real cómo obtiene `auth.uid()` su valor. Cinco hechos:

| Situación | Resultado |
|---|---|
| Rol `authenticated` con claims del usuario 1 | Ve sólo sus filas |
| Rol `authenticated` con claims del usuario 2 | Ve sólo las suyas |
| Rol `authenticated` **sin claims** | **Cero filas** |
| Rol de servicio | Ve todo: elude las políticas |
| Fuera de la transacción | Los claims no sobreviven |

`auth.uid()` lee `current_setting('request.jwt.claims')`. Con una conexión directa **nadie lo fija
por nosotros**, así que hay que propagarlo por transacción de todos modos.

Eso corrige lo que había estimado: **elegir el servicio gestionado no elimina el trabajo de
propagación**, sólo cambia de dónde sale la identidad. `withRequester` y `withSystem` se conservan
enteros; lo que se sustituye es la maquinaria de sesión propia.

**Cerrado**

- Migración escrita a mano con el esquema `app`: `member_of()`, `system_scope()`,
  `current_companies()`, `is_platform_admin()`, más los permisos del rol `authenticated`.
- `withRequester` fija rol y claims por transacción. **Las empresas no se pasan desde la
  aplicación**: las resuelve el motor leyendo las membresías del usuario que declaran los claims.
  Pasarlas permitiría que un fallo del código ampliara el alcance.
- `withSystem` declara su alcance como claim, y **las políticas lo hacen cumplir**. No elude nada:
  escribir en una empresa no declarada falla.
- `withElevated` para migraciones y mantenimiento, con nombre largo a propósito.
- **10 pruebas** de aislamiento, incluida la del modo de fallo.
- El esquema completo aplica sobre el Postgres de la pila (91 tablas, 229 claves foráneas).

**La prueba que sostiene todo esto**

Que un rol `authenticated` sin claims vea **cero filas**. Si algún camino olvida propagar la
identidad, la consulta sale vacía en lugar de salir completa. Sin esa propiedad, la segunda capa
sería decorativa.

**Abierto — y es lo que falta para cerrar la 06**

- Las políticas están definidas para **una tabla de prueba**, no para las 91. Falta escribirlas por
  tabla siguiendo la vía hasta la empresa que cada módulo documenta.
- La maquinaria de sesión propia (`password.ts`, `tokens.ts`, `accounts.ts`, `sessions.ts`) sigue en
  pie y hay que sustituirla por el servicio gestionado. Sus 27 pruebas describen el comportamiento
  que la sustitución debe seguir cumpliendo.
- `users` debe pasar a colgar de la identidad del servicio gestionado.
- **Contrato en conflicto**: `access-control` exige que cerrar sesión o desactivar una cuenta se
  note en la petición siguiente. Con un token autocontenido eso no se cumple salvo que se consulte
  la base en cada petición. Decisión pendiente.

### 2026-08-16 · Políticas de aislamiento en las 91 tablas

Rebanada **06 · `add-tenant-scoping`** — capa de datos cerrada.

`0005_rls_policies.sql`, escrita a mano: **195 políticas sobre las 91 tablas**, y una comprobación
al final de la propia migración que la hace fallar si dejó alguna sin cubrir.

**Tres patrones, y sólo tres**

| Patrón | Predicado | Ejemplo |
|---|---|---|
| Vía directa | `company_id = any((select app.current_companies())::uuid[])` | almacén, producción, sitio |
| Vía derivada | `exists (select 1 from padre where padre.id = hijo.fk)` | todo lo que cuelga de ellos |
| Catálogo de plataforma | lectura abierta, escritura de administración | servicios, taxonomía global, catálogo Pixit |

El patrón derivado **no repite la lógica de empresa**: la consulta interior queda sujeta a la
política del padre, así que una fila es visible exactamente cuando su padre lo es. Una línea de
utilería llega hasta la empresa por cuatro saltos sin que su política nombre ninguna empresa. Hay
una prueba que recorre esa cadena entera.

**El error que cometí y tuve que corregir a medio camino**

Escribí las primeras políticas con **el mismo predicado para leer y para escribir**. Está mal, y de
una forma que no salta a la vista: un `exists` se resuelve con la política de **lectura** del padre.
Donde la lectura del padre es más ancha que su escritura —el comprador lee su pedido, el cliente lee
la cotización que le hicieron— el hijo heredaba esa anchura y **dejaba escribir a quien sólo debía
mirar**. Un comprador podía añadir líneas a su propio pedido; un cliente, editar la cotización.

La corrección son dos políticas donde las dos caras difieren (`lectura` y `arrendatario`), y hacer
que esos hijos **atraviesen hasta una tabla de política simétrica** —el almacén, la producción, la
empresa— en lugar de apoyarse en el padre inmediato. Cada caso lleva anotado por qué.

**Ciclos**

Dos políticas que se referencian entre sí provocan `infinite recursion detected in policy`. Pasa en
los dos puntos donde dos empresas ven el mismo documento desde lados opuestos: el pedido de almacén
contra la orden de compra de producción, y la contraparte contra su documento. Se rompen con
`app.is_my_counterparty()` y `app.reaches_purchase_order()`, `security definer`, que resuelven la
pertenencia sin pasar por las políticas.

**Tres excepciones deliberadas, cada una con su prueba**

- **El chat del pedido** es el único sitio donde la contraparte escribe. Es un chat: tiene que poder.
- **El directorio de locaciones** se lee entre empresas —para eso es un directorio— pero sólo lo
  escribe la red dueña.
- **Sesiones y credenciales de un solo uso quedan fuera del alcance de la administración de
  plataforma.** El requisito le concede el papel de propietario *de una empresa*; la credencial de
  otra persona no es dato de ninguna empresa. Excluirlas no contradice la spec, la lee con precisión.

**Verificado**

- 91/91 tablas con políticas activas, 195 políticas, tras `supabase db reset` + `drizzle-kit migrate`
  desde cero. El andamiaje de DDL de la migración se retira solo al terminar.
- **21 pruebas nuevas** sobre tablas reales, ninguna con filtro de aplicación: lo que devuelven sale
  sólo de las políticas. Total **144** (51 contratos + 53 datos + 40 API), 0 errores de tipos, 0 de
  análisis.

**Límite conocido**

`uploads` no tiene vía hasta la empresa **a propósito**: una misma fila la referencian entidades de
empresas distintas y no tiene dueño. Se lee y se da de alta sin restricción; modificarla y borrarla
quedan para la administración y la vía de sistema. Lo que protege el contenido no es la política
sino la URL firmada — la fila sólo guarda la dirección. Si se quisiera cerrar, haría falta añadirle
dueño, y eso es un cambio de esquema.

**Sigue abierto**

- La **capa de aplicación** del aislamiento llega con los manejadores de dominio, que aún no existen.
- La maquinaria de sesión propia sigue en pie y hay que sustituirla por el servicio gestionado.
- El **contrato en conflicto** quedó resuelto en el incremento siguiente: se paga la consulta.

### 2026-08-16 · Revocación inmediata en el motor

Resuelve el conflicto de contrato que bloqueaba el reemplazo de la capa de sesión. **Las specs no se
tocan**: se paga la consulta.

**Antes de decidir, medí en vez de suponer**

| Comprobación contra el servicio real | Resultado |
|---|---|
| ¿El token declara su sesión? | Sí, en un claim |
| ¿Cerrar sesión borra el registro? | Sí |
| Token sin caducar, sesión cerrada, contra el propio servicio | **`403`** |
| Vigencia por omisión | 3600 s |

La tercera fila es la que decidió. **El servicio gestionado ya paga la consulta**: su token es
autocontenido y aun así comprueba la sesión antes de responder. Adoptarlo y no comprobar nos habría
dejado más débiles que el servicio que estamos adoptando.

Coste: `0.023 ms`, un acierto de memoria compartida, y **sin viaje de ida y vuelta adicional** —
viaja dentro de la transacción que ya se abre para fijar los claims.

**Corrección a lo que te había dicho**

Planteé el conflicto como «`access-control` exige revocación inmediata». Impreciso: de los tres
casos, **uno ya estaba resuelto y gratis**. Desactivar una membresía surte efecto en la petición
siguiente porque `app.member_of()` lee las membresías vivas y no depende del token. Sólo quedaban
cerrar sesión y desactivar la cuenta.

**Cómo se hace cumplir**

`app.uid()` es ahora la única identidad del sistema, y devuelve **nulo** si la sesión se cerró o la
cuenta dejó de estar vigente. De ahí cuelga todo: empresas, filas propias y administración de
plataforma. Un punto único que no se puede olvidar.

Las políticas de `0005` **no se reescribieron a mano**: la migración las lee del catálogo y sustituye
la identidad cruda por `app.uid()`. Así la sustitución es exhaustiva por construcción y no hay dos
sitios donde leer el predicado vigente. Termina exigiendo que **ninguna política nombre
`auth.uid()`**; si alguna lo hiciera, la migración falla.

`Requester` pasa a exigir sesión, y **pierde «es administrador de plataforma»**: lo resuelve el
motor, y traerlo desde la aplicación invitaría a confiar en un valor que la aplicación puede
calcular mal.

**Verificado**

- 91/91 tablas con políticas, 195 políticas, 13 con `app.uid()`, **0 con identidad cruda**, tras
  recrear la base desde cero.
- **6 pruebas nuevas** de revocación: sesión cerrada que no lee ni escribe, sesión inexistente,
  cuenta desactivada y reactivada, administrador con la sesión cerrada, y contexto de sistema que
  no necesita sesión. Total **150** (51 contratos + 59 datos + 40 API), 0 errores de tipos ni de
  análisis.

**Coste anotado**

Ata el motor a `auth.sessions`, esquema interno del proveedor. Es acoplamiento real y queda escrito
como tal, no como una frontera estable que hayamos elegido. Se acepta porque es un predicado en una
función. Mientras convivan las dos maquinarias de sesión, la comprobación mira las dos; el segundo
brazo desaparece al retirar la propia.

### 2026-08-16 · Cáscara de aplicación y acceso

Primera pantalla. Rebanada **28 · `rebuild-ui-foundation`**, sub-rebanadas a, b, c y f.

Se adelanta al resto del bloque de seguridad a propósito, y el `README.md` de las rebanadas ya lo
permitía: la interfaz «puede empezar en cuanto esté la 03 y avanza en su propia vía». El motivo de
ejercerlo ahora es que **hasta que algo se pinta, los defectos de lo construido no se ven** —y esta
rebanada encontró tres, uno de ellos grave.

**Cerrado**

- `@tfv/ui`: tokens traducidos del tema anterior, papeles de color que sí cambian con el tema,
  y los primitivos que la cáscara necesita.
- `apps/web`: doce pantallas —acceso, registro, verificación, recuperación, restablecimiento,
  selector de empresa, portada de empresa, servicio, cuenta, sesiones—, en **español e inglés**.
- Las **tres guardas anidadas** de `app-shell`, resueltas en el servidor antes de pintar.
- Transporte con renovación ante `401` y reintento transparente.
- Tema claro y oscuro **sin destello**, e idioma que respeta el navegador y recuerda la elección.
- `GET /auth/me`, que no existía y sin el cual la cáscara no puede pintarse.
- Siembra de desarrollo. `pnpm db:seed` apuntaba a un guion inexistente.

**El defecto grave, que sólo apareció al mirar una pantalla**

La lista de sesiones mostraba «dirección desconocida» en todas. Tirando del hilo:

El limitador de intentos frena por cuenta **y por origen**, y guardaba la cadena `"unknown"` cuando
no conocía la dirección. Esa cadena se compara igual que una dirección real, así que **todas las
peticiones sin origen compartían la misma casilla**. El predicado es `email = X OR ip = Y`.

Comprobado contra el servicio antes de tocar nada: ocho intentos fallidos con correos inventados, y
el noveno —con credenciales correctas de otra cuenta— respondía `429`.

> **Ocho peticiones bastaban para que nadie pudiera iniciar sesión en toda la plataforma durante
> quince minutos.** Sin autenticarse, sin conocer ninguna cuenta.

La causa de fondo estaba en el esquema: `login_attempts.ip_address` era `NOT NULL`. Una columna que
no admite «no se sabe» obliga a inventar un valor que signifique eso, y ese valor acaba
comportándose como un dato. Ahora admite nulo (`0007`), y con origen desconocido el conteo mira
**sólo la cuenta**. Dos pruebas de regresión fijan las dos mitades: que los fallos sin origen no
frenen a terceros, y que sí frenen cuando el origen sí se conoce.

**Los otros dos**

- **La aplicación no reenviaba la dirección del cliente.** El reenvío de `/api/*` conserva el agente
  de usuario pero no añade `x-forwarded-for`, así que la API veía todas las peticiones sin origen —
  y con ello la mitad del limitador quedaba inerte incluso ya arreglado lo anterior.
- **La cookie de renovación no llegaba a su propia ruta.** Declara `Path=/auth` para no viajar en
  cada petición; con la API servida bajo `/api`, el navegador pide `/api/auth/refresh` y la cookie
  no se enviaba nunca. La renovación habría fallado **siempre**, y la sesión se caería al caducar el
  acceso en lugar de renovarse. Se resuelve con `COOKIE_PATH_PREFIX`, que conserva la restricción en
  lugar de relajarla a `/`, que es la salida fácil.

Ninguno de los tres se ve leyendo el código de la API. Los tres aparecen a la primera en cuanto hay
un cliente que la usa como la usará un navegador.

**Cuatro colores que no son los del tema anterior**

Se midió el contraste en vez de estimarlo:

| Papel | Antes | Medido | Ahora | Medido |
|---|---|---|---|---|
| Texto tenue, claro | `#797979` | 3.82 | `#686868` | 4.89 |
| Texto tenue, oscuro | `#646464` | **2.49** | `#949494` | 4.86 |
| Texto de error, claro | `red.6` | **2.88** | `red.9` | 4.79 |
| Borde de control | `#e6e6e6` | **1.20** | `#858585` | 3.03 |

El de oscuro estaba a la mitad del mínimo, y es el color con el que se pinta la nota al pie de cada
tarjeta. El del borde es el que más cambia el aspecto: un campo de formulario a 1.20 se distingue
por su sombra o por nada, y el mínimo para el límite de un control son 3:1. Sale más marcado que la
referencia; es el precio de que el campo se vea.

**Tres desviaciones al traducir el tema, y sus motivos**

- La familia tipográfica declaraba Inter con una lista de reserva **monoespaciada entera**. Si Inter
  no cargaba, la aplicación caía a Courier. Es un error, no una decisión.
- De unos sesenta tamaños de fuente, el censo del código encontró **diecisiete con uso**. Familias
  enteras —`caption`, `overline`, `subtitle`— tenían cero, y había valores de un cuarto de píxel.
- `laptop` y `desktop` valían los dos `1024px`, así que la distinción no existía.

**El fallo que no era de diseño**

La primera captura salió con el botón principal **sin texto** y los títulos sin crecer. La causa: el
fusionador de clases no conocía la escala de tamaños del tema, clasificaba `text-body1` como color,
y al chocar con `text-on-accent` descartaba uno de los dos — dejando el texto del botón del mismo
color que su fondo. Se arregla declarándole la escala. Lo anoto porque el síntoma parece un problema
de diseño y no lo es, y porque sin mirar una captura no se detecta.

**Otras dos cosas que estaban rotas y no se sabía**

- **`pnpm test` fallaba.** Turbo corría las suites de datos y de API en paralelo contra la misma
  base y se truncaban las tablas entre sí. Las 150 pruebas pasaban por separado y nadie las había
  corrido juntas. Ahora van en serie.
- **`/auth/refresh` devolvía `userId: ""`**, un hueco a medio cerrar.

**Decisión de producto tomada**

**Español e inglés desde el primer componente**, y **sin prefijo de idioma en la dirección**:
duplicar cada URL sólo tendría sentido si las páginas fueran públicas e indexables, y el panel no lo
es. Desbloquea la 29. Los mensajes se cargan con `import()` a secas, que es la corrección de F-07.

**Verificado contra el servicio en marcha**

- Las seis salidas de las guardas: sin sesión conserva el destino; con sesión, la pantalla de acceso
  lleva al panel; una empresa ajena lleva al selector **y no a la raíz**; un servicio no contratado
  lleva a la portada de la empresa; uno inventado da no encontrado **sin salir del ámbito**; una
  cuenta con una sola empresa se salta el selector.
- Renovación por el reenvío: la cookie declara el camino correcto y devuelve credenciales nuevas.
- Tema claro y oscuro, y español e inglés, en la misma pantalla.
- **157 pruebas** (51 + 59 + 47), 0 errores de tipos, 0 de análisis.

**Abierto**

- **Ni una prueba automatizada de la interfaz.** Todo lo de arriba se comprobó a mano. Falta decidir
  con qué herramienta se escriben las de extremo a extremo.
- **Las pruebas vacían la base de desarrollo**: truncan sus tablas y hay que volver a sembrar. Hace
  falta una base separada.
- La renovación va serializada porque no hacerlo cierra la sesión del usuario legítimo —la
  credencial rota y la segunda petición dispara la detección de robo—. Queda escrito en el código
  porque es de las cosas que alguien «simplifica» sin ver por qué estaba así.
- La raíz reparte al panel o al acceso. La superficie de marketing que la spec pide ahí no existe.
- Faltan 28d (colecciones) y 28e (formularios), que son la mitad ancha de la rebanada.

### 2026-08-17 · Los permisos empiezan a autorizar

Rebanada **05 · `add-authorization-enforcement`**. Es el cambio más profundo del programa: los
permisos **existían** en la implementación anterior y no autorizaban nada — su único consumidor
decidía a quién notificar, así que el editor de matriz de permisos era un selector de audiencia con
aspecto de control de acceso (`DEFECTS.md` S-07).

**El catálogo no tiene 127 claves. Tiene 255.**

La spec lo decía en cuatro sitios y estaba mal en todos. Lo comprobé extrayendo el catálogo real del
frontend anterior y reproduciendo su función de derivación letra por letra, en vez de contar a ojo:

| | |
|---|---|
| Claves reales | **255**, en 45 recursos |
| La tabla de la spec enumeraba | 130 |
| De ésas, inexistentes | **11** |
| Que faltaban | **136** |

Las 11 inexistentes lo eran de una forma sistemática: `companies.create` y los `users.*` estaban
escritos sin su nivel de servicio —cuando la propia spec dice, dos líneas antes, que las claves son
de tres niveles—, y `warehouses.orders.create` y `warehouses.quotes.delete_payment` sencillamente no
están en el código.

De las 136 que faltaban, **45 son el eje `view` entero**: la spec no enumeraba ni un solo permiso de
lectura. Eso no es un descuido de conteo, es media capability sin describir.

La spec queda corregida con la tabla extraída, y con una nota de por qué. **Importa que sea exacta**:
los roles que hoy existen guardan estas cadenas literales, y una clave que falte al migrarlos deja a
alguien sin un permiso que tenía el día del corte.

**Cerrado**

- El catálogo en `@tfv/contracts`, tipado: `REQUIRES("warehouses.products.aprobar")` **no compila**.
  Una clave inventada es error de compilación, no un permiso que nunca se concede a nadie.
- Resolución de rol, con las tres vías por las que se concede —rol, propiedad, administración de
  plataforma— y el motivo registrado en la petición, que es lo que la bitácora necesitará para
  distinguir lo que hizo soporte de lo que hizo el cliente.
- La compuerta comprueba **antes de cualquier efecto**, porque vive en el middleware y no en el
  manejador. La spec exige que sin permiso no quede rastro; dejarlo dentro del manejador lo dejaría
  al criterio de cada uno.
- `GET /permissions`, para que el navegador deje de tener su propia lista.
- Permisos efectivos por empresa en `GET /auth/me`, resueltos con la **misma función** que usa el
  guardián. Dos implementaciones de «qué puede hacer esta persona» divergen, y el caso malo —la
  interfaz niega lo que el servidor concedería— no se nota nunca.
- Validador que rechaza claves ausentes del catálogo al guardar un rol.
- **19 pruebas nuevas**, transcritas de los escenarios. Total **176**.

**Por qué es una constante y no una tabla**

La spec pide «dato del servidor, versionado y consultable», y las tres propiedades se cumplen: del
servidor porque ya no vive en el navegador, versionado por el control de versiones, y consultable
por su endpoint. En una tabla, el catálogo y el código que lo hace cumplir podrían separarse. Aquí
no pueden: la comprobación no compila si la clave no existe. Se pierde poder editar permisos sin
desplegar, que no es algo que queramos poder hacer.

**El defecto silencioso que apareció al escribir la primera ruta con parámetro**

El contrato publicado nombra sus parámetros `{companyId}` y el enrutador los espera `:companyId`. El
manejador se registraba con la conversión hecha; **el guardián se montaba sin ella**. Su camino no
coincidía con ninguna petición, así que no corría: la ruta respondía con normalidad, sin autenticar
y sin comprobar permiso.

No fallaba, no avisaba, y no había ninguna ruta con parámetros cuando apareció — así que no expuso
nada. La primera, `/companies/{companyId}/…` de la rebanada 10, lo habría heredado.

Es la misma forma de S-05 —olvidar el gancho deja la ruta abierta, que es como sesenta y nueve de
noventa y un módulos acabaron sin autenticación—, sólo que cometida **por el andamiaje que existe
para impedirla**. Arreglado, con prueba de regresión que lo fija.

**Verificado contra el servicio en marcha**

| Cuenta | Permisos efectivos |
|---|---|
| Administración de plataforma | 255 en **cada** empresa, incluidas las ajenas |
| Propietaria | 255, con el rol vacío |
| Rol acotado | exactamente los 5 que su rol declara |
| Sin membresía | ninguno, y `403` en la empresa |

La siembra trae una cuenta de cada, porque las cuatro vías sólo se distinguen si hay con qué
compararlas.

**Abierto — y es lo que impide cerrar la rebanada**

La **medición previa al corte**. Hoy la compuerta deniega desde el primer día y no rompe nada
porque no hay tráfico real. En el corte sí lo habrá, y los permisos **nunca se han evaluado**: nadie
sabe cuántas operaciones legítimas dependen de un rol que quedó mal poblado en cinco años sin
consecuencias. Activar la denegación sin medir antes es descubrirlo con usuarios delante.

También abiertos: las etiquetas de la matriz —el catálogo no las trae porque la interfaz es bilingüe
y fijar aquí un idioma obligaría a deshacerlo—, la marca en bitácora de lo ejercido como
administración de plataforma (necesita la 09), y la escritura de roles por API (la 10).

### 2026-08-17 · El primer dominio

Rebanada **10 · `migrate-identity-and-companies`**, por su parte estructural: **empresas,
membresías y roles**. Es lo que abre las dos columnas de dominio, y son las primeras rutas que la
compuerta de permisos protege de verdad.

**Cerrado**

- Empresas: crear, listar, ver, editar y dar de baja. **13 rutas** con permiso declarado.
- Membresías: incorporar, retirar, activar, asignar rol y mover la propiedad.
- Roles: crear, renombrar, repartir permisos y eliminar, con el catálogo como autoridad.
- Pantallas de **miembros** y **roles**, que es donde el modelo de permisos por fin se ve.
- **28 pruebas nuevas.** Total **204**.

**Lo que hacen cumplir, y no se podía antes**

| Invariante | Qué impide |
|---|---|
| La empresa nunca se queda sin propietaria | Que quede inservible y sólo la plataforma la rescate |
| Un rol es de una empresa y de una sola | Cruzar arrendatarios por una asignación |
| Eliminar un rol conserva la pertenencia | Expulsar gente por un cambio de configuración |
| Repartir permisos ≠ renombrar el rol | Que quien puede renombrar se conceda todo lo demás |
| La comisión sólo la mueve la plataforma | Que la mueva quien la paga |

Las dos primeras se comprueban **dentro de la transacción**. Comprobar antes y escribir después deja
una ventana en la que dos peticiones simultáneas, cada una retirando a una propietaria distinta,
pasan las dos su comprobación y dejan cero.

**La baja de una empresa no retiraba el acceso**

`app.member_of()` leía las membresías activas **sin mirar si la empresa seguía vigente**. Como el
borrado es lógico, sus membresías sobreviven a la baja: la empresa quedaba dada de baja y sus
miembros seguían alcanzando todos sus datos a través de las políticas.

Lo difícil de notar es que la aplicación ya la excluía al construir el perfil, así que
**desaparecía de la pantalla y seguía siendo accesible** para cualquier consulta que no repitiera
ese filtro. El arreglo va en el motor (`0008`), no en cada consulta: es un predicado que hay que
aplicar en todas, y repartido se olvida en la primera que se escriba con prisa — y el olvido no
falla, devuelve datos de más.

**La propiedad no tiene clave de permiso**

El catálogo no trae ninguna para transferirla. No se puede exigir como permiso, así que se exige
**ser propietaria**, que es una regla y no un permiso. Hay una prueba que lo fija: alguien con
`companies.users.change-role` —la clave que protege esa misma ruta— no puede nombrarse propietaria.

Si el negocio quiere poder delegarla a un rol, hace falta una clave nueva, y entonces el catálogo
deja de coincidir con el de la implementación anterior. **Decisión pendiente**, anotada abajo.

**Crear una empresa es la única operación que no cabe en el alcance del solicitante**

La política exige que la empresa ya esté entre las suyas, y al crearla no lo está. Se resuelve con
la vía de sistema, que declara el alcance explícitamente y **no elude las políticas**: escribir en
una empresa que no se nombró sigue fallando. La alternativa era la vía elevada, que las apaga
enteras; se descartó porque apagar el aislamiento para escribir dos filas es desproporcionado y no
deja rastro de qué alcance se pretendía.

**Las dos capas, comprobadas por separado**

Hay dos pruebas que **se saltan la API entera** y consultan el motor con la identidad de quien no
pertenece. Devuelven cero filas. Es la propiedad que sostiene todo el diseño: si la capa de
aplicación fallara, la de datos no devuelve las filas de otro arrendatario — devuelve ninguna.

**Un detalle de presentación que sí importa**

Una empresa ajena responde `403`; una dada de baja responde `404`. No es incoherencia: en el primer
caso existe y no es tuya, en el segundo dejó de existir para todos. Y a quien le falta un permiso se
le dice **eso**, no «algo salió mal» — presentar un `403` como avería hace reintentar, recargar y
escribir a soporte por un sistema que funciona exactamente como debe.

**Abierto**

Dos tercios de la rebanada: direcciones, contrapartes, taxonomías y prospectos. Y de lo hecho,
faltan la invitación de quien **no** tiene cuenta —existe en `accounts.ts` desde la 04, falta
atarla— y la enumeración del alcance antes de confirmar una baja, que necesita el diálogo de la 28e.

### 2026-08-17 · Los formularios, y el aislamiento en sus dos capas

Rebanada **28e**, más lo que faltaba de **28b** y **28c**. Se adelantó a terminar la 10 por lo que
se veía al acabar el incremento anterior: había **trece rutas de escritura y ninguna pantalla que
escribiera**. Todo lo construido se administraba con `curl`.

**Cerrado**

- Diálogo con sus tres tamaños, y **cajón inferior en teléfono** — centrado queda bajo el teclado.
- Selección, casilla con **estado intermedio** e interruptor.
- La máquina de envío: envío doble bloqueado, errores del servidor situados en su campo, sesión
  caducada que va a acceder en lugar de decir «algo salió mal» sobre un formulario correcto.
- **Confirmación destructiva que nombra la entidad y enumera la cascada**, con el recuento real del
  servidor: «1 persona se queda sin rol y conserva su pertenencia», no una frase genérica.
- **La matriz de permisos.** Es la pantalla para la que el catálogo se publicaba.
- Crear empresa, incorporar y editar miembros, crear, editar y eliminar roles.

**Los formularios de acceso se reescribieron sobre lo mismo.** Repetían el bloque de envío cuatro
veces y ya empezaban a diferir en detalles que nadie había decidido.

**Verificado recorriendo el navegador de verdad**

No con `curl`: abriendo el diálogo, escribiendo, marcando un grupo de la matriz, enviando.

| | |
|---|---|
| El diálogo se abre y se cierra al terminar | sí |
| La casilla de grupo marca las 8 claves de `companies.users` | sí |
| **La fila aparece sin recargar la página** | sí |
| Persistió en la base | 8 permisos |

Esa tercera línea es el criterio «crear un elemento lo hace aparecer en sus listados» de la 28, y
es lo que sustituye a las mil doscientas llamadas manuales de refresco de la pila anterior (F-02).

**El defecto que no falla**

Al abrir el primer diálogo no pasó nada. La página se pintaba entera, se veía perfecta, y **ningún
botón respondía**: en desarrollo, Next sirve su paquete de cliente sólo a los orígenes que reconoce,
y `127.0.0.1` no está entre ellos por omisión. Entrando por ahí la aplicación no hidrata.

No hay error, no hay aviso, y por `localhost` funciona. Sólo se descubre al intentar pulsar algo —
que es exactamente lo que había estado sin hacer hasta ese momento, porque todas las pantallas
anteriores eran de lectura. Sólo afecta a desarrollo.

**Dos cosas que la creación de empresas rompió, y hubo que arreglar**

- Quien no tenía ninguna aterrizaba en su cuenta, porque «era lo único que esa persona podía hacer
  hasta que la invitaran». Ya no: ahora puede crear una, y mandarla a su perfil la dejaba mirando
  una pantalla sin salida.
- Quien tenía una sola no podía llegar al selector, así que no podía crear la segunda. El menú de
  cuenta ofrece ahora la entrada siempre.

Las dos son de la misma clase: una decisión correcta que deja de serlo cuando cambia lo que se
puede hacer alrededor.

**El aislamiento, en sus dos capas**

Los manejadores corren dentro de `withRequester`, así que el motor vuelve a comprobar el alcance
aunque la compuerta ya lo haya hecho. Eso cierra la parte de la rebanada 06 que llevaba desde
agosto esperando «a los manejadores». Hay dos pruebas que **se saltan la API entera** y consultan el
motor con la identidad de quien no pertenece: devuelven cero filas.

**Abierto**

Sigue sin haber **ni una prueba automatizada de la interfaz**. Lo de arriba se comprobó con un guion
que maneja el navegador, y ese guion vive en un directorio temporal — sirvió para verificar, no es
una red. Y de la 28e faltan el asistente por pasos, la confirmación al cancelar con cambios, y los
controles ricos: archivos, texto enriquecido, firma, mapa e importes.

### 2026-08-17 · Una red para la interfaz

Se adopta **Playwright**, que era lo que la tabla de herramientas declaraba desde el primer día y
nunca se había ejecutado. Vive en `apps/e2e`: ejercita el sistema entero —navegador, aplicación, API
y base—, así que no es una prueba *del* paquete web y meterla allí metería el navegador en su grafo
de dependencias.

**Cómo está montado, y por qué así**

| Decisión | Motivo |
|---|---|
| Contra un **build de producción**, en el puerto 3100 | El primer intento corrió contra `next dev` y falló con navegaciones enteras caídas: compila bajo demanda y sirve trozos incoherentes a pestañas nuevas. Además, así no interfiere con el `pnpm dev` del 3000 |
| **Una sesión por papel**, abierta en la preparación | Cuatro inicios de sesión en toda la suite en lugar de uno por prueba. La derivación de contraseña es lenta **a propósito** |
| **No truncan la base** | Es lo que hacen las de la API y es justo lo que estorba. Cada prueba limpia lo suyo |
| El conteo de renovaciones, en **Vitest** y no aquí | Provocar tres peticiones simultáneas con la credencial recién caducada desde una pantalla real sale distinto cada vez. Allí el reloj y la red los pone la prueba |

**18 pruebas en unos 8 segundos.** Cubren tema sin destello, idioma, las tres guardas con el destino
conservado, la navegación que refleja lo permitido, el cierre de sesión sin recarga, la renovación
transparente y el recorrido de escritura completo.

**Lo que encontró la primera ejecución**

Tres cosas, y ninguna se habría visto de otra forma.

**Un defecto que llevaba semanas en pie.** El contrato de error pone los problemas por campo en
`message`, como lista. El cliente esperaba `{ error: { message, fields } }` —la forma de otras
APIs—, así que **ningún error por campo llegaba nunca a su campo**: todos los `Field error={…}` de
todos los formularios eran código muerto, y una validación se pintaba como `[object Object]`.

Lo peor es por qué no se había visto: sus pruebas de unidad pasaban en verde porque **inventaban la
misma forma equivocada**. Una prueba con una respuesta inventada comprueba la invención, no el
contrato. Queda escrito junto a la prueba corregida.

**Un fallo de diseño de las propias pruebas, propio de este sistema.** Tres pruebas de roles
fallaron con la pantalla de acceso delante sin haber tocado nada de sesiones. Causa: todas
compartían la misma sesión guardada, y la prueba que cierra sesión **la revoca de verdad en el
servidor** — porque aquí las sesiones son revocables, que es una propiedad que costó construir.
Reutilizar una sesión es seguro sólo mientras nadie la cierre; las que cierran abren la suya.

**Una etiqueta que cambiaba sola.** El nombre accesible de la casilla que gobierna un grupo de
permisos era «companies.users 0 de 8»: incluía el contador, así que **cambiaba al marcarla**. Un
lector de pantalla anunciaría un nombre distinto para el mismo control cada vez que vuelve a él, y
ninguna herramienta puede localizarlo por su nombre. El recuento pasó a la descripción — el nombre
es la identidad, el contador es estado.

**Y dos de desarrollo, del mismo día**

- **La aplicación no hidrataba entrando por `127.0.0.1`.** Next sirve su paquete de cliente sólo a
  los orígenes que reconoce. La página se pintaba entera y ningún botón respondía.
- **El empaquetador no sabía cuál era la raíz del espacio de trabajo**, y eso producía trozos de
  cliente incoherentes en pestañas recién abiertas.

Los dos sólo afectan a desarrollo, y los dos son de la clase que no falla: no hay error, no hay
aviso, y por otro camino funciona.

### 2026-08-17 · Los datos maestros

Segunda mitad de la rebanada **10**: direcciones, contrapartes y taxonomía global. Son de lo que
cuelga todo el comercio — una cotización necesita una contraparte y una dirección; un producto, una
categoría—, así que con esto la columna de almacenes ya no espera nada.

**23 pruebas nuevas**, transcritas de los escenarios. Total **254**.

**Qué garantiza el motor y qué garantiza el código**

Es la distinción que más decide en esta rebanada:

| Regla | Dónde | Por qué ahí |
|---|---|---|
| Una sola dirección primaria por libreta | Índice único parcial | La aplicación no puede dejar dos aunque se equivoque |
| El aprovisionamiento en pareja no duplica | Índice único parcial | Comprobar antes de insertar deja una ventana, y dos compras simultáneas crean dos parejas |
| Eliminar una categoría se lleva su subárbol | Clave foránea en cascada | Recorrerlo a mano es donde la pila anterior se equivocaba (C-08) |
| Lo clasificado sobrevive sin categoría | Clave foránea a nulo | — |
| **No hay ciclos en el árbol** | **Código** | Es lo único que el motor no puede: la consulta que lo detecta es recursiva |

Las consecuencias sí las escribe el código —la primera dirección nace primaria, marcar una desmarca
la anterior, eliminar la primaria promueve otra— y las tres van **dentro de la misma transacción**
que la escritura que las provoca. Fuera de ella, entre desmarcar y marcar hay un instante sin
primaria, y ese instante es el que el cálculo de envío usaría para decidir que no hay origen.

**La sustituta de una primaria eliminada es la más antigua**, no una cualquiera: la spec pide que
sea determinista, y con un criterio arbitrario dos ejecuciones sobre los mismos datos dan libretas
distintas.

**Dos cosas que no caben donde parecía**

**Buscar una cuenta por correo no cabe dentro de la transacción del solicitante.** Al dar de alta un
cliente atado a una cuenta existente, la fila de esa persona está fuera de su alcance —no comparten
empresa— y las políticas la ocultan: la consulta salía vacía y la contraparte quedaba suelta. Lo
descubrió una prueba. Se resuelve fuera, y de ahí sólo sale el identificador; lo único que revela es
si ese correo tiene cuenta, y eso ya lo sabe quien lo está escribiendo.

**La taxonomía global no puede tener clave de permiso.** Es común a todas las empresas, así que un
permiso *de empresa* no la autoriza. Sus rutas cuelgan de `:companyId` porque la compuerta lo exige,
pero lo que decide es una comprobación de administración de plataforma. Mismo caso que la
transferencia de propiedad, y apunta a la misma decisión pendiente.

**Y el candado de la superficie pública funcionando**

La taxonomía se lee sin sesión —aparece en las tiendas y en el directorio—, así que al añadirla
falló la prueba que fija la lista de rutas públicas. Eso es exactamente lo que esa prueba existe
para hacer: abrir una ruta al mundo tiene que ser un acto deliberado que se vea en la revisión. Se
añadió a la lista con su motivo escrito al lado.

**Abierto de la 10**

Los prospectos, el cambio de correo, y las tres comprobaciones de «en uso» —dirección, contraparte,
categoría— que necesitan documentos que todavía no existen. Fingirlas ahora sería peor que
declararlas pendientes.

### 2026-08-17 · Las colecciones

Rebanada **28d**. Seis listados que devolvían una lista pelada ahora hablan el lenguaje de
`query-and-pagination`, y la interfaz que los muestra guarda su estado **en la dirección**.

**53 pruebas nuevas** — 19 de la API, 21 de la lógica de exploración, 13 en el navegador. Total
**307**.

**La regla de la que sale todo lo demás**

Búsqueda, filtros, página y tamaño son **parámetros de la URL**, no estado de un componente. De ahí
salen tres propiedades que la persona da por hechas, sin escribir código para ninguna:

- un listado filtrado se comparte por enlace;
- el botón de atrás deshace el último filtro;
- recargar no pierde nada.

Y sale gratis lo que la 28 tenía pendiente por falta de paginación: **editar desde la página cuatro
no devuelve a la primera**. Guardar vuelve a resolver el árbol de servidor y no toca la dirección —
y la página *es* la dirección, así que no hay estado que reiniciar.

**Dónde va la búsqueda sin acentos**

En el motor, no en el cliente. Normalizar del lado de la aplicación sólo normaliza el término
buscado, no las mil filas contra las que se compara: quien escriba «camara» seguiría sin encontrar
«Cámara». La migración `0009` añade `app.norm`, y se declaró **inmutable** —con la variante de dos
argumentos de `unaccent`— por si algún día hay que indexarla; elegir hoy la que no se puede indexar
obligaría a reescribir cada consulta el día que los volúmenes lo pidan.

La coincidencia usa `strpos` y no `like`. Con `like` habría que interpolar comodines alrededor del
término, y entonces un `%` escrito por alguien deja de ser una letra y pasa a ser sintaxis. No es
una inyección —el valor sigue siendo un parámetro—, pero sí un resultado que nadie pidió.

**El orden estable no es un detalle**

El desempate va siempre al final de todo criterio de orden. Sin él, dos filas que empatan pueden
salir en orden distinto en cada consulta, y entonces paginar **repite elementos en una página y se
salta otros en la siguiente**. El síntoma —una fila que falta— no se parece en nada a la causa, y
por eso el mapa de columnas exige declararlo: no se puede olvidar.

**La gramática sigue siendo cerrada**

Cuatro operadores y ni uno más: igual, intervalo, conjunto y nulo. El análisis vive en los
contratos y no toca la base; la traducción a SQL no ve texto de la URL, sólo valores ya validados
contra el tipo declarado del campo. Filtrar por un campo que el recurso no declara responde `400`
nombrándolo.

Un detalle que se corrigió al usarlo: **el extremo superior de un intervalo de fechas incluye el día
entero**. `hasta=2026-12-31` se convertía en la medianoche del 31 y dejaba fuera todo lo ocurrido
ese día — el día que la persona acababa de elegir en el calendario.

**La siembra creció, y no por adorno**

Con cuatro cuentas y cero clientes la búsqueda siempre encuentra, los filtros nunca quitan nada y la
paginación no aparece nunca: las tres se ven funcionar sólo cuando hay más elementos que los que
caben en una página. Ahora hay treinta y seis personas, ciento veintiocho clientes, sesenta
proveedores y veintiocho direcciones, con acentos a propósito.

**Cuatro entradas del registro de búsqueda estaban mal**

La spec decía que un cliente se busca por «nombre y apellido del usuario». Media cartera **no tiene
usuario** —son contrapartes externas, que es el caso que la entidad existe para admitir—, así que
buscar por el usuario dejaba fuera precisamente a quien no está en la plataforma. Lo mismo con las
direcciones («nombre», que es la etiqueta, y casi siempre está vacía) y con las membresías (sin el
correo, que es lo que la pantalla enseña). Y los roles no aparecían, sin estar entre las exclusiones
deliberadas: era una omisión. Corregidas las cuatro en la spec, con el motivo.

**El intervalo de fechas estaba roto de dos maneras, y ninguna era de la gramática**

Es el único tipo de filtro que ninguna pantalla usaba, así que se descubrió mirándolo a mano al
final. Las dos causas están **por debajo** del análisis, que es donde estaban las pruebas.

La primera: el esquema publicado declaraba cada parámetro como cadena. Un intervalo es la misma
clave dos veces, y el validador del transporte —que corre **antes** que el análisis— lo mataba con
«se esperaba una cadena, llegó una lista». Un mensaje del transporte sobre una petición
perfectamente válida.

La segunda, ya pasada esa: la traducción a SQL envolvía cada columna en una expresión para que
encajara en una unión de tipos. Drizzle usa el lado izquierdo de una comparación para saber **cómo
codificar el derecho**; envuelta, la columna pierde esa información y el conductor recibe un objeto
`Date` que no sabe serializar. `500`. Y sólo para los tipos que no son texto, que es lo que lo hace
fácil de no ver.

Las pruebas de `parseQuery` pasaban en verde las dos veces, porque el análisis es correcto: el
defecto estaba en las capas que lo rodean. Ahora hay dos pruebas que **atraviesan el transporte y
llegan al motor**, que es la única forma de comprobar lo que hay entre medias.

**Dos defectos de accesibilidad, encontrados por las pruebas**

Un indicador de filtro se leía **«Estado:Inactiva»**, sin espacio: el campo y su valor iban en dos
cajas de disposición separadas y el espacio lo ponía el CSS. Se ve perfecto y se lee pegado. El
espacio entre palabras es texto, no separación.

Y sin resultados había **dos botones llamados «Limpiar todo»** en la misma pantalla, uno en la barra
y otro en el estado vacío. No se pueden distinguir al recorrer la página ni nombrar por voz.

**Abierto de la 28d**

El carrusel —ninguna pantalla lo pide— y tres tipos de control de filtro: número, intervalo numérico
y fecha suelta. Ningún recurso los declara todavía, y un control sin nada que filtrar se escribe a
ciegas y se descubre equivocado el día que tenga usuario. La taxonomía global tampoco pagina: su
listado por defecto son las raíces, y «ausente» no es «nulo» en esta gramática.

### 2026-08-17 · Las primeras pantallas de directorio

Rebanada **29a**, adelantada porque no costaba nada: la API de direcciones, clientes y proveedores
estaba hecha y probada desde la 10, la exploración desde la 28d, y no había **ninguna pantalla que
las usara** — la cartera de ciento veintiocho clientes de la siembra sólo se veía por `curl`.

Tres pantallas nuevas y **8 pruebas de navegador**. Total **315**.

**Clientes y proveedores son dos colecciones, no una con un parámetro**

Comparten el código entero y no comparten el permiso, que es lo único que no se puede compartir:
quien lleva las compras no ve por ello la cartera de clientes. Un parámetro de ruta no se puede
autorizar por separado, así que son dos claves del catálogo y dos rutas. Hay una prueba que lo fija:
un cliente dado de alta no aparece buscándolo entre los proveedores.

**Dos decisiones de la libreta que se ven en la pantalla**

«Marcar como primaria» es una **acción con confirmación**, no una casilla dentro del formulario de
edición: quien la pulsa está cambiando dos direcciones —la nueva y la que deja de serlo—, y eso
merece decirse antes y no descubrirse después. Y no se ofrece sobre la que ya lo es: una acción que
no hace nada es peor que no ofrecerla.

Eliminar la primaria avisa de que la sustituta será la más antigua de las que queden. Sin ese aviso,
el origen de los envíos cambia solo y nadie relaciona una cosa con la otra.

**Cambiar de empresa dejaba de conservar la sección**

La navegación decidía si conservarla mirando si la empresa destino tenía **ese servicio**. Las
secciones que no son de ningún servicio —directorio y configuración— no pasaban la comprobación, así
que cambiar de empresa desde «Miembros» caía a la portada. Existen en toda empresa: ahora se
conservan sin preguntar.

**Y un fallo que el compilador no ve**

La función que arma la línea legible de una dirección estaba exportada desde el módulo de los
diálogos, que lleva `"use client"`. La pantalla es de servidor, y llamarla desde ahí no compila mal:
**falla en ejecución** con «attempted to call describe() from the server». Los tipos no dibujan esa
frontera, así que hay que dibujarla a mano — lo compartido entre servidor y cliente vive ahora en su
propio archivo, sin la directiva.

Se descubrió al correr las pruebas de navegador. Sin ellas, se habría descubierto abriendo la
pantalla.

**Y dos primitivos que no ataban su etiqueta**

`Checkbox` y `Switch` ponían `htmlFor` con el identificador que les dieran, y si no les daban
ninguno se quedaban sin él: pulsar la etiqueta no marcaba nada y el control perdía su nombre
accesible. No se ve —la etiqueta se pinta igual— y sólo aparece al intentar usarlo con teclado. Lo
generan ellos ahora, que es el mismo argumento por el que `Field` es un componente y no tres.

### 2026-08-17 · El almacén y su nave

Primera mitad de la rebanada **12**, y la apertura de la columna de comercio: el almacén y su árbol
de ubicaciones físicas. Doce rutas nuevas y **22 pruebas**. Total **337**.

**La habilitación no es el permiso**

Crear un almacén exige que la empresa tenga contratado el servicio. Es una comprobación aparte, y
hace falta que lo sea: el permiso dice qué puede hacer una persona **dentro** de una empresa, y una
propietaria los tiene todos. Sin esta comprobación, la propietaria de una empresa que no contrató
almacenes podría crear uno, porque la compuerta sólo mira permisos.

**El código de una ubicación es para decirlo en voz alta**

`RCK3`, `BOX12`. La gente los escribe en etiquetas y los dice cruzando la nave, y de ahí salen dos
reglas que parecen detalles y no lo son:

- **Se regenera al cambiar de tipo y nunca al renombrar.** Corregir una falta de ortografía en el
  nombre no puede dejar la nave llena de etiquetas mintiendo.
- **El correlativo cuenta por tipo y por almacén.** Cada nave tiene su `BOX1`. Contar globalmente
  daría números altos y sin sentido para quien sólo ve la suya.

Y una consecuencia que conviene tener escrita: el número **no identifica**. Se calcula contando, así
que eliminar una ubicación libera su número y el siguiente alta lo reutiliza. Lo que identifica es
la fila. Dos altas simultáneas del mismo tipo cuentan lo mismo y la segunda choca contra el índice
único de `(almacén, código)` — falla, que es el modo correcto de fallar.

**Eliminar una caja no destruye lo que había dentro**

Se lleva el subárbol y deja los productos **sin ubicación**. Las dos consecuencias las hace el
motor: la cascada, con la clave foránea autorreferente; y los productos sueltos, con la clave
foránea a nulo. No hay recorrido escrito a mano, que es donde la implementación anterior se
equivocaba —veinte funciones de borrado, tres de ellas borrando de la tabla de empresas (C-08)—.

Lo único que el motor no puede impedir por sí solo es el ciclo, porque la consulta que lo detecta es
recursiva y una restricción no puede serlo. Es el mismo reparto que en la taxonomía global.

**El identificador legible se comporta distinto al crear y al editar**

Al crear se añade un sufijo si colisiona: nadie eligió el identificador, se derivó del nombre, y
«Bodega» es un nombre razonable dos veces. Al cambiarlo a mano se **rechaza**: alguien escribió uno
concreto, y darle otro en silencio es no hacer lo que pidió.

La derivación se sacó a los contratos, con sus pruebas. La necesitan ya las categorías, los
almacenes y —en cuanto lleguen— los productos y las tiendas, y dos implementaciones del mismo
formato acaban difiriendo en el primer caso raro: una eñe, un guion doble, un nombre que son sólo
símbolos.

**Y una mezcla de dos formas de consultar**

El camino de la raíz a una ubicación sale de una consulta recursiva, que es SQL a secas. Sus
columnas vuelven como las nombra la base —`parent_id`, `created_at`—, sin la traducción del
constructor de consultas: mezclar las dos formas deja campos en `undefined` que sólo se notan al
serializar. Ahora lo recursivo aporta **sólo el orden** y las filas las lee la consulta tipada.

**Abierto de la 12**

El catálogo, las medidas, los precios y las unidades. Y dos cosas que no dependen de escribir más
código aquí: impedir la baja de un almacén con trabajo en curso necesita las cotizaciones y los
pedidos, y presentar el árbol como jerarquía navegable es pantalla.

### 2026-08-17 · El catálogo

Segunda parte de la rebanada **12**: la taxonomía del almacén, el catálogo con variantes y
accesorios, y las medidas con su ficha de sastrería. Doce rutas más —**73** en total— y **22
pruebas**. Total **359**.

**El cambio de fondo, y cómo se comprueba**

Crear un producto con toda su estructura es **atómico**. La implementación anterior creaba de forma
recursiva medidas, unidades, tarifas, variantes y accesorios **sin transacción**: un fallo a mitad
dejaba un producto existente, listable, y con la mitad de sus medidas. Eso no se detecta mirando la
pantalla; se detecta semanas después, cuando alguien cotiza y las cuentas no salen.

La prueba tiene que fallar **durante** la escritura o no comprueba nada: un cuerpo que el esquema
rechaza falla sin haber tocado la base. Así que la segunda variante lleva una medida cuyo ajuste de
precio no cabe en la columna, y el motor la rechaza cuando ya están escritos el producto, sus tres
medidas y la primera variante entera. La prueba afirma **`500` y no `400`** justamente por eso: un
`400` significaría que nunca se escribió nada.

**Tres niveles que conviene no confundir**

| Nivel | Qué es | Ejemplo |
|---|---|---|
| Producto | El artículo del catálogo | «Cámara Sony FX6» |
| Medida | La variante mensurable a la que se lleva existencia | «Cuerpo», «Kit con óptica» |
| Unidad | Un objeto físico concreto | La cámara con número de serie tal |

Y de ahí sale una decisión que parece de implementación y es de negocio: **la cantidad inicial de
una medida materializa unidades**. No es un número guardado, son filas. Sin fila no hay nada que
etiquetar, mover ni reservar, y un inventario que sólo cuenta no puede decir *cuál* está prestada.

**La herencia es una copia, no una referencia**

Una variante nace con el almacén, la ubicación, la clasificación y el responsable de su padre, y
puede divergir después. Eso es lo que la hace una variante y no una vista del padre.

La contrapartida es que reclasificar al padre tiene que propagarse, o la herencia dejaría de servir
para lo único que existe: no reclasificar veinte variantes a mano. Se propagan **sólo los tres
campos que se heredan como clasificación**; el nombre y el precio de una variante son suyos.

**El código de un producto va en una etiqueta**

Doce caracteres del alfabeto de Crockford: sin `I`, `L` ni `O`, que se confunden con `1` y `0` en
una etiqueta impresa y dictada por teléfono, y sin `U`. **La garantía de unicidad es el índice, no
la aleatoriedad**: sesenta bits hacen la colisión despreciable, y si alguna vez ocurriera, la
inserción falla y la operación entera se revierte. Falla ruidosamente, que es lo contrario de dos
productos compartiendo etiqueta.

**Filtrar por una categoría trae las de sus descendientes**

`query-and-pagination` lo exige, y la gramática genérica no puede hacerlo: no sabe qué campos son
jerárquicos. Se resuelve en el catálogo, expandiendo el filtro al subárbol antes de construir la
condición, y retirándolo del conjunto genérico para que no se aplique dos veces.

**Y la nave dejó de estar vacía**

La siembra crea ahora un almacén con doce cajas repartidas en dos pisos y seis racks, cuatro ramas
de taxonomía, veinticuatro productos y ciento treinta y dos unidades. Los tipos de ubicación se
mezclan a propósito: con una lista plana de cajas, el código autogenerado, el camino a la raíz y la
eliminación recursiva se comportan igual estén bien o mal.

**Abierto de la 12**

Las listas de precios con su precedencia, y la gestión de unidades —los once estados, las
transiciones, las etiquetas y el historial—. Y las dos comprobaciones de compromiso —no eliminar un
producto ni una medida con unidades reservadas— que necesitan las cotizaciones y los pedidos.

### 2026-08-17 · Los precios y las existencias

Cierre de la parte de la rebanada **12** que no depende de nadie: listas de precios con su
precedencia, y la gestión de unidades. Quince rutas más —**88** en total— y **26 pruebas**. Total
**385**.

**La precedencia vive en un solo sitio**

| # | Origen | Aplica a |
|---|---|---|
| 1 | Tarifa del producto en la lista aplicable | Venta y renta |
| 2 | Precio escalar del producto | Sólo venta |
| 3 | Cero | Último recurso |

Escrita una vez. Repartida por las cotizaciones, la tienda pública y el punto de venta, se convierte
en tres reglas que coinciden hasta que alguien toca una — y entonces el mismo producto vale distinto
según por dónde se mire, que es la clase de discrepancia que nadie atribuye a su causa.

Dos consecuencias que conviene tener escritas:

- **El escalar no aplica a la renta.** Cobrar el precio de venta por un día de renta es un error de
  tres órdenes de magnitud, y de los que se descubren después de emitir la factura.
- **El cero no es un precio, es la ausencia de uno.** Se devuelve marcado como tal, porque un
  producto a cero en una cotización casi siempre es un producto sin tarifa, no un regalo.

**L-04, corregido y con su prueba**

Establecer el conjunto de productos de una lista añadía los que faltaban y **no retiraba los que
sobraban**: la implementación anterior calculaba altas y bajas con el mismo criterio, así que la
lista de bajas salía siempre vacía. Retirar un producto de una lista no surtía efecto nunca, y se
descubría al facturar.

Ahora las dos direcciones se calculan con criterios opuestos —lo pedido que no está, y lo que está y
no se pidió—, y hay una prueba que empieza con A, B y C, pide A y D, y comprueba que quedan
exactamente A y D. Quien ya tenía tarifa la conserva: «establecer el conjunto» no es «rehacer la
lista».

**Los once estados, en tres grupos**

| Grupo | Estados | Qué significan juntos |
|---|---|---|
| Compromiso | disponible, en cotización, en pedido | Reversibles, y los dos últimos los mueve un documento |
| Salida | rentada, vendida, gastada | La unidad no está en la nave |
| Incidencia | perdida, dañada, robada, incompleta, modificada | Está o no está, pero no sirve |

Y dos reglas que separan los grupos, las dos para que el inventario y los documentos no se
contradigan:

- **Un compromiso vigente bloquea el cambio manual.** Liberar una unidad reservada se hace
  deshaciendo el compromiso, no marcándola disponible por detrás.
- **Una salida definitiva no vuelve.** Una vendida no se recupera con un cambio de estado; una
  dañada sí, porque se repara. La distinción es la que decide qué se puede arreglar y qué hay que
  dar de alta de nuevo.

«Rentada» **no** cuenta como compromiso a estos efectos, y es deliberado: la unidad ya salió de la
nave, y marcarla perdida o dañada al volver es exactamente lo que hay que poder hacer a mano.

**La modificación masiva comprueba antes de escribir**

Aunque la transacción revertiría igual, comprobar todas antes permite decir en el mensaje cuántas y
cuáles fallan, en lugar de sólo la primera. Con veinte unidades seleccionadas, saber que son tres y
cuáles es la diferencia entre corregir y volver a intentarlo a ciegas.

**Y el alta también deja rastro**

Sin el momento inicial, el historial de una unidad empieza en su segundo estado y no se puede
reconstruir de dónde salió. Es el requisito que la pila anterior no cumplía en absoluto: allí sólo
se conocía el estado final, y por eso **el historial no se puede reconstruir retroactivamente en el
corte**. Empieza donde empiece la pila nueva.

**Abierto de la 12**

Las tres comprobaciones de compromiso sobre productos y medidas —las de unidades ya están— y las
etiquetas imprimibles, que son pantalla. El código ya usa el alfabeto que la etiqueta necesita.

### 2026-08-17 · El almacén ya se puede recorrer

Primer incremento visible de la **29b**: listado de almacenes, catálogo explorable, ficha de
producto con medidas y disponibilidad, y árbol físico navegable. Son cinco rutas de pantalla
nuevas; la selección de ubicación vive en la dirección y cada nodo muestra los productos asignados
directamente, sin traer el árbol entero.

**La disponibilidad sólo se consulta donde existe**

La rejilla del catálogo no incluye medidas ni existencias en su contrato. Consultar la ficha de
cada producto para dibujar un contador convertiría una página de veinticuatro elementos en
veinticinco peticiones. La rejilla se limita por eso a lo que el listado devuelve, y la
disponibilidad por los once estados aparece en la ficha, donde llega en una sola respuesta.

Por la misma razón no se ofreció todavía el filtro general por ubicación: el filtro del servidor es
exacto y el endpoint del árbol devuelve un nivel cada vez. Poblar un selector completo exigiría una
petición por cada nodo con hijas en cada render. La exploración por ubicación sí está disponible en
el árbol, de forma perezosa; el filtro global necesita una consulta plana o un selector jerárquico
que cargue bajo demanda.

**Un permiso de producto no descubre el almacén**

Los permisos de almacén son independientes. `warehouses.products.view` abre el catálogo cuando ya
se conoce el identificador del almacén, pero la única ruta para descubrirlo —`GET
/companies/:companyId/warehouses`— exige `warehouses.warehouses.view`. La navegación del servicio
entra por esa lista, así que el papel `Ventas` de la siembra, que tiene el primero y no el segundo,
recibe `403` antes de poder elegir un almacén. Entrar con una dirección directa al catálogo sí
funciona.

No se hizo que un permiso implique al otro ni se amplió el papel en silencio. Hace falta decidir
entre componer los papeles con `warehouses.warehouses.view`, definir herencia entre permisos o
exponer una consulta de descubrimiento autorizada por los recursos hijos. Hasta entonces, una
persona con permisos parciales necesita una dirección directa y conocer el identificador del
almacén.

**Comprobado**

TypeScript, las **29 pruebas web**, Biome, el detector de interfaz y el build de producción con
Webpack. Turbopack no pudo abrir su puerto interno de PostCSS en este entorno; el mismo árbol
compiló y generó todas las rutas con Webpack.

### 2026-08-17 · El correo nuevo se confirma antes de sustituir al anterior

Cerrado el cambio de correo pendiente de la **10**. La cuenta permite solicitar desde su perfil
una dirección nueva, pero conserva la vigente hasta que se consume el enlace de un solo uso. La
sesión abierta no se invalida: identifica a la persona, no a su correo, y al confirmar vuelve a
resolver el perfil con la dirección actualizada.

**El destino viaja con la entrega**

La entrega no puede deducir el destinatario leyendo `users.email`, porque ése sigue siendo el
correo anterior precisamente hasta la confirmación. El outbox guarda por eso la dirección nueva en
el payload del evento `email_change_verification`; cuando llegue el despachador de la 09 tendrá un
destino inequívoco sin adelantar el cambio en la cuenta.

La confirmación vuelve a comprobar la unicidad. Una dirección podía estar libre al solicitar y ser
ocupada antes del clic; en ese caso responde conflicto, conserva el correo anterior y la
transacción no consume el enlace. La restricción única de la base sigue siendo la última defensa
ante dos confirmaciones simultáneas.

**Comprobado sin tocar la siembra**

La suite de autenticación corrió contra una base temporal aislada y pasó sus **41 pruebas**,
incluidas solicitudes y confirmaciones concurrentes, dos cuentas disputando la misma dirección y
un token abierto bajo una sesión ajena. La
base y los volcados de esquema temporales se eliminaron al terminar. También pasaron TypeScript en
API y web, las **29 pruebas web**, Biome y el build de producción con Webpack.

### 2026-08-17 · La aritmética que decide los importes

Primera mitad de la **14**: el motor de cálculo de cotizaciones, entero y probado. Es una función
pura en los contratos —sin acceso a datos, sin reloj— que recibe las líneas ya resueltas con su
precio y su cantidad, las condiciones de pago, el bloque fiscal y la ventana de fechas, y devuelve
el desglose con cada paso intermedio.

Que sea pura no es una preferencia estética: es lo que permite que el navegador previsualice
mientras se edita y el servidor recalcule al guardar **con la misma función**, que es el requisito
de que la previsualización coincida. Y hace que cada escenario de la spec sea un caso de prueba
directo, sin montar base de datos. Son treinta y nueve, uno por escenario, y el archivo dice de
dónde viene cada uno.

**Dos sitios donde el orden decide el importe**

Las comisiones van **después** de los impuestos, sobre el neto. Aplicarlas antes movería la base
imponible y con ella el importe de cada impuesto. Y el precio fijo sustituye a la base calculada
pero **no** al descuento: el descuento global se aplica igualmente sobre él. Los dos llevan
comentario en el código, porque son invisibles al leer y caros al equivocarse.

**Una sola tabla de tratamiento fiscal**

La implementación anterior aplicaba dos convenciones de signo incompatibles según se repartieran o
no las comisiones entre líneas: una pasada calculaba `IVA + ISR − retención` y la otra
`IVA − ISR + retención` (`DEFECTS.md` M-05). Aquí hay una tabla, en un solo lugar, y el reparto no
la toca.

Se sostiene porque **el reparto de comisiones es de presentación**: distribuye la comisión entre las
unidades cotizadas y la incorpora al precio unitario, sin tocar la cadena de cálculo. Activarlo no
mueve la base, ni los impuestos, ni el total —hay una prueba de cada cosa—; lo único que cambia es
dónde aparece la comisión en el documento. El residuo va a la última línea, así que las líneas
impresas siguen sumando exactamente lo mismo.

El **ISR directo** adopta el criterio fiscal habitual —aumenta la base— y queda señalado en el
código como pendiente de confirmación de administración. Cambiarlo, si lo confirman al revés, es una
fila de la tabla.

**Un matiz que apareció al implementar**

El helper de precios de la 12 resolvía la tarifa por periodicidad de otra manera que el
encadenamiento de la spec, y comparándolos se vio cuál de las dos ramas recae en el precio base:
sólo la de periodicidad. Una tarifa **marcada como fija y vacía cobra cero**, no el precio del
catálogo — marcarla fija es declarar que no se cobra por periodicidad, no pedir que se cobre otra
cosa. Tiene su prueba y su comentario.

**El documento de la cotización pasa a los contratos**

Las condiciones de pago, el bloque fiscal, la tarifa por periodicidad y el desglose se declaraban en
el esquema y son la entrada y la salida del motor. Tenerlos en dos sitios es tenerlos mal en uno de
los dos: el día que divergieran, el importe guardado dejaría de ser el importe calculado. Ahora se
declaran una vez, en los contratos, y el esquema los importa. No hubo migración — el tipo de una
columna `jsonb` sólo existe en TypeScript.

De paso, el bloque fiscal gana lo que le faltaba para cumplir su spec: un impuesto se **desactiva
sin perder su porcentaje** —antes no había dónde guardar la diferencia entre «sin registrar» y
«registrado y apagado»— y una contribución adicional declara si aumenta o disminuye la base.

**Lo que no entra, y por qué**

Recalcular al guardar, congelar el desglose al cerrar y el documento comercial son las otras tres
secciones de la 14, y las tres necesitan que exista una cotización en la API. No existe ninguna
todavía: el modelo está en la base desde la 02, pero no hay ni un endpoint. Es lo primero de lo
siguiente, junto con la 13.

**Comprobado**

TypeScript en los seis paquetes, Biome, y las **432 pruebas** —98 de contratos, 59 de datos, 207 de
API y 29 de web— y las **39 de extremo a extremo**, que se volvieron a correr en vez de darlas por
buenas. La suite de la API volvió a vaciar la base de desarrollo, y se volvió a sembrar.

### 2026-08-17 · El inventario se convierte en comercio

Las rebanadas **13 y 14**, y con ellas el tramo más delicado del servicio de almacenes. Hay
cotizaciones en la API, reservan equipo de verdad, y el importe lo decide el servidor.

Son cuatro incrementos encadenados: el documento con su máquina de estados, el motor de reserva, la
proyección sobre el inventario, y el cálculo como autoridad del servidor. Cada uno con sus pruebas
transcritas de los escenarios de su spec —cuarenta y siete en total, contra la base real—.

**El folio es del almacén, no de la instalación**

El índice único del folio era global. En un sistema multi-arrendatario eso significa que dos casas
de renta no pueden numerar sus documentos cada una desde uno, y que la segunda en dar de alta una
cotización vería un folio que delata cuántas lleva la primera. Se corrigió el índice —migración 10,
`(warehouse_id, folio)`— y se anotó en el `design.md` de `quotation-pricing`, que lo declaraba
global.

El correlativo se asigna tomando el bloqueo de la fila del almacén antes de contar. Serializa las
altas por almacén, que es gratis cuando las cotizaciones se crean a mano, y evita tener que
explicar por qué a veces falla la segunda.

**`for update skip locked`, y por qué es la pieza y no un detalle**

Sin él, dos reservas simultáneas sobre la misma medida se serializan y la segunda puede fallar por
espera en lugar de tomar limpiamente otras unidades. Con él, la segunda **salta** las filas
bloqueadas y coge las siguientes; si no quedan, falla por existencia insuficiente, que es la
respuesta correcta y no un error de infraestructura. La prueba lanza las dos reservas a la vez sobre
una única unidad disponible y comprueba que exactamente una lo consigue.

Debajo, el índice único parcial `(stock_unit_id) where released_at is null` es la garantía
estructural: una unidad no se compromete dos veces aunque la aplicación se equivoque.

**Se reconcilia por diferencia, y hay un caso que la spec no contemplaba**

Subir de dos a cinco aparta tres más y conserva las dos; bajar libera empezando por las más
recientes, para que lo que lleva más tiempo apartado siga estándolo. Reservar de nuevo desde cero
devolvería equipo al inventario por un instante, y otra cotización simultánea podría llevárselo.

Al implementarlo apareció un caso que ni la spec ni el diseño mencionan: **cambiar la medida de una
línea**. La reconciliación mira la cantidad, así que con la misma cantidad no habría hecho nada, y
la línea acabaría diciendo una medida y sujetando unidades de otra — el descuadre que sólo se
descubre el día que alguien va a la nave a buscar el equipo. Se suelta lo ajeno antes de apartar lo
nuevo, con su prueba.

**Acuñar inventario exige decirlo (M-04)**

La implementación anterior creaba unidades en silencio y siempre cuando no había existencia, de modo
que una cotización podía comprometer equipo que no existía en la nave. Ahora, sin autorización
explícita en la operación, la falta de existencia rechaza la reserva con `422` diciendo cuántas hay
y cuántas se pidieron, y no reserva parcialmente. Con autorización, cada unidad creada queda marcada
con quién la motivó y con qué cotización, y se puede filtrar por esa marca en el inventario.

Es el criterio adoptado en la spec, implementado y señalado en el código. Si negocio confirma que la
creación automática es deliberada, lo que cambia es el valor por defecto del parámetro, no el
modelo.

**Una cotización de renta completada deja el equipo fuera**

Es el caso contraintuitivo, y tiene prueba propia y comentario en el código: completar significa que
el equipo salió, no que volvió. Mientras no vuelva no cuenta como disponible para otra cotización.

De ahí que el **retorno** sea un acto explícito, unidad por unidad, que distingue lo que vuelve en
condiciones de lo que vuelve dañado. No existía: antes, completar una renta devolvía el equipo al
inventario solo, y el sistema daba por disponible equipo que seguía en un camión. De ahí también que
una cotización con equipo sin devolver no se pueda eliminar.

Una venta cerrada suelta el vínculo —la unidad salió y no vuelve—; una renta lo conserva, porque es
lo único que dice qué equipo hay que reclamar y a quién.

**El importe lo decide el servidor (M-06)**

Las líneas se resuelven contra el catálogo —tarifa de la lista, o precio del producto, o cero, más
el ajuste de la medida— y se entregan al motor puro de los contratos, el mismo que correrá en el
navegador. Con dos implementaciones no coincidirían, y la que mandaría sería la del navegador.

La cantidad de una línea no se lee de una columna: es **cuántas unidades tiene apartadas**, la misma
cifra que ve el almacén. Así un importe no puede cobrar por equipo que no está comprometido.

**El desglose se congela al cerrar, y antes de proyectar.** El orden importa: cerrar suelta el
vínculo de lo vendido y lo cancelado, así que calcular después congelaría ceros. Una cotización
cerrada no se mueve aunque se dupliquen las tarifas; una abierta refleja el cambio.

**Lo que no entra**

El documento comercial y el enlace público de la 14 esperan a `pdf-documents`. Las firmas y los
pagos de `quotations` van con la 15, que es quien los necesita. Y la ejecución programada de la
verificación de coherencia —lo único que le falta a la 13— espera al despachador de trabajos de la
09; la consulta y la comunicación de discrepancias ya están, en su endpoint.

**Comprobado**

TypeScript en los seis paquetes, Biome, y las **479 pruebas**: 98 de contratos, 59 de datos, 254 de
API, 29 de web y 39 de extremo a extremo. La suite de la API volvió a vaciar la base de desarrollo,
y se volvió a sembrar.

### 2026-08-17 · Una clave del catálogo que nadie podía ejercer

Al repasar lo escrito apareció que el comentario de la ruta de estado prometía tres claves de
permiso y la ruta declaraba una. No era sólo un comentario desactualizado: `warehouses.quotes.rented`
era una clave del catálogo que **ninguna ruta exigía**, y colapsar en `edit_status` las tres que la
matriz anterior separa amplía en silencio la autoridad de quien sólo tenía la general — mover una
cotización por la bandeja pasaba a incluir sacar el equipo de la nave.

La ruta declara la general, que es lo que mantiene cierto que ninguna escritura llega sin permiso, y
el manejador exige además la del destino contra la autorización que el guardián ya resolvió. La del
destino sólo puede estrechar, nunca abrir. Tres pruebas con un rol acotado lo fijan.

**Los hallazgos dejan de vivir sólo en la bitácora**

Doce cosas de este tipo —specs que no se sostenían al escribirlas, huecos que sólo se ven con el
código delante, decisiones pendientes— estaban repartidas entre entradas de bitácora y comentarios
de `design.md`. Ahora están en [`openspec/HALLAZGOS.md`](./openspec/HALLAZGOS.md), que es el
complemento de `DEFECTS.md`: aquél registra defectos de la implementación anterior, éste lo que
aparece construyendo la nueva. La regla 4 pide anotar cada corrección de spec, y una corrección
anotada sólo en el diff no la encuentra nadie.

**Comprobado**

TypeScript, Biome y las **257 pruebas de API**, cincuenta de ellas de cotizaciones.

### 2026-08-17 · La cotización se puede mirar

Primer incremento visible de las 13 y 14: la **bandeja de trabajo** y la **ficha**. Dos rutas de
pantalla nuevas y una entrada más en la navegación del almacén, con su permiso.

**La bandeja no decide el orden.** Llega ordenada por la prioridad que el servidor deriva del
estado —una columna calculada, no un valor que nadie escribe—, así que lo que hay que atender antes
sale antes sin que la pantalla opine. Ordenarla aquí desharía esa derivación, que es justo lo que la
hace fiable.

La ficha enseña el equipo apartado línea a línea y el desglose entero: cada impuesto por separado,
comisiones, anticipo y total. Y dice si los importes están **congelados** o si todavía se mueven,
porque un total que puede cambiar mañana y otro que no volverá a moverse se leen distinto.

**Una petición por cotización, no una por línea**

Las líneas devolvían el identificador de la medida y nada más, que a quien lee el documento no le
dice nada. Resolverlos uno a uno habría convertido una cotización de doce líneas en trece
peticiones — el mismo error que la rejilla del catálogo evitó no incluyendo la disponibilidad. Ahora
la línea trae el producto y la medida por su nombre, como la localización por código devuelve el
camino entero.

**Los importes no pasan por coma flotante ni para pintarse**

Dos decimales caben de sobra en un flotante, y por eso es tentador convertir la cadena decimal para
formatearla. Se agrupa la parte entera con las convenciones del idioma y se vuelve a pegar la
fracción, sin `Number` en ningún punto: convertir para pintar es el hábito que acaba con un total
mostrado que no coincide con el cobrado.

**El tono de la insignia dice la fase, no si va bien**

Cancelada es peligro y completada es éxito, pero **en renta es aviso**: hay equipo fuera de la nave,
que es la situación que alguien tiene que vigilar. Pintarla de verde por estar «avanzada»
escondería justo lo que hay que mirar.

**La siembra deja cuatro cotizaciones en cuatro estados**

Como todo lo demás de esa siembra, los estados difieren a propósito: con cuatro pendientes, el orden
por prioridad se comportaría igual estuviera bien o mal. Su inventario queda proyectado, de modo que
la verificación de coherencia pasa sobre la base sembrada en vez de encontrarse un descuadre nacido
ahí. Todas nacen abiertas: congelar un desglose a mano en la siembra sería reimplementar la
transición.

**Dos defectos que sólo se vieron mirando la pantalla**

Ninguna prueba los habría cazado, porque las dos cosas *funcionaban*: la ficha enseñaba **«iva»** en
lugar de «IVA» —el desglose rellenaba el concepto con la clave interna cuando nadie había escrito
uno, y un documento con consecuencias contractuales no puede mostrar el nombre de una columna— y la
ventana de renta salía en crudo, «Mon Aug 31 2026 18:00:00 GMT-0600», porque pedía un formato con
nombre que la configuración no define.

El concepto pasa a ser lo que escribió quien registró el impuesto, **o nada**; ponerle nombre es
trabajo de quien traduce. Tiene su prueba en los contratos.

**Comprobado**

TypeScript en los seis paquetes, Biome, las **445 pruebas** de vitest y las **44 de extremo a
extremo**, cuatro de ellas nuevas. El build de producción con Webpack genera las dos rutas, y las
dos pantallas se miraron de verdad: la cadena de importes cuadra a la vista —490.00 más 78.40 de
IVA, 17.05 de comisión, 585.45 a pagar—.

Una nota de entorno: la primera pasada de extremo a extremo falló entera porque el proceso de la API
llevaba horas levantado sin recarga y servía un registro de rutas anterior a las cotizaciones. No
era un fallo del código, pero costó una vuelta entera de diagnóstico — el arranque sin vigilancia
no avisa de que está viejo.
