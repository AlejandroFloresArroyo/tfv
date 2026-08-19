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
pnpm test           # Contratos, datos, API y transporte — sobre la base de pruebas
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

> **No hay envío de correo todavía.** El despachador de la rebanada 09 ya existe y entrega, pero
> **no hay proveedor de correo**: el enlace de verificación, el de recuperación y el de invitación
> se encolan y se quedan ahí, sin contar como fallo, hasta que se registre un transporte. En
> desarrollo se escriben además **en el registro del servicio**, con su dirección completa, así que
> registrarse se completa pegando esa dirección en el navegador. Las cuentas sembradas ya vienen
> verificadas y no necesitan nada de esto.

> `pnpm test` corre contra **`tfv_test`**, una base aparte del mismo servidor local que se crea y se
> migra sola la primera vez. Las suites truncan sus tablas, y ahora eso no toca los datos con los
> que se está mirando la aplicación.
>
> `pnpm test:e2e` **también tiene la suya**, `tfv_test_e2e`, y levanta su propia API contra ella en
> un par de puertos deducidos del árbol de trabajo desde el que se lanza —web `32xx`, API `52xx` con
> el mismo final—. Antes reutilizaba la API del `5000`, es decir la base de desarrollo, y correrla
> le borraba los datos a quien estuviera mirando la aplicación (`HALLAZGOS.md` H-138). Ya no hace
> falta tener nada levantado para lanzarla, y lanzarla no estorba a nada que lo esté.
>
> Lo que sigue sin resolver: **dos ejecuciones simultáneas de la misma suite se pisan**, porque
> comparten su base.

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
| Rebanadas | 25 de 30 empezadas, **6 cerradas del todo**: 03, 08, 09, 11, 13 y 17 |
| Tareas | **747 de 1228**, el 60,8 %. Contadas sobre los `tasks.md`, no estimadas. Otras 29 están marcadas **no aplicables** con su razón escrita: apuntan a la pila vieja, que la regla 1 deja intacta |
| Código sin pruebas | 93 041 líneas |
| Código de prueba | 33 985 líneas |
| Pruebas | **1534** de vitest — 406 contratos, 90 datos, 810 API, 109 web, 119 interfaz — y **83 de extremo a extremo** con Playwright sobre un build de producción |
| Esquema | 97 tablas · 295 índices · 50 enumerados · 8 comprobaciones · 42 únicos parciales · 238 claves foráneas |
| Aislamiento | 215 políticas · 97/97 tablas · 0 con identidad cruda |
| Migraciones | 28, replicadas desde cero en cada verificación |
| Rutas | **228** registradas, 165 con permiso declarado, 43 sólo autenticadas y 20 públicas y enumeradas |
| Permisos | **255** claves, comprobadas antes de cualquier efecto |
| Pantallas | 62, en español e inglés (1656 mensajes, sin desalinear) |

**Dónde estamos de verdad**: los cimientos, la seguridad, la interfaz con formularios que escriben,
**los datos maestros** —empresas, membresías, roles, direcciones, contrapartes y taxonomía—, **las
colecciones explorables**, **el almacén entero, del catálogo a las existencias** y, desde el 19 de
agosto, **el área de administración de plataforma** y **la contratación de planes**. La parte ancha
del trabajo que queda son **producciones** (20–23) y **Pixit y locaciones** (24–27, en pausa por
decisión de producto): entre las dos suman 295 de las 481 tareas abiertas. De los servicios de
plataforma sólo sigue en curso la 10, y le faltan dos taxonomías que cuelgan de entidades que aún no
existen.

**La plataforma ya tiene dónde administrarse, y deja rastro de hacerlo.** Un administrador de
plataforma puede mirar a través de todos los arrendatarios —eso existía desde la rebanada 05— y
ahora tiene un sitio propio desde el que ejercerlo: la bandeja de prospectos que llevaba desde la 10
implementada y sin pantalla, y dos padrones de sólo lectura. Cada ruta del área niega a un usuario
corriente con `403`, y cada acción que se hace desde ella queda escrita en una bitácora que ni
siquiera quien la protagoniza puede reescribir.

**Contratar ya cierra el círculo, que era lo que abría todo lo demás.** El plan se contrata de verdad: la
sesión de pago lleva a la página del procesador —hoy un suplente que no mueve dinero y lo dice—, y
pagar ahí **firma el evento y lo entrega a `/payments/events`**, el mismo endpoint que atenderá al
procesador real. La suscripción nace de ese evento y de ningún otro sitio, así que el camino que
usará producción se ejerce en cada pasada. Detrás se encienden los recorridos que colgaban de tener
suscripción —cambiar de plan, cancelar al vencimiento, reactivar, el historial de cobros— y,
encadenada, **la tienda pública**, que exige suscripción vigente antes de servir nada.

**Y ya se puede comprar.** Una tienda pública vende de verdad: el carrito se valora contra el
catálogo publicado con la misma función que pinta la ficha, pagar **aparta unidades concretas** con
caducidad, y el cobro confirmado materializa las ocho entidades en una transacción con la marca al
final. Si el cobro falla no queda ni pedido ni existencia apartada; si el mismo cobro llega dos
veces, hay un pedido. Son los cuatro defectos más caros del levantamiento —M-01, M-02, M-03 y
M-10— cerrados de una vez.

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

**La interfaz ya tiene red.** Ochenta y tres pruebas de extremo a extremo con Playwright, en unos
veintiséis segundos, sobre un build de producción y contra una base y unos puertos propios del árbol
de trabajo desde el que se lanzan — que es lo que hace que se puedan correr sin pedirle permiso a
nadie. Cubren tema, idioma, las tres guardas, la renovación transparente, el cierre de sesión sin
recarga, el recorrido de escritura completo, la exploración de colecciones, el almacén de punta a
punta y **el ciclo de contratación entero**. Lo que aún no cubren está enumerado en el `tasks.md` de
la 28.

## Estado

Leyenda: ⬜ sin empezar · 🟡 en curso · ✅ terminada

### Cimientos

| # | Rebanada | Estado | Tareas | Nota |
|---|---|---|---|---|
| 00 | Andamiaje del espacio de trabajo | ✅ | — | Raíz, herramientas, base local |
| 01 | `add-platform-contracts` | 🟡 | 27/37 | Dinero, errores, consulta, paginación, identificadores, **idempotencia**, **campos calculados** y **el cliente tipado generado**. Falta el registro de búsqueda y los esquemas de entrada y salida compartidos |
| 02 | `add-postgres-data-model` | 🟡 | 30/34 | 91 tablas, 229 claves foráneas, 48 únicos parciales. Falta medir el volcado real, la siembra y el desfase en integración continua |
| 03 | `add-hono-api-runtime` | ✅ | 26/26 | Registro explícito, validación, contrato de error, contrato publicado con su cliente tipado y su candado de desfase, salud, límite de cuerpo y limitación de frecuencia. **La primera rebanada cerrada del todo** |

> **La 09 se cierra el 2026-08-19**, la segunda. Al cerrarla salieron las dos cosas que nadie había
> mirado por no hacer falta para que la pantalla se dibujara: el asiento guardaba español (H-153) y
> **ninguna de sus referencias llevaba a ninguna parte** (H-154) — la bandeja las pintaba como
> enlace desde el primer día y la prueba que había afirmaba la dirección rota tal cual.

> **La 03 se cierra el 2026-08-19**, esta vez con sus veintiséis tareas marcadas y no por costumbre.
> Al cerrarla apareció lo que faltaba por mirar: el comando que emite el contrato apuntaba a un
> archivo que no existía (H-126), y las capas del motor se montaban por camino y no por verbo, así
> que una ruta heredaba los guardianes de sus hermanas según el orden de la tabla (H-127).

> **Corregido el 2026-08-16.** La 02 y la 03 figuraban como terminadas y no lo estaban: sus listas
> de tareas nunca se habían marcado, y al repasarlas contra el código aparecieron huecos reales.
> Ninguno bloquea lo que viene, pero decir «✅» de algo con cinco tareas abiertas es justamente el
> tipo de cosa que este documento existe para no hacer.

### Bloque crítico de seguridad

| # | Rebanada | Estado | Tareas | Nota |
|---|---|---|---|---|
| 04 | `add-session-lifecycle` | 🟡 | 31/36 | Sesiones revocables, rotación con detección de reutilización, y revocación exigida por el motor. Falta sustituir la maquinaria propia por el servicio gestionado |
| 05 | `add-authorization-enforcement` | 🟡 | 22/29 | Catálogo de **255** claves, resolución de rol, elusión acotada de propietario y de plataforma, permisos efectivos para la interfaz. Falta la medición previa al corte, que es lo que impide cerrarla |
| 06 | `add-tenant-scoping` | 🟡 | 28/29 | **Las dos capas en pie**: 195 políticas sobre las 91 tablas, y los manejadores corriendo bajo `withRequester`. Faltan las de los dominios que aún no existen |
| 07 | `add-verified-payment-webhooks` | 🟡 | 25/38 | **Firma verificada de verdad**, unicidad por reclamación e inserción, y transaccionalidad. Los manejadores por tipo **ya están**: los de suscripción con la 11, los de cobro en tienda con la 18 (H-88 cerrado) |

### Servicios de plataforma

| # | Rebanada | Estado | Nota |
|---|---|---|---|
| 08 | `migrate-media-storage` | ✅ | 39/39. **Subida directa entera y usada**: autorización acotada al objeto y con caducidad, cinco objetos por imagen y por video, reemisión, confirmación que dice qué se escribió, y el selector con vista previa, reducción y reintento por objeto. La **sustitución de colecciones diferencia** —L-01— y las pantallas del almacén ya suben: galería del producto, e imagen única de almacén y ubicación. **Cerrada el 2026-08-19**: los marcadores de posición ya son activos propios y el recolector corre programado sobre el despachador de la 09 —y nunca toca lo referenciado, ni la fila ni los objetos—. La única casilla sin marcar es **no aplicable con su razón escrita**: la vista previa de los formatos de cámara de teléfono, que se resuelve diciendo lo que no se puede previsualizar (H-51, H-68) |
| 09 | `migrate-activity-and-notifications` | ✅ | 50/50. Bitácora transaccional de sólo anexado, audiencia por permiso, bandeja entera con su contador, preferencias y dispositivos, y el **despachador de trabajos**, que desbloquea la 08 y la 13. Cerrada el 2026-08-19: el asiento pasa a **clave y parámetros**, la referencia navegable sale de una sola función y apunta a pantallas que existen, el destinatario se da de alta ante el proveedor antes de su primer envío, y la administración de plantillas queda retirada con su delta y con una prueba que impide que vuelva. **La segunda rebanada cerrada del todo** |
| 10 | `migrate-identity-and-companies` | 🟡 | 62/75. Empresas, membresías, roles, direcciones, contrapartes, taxonomía global y **prospectos, ya con sus dos pantallas**: el formulario público y la bandeja, que estrena el **área de administración de plataforma**. Faltan las dos taxonomías que cuelgan de entidades que aún no existen |
| 11 | `migrate-subscriptions-and-billing` | ✅ | 43/43. Planes, contratación, asientos, gracia, las tres compuertas y el alta de comercio entera, con 78 pruebas. **Contratar cierra el círculo desde el 2026-08-19**: el suplente tiene su propia página de cobro y al pagarla firma el evento y lo entrega al mismo endpoint que atenderá al procesador real, así que la suscripción nace por donde nacerá siempre (H-163). Lo único pendiente **no depende de nosotros**: el procesador real (H-85) es una cuenta con sus credenciales, y la costura por la que entra ya está ejercida |

### Columna de comercio

| # | Rebanada | Estado | Nota |
|---|---|---|---|
| 12 | `migrate-warehouse-catalog` | 🟡 | 51/52. Entera salvo el detalle de producto y sus asistentes, que son pantalla (29b). El **alta provisional** y su bandeja ya están |
| 13 | `add-transactional-stock-reservation` | ✅ | 31/31, con el **agujero de las huérfanas rentadas** tapado. La verificación de coherencia **ya corre programada** y avisa a quien puede arreglarla (09, H-11 cerrado). **M-04 resuelto el 2026-08-19**: comprometer lo que no está en la nave es la prestación —las bodegas lo traen de fuera—, así que se autoriza **sólo en mostrador**, la tienda pública sigue negándose, y se añadió la **confirmación de llegada** con su bandeja |
| 14 | `add-server-side-quotation-pricing` | 🟡 | 33/35. Motor, autoridad del servidor, congelación al cerrar, **precio negociado, precio por paquete, cobros y saldo**. La interfaz consume ya la misma función, y **el documento comercial ya se imprime y se comparte por enlace**. Falta la firma capturada en pantalla. M-05 sigue sin confirmar |
| 15 | `migrate-warehouse-orders` | 🟡 | 30/33. Ciclo, **aceptación atómica**, rechazo con motivo, propagación a la orden de compra y su bandeja. Las cuatro que faltan esperan al escaparate (19) y al servicio de producciones (20) |
| 16 | `migrate-order-chat-realtime` | 🟡 | 24/34. Historial con cursor, envío optimista, acuses por lado, editar y borrar lo propio, mensajes del sistema y la pertenencia al pedido, con la pantalla dentro de la ficha. **Sin conexión persistente**: pide configuración externa que no hay, y el transporte queda detrás de una costura (H-60) |
| 17 | `migrate-shipping-rates` | ✅ | 31/31. El cálculo va como función pura en contratos con las tarifas inyectadas como dato, y el peso facturable en decimal exacto —en coma flotante 2 lb son 0.9071839999999999 kg—. Cuadro por empresa con su pantalla y simulador que pregunta al servidor. La estimación **recibe la transacción en vez de abrirla**, que es lo que dejó a la 18 cobrar con la tarifa que cotizó. Las dos casillas sin marcar son **no aplicables con su razón escrita**: piden retirar del navegador unas copias que sólo existen en `tfv-frontend/`, el árbol viejo que la regla 1 deja intacto — en la pila nueva el cálculo y la distancia viven una sola vez, en `packages/contracts/src/shipping.ts` |
| 18 | `add-transactional-checkout` | 🟡 | 37/44. Carrito valorado en el servidor, **reserva efectiva con caducidad**, instantánea congelada, idempotencia y la materialización de las ocho entidades en transacción, con la marca al final. Las cuatro de mosaicos esperan a la 24; el aviso de fallo persistente y el reproceso manual, a un área de administración de plataforma |
| 19 | `migrate-websites-and-site-builder` | 🟡 | 38/48. Sitios, resolución por subdominio, tienda y **el constructor entero**: temas con su campaña programada, secciones con su contenido, reordenación por arrastre y vista previa que comparte función y componente con lo que se sirve. Falta el carrito y la cuenta del comprador, que son de la 18 |

### Columna de producciones

| # | Rebanada | Estado | Nota |
|---|---|---|---|
| 20 | `migrate-productions-core` | 🟡 | 9/41 más lo que no estaba en la lista. **La columna deja de estar en cero**: la producción entera —alta, ficha, fechas, publicación, panel y baja con su alcance—, su taxonomía con el rol que dirige el trabajo al equipo, y el flujo básico de los planes de trabajo. Faltan guion, capítulos y escenas (21), y jornadas, continuidad y catálogos, que son el grueso de la lista |
| 21 | `add-durable-script-sync` | ⬜ | 0/33 |
| 22 | `migrate-productions-operations` | ⬜ | 0/44 |
| 23 | `add-transactional-procurement` | ⬜ | 2/43. Converge las dos columnas |

### Pixit y locaciones

| # | Rebanada | Estado | Nota |
|---|---|---|---|
| 24 | `migrate-pixit-catalog-and-ledger` | ⬜ | 0/42. **Bloqueada**: decisión F-10 |
| 25 | `add-server-side-pos-sales` | ⬜ | 0/37 |
| 26 | `migrate-mosaic-generation` | ⬜ | 0/39. **Bloqueada**: decisión F-09 |
| 27 | `migrate-locations-directory` | ⬜ | 1/28 |

### Interfaz y corte

| # | Rebanada | Estado | Nota |
|---|---|---|---|
| 28 | `rebuild-ui-foundation` | 🟡 | 58/71. Tokens, primitivos, superficies, transporte y **formularios que escriben** (28a·b·c·e·f, parcial), con el **asistente por pasos**, el área de texto, el campo de importe y el selector con búsqueda. De la 28e faltan el selector de archivos, el editor enriquecido, la firma y el mapa; de la 28d, la exploración de colecciones |
| 29 | `rebuild-ui-domain-screens` | 🟡 | 18/56. Acceso, miembros, roles, contrapartes y direcciones (29a). La 29b **cierra el flujo del almacén**: alta y baja de almacén, los dos árboles editables, los **dos asistentes** de producto y de variante, la ficha corregible, existencias con etiquetas imprimibles, listas de precios con asignación masiva, **el panel del almacén** y el constructor de cotizaciones entero —sus cuatro bloques se guardan solos, y la ventana de fechas rehace los días que cobra cada línea antes de guardar—. El **documento de cotización y su enlace público** ya están; falta la conversación del pedido. 29c–29e esperan a sus rebanadas de servidor |
| 30 | `add-data-migration-and-cutover` | ⬜ | 1/50 |

## Lo siguiente

En este orden, y con el motivo de que sea ése:

1. **El modelo y el motor del precio** (hecho): precio negociado, la renta sin tarifa y la marca de
   provisional.
2. **El bloque de condiciones de pago entero** (hecho), y con él el fiscal: los dos se guardan solos
   y alimentan la misma previsualización.
3. **Congelar las líneas al salir el equipo** (hecho), con el retorno anticipado declarado y el
   agujero de las huérfanas rentadas tapado por los dos lados: ya no se crea, y la verificación lo
   vería si existiera.
4. **Pagos cobrados** (hecho), separados del anticipo pactado y sin comprobantes, con el escenario
   de la spec incumplido a propósito hasta que exista almacenamiento de ficheros.
5. **El alta provisional desde el constructor** (hecho), con su bandeja. Quitar la marca espera al detalle de producto.
6. **La extensión de renta** (hecho): cotización nueva enlazada, parcial y encadenable, que
   traspasa los vínculos vivos sin que la unidad pase por disponible. **Nace en renta**, no en
   borrador como esbozamos — el motivo está en la bitácora y merece una revisión.
7. **Pedidos de almacén** (hecho): ciclo, aceptación atómica, rechazo con motivo y su bandeja.
   Quedan cuatro tareas de la rebanada esperando al escaparate y al servicio de producciones.
8. **Lo que queda de la 10** (hecho): los prospectos y la comprobación de «en uso» de una
   contraparte, que ya tiene documentos que consultar. Sus dos pantallas ya están: el formulario
   público, y la bandeja dentro del área de administración de plataforma.
9. **Base de pruebas separada de la de desarrollo** (hecho). Dos ejecuciones simultáneas siguen
   pisándose, que es la mitad barata de vivir con ella.
10. **Recepción verificada de eventos de cobro** (hecho en su parte crítica: firma, unicidad y
   transaccionalidad; los manejadores esperan a las rebanadas 11 y 17). Queda **sustituir la
   maquinaria de sesión propia por el servicio gestionado**, que cierra la 04: es una reescritura
   del camino de autenticación, necesita configuración externa, y no debe hacerse sin supervisión.
11. **La compra en la tienda pública** (hecho): el carrito valorado en el servidor, la reserva
   efectiva con caducidad y la materialización de las ocho entidades en transacción, con la marca al
   final. Con ella llegan los manejadores de cobro que la 07 dejó pendientes, y de paso tres
   políticas que dejaban al comprador reescribir la instantánea de su compra, fabricar el asiento de
   su cobro e insertar una orden de trabajo en el almacén de cualquier empresa.

Dos cosas que no van en esta lista porque no dependen de nosotros: la **medición previa al corte**
de la 05, que necesita tráfico real de la pila anterior, y la **medición de importes** de la 14
—cuántas cotizaciones abiertas cambian y en cuánto—. Su sitio es junto a la rebanada 30.

Lo que queda, sin orden acordado todavía:

- **Llevar el almacenamiento de objetos a S3** (2026-08-19, pedido por el propietario). **Listo para
  ejecutar**: interfaz de proveedor, el de hoy detrás de ella, un segundo que habla S3 con su firma
  SigV4 —ejercido contra la pila local, que expone su punto S3—, el guion que reescribe las
  direcciones ya persistidas, y desde el 2026-08-19 las dos mitades que faltaban: el depósito se deja
  puesto y se comprueba con `pnpm --filter @tfv/api bucket` —lectura pública leyendo sin credencial,
  CORS preguntando el preflight de `PUT`—, y la copia de los objetos la ejecuta `aws s3 sync` desde
  `copy-media-objects`. Los cuatro pasos de AWS los imprime `bucket --aws` compuestos desde esta
  misma configuración, con la política de escritura acotada al depósito.

  Lo que queda **no es nuestro y no se puede hacer desde aquí**: una cuenta de AWS, un nombre de
  depósito y una credencial de administración con la que correr esos cuatro pasos una vez. El orden
  completo de la mudanza está en `.env.example` y en la cabecera de `copy-media-objects`. Su sitio
  natural sigue siendo junto a la rebanada 30, con el corte.

- **Sustituir la maquinaria de sesión propia por el servicio gestionado** (cierra la 04). Es lo
  único de la lista anterior que quedó sin hacer, y a propósito: reescribe el camino de
  autenticación y necesita configuración externa.
- **El detalle de producto y sus asistentes** (29b). Sin ellos no se puede completar un alta
  provisional ni editar una medida desde la pantalla.
- **Un procesador de pagos real** (H-85). El ciclo entero corre contra una costura y su
  suplente; lo que falta es una cuenta con sus credenciales, que es configuración externa.
- **El sitio público** (29e): el formulario de contacto y la tienda de almacén. Con él llegan
  también la compra pública de la 15 y las unidades concretas por línea.
- ~~**Un área de administración de plataforma**~~ (hecha, 2026-08-19): la bandeja de prospectos, el
  padrón de empresas y el de cuentas, y su propia bitácora. Lo que sigue fuera es **escribir** datos
  de una empresa desde ahí —leer sí, escribir es otra decisión y no tiene clave que la respalde
  (H-121)—, y las dos superficies de plataforma que sus specs piden y sus rebanadas todavía no
  tienen: reprocesar un evento de cobro (`payment-webhooks`) y habilitar servicios de una empresa
  (`companies`).
- **El idioma de los importes** (H-25): `es` agrupa a la europea y esto es un sistema mexicano. Es
  decisión de producto.

## Decisiones pendientes que bloquean

Ninguna bloquea el trabajo en curso. Por orden de cuándo harán falta:

| Cuándo | Decisión | Quién |
|---|---|---|
| Rebanada 24 | Anulación de venta por compensación (F-10) | Contabilidad |
| Rebanada 26 | Cuál indexación del mosaico es la real (F-09) | Comprobación física |
| Rebanada 28e | Si la licencia del editor de imagen es transferible (F-13) | Legal |

Las tres son de fuera: dos esperan a Pixit, que está en pausa, y la tercera a un contrato. Ninguna
detiene nada de lo que está en marcha.

**Resueltas el 2026-08-19**, en la sesión de repaso:

| Decisión | Resolución |
|---|---|
| **M-04** · si comprometer inventario que no está en la nave es prestación o defecto | **Prestación.** Las bodegas traen de fuera lo que no tienen; para eso existe. Se autoriza **sólo en mostrador** —la tienda pública sigue negándose— y se añadió la **confirmación de llegada** con su bandeja, para que lo comprometido y lo que ya está en la nave dejen de ser la misma cosa. El permiso se queda como está |
| **M-05** · convención de signo del ISR directo y alcance fiscal | **Sólo calcular bien.** No hay aspiración de cumplimiento formal: el motor tiene que dar el número correcto, y eso ya lo hace |
| **Rebanada 10** · si transferir la propiedad de una empresa puede delegarse | **Sólo el propietario.** No se añade clave al catálogo, que sigue cerrado en 255 |
| **Rebanada 30** · qué se hace con las cuentas existentes marcadas como verificadas | **Se les cree.** Una cuenta verificada en la pila anterior entra verificada |

Resueltas antes: **cómo se propaga la identidad al motor** (rebanada 06, ver D-07 y la bitácora del
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

### 2026-08-17 · La cotización se puede construir

El **constructor**: el editor de líneas con la disponibilidad delante, el cambio de estado y el
registro del retorno. Es la parte que escribe, y cierra las dos tareas que le quedaban a la 14.

**La previsualización no es una aproximación**

El navegador calcula los importes con `computeQuotation`, **la misma función que corre en la API**.
No es una reimplementación ligera para enseñar algo mientras llega la buena: es la del paquete
compartido, así que el requisito de `quotation-pricing` —«la previsualización coincide con lo que el
servidor calculará»— se cumple por construcción y no por disciplina. La tarea decía «retirar el
motor del código del navegador»: no hay motor, hay una importación.

Con el motor viajaron dos reglas más, por el mismo motivo. **La resolución de tarifa**: la
precedencia de `warehouse-catalog` —tarifa de la lista, o precio del producto, o cero— más el ajuste
propio de la medida. Y **la máquina de estados**, para que la pantalla ofrezca sólo lo que existe.

**Y sin embargo el primer intento no cuadraba**

La ficha enseñaba una línea a 700.00 mientras el subtotal, tres centímetros más allá, decía 210.00.
La función era la misma; lo que difería era **el precio que se le entregaba**. El editor resolvía la
tarifa por su cuenta y contra otra lista de precios, así que recaía en el precio de venta en lugar
de la tarifa semanal.

Es el defecto M-06 un paso antes del motor, y merece anotarse porque la lección no es la evidente:
compartir la función no basta si cada lado compone su entrada. Ahora **la línea viaja con su tarifa
ya resuelta**, la que el servidor aplicó, y la previsualización parte de lo que se guardó. Queda
anotado como H-14.

**La existencia se mira antes de guardar, no al guardar**

El servidor rechaza una reserva que no cabe y no aparta nada a medias —eso está probado desde la
13—. Pero enterarse al guardar es enterarse **después** de haberle prometido el equipo al cliente.
El tope de cada línea es lo libre más lo que ella misma tiene apartado: al reconciliar, sus propias
unidades no compiten consigo mismas.

De ahí sale `GET .../rates`, que devuelve tarifa y existencia **juntas**. Separarlas obligaría a la
interfaz a cruzar dos listados y a resolver la precedencia por su cuenta, que es justo lo que
acabábamos de impedir. Exige la clave de editar líneas y no la de mirar: publica las tarifas
negociadas del almacén, y quien puede leer una cotización no tiene por qué ver la lista entera.

**Un botón que responde 409 no es un botón**

El cambio de estado ofrece sólo las transiciones que la máquina admite, y filtra las que no
corresponden al tipo —una venta no pasa «a renta»—. Una cotización cerrada no ofrece editor: su
guardado respondería `409` siempre. Ofrecer y dejar que el servidor rechace convierte una regla del
dominio en un error de formulario.

**El retorno tenía que poder nombrarse**

Completar una renta deja el equipo fuera a propósito: terminar el documento y recibir el equipo son
cosas distintas y pasan en momentos distintos. Registrar el retorno exige decir **qué** unidad
vuelve y en qué condiciones, y para eso hacía falta una ruta que dijera qué tiene fuera la
cotización. Cada unidad por su código, que es lo que lleva escrito la etiqueta de la nave.

**Una tarifa que nadie fijó no se enseña como si la hubieran fijado**

Cuando la lista no tiene tarifa para la periodicidad elegida, el motor cobra el precio base — es la
regla declarada. El buscador lo enseñaba como «por día» sin decirlo, y con la siembra anterior —que
sólo fijaba la semanal— eso significaba ofrecer una cámara a diez veces lo que vale su semana. Ahora
se marca en aviso, y la siembra fija las tres periodicidades. Queda anotado como H-15.

**Comprobado**

TypeScript en los seis paquetes, Biome, **476 pruebas** de vitest y **51 de extremo a extremo**,
seis de ellas nuevas. La primera de esas seis es la que importa: la suma de los totales de línea que enseña
el navegador es el subtotal que enseña el servidor, en la misma pantalla y a la vez.

Y se miró de verdad, que es como aparecieron los dos defectos de arriba. En la ficha en renta:
140.00 más 70.00 más 280.00 son los 490.00 del subtotal, más 78.40 de IVA y 17.05 de comisión,
585.45 a pagar.

Dos notas de entorno. El proceso de la API volvía a estar arrancado sin vigilancia y servía un
registro de rutas anterior — H-13, otra vez. Y **dos ejecuciones de `pnpm test` no pueden
solaparse**: se truncan las tablas la una a la otra, y los fallos que salen no son de ningún cambio.

### 2026-08-18 · Lo que cuesta de verdad una renta

Primer punto de lo acordado tras interrogar el plan: el modelo y el motor.

**Una renta sin tarifa cobraba el precio de venta por día**

La spec lo decía —«recurriendo al precio base cuando la frecuencia no tenga tarifa»— y el precio
base de un producto es el de **venta**. Catorce días de renta cobraban el equipo catorce veces. Lo
que lo convierte en grave no es la regla sino su frecuencia: las listas de precios por día, semana y
mes están sin llenar en la inmensa mayoría de los almacenes, así que ése era el camino **normal**.

Ahora la línea queda **sin precio** y se señala. Spec corregida bajo la regla 4, con su escenario
invertido, y la siembra pasa a llenar las tres periodicidades para que la situación se vea como lo
que es —una lista a medias— y no como un defecto de la pantalla.

**El precio negociado, que no estaba en ninguna spec**

Es el total de una línea para el periodo completo: no se multiplica por los días ni por las
unidades. Sustituye a toda tarifa sin borrarla, de modo que retirarlo devuelve el cálculo anterior.

Trae consigo una consecuencia que conviene ver: **una línea así no tiene precio unitario**. Repartir
3 500 entre tres cámaras da 1 166.67, 1 166.67 y 1 166.66 —tres cifras para tres cosas iguales— o
una redondeada que multiplicada por tres no da 3 500. El tipo lo declara ausente, así que quien
pinte esa columna tiene que decidir qué enseña; el documento pone un guion.

**Y otra vez dos cifras a un palmo diciendo cosas distintas**

El panel de importes enseñaba lo guardado mientras las líneas enseñaban lo que se estaba
escribiendo. Es el mismo defecto que el motor compartido evita, sólo que en la otra dirección: aquí
las dos cifras eran correctas por separado, y por eso ninguna prueba lo habría cazado. El editor
publica ahora su previsualización y el panel la consume, avisando de que todavía no se ha guardado.

**El producto provisional**

`is_provisional` marca el alta hecha desde una cotización. Mientras esté puesta el producto no se
publica, y retirarla exige la clave de catálogo: convertir un alta a medias en producto de catálogo
es dar de alta catálogo, aunque la fila ya exista, porque es el momento en que alguien lo mira y
responde por él. Sin la marca, «ya lo completaré luego» es una intención; con ella es una bandeja.

**Comprobado**

TypeScript en los seis paquetes, Biome, **490 pruebas** de vitest y las de extremo a extremo del
almacén repetidas dos veces cada una. La cadena se miró en pantalla: 3 500.00 negociados más 107.34
de la otra línea son los 3 607.34 de subtotal, y de ahí sale el total con sus impuestos y comisiones
sin haber guardado nada.

Tres pasadas de diagnóstico se fueron en dos trampas de las pruebas de extremo a extremo que no eran
del producto —la siembra de la suite no borra, y «Guardado» no significa que el árbol de servidor se
haya rehecho—. Quedan anotadas en el propio archivo de pruebas y como H-18.

### 2026-08-18 · Lo que se negocia alrededor del precio

Segundo punto de lo acordado: el bloque de condiciones de pago **entero**, y con él el fiscal, que
tenía su ruta y su permiso desde la rebanada 14 y no tenía formulario.

**Guardado sin botón**

El texto viaja al perder el foco, los controles al cambiar. Tres decisiones lo sostienen, y las tres
están probadas fuera de React porque montar un navegador para verlas habría acabado en no verlas:

- **Una petición en vuelo a la vez.** El `PUT` reemplaza el objeto completo, así que dos en paralelo
  se pisan y guarda la que **llega** la última, no la que se escribió la última. Las que lleguen
  mientras hay una en curso marcan que hay que repetir, y al terminar se manda el estado más
  reciente. Los intermedios no viajan porque no hacen falta.
- **Fallar no revierte.** Lo escrito se queda y el aviso aparece. Volver al último valor bueno tira
  lo que la persona acaba de teclear, que es la peor manera de contarle que hubo un problema.
- **Un importe a medio escribir detiene el bloque**, no viaja como ausencia. Si `15` se tratara como
  «no hay», salir del campo borraría del servidor el valor que había.

El editor de líneas conserva su botón, y no por consistencia: guardar líneas **aparta equipo**,
puede fallar por existencias, y cada fallo es un conflicto que alguien tiene que ver. Cambiar un
precio no mueve nada —la reconciliación es diferencial—, pero comparten envío.

**Tres formularios sobre las mismas cifras**

La previsualización pasa a componerse en un solo sitio: las líneas, las condiciones y los impuestos
se juntan y el motor se llama una vez. Que cada formulario compusiera su entrada con su trozo y lo
guardado de los otros dos es H-14 otra vez, un paso antes del motor — no en el cálculo, sino en qué
se le entrega.

**Tres cosas que el motor hacía mal, y una que no hacía**

- El **precio por paquete sustituía a la base**, y la base viene del subtotal, que incluye los
  conceptos adicionales: declarar un paquete hacía **desaparecer** un flete registrado aparte. Ahora
  sustituye a lo que suman las líneas, y los adicionales siguen sumando encima.
- El **descuento por producto se aplicaba «sobre el costo unitario»**, y el costo unitario de una
  renta es la **tarifa**: un diez por ciento sobre una renta de diez días descontaba el uno por
  ciento. En una venta coincide, y el único escenario de la spec era una venta. Ahora baja el
  importe de la línea.
- El mismo campo en **importe fijo** significaba dos cosas según la línea —por unidad con tarifa,
  una sola vez con precio negociado—, con un orden de magnitud entre ellas. Ahora es una sola vez, y
  entonces la línea no informa unitarios, por lo mismo que la de precio negociado.
- El **depósito en garantía se guardaba y no lo miraba nadie**: estaba en el esquema, en la ruta y en
  el tipo de entrada, y el cálculo no lo tocaba. Ahora se informa como contingente, junto a la
  penalización: ni suma ni resta, porque se devuelve.

**Un importe ambiguo en el documento que se firma**

`10.500.00`. La parte entera se agrupaba con las convenciones del idioma y luego se le pegaba un
punto para los decimales; en español el punto ya separa los miles. Sólo se ve a partir de cinco
dígitos y nada sembrado llegaba: apareció al escribir un precio de paquete. El separador decimal lo
pone ahora el idioma.

Queda una pregunta abierta que no me corresponde: el idioma es `es`, que agrupa a la europea
—`10.500,00`—, y esto es un sistema mexicano, donde se espera `10,500.00`. Cambiarlo afecta también
a fechas y a todo lo demás, así que se pregunta antes de tocarlo.

**Las pruebas de extremo a extremo compartían documento**

Escribían sobre las cuatro cotizaciones sembradas, y tanto el guardado de líneas como el de
condiciones de pago mandan el conjunto completo: dos pruebas sobre el mismo documento se borran lo
que la otra acaba de escribir. Peor, registrar un retorno **consume** el equipo de la renta sembrada
y la siembra no lo repone —respeta lo que existe—, así que la suite pasaba una vez y luego mentía.
Ahora cada prueba que escribe crea la suya y se la lleva cancelando primero, que es lo que devuelve
el equipo a la nave.

De paso quedó claro que **`--repeat-each` no es un modo válido para esta suite**: los archivos que no
se tocaron fallan igual. Doblar la concurrencia contra una base compartida no lo aguanta ninguno.
Es la rebanada 9 asomando.

**Comprobado**

TypeScript en los seis paquetes, Biome, **507 pruebas** de vitest —132 de contratos, 59 de base, 37
de web y 279 de API— y **56 de extremo a extremo**, dos pasadas seguidas sin dejar rastro: cuatro
cotizaciones antes y cuatro después. Se miró en pantalla: 9 000.00 de paquete más 1 500.00 de
traslado son 10 500.00 de subtotal, y de ahí 12 545.40 a pagar con el depósito y la penalización
aparte.

### 2026-08-18 · El equipo que ya salió

Tercer punto: congelar las líneas cuando el equipo está fuera, y tapar el agujero que eso destapa.

**Por qué se congelan**

No es una regla de documento. Soltar una reserva devuelve a `available` **sólo lo que estaba
apartado**: el `update` lleva un `where status = 'in_quote'` que existe por buenas razones —una
unidad rentada no vuelve al estante porque alguien edite un papel—. La consecuencia es que bajar
una cantidad en una renta en curso **suelta el vínculo y deja la unidad `rented` sin dueño**:
comprometida indefinidamente, invisible en el catálogo, y sin nadie a quien reclamarla.

Ahora `setLines` rechaza con `409` mientras el equipo está fuera —en renta, o completada con
unidades sin devolver— y la ficha no ofrece el editor: enseña las líneas y dice a dónde ir. El
equipo vuelve por el retorno, que es la única operación que sabe en qué condiciones volvió cada
unidad. El retorno anticipado ya funcionaba y queda declarado en la spec.

**Y el agujero que la verificación no podía ver**

El escaneo de huérfanas miraba `in_quote` a secas. Es decir: el descuadre más caro —equipo que
salió y que nadie reclama— caía **fuera de la comprobación**, y no por descuido de la
implementación sino porque la spec lo enunciaba así, «unidades en estado de cotización». Ahora
recorre `in_quote`, `in_order` y `rented`, y la spec dice «comprometida».

Conviene ver el orden: la congelación evita que se cree desde la aplicación, pero cualquier
descuadre que ya existiera —o que llegue por otra vía— seguía siendo invisible. Las dos cosas hacen
falta, y sólo la segunda mira hacia atrás.

**Cancelar tampoco, mientras haya equipo fuera**

Cancelar proyecta el inventario a disponible. Con el equipo en la calle eso escribe en el sistema
que hay cámaras en el estante que no están, y nadie lo nota hasta que alguien va a buscarlas. Es la
misma guarda que ya protegía la eliminación de la cotización; ahora también la transición.

**Sólo vuelve lo que salió**

El retorno aceptaba cualquier unidad con vínculo vivo, incluidas las apartadas que nunca salieron de
la nave: las soltaba sin pasar por la reconciliación, que es quien sabe qué líneas quedan y con
cuántas unidades cada una. Ahora exige que esté fuera.

**Comprobado**

TypeScript en los seis paquetes, Biome, **520 pruebas** de vitest —137 de contratos, 59 de base, 37
de web y 287 de API— y **57 de extremo a extremo**. La suite se corrió **cinco veces seguidas** sin
dejar rastro: cuatro cotizaciones antes y cuatro después, y la verificación de coherencia del
almacén sin una sola discrepancia. Se miró en pantalla: la renta en curso con sus tres unidades
fuera, la nota de por qué no se editan, y cancelar respondiendo «Hay 3 unidades sin devolver».

### 2026-08-18 · Pactar no es cobrar

Cuarto punto, y el primero de la tanda autónoma. Las decisiones que aparecieron y no eran mías —el
permiso— quedan tomadas por el criterio más conservador y anotadas.

**Dos cifras que no son la misma**

El **anticipo** de las condiciones de pago es lo pactado, y mueve el total del documento. Un **cobro**
es dinero que entró, y mueve el saldo. Estaban confundidos en una sola cifra, y el resultado era que
el sistema no sabía responder a la única pregunta que importa cuando un cliente llama por su cuenta:
cuánto falta.

El saldo se cuenta desde el **bruto**, no desde el total. El total ya descontó el anticipo pactado, y
descontar además lo cobrado contaría dos veces el mismo dinero en cuanto ese anticipo se cobre —que
es el caso normal—. Cuando se cobra y se registra, saldo y total coinciden, y ésa es la comprobación
de que la cuenta está bien planteada.

En la pantalla, el bloque de saldo **sólo aparece cuando hay algo cobrado**: con cero, «Saldo» sería
el bruto entero mientras «Total a pagar» ya descontó el anticipo, y dos cifras distintas sin que
haya pasado nada enseñan a desconfiar del panel.

**Lo pactado se congela; lo que pasa después, no**

Una cotización cerrada tiene sus importes congelados —es lo que permite explicar una cifra de hace
ocho meses—, pero **se sigue cobrando**: una renta que terminó se paga después. Así que lo cobrado y
el saldo se recalculan siempre, incluso sobre un desglose congelado. Un saldo que no se mueve al
recibir el dinero es un saldo inservible.

Es la regla contraria a la de las líneas, y conviene verlas juntas: las líneas se congelan porque
tocarlas movería inventario real; el cobro no, porque el dinero sigue llegando.

**El permiso que no inventé**

Registrar un cobro y negociar las condiciones son actos distintos que suelen hacer personas
distintas, y merecerían claves distintas. Pero el catálogo de permisos es un **conjunto cerrado de
255 claves migradas**, escrito en la spec de control de acceso, y añadir una amplía la superficie de
autorización: es decisión de producto, no de implementación, y menos estando solo. Va con
`warehouses.quotes.edit_payment` y queda anotado en la propia ruta.

**Y un escenario incumplido a propósito**

La spec pide que el comprobante sea consultable. No lo es: falta el almacenamiento de ficheros, y la
tabla de comprobantes lleva en el esquema desde la migración 0002 esperándolo. El registro entra
igual, marcado en la spec como incumplido a propósito, porque llevar la cuenta a mano mientras tanto
es peor que llevarla sin el papel escaneado.

**Comprobado**

Los seis paquetes, Biome, **524 pruebas** de vitest y **58 de extremo a extremo**, dos pasadas
seguidas. Se miró en pantalla: 250,91 de bruto, 120,00 cobrados y 130,91 de saldo, y la baja del
cobro devolviéndolo todo a su sitio.

### 2026-08-18 · El equipo que no está en el catálogo

Quinto punto. El modelo y el permiso ya estaban desde la primera tanda; lo que faltaba era la
pantalla y una lista donde mirar.

**Dónde aparece**

Bajo el «no hay equipo que coincida» del buscador, que es donde se descubre que falta. El caso real
es alguien cotizando con un cliente delante: el equipo existe en la nave pero no en el catálogo, y
mandarle a rellenar cinco pasos en otra pantalla es lo que hace que la cotización acabe a mano en
una hoja de cálculo.

Producto, medida y unidades entran en **una sola petición**, que es una sola transacción. Encadenar
tres llamadas desde el navegador dejaría productos huérfanos —sin medida, o con medida y sin
existencias— el día que la segunda falle, y nadie los volvería a mirar.

**Lo que no pide**

Precio. Para eso está el precio negociado de la línea, que es como se cotiza cuando la lista está
sin llenar; pedirlo aquí obligaría a inventar una tarifa en el peor momento posible para inventarla.
La línea nace señalada como sin precio, que es exactamente lo que es.

**La bandeja**

Un filtro en la rejilla del catálogo, con su distintivo en la ficha. Una pantalla aparte para una
lista filtrable es una pantalla de más. `isProvisional` entra en la gramática de la colección, que
es cerrada y por eso rechazaba el filtro con un `400`.

**Quitar la marca no entra**, y conviene decirlo en voz alta: eso es editar el producto, y el
detalle de producto sigue siendo tarea pendiente de la 29b. Lo que la bandeja da hoy es que sean
encontrables, que es la diferencia entre una intención y una lista.

**Dos procesos de la API peleándose por el puerto**

Costó una vuelta de diagnóstico: el filtro nuevo devolvía `400` en el navegador y pasaba en las
pruebas. Había **dos** procesos con `--watch`, uno heredado de una sesión anterior; el que tenía el
puerto era el viejo, y el nuevo reintentaba en vano. Es H-13 con una vuelta de tuerca, y se anota
como H-27 porque el síntoma —código correcto que se comporta como si no lo fuera— es el mismo que
lleva a dudar del cambio recién hecho.

**Comprobado**

Los seis paquetes, Biome, y **59 pruebas de extremo a extremo** en dos pasadas. Se miró en pantalla:
el diálogo con el nombre ya escrito, la línea con sus dos unidades y su aviso de sin precio, y la
bandeja con sus tres marcados como «Por completar» y «No publicado».

### 2026-08-18 · Alargar una renta sin soltarla

Sexto punto, y el que más se resistió al esbozo. Se implementó como acordamos en lo esencial, con
**una desviación** que conviene revisar cuando vuelvas.

**Lo que no se sostuvo del esbozo**

La extensión iba a nacer `in_progress` nombrando unidades, y a traspasar los vínculos al pasar a
`in_rent`. No se sostiene, por una propiedad del modelo que da gusto tener y que aquí estorba: **la
cantidad de una línea es cuántas unidades sujeta**, no una columna. Una extensión en borrador sin
vínculos vale cero, y no se puede negociar un precio que no se ve. Y si se le traspasan los vínculos
estando `in_progress`, proyecta «en cotización» mientras las unidades están `rented`, de modo que la
verificación de coherencia la marcaría —con razón.

Nace `in_rent`, en una sola transacción. Todos los invariantes se sostienen en cada instante, y el
precio se ajusta después.

**El traspaso**

Es un `update` que cambia de dueño una fila que **sigue viva**: `released_at` no se toca y la unidad
no cambia de estado. No hay fila nueva, así que el índice único parcial se respeta sin esfuerzo y
—lo que importa— **no existe el instante en que la unidad está libre**. Si existiera, otra cotización
podría llevársela mientras está en un rodaje.

Puede ser parcial: lo que no siga se queda con la original esperando su retorno. Y es encadenable.

Se copian la tarifa, la periodicidad y el bloque fiscal. **No** el precio negociado —que es «el
total de la línea para el periodo completo», y arrastrar el de dos semanas a una extensión de un mes
sería cobrar mal y parecer que alguien lo decidió— ni las condiciones de pago, que son de aquel
trato.

**Y una corrección de lo que hice en el punto 3**

Para que la extensión pueda tener precio, hubo que corregir la congelación: yo había congelado las
líneas **enteras**, y lo que se pidió fue congelar el **movimiento de inventario**. Cambiar lo que
cuesta una línea no saca ni mete equipo de la nave. Ahora, con el equipo fuera, se admite el envío
si describe exactamente las mismas líneas con las mismas medidas y cantidades; lo demás se rechaza.
El editor se queda en modo precio: sin buscador, sin quitar líneas, con la cantidad apagada.

**Comprobado**

Los seis paquetes, Biome, **301 pruebas** de la API y **60 de extremo a extremo**, dos pasadas, sin
dejar rastro y con la verificación de coherencia del almacén limpia. Se miró en pantalla: tres
unidades fuera, dos que continúan, la extensión con su ventana nueva y su enlace hacia la original,
y la original quedándose con la unidad que no siguió.

### 2026-08-18 · La bandeja del operador

Séptimo punto: la rebanada 15 entera salvo lo que depende de rebanadas que no existen. El modelo
llevaba en el esquema desde la 03 sin que nadie lo usara.

**Aceptar es atómico, y ése es el cambio de fondo**

La pila anterior creaba la cotización, reservaba el inventario y enlazaba el pedido en pasos
sueltos. Un fallo a mitad dejaba un pedido aceptado sin cotización, o una cotización con reservas
que ningún pedido reclamaba — y las dos cosas no se descubren el día que pasan, sino semanas
después, cuando alguien va a la nave a buscar equipo que figura comprometido con nadie.

Ahora todo ocurre en una transacción. La prueba lo comprueba pidiendo más de lo que hay con
«incluir todo»: la reserva falla y el pedido sigue pendiente, sin cotización y sin unidades.

**Lo que no cabe se dice antes de aceptar**

Cada línea llega con la existencia libre de su medida, así que la ficha señala la falta **antes** de
decidir. Enterarse al fallar la reserva es enterarse tarde: el operador ya le dijo que sí al
cliente. Por defecto entra lo que cabe y se informa de lo que no; incluir todo obliga a autorizar la
creación de inventario, que es la regla de `stock-reservation` y no se relaja aquí.

**El rechazo sube**

Cancelar la orden de compra cuando su último pedido vivo se rechaza evita órdenes zombis. La
comprobación va **dentro** de la transacción que acaba de cancelar uno, de modo que la carrera de la
pila anterior —dos rechazos simultáneos, ninguno el «último»— no puede darse.

**Un código que colisionaba**

El primer intento derivaba el código del pedido de su identificador. Los identificadores llevan el
instante en los bits altos, así que dos pedidos creados en el mismo milisegundo compartían prefijo —
y el prefijo era justo lo que cabía en un código corto. Nueve pruebas fallaron a la vez con un
`500` de clave duplicada. Es aleatorio, con el mismo alfabeto que el resto de códigos.

**Fuera de alcance, a propósito**

La compra pública —el pedido que nace finalizado— y las unidades concretas por línea necesitan el
escaparate, que no existe. La cancelación descendente desde la orden de compra necesita el servicio
de producciones. Quedan cuatro tareas de treinta y tres, todas señaladas con lo que esperan.

**Comprobado**

Los seis paquetes, Biome, **316 pruebas** de la API —quince nuevas— y **62 de extremo a extremo**,
dos pasadas sin dejar rastro. Se miró en pantalla: la bandeja con lo pendiente delante, la ficha
diciendo «2 unidades pedidas · 5 libres» junto a «8 unidades pedidas · sin unidades libres», y
aceptar llevando a la cotización con el folio del pedido.

Un detalle que la limpieza de las pruebas destapó: dar de baja un pedido **desvincula** su
cotización en vez de borrarla —es un documento con importes—, así que una prueba que acepta tiene
que llevarse las dos o deja rastro.

### 2026-08-18 · Lo que quedaba de la décima

Octavo punto. Eran dos cosas: una comprobación que llevaba meses esperando a que existiera algo que
consultar, y los prospectos.

**La comprobación que ya se puede hacer**

«Impedir eliminar una contraparte con documentos vigentes» estaba declarada pendiente desde la
rebanada 10 con su motivo escrito: «hoy no hay nada que consultar, y fingir la comprobación sería
peor que declararla pendiente». Ya hay cotizaciones y pedidos.

Retienen los **abiertos**. Los cerrados no: una venta de hace dos años no debe impedir limpiar la
cartera, y su copia de los datos del cliente vive en el propio documento. El mensaje nombra lo que
la retiene, porque un rechazo que no dice qué mirar obliga a buscar a ciegas.

**Los prospectos, y por qué no son una cuenta a medias**

La tentación es crear el usuario desactivado y ya. No: una cuenta a medias es una cuenta que alguien
acaba pudiendo usar, y además ocupa el correo, de modo que quien luego quiera registrarse de verdad
se encuentra con que «ya existe». Un prospecto vive en su propia tabla hasta que alguien lo
convierte.

Aceptar reutiliza `invite`, que desde la rebanada 04 sabe crear la cuenta verificada y sin
contraseña con su enlace de un solo uso. El enlace **no vuelve en la respuesta**: devolverlo dejaría
entrar en la cuenta ajena a quien acepta.

Y la corrección de L-02 sale gratis por cómo está planteado: la bandeja de pendientes son los que no
tienen `accepted_at`, así que el aceptado sale de ella **por construcción**, sin que nadie tenga que
acordarse de retirarlo — que es exactamente lo que la implementación anterior no hacía.

**Dos guardas del propio repositorio hicieron su trabajo**

La primera: la prueba de cobertura de políticas, la que lleva escrito «no borrar esta prueba». El
bucle que repartió la política de plataforma en la 0005 corrió **una sola vez**, así que la tabla
nueva quedó con las políticas desactivadas — que no es «falla cerrado» sino abierta de par en par.
La 0014 repite el bucle sobre todas las tablas y vuelve a comprobar que no quede ninguna suelta.

La segunda: el candado de la superficie pública. Comprobaba que toda escritura pública cuelgue de
`/auth`, que era un **sustituto** de la frontera real —«ninguna sobre datos de una empresa»— y que
servía mientras todas lo hacían. Un prospecto no es autenticación y no es de nadie. Se comprueba
ahora la frontera de verdad: que el camino no se resuelva contra una empresa, la misma que
`assertScopedByCompany` aplica al cargar el módulo.

**Sin pantalla, a propósito**

El formulario de contacto pertenece al sitio público (29e) y la bandeja necesita un área de
administración de plataforma que no existe. Queda anotado en la tarea.

**Comprobado**

Los seis paquetes, Biome, **327 pruebas** de la API —once nuevas— y **62 de extremo a extremo**.

### 2026-08-18 · Las pruebas dejan de estorbar

Noveno punto, y el que más había costado hoy: seis siembras, cada una precedida de un rato de
desconcierto —«¿por qué no entro?»— hasta recordar que acababa de correr las pruebas.

Las suites de integración truncan sus tablas. Lo hacían sobre la base de desarrollo, así que cada
`pnpm test` borraba los datos con los que se está mirando la aplicación. Ahora hablan con
`tfv_test`, otra base del mismo servidor local, que **se crea y se migra sola** la primera vez.

No hace falta configurar nada: se deriva de `DATABASE_URL` cambiándole el nombre. `DATABASE_URL` se
fija desde la configuración de vitest y no desde la preparación global, porque el cliente la lee al
cargar su módulo y ponerla más tarde llegaría tarde.

**La factura del acoplamiento con el proveedor, en factura**

Una base nueva del mismo servidor no trae el esquema `auth` de Supabase, ni el `extensions` donde
vive `unaccent`. Las migraciones fallaban en la primera línea que los nombra. Hay que reproducir las
dos piezas, y no se inventa nada: son exactamente las que la migración 0006 ya dejó anotadas como
acoplamiento real —«tabla del proveedor y esquema interno suyo… se acepta porque vive en un único
predicado de una única función»—. Que hagan falta aquí es lo que cuesta ese acoplamiento, y verlo
escrito es mejor que no verlo.

**Lo que sigue abierto**

Dos ejecuciones simultáneas se siguen pisando, porque comparten la base de pruebas. Resolverlo
pediría un esquema por ejecución, y el remedio sería más complicado que la enfermedad mientras el
caso sea «se me olvidó que ya la tenía corriendo».

**Comprobado**

**569 pruebas** de vitest —146 de contratos, 59 de base, 37 de web y 327 de API— contra la base
nueva, y la sesión de desarrollo **seguía viva** al terminar, con sus cuatro cotizaciones sembradas.
Que es el punto entero.

### 2026-08-18 · La firma que no se fabrica

Décimo punto, y sólo la mitad que me corresponde hacer solo.

**Lo que no toqué, y por qué**

Sustituir la maquinaria de sesión propia por el servicio gestionado es una reescritura del camino de
autenticación: necesita configuración externa y, si sale mal, deja a todo el mundo fuera. No es algo
que deba hacer sin ti. Sigue pendiente, y sigue siendo lo que cierra la rebanada 04.

**S-01, el defecto más grave del levantamiento**

El manejador anterior **generaba su propia firma y la verificaba**: tomaba el cuerpo recibido, lo
firmaba con el secreto compartido, y comprobaba esa firma que acababa de fabricar. Pasaba siempre.
Como el endpoint no requiere autenticación —correctamente, porque lo llama un tercero—, cualquiera
podía publicar un evento falso y activar una suscripción, cambiar un plan o materializar un pedido
que nadie pagó.

Lo que entra es su contrario, punto por punto: la firma que se verifica es la que **trae** la
petición; se verifica sobre el **cuerpo sin procesar**, y por eso la ruta no declara esquema de
entrada —dejar que el validador lo interprete y volver a serializarlo produce un texto distinto del
que se firmó—; la comparación es de **tiempo constante**, porque `===` sobre cadenas termina en el
primer byte distinto y esa diferencia se puede medir; y hay **ventana temporal**, que es lo único
que delata un evento legítimo capturado y reproducido, porque su firma sigue siendo válida.

**Sin secreto se rechaza todo**

No verificar no es aceptar. Es la lección de S-13, donde el secreto por defecto era la palabra
`secret`: un secreto con valor por defecto es un secreto público. Aquí no hay valor por defecto, en
producción es obligatorio y el servicio no arranca sin él, y fuera de producción su ausencia deja el
endpoint **cerrado**.

**Una sola vez**

El procesador reintenta ante cualquier respuesta que no sea de éxito, así que sin unicidad un
reintento duplica pedidos y pagos (M-03). El evento se reclama **insertando**: el índice único
convierte la carrera en un conflicto, y el conflicto es la respuesta. Comprobar y luego insertar
dejaría una ventana entre las dos cosas por la que caben las dos entregas simultáneas.

Reclamación y efectos van en la misma transacción, de modo que un fallo revierte **también la
reclamación** y el reintento puede volver a intentarlo.

**Lo que no entra**

Los manejadores por tipo —sesión completada, factura cobrada, suscripción modificada, reembolso,
disputa— actúan sobre suscripciones (11) y sobre la compra en tienda (17), que no existen. La tabla
de manejadores está vacía a propósito, y mientras lo esté todo tipo cae en «sin manejador»: éxito y
constancia, que es lo que la spec pide y lo que evita que el procesador acabe desactivando el
endpoint por reintentos indefinidos.

Once tareas de la rebanada hechas; las veintisiete que quedan esperan a esas dos rebanadas.

**Comprobado**

**339 pruebas** de la API, doce de ellas nuevas. No comprueban una función: comprueban que un
tercero no pueda activar suscripciones ni materializar pedidos.

### 2026-08-18 · El flujo del almacén, cerrado por los dos extremos

Cuatro árboles de trabajo a la vez y un tronco. Lo que se cierra no es una pantalla: es que **el
módulo de almacenes se puede usar sin sembrar la base**. Hasta hoy no se podía crear nada desde la
pantalla —ni un almacén, ni una ubicación, ni una categoría, ni un producto, ni una unidad, ni una
lista de precios, ni siquiera una cotización—. El servicio tenía todas las rutas; faltaba la mano.

**Lo que se decidió antes de escribir nada**

Doce preguntas, y dos respuestas que gobiernan el resto:

- **El asistente valida cada paso con el esquema del servidor**, no con una copia. Para eso el
  cuerpo del producto se mudó a `@tfv/contracts`. Duplicar la regla en el cliente es lo que la 28e
  ya había anotado como deuda, y la copia que se queda vieja es siempre la del navegador — que es
  la que decide si el usuario puede seguir.
- **Un diálogo por bloque en la ficha, y el bloque es la unidad de guardado.** Es lo contrario del
  constructor de cotizaciones, a propósito: el catálogo reparte la edición de un producto en cinco
  claves, así que un panel que se guardara solo con campos de tres permisos distintos mandaría
  peticiones que el servidor rechaza a medias. Una cotización se compone; una ficha se corrige.

**Los primitivos que faltaban**

Asistente por pasos —con su máquina fuera de React, diez pruebas—, área de texto, campo de importe
y selector con búsqueda. Dos de ellos escondían un defecto que sólo se ve tecleando:

- **El campo de importe se comía su propio separador decimal.** Escribía el decimal con punto y a
  la tecla siguiente leía ese mismo punto como separador de millar: `12.345,678` acababa en `123`.
  Tres órdenes de magnitud, sin aviso, en la cifra que el cliente firma. Ahora el idioma dice cuál
  de los dos signos es el decimal y el campo **escribe con él**; `toDecimalString` traduce al punto,
  que es como el importe viaja. Es H-22 en la dirección contraria.
- **`Button asChild` derribaba la página entera.** Le pasaba dos hijos a `Slot`, que exige uno. El
  síntoma visible no se parecía a la causa: una dirección inexistente respondía `500` en vez de
  `404`. Lo encontró quien escribía otra pantalla (H-30).

**Lo que el servicio no tenía y hacía falta**

Tres huecos que sólo aparecen cuando alguien intenta usar el sistema de verdad:

- **Corregir una medida no existía** — había alta y baja. Una errata en el nombre sólo se arreglaba
  borrando la medida, y eso borra sus unidades: objetos físicos con su código impreso en una
  etiqueta pegada. Requisito nuevo en la spec (H-28).
- **Añadir una variante a un producto que ya existe tampoco.** Sólo se podían crear hijos en el
  mismo acto que el padre, y una variante nace casi siempre después. La spec ya lo daba por
  supuesto.
- **La baja de un almacén no miraba si había trabajo en curso**, y la spec lo exige con su
  escenario. Se podía dar de baja un almacén con una renta y el equipo en la calle. La casilla
  estaba anotada en la rebanada 12 esperando a las cotizaciones y a los pedidos: existían desde
  hacía dos rebanadas y nadie lo había advertido (H-29).

**Dos barreras nuevas, porque cuatro personas escriben a la vez**

Ninguna comprobaba que los dos idiomas tuvieran las mismas claves, ni que las claves que piden las
pantallas existieran. `next-intl` no falla cuando una clave falta: **enseña la clave cruda** en
mitad del formulario, y eso pasa cualquier revisión porque la pantalla se dibuja entera. Me ocurrió
con dos claves del asistente y lo descubrí tecleando, no leyendo.

**El eslabón que no se puede cerrar todavía**

Crear un almacén exige que la empresa tenga contratado el servicio —y está bien que lo exija—, pero
**contratarlo no tiene ruta**: la única forma de que una empresa tenga servicios es la siembra. El
primer eslabón de «de la empresa vacía a la cotización» está cortado, y taparlo aquí regalaría lo
que la rebanada 11 existe para vender (H-40). El recorrido de extremo a extremo parte de una empresa
sembrada y crea **todo lo demás**.

**Comprobado**

637 pruebas de la suite, más el recorrido completo en el navegador: almacén → categoría → ubicación
→ producto por el asistente de cinco pasos → lista de precios con su asignación → cotización con su
línea y su importe. Y las cuatro pantallas de los árboles de trabajo, cada una verificada por quien
la escribió con dos cuentas de permisos distintos y en ancho de teléfono.


### 2026-08-18 · Los archivos, y cuatro frentes a la vez

Cinco frentes en paralelo: cuatro árboles de trabajo y el tronco. Lo que cierra la sesión es la
**rebanada 08 entera del lado del servidor** —un archivo se registra, se autoriza su escritura y se
confirma— más el selector que la usa desde el navegador.

**Cómo se guarda un archivo**

Subida directa: la API firma una autorización acotada a un objeto y con caducidad, y el navegador
escribe contra el almacenamiento. Los bytes no pasan por el servicio, y por eso ningún endpoint
necesita aceptar cargas grandes. Comprobado contra el almacenamiento **de verdad**, sin dobles,
porque lo que se comprueba es una propiedad suya: la autorización escribe su objeto sin credencial
ninguna, y sobre otro objeto responde que la firma no vale. Si eso no se cumpliera, entregarle la
autorización al navegador sería entregarle el almacenamiento entero.

Tres decisiones que no estaban en la spec y que salieron de escribir el cliente antes que el
servidor:

- **Un archivo son cinco objetos** —el original y cuatro derivados— y **los produce el navegador**.
  La autorización se emite para los cinco de una vez.
- **La confirmación dice qué se escribió**, no si todo fue bien. Un navegador que no descodifica
  `heic` sube el original y ningún derivado: no es un fallo, es lo que ese navegador podía hacer.
  Lo que sí es un fallo es que falte el original.
- **Se puede volver a autorizar** el mismo registro. Que caduque una firma no puede costar resubir
  doce megas.

Las tres las pidió quien escribía el selector, antes de que existiera una línea del servidor. Es el
argumento de escribir el cliente contra un contrato dicho en voz alta: las tres habrían costado
mucho más descubiertas después.

**Lo que apareció**

- **Confirmar una subida era imposible** (H-55): la tabla de archivos tenía política de lectura, de
  alta y la de plataforma, y ninguna de actualización. Confirmar *es* actualizar. Leyendo el modelo
  no se ve; las tres políticas que había parecen las de una tabla terminada.
- **`text-warning` y `text-success` no existían** (H-57), y se usaban en once sitios: todos los
  avisos del constructor de cotizaciones eran invisibles. Al repararlos con las rampas crudas
  pasaron a ilegibles —`yellow.9` da 2.63:1 sobre este lienzo—, así que los papeles entran donde
  debían, medidos.
- **`max-w-xl` mide veinte píxeles** en este tema (H-46), y llevaba tiempo encogiendo el formulario
  de cambio de correo a una palabra por renglón.
- **El cambio de contraseña cierra también la sesión actual**, y la spec decía lo contrario (H-45).
  Corregida hacia lo que el sistema hace, con el requisito de que la pantalla lo advierta antes.
- **La tabla de tipos de archivo estaba escrita dos veces**, en el sistema de diseño y en el
  contrato. Coincidían —las noventa y siete pruebas del paquete pasando contra la del contrato lo
  demuestran— y se unificaron antes de que dejaran de coincidir.

**Lo que queda dicho y sin decidir**

Una **firma de entrega** vive hoy en el mismo cubo de lectura abierta que una foto de catálogo
(H-56), porque el modelo declara la dirección de lectura como pública. Para el catálogo es
correcto; para una firma, nadie lo ha decidido a conciencia, y separarlo pide un segundo cubo con
lecturas firmadas y caducas.

**Comprobado**

742 pruebas antes de la última fusión y las cinco suites en verde después. La base de pruebas
compartida volvió a morder: dos ejecuciones simultáneas se pisan y producen fallos en archivos que
nadie ha tocado (H-12). Se perdió una vuelta de diagnóstico por eso, en los dos lados.
### 2026-08-18 · El documento que el cliente firma

El servicio de documentos, que quedó anotado «para después» cuando se decidió imprimir desde el
navegador. Llega con la primera de sus seis familias hecha —la cotización— y la costura preparada
para las otras cinco.

**Lo que se decidió y por qué**

Imprimir desde el navegador no es una carencia: es lo que hace que **previsualizar, imprimir y
descargar no puedan diferir**. Son la misma hoja y el mismo modelo; descargar es el diálogo de
impresión con el destino «Guardar como PDF». La spec pide que las tres representaciones coincidan, y
aquí no hay nada que mantener de acuerdo porque no hay dos dibujos.

El reparto queda así: el servidor **compone el documento** —qué dice, con qué importes, en qué
orden— y el navegador lo dibuja. La composición es una función pura en `@tfv/contracts`, de modo que
el modelo del documento se declara una vez y no dos.

**Los importes son los de la cotización, no una segunda lectura**

El desglose sale de `breakdownOf`, la misma función que alimenta la ficha: congelado si la
cotización está cerrada, recalculado si sigue abierta. Volver a resolverlo aquí habría sido repetir
H-14 en el documento, que es el peor sitio: la hoja que el cliente firma contradiciendo la pantalla
desde la que se imprimió.

Y el documento **comprueba que cuadra**. Los subtotales de grupo se suman de las filas visibles en
lugar de copiarse del desglose, y si lo que suman no es el total de líneas, la pantalla lo dice
antes de mandarlo — un aviso que no se imprime, porque es nuestro y no del cliente.

**El enlace público, sin estado que mantener**

La referencia es un **sobre firmado**: familia, empresa, ámbito y documento en cuarenta y nueve
bytes, más una firma HMAC. Ochenta y siete caracteres. No hay columna ni tabla que limpiar, el
enlace es estable —el que se mandó hace un mes sigue sirviendo— y alterarlo un solo carácter
responde `404` sin decir por qué.

Lo que **sí** cuesta: no se puede revocar uno suelto, sólo rotar el secreto. La spec no lo pide;
queda anotado (H-64) con el motivo escrito en el propio archivo.

La lectura sin sesión corre bajo `withSystem`, declarando la empresa **que nosotros firmamos**, no
la que pide quien llama. Las políticas del motor siguen aplicándose: un fallo en el manejador no
puede enseñar el documento de otra empresa. Y el candado de la superficie pública se amplió a mano,
con su motivo, que es exactamente para lo que está.

**Tres defectos que sólo se ven en papel**

1. **`max-w-sm` mide doce píxeles** en este tema (H-60): el espaciado llamado `sm` gana a la escala
   de contenedores. La columna de importes salía con una palabra por línea. En pantalla y en papel.
2. **La hoja impresa es más estrecha que una tableta** (H-63), así que todo lo maquetado con
   `tablet:` se apila en el papel. Las dos rejillas del documento se declaran a dos columnas también
   en la regla de impresión.
3. **El pie se quedaba solo en una segunda hoja en blanco.** Se probó a repetirlo en cada página
   sacándolo del flujo, y el navegador lo pintó encima de las firmas. Firmas y pie van ahora en un
   bloque indivisible: caben los dos, o pasan los dos juntos.

**Lo que queda fuera, a propósito**

Las otras cinco familias —nota de entrega, presupuesto, plan de trabajo, recibo de venta e
instructivo de armado— y el visor de guiones. Ninguna tiene todavía entidad detrás: esperan a
producciones (20 y 22) y a Pixit (24 a 26). La costura está puesta: el reparto por familia es un
`switch` sobre la referencia firmada, y una familia sin manejador responde `404` como cualquier otra
cosa que no existe.

La **firma capturada en pantalla** tampoco entra: necesita el control de firma (28e) y
almacenamiento de ficheros (08). El documento imprime el espacio vacío, que es lo que la spec pide
para un documento sin firmar, y hoy se firma a mano sobre el papel.

Y la **hoja de etiquetas de existencias** no se enchufó a este servicio: no existe todavía en este
árbol. Cuando exista, lo que puede reutilizar es la regla de impresión.

**Comprobado**

**611 pruebas** de vitest —158 de contratos, 59 de datos, 352 de la API y 42 de web, **treinta
nuevas**—, `check` y `lint` limpios. Y en el navegador, que es donde se ven los tres defectos de
arriba: las cinco cotizaciones sembradas abiertas como documento, mandadas a imprimir a PDF, con el
nombre del archivo
puesto en el título y devuelto al terminar, y el enlace público abierto en un contexto **sin una
sola cookie**. Alterar la referencia lleva a «este enlace no lleva a ningún documento».
### 2026-08-18 · Lo que se habla alrededor del pedido

Un pedido no se resuelve solo con estados. Se resuelve preguntando si la grúa lleva el cabezal,
avisando de que el camión sale a las ocho y no a las siete, y confirmando que alguien pasará por el
equipo el jueves. Eso es lo que entra: la conversación del pedido, dentro del pedido.

**Lo que no entra, y por qué se dice antes que lo demás**

La spec pide conexión persistente autenticada con difusión entre instancias. No la hay. El
transporte que la sostendría —canal de tiempo real gestionado, o notificación entre instancias del
motor de datos con una conexión dedicada fuera del pozo— pide configuración que este entorno no
tiene, y media conexión a medio funcionar es peor que ninguna: se ve perfecta en las pruebas y se
comporta raro en cuanto hay dos personas.

Entra en su lugar **todo lo que no depende del transporte**, que es la mayor parte, y el transporte
queda detrás de una costura de seis funciones. Sustituirlo el día que haya con qué es escribir otra
implementación de esa interfaz; la pantalla no se entera. Anotado como H-60.

**Dos cursores, porque son dos preguntas**

Hacia atrás —el historial— se camina por identificador, que en este sistema ya ordena por tiempo: el
más antiguo que ya tienes es el sitio exacto por donde seguir, sin instantes que redondear.

Hacia adelante no basta con los mensajes nuevos: hay que enterarse de los que se **editaron** y los
que se **borraron**, y ésos son viejos. Se camina por instante de modificación, y ahí aparece la
parte que no se ve venir: la base guarda microsegundos y el cursor viaja en milisegundos, así que un
mensaje con microsegundos distintos de cero queda **siempre por delante de su propio cursor** y se
entrega en cada consulta, para siempre. Se compara truncado al milisegundo, que es la precisión que
sobrevive al viaje.

Y al revés: un mensaje que **confirma** en la base después de que la consulta tomó su instante
quedaría por detrás del cursor y no aparecería nunca en ninguna pantalla. Por eso quien pregunta
retrocede dos segundos cuando ya no tiene cola. Recibir dos veces lo mismo no cuesta nada —se
reconcilia por identificador—; perder un mensaje sí.

**Los acuses son del lado, no de la persona**

Si tres personas del almacén están en la conversación y una lee, queda leído para el lado del
proveedor. Es lo correcto aquí: el cliente quiere saber si *el almacén* lo vio, no quién
concretamente. El acuse mueve el instante de modificación del mensaje, y por eso el otro lado se
entera por el mismo cursor con el que se entera de todo lo demás — sin eso, un acuse sería invisible
hasta que alguien volviera a escribir.

Editar y borrar sí son de la **persona**: reescribir lo que dijo un compañero es ponerle palabras en
la boca.

**El lado se le pregunta al motor**

Si el almacén se te enseña, eres quien surte; si la contraparte del pedido es tuya, eres quien pidió.
Las dos respuestas salen de las mismas políticas que gobiernan el aislamiento, así que no pueden
decir una cosa distinta de la que dice el motor. La pantalla del lado cliente vive en producciones y
no existe todavía (H-64), pero el lado ya se resuelve y tiene su prueba: cuando llegue, hace falta
una ruta, no reescribir esto.

**La clave que no existe**

El catálogo cerrado no tiene ninguna para conversar. Mirar va con `warehouses.orders.view` y escribir
con `warehouses.orders.edit`, que deja fuera a quien sólo mira. Es la elección conservadora, y no
obviamente la correcta: colapsarlas ampliaría en silencio la autoridad de quien tenía la general, que
es el error que ya costó una corrección en H-07. Anotado como H-62.

**Dos ventanas, y lo que sólo se ve mirando**

Rosa y Ale, dos cuentas, el mismo pedido. Mandar, editar, borrar, marcar leído, cortar la red y
devolverla. Todo lo que hacía falta comprobar se comprobó, y apareció lo que ninguna prueba habría
cazado: **los nombres de la escala de anchura de este sistema de diseño son espaciado**. `max-w-md`
no son 28rem, son 0.842rem. El aviso del sistema salía en columna, una palabra por línea, y el
síntoma parecía de centrado. Medido en el navegador, no supuesto — y ya había una pantalla en pie
con el mismo nombre (H-63).

**Comprobado**

**629 pruebas** de vitest —157 de contratos, 59 de base, 51 de web y 362 de API—, cuarenta y ocho
de ellas nuevas. Y la comprobación que ninguna de ellas hace: la conversación abierta dos veces, con
dos cuentas, hablando consigo misma.

La primera prueba del archivo no es de comportamiento: es la frontera. Nadie lee la conversación de
un pedido ajeno —ni por la ruta del proveedor, ni desde su propio almacén, ni por debajo de la
aplicación—, y está escrita antes que ninguna otra.

### 2026-08-19 · Las fotos del catálogo, de punta a punta

La rebanada 08 tenía servidor y cliente y **ninguna pantalla los usaba**. Ahora se sube una foto
desde el asistente de alta, desde la ficha del producto, y desde el alta y la edición de un almacén
y de una ubicación. Con ellas entra la corrección que faltaba del bloque de correcciones.

**La galería del producto es una tabla, y la portada es una marca**

`warehouse_products` no tenía columna de imagen. El almacén, la ubicación y la categoría sí, pero la
spec habla de «un producto con las imágenes A, B y C»: una columna no sirve. La forma es la de
`pixit_product_images` con una marca de portada añadida, porque **reordenar y elegir portada son dos
decisiones distintas**: atarlas obliga a arrastrar una foto hasta el principio para que sea la que
se enseña, que es justo lo que nadie quiere hacer con una galería de doce. Una portada por producto,
garantizada por un índice único parcial y no por quien envía.

**L-01, dicho como lo que es**

Al sustituir una colección, la implementación anterior **intersecaba** en vez de diferenciar:
borraba los que seguían estando y dejaba huérfanos los retirados. Actualizar de A, B, C a A, D
borraba A —la que se quería conservar— y dejaba B y C ocupando almacenamiento para siempre. Las dos
mitades del error se compensan en el recuento, y por eso nadie lo vio: seguían quedando dos
archivos. La prueba mira **las dos listas**.

Tres razones para no borrar, y las tres se comprueban: sigue en la colección, lo referencia otra
entidad, o es un marcador de posición. La segunda no la responde una lista escrita a mano de las
**treinta y dos** columnas que hoy apuntan a `uploads` —esa lista se queda vieja en silencio la
primera vez que alguien añada una entidad con foto— sino el motor, que tiene las claves foráneas en
su catálogo. Va `security definer` porque la pregunta cruza tablas de otros arrendatarios: una
comprobación que no las ve responde «no la referencia nadie» justo antes de borrar la foto de otro.

Vive en `apps/api/src/media/` y no dentro del catálogo, porque lo llaman ya cuatro sitios y copiar
**esta** regla en concreto es copiar el defecto que corrige.

**Y el defecto que sólo aparece usando la pantalla**

Subir una foto, quitarla, y pedir su dirección: seguía respondiendo. El endpoint de borrado del
proveedor recibe un campo llamado `prefixes` y **no borra por prefijo**, borra por clave exacta.
`removeObjects` le pasaba `empresa/archivo`, el almacenamiento respondía `200`, y los cinco objetos
se quedaban ahí sin fila en la base que los reclamara — así que ni el recolector volvería a mirarlos.
Afectaba también a la recolección de subidas abandonadas. Ahora se pregunta primero qué hay bajo el
prefijo y se borra por clave, que además resuelve que las extensiones no se puedan dar por sabidas.
Es H-71, y leyendo el código era correcto.

Con él, otros dos que tampoco se leen: la ficha pintaba las fotos recién subidas con una dirección
vacía hasta recargar —ahora la galería se rehace con la respuesta del servidor— y la vista previa
del selector se rompía al cambiar de paso del asistente, sólo en desarrollo, porque el ciclo de
comprobación de React revoca las direcciones recién creadas y la marca de «de éste ya me ocupé»
sobrevive a esa limpieza (H-72).

**Una pantalla terminada a la que no enlazaba nadie**

`products/new` aparecía una sola vez en toda la aplicación: dentro de su propia página. El asistente
de alta de producto estaba entero —cinco pasos, sus permisos, su guarda— y la única forma de llegar
era escribir la dirección. Es H-70, y es el mismo motivo por el que este encargo pide abrir el
navegador: no se ve leyendo código.

**Subir va después de guardar, siempre**

La escritura va directa al almacenamiento y puede fallar por su cuenta. Al revés, una foto caída se
lleva por delante los cinco pasos que la persona acaba de rellenar; así, lo peor que pasa es un
producto creado sin fotos, y añadirlas desde su ficha ya funciona. Y una tanda con fallos no se da
por buena: se guarda lo que sí subió y se dice cuántas quedan por reintentar, porque revertir
tiraría las que sí llegaron.

**Quitar la imagen y no tocarla no son lo mismo**

Omitir el campo la deja como está; `null` la retira. Confundirlos hace que guardar el nombre de un
almacén le borre la foto, y nadie relaciona lo uno con lo otro. Es una función pura con sus cuatro
casos probados, igual que el resto de lo que decide algo: mover una foto, quitarla y saber qué
portada queda viven en `~/lib/gallery.ts` y el componente sólo cablea eventos.

**El permiso que no inventé**

El catálogo de 255 claves **no tiene ninguna de archivos**. La galería va con
`warehouses.products.edit_info` —las fotos son la información del producto dicha en imágenes, donde
ya viven el nombre y la descripción— y las imágenes del almacén y de la ubicación con las de su
edición, que ya existen. Anotado como H-73: añadir claves propias amplía la superficie de
autorización y es decisión de producto.

**Comprobado**

Los seis paquetes, Biome, y **789 pruebas** de vitest —160 de contratos, 62 de base, 97 del sistema
de diseño, 74 de web y 396 de API—, con veinticinco nuevas. Y en el navegador, sobre la base de
desarrollo y devolviéndola a como estaba: se creó un producto con su foto desde el asistente, se le
añadieron dos más desde la ficha, se cambió la portada, se reordenó y se quitó una — y el objeto de
la retirada dejó de responder. La imagen de un almacén y la de una ubicación, lo mismo, incluida la
retirada. Los cinco objetos por imagen se sirven con su tipo: el original en `png` y sus derivados
en `jpg`.

### 2026-08-18 · La bitácora, la bandeja y el despachador que faltaba

Rebanada **09 · `migrate-activity-and-notifications`**, y con ella la pieza que dos rebanadas
llevaban esperando.

**El asiento va dentro de la transacción, y eso es todo el requisito**

`recordActivity` recibe la transacción de quien muta. De ahí salen las dos mitades sin escribir una
línea más: si la mutación se revierte no hay asiento, y si el asiento no se puede escribir la
mutación no se confirma. La implementación anterior emitía la actividad sin esperarla y descartaba
sus errores, de modo que una operación podía completarse sin dejar rastro y nadie lo sabía.

Y una acción denegada no registra nada **sale gratis**, por dónde vive la compuerta de permisos:
en el middleware, antes del manejador. Un `403` no llega a ejecutar nada.

**La misma clave autoriza y selecciona**

La audiencia son los miembros cuyo rol concede **todas** las claves que la acción declara, más los
propietarios —tengan el rol que tengan, porque la propiedad no es un permiso sino la vía que los
elude—, menos el autor. Es el vínculo que la spec pide con `access-control`: hasta la rebanada 05
los permisos seleccionaban audiencia sin autorizar nada (`DEFECTS.md` S-07), y desde entonces
autorizaban sin seleccionar. Ahora hacen las dos cosas y son la misma cadena literal.

**El despachador, y por qué una tabla**

No había ninguna cola en el repositorio, y dos piezas escritas y probadas llevaban meses sin que
nadie las llamara: el recolector de subidas abandonadas (08) y la verificación de coherencia de
existencias (13, H-11). Un temporizador las llamaría; lo que no sabría es cuándo corrió la última
vez, ni sobrevivir a un reinicio a mitad, ni dejar constancia de un fallo.

Cuatro estados, un intento contado **al tomar** el trabajo —para que un proceso que muera a mitad
deje constancia—, `for update skip locked` para que dos despachadores no se lleven el mismo, espera
creciente y acotada, y `failed` como final visible. Un trabajo que espera reintento no es un estado
más: es `queued` con `attempts` y `run_at` en el futuro.

Las doce pruebas del despachador comprueban sobre todo **cómo falla**: que reintenta, que se rinde,
que un trabajo que revienta no se lleva por delante al que va detrás, que uno sin manejador no gasta
cinco intentos, y que el que quedó en curso se recupera. Una cola que nadie vio fallar no es una
cola.

**El defecto que apareció al escribir la prueba que se me pidió**

«El recolector nunca toca un archivo referenciado» era una propiedad que **no se cumplía**.
`collectAbandoned` elige por antigüedad y estado, y no mira si algo apunta al archivo. De las
treinta y dos claves foráneas que llegan a `uploads`, cinco propagan el borrado —una foto de
utilería, una imagen de locación, **el comprobante de un pago**— y las otras veintisiete dejan la
referencia en nulo.

Comprobado contra la base antes de tocar nada: la fila de `location_images` desaparecía. Una entidad
guardada antes de que llegara la confirmación se llevaba por delante su propia fila veinticuatro
horas después, y el síntoma —una foto que falta— no se parece en nada a la causa.

La guarda va en el **motor** y no en el recolector, por dos razones: allí es una convención y aquí
es una garantía que hereda cualquier otro camino que borre un archivo; y la lista de quién
referencia la lleva el catálogo, así que una tabla nueva con una foto queda protegida el día que se
crea. Se **omite** el borrado en lugar de fallar: fallar revertiría la recogida entera, y un solo
archivo referenciado dejaría la limpieza sin ocurrir para siempre. Queda un resto anotado (H-75):
los objetos del almacenamiento se retiran antes del borrado, y eso sólo se arregla dentro de
`uploads.ts`.

**Alcance acotado a propósito: un canal que funciona**

De los tres canales entra entero el de **bandeja**. Empuje y correo necesitan configuración externa
que este entorno no tiene, y fingirla habría dado tres canales a medias. La costura es
`registerTransport`, y lo que hay detrás está probado con un transporte que falla adrede: la
operación de negocio se completa, la entrega queda encolada, se reintenta y **no se duplica**.

Una entrega de un canal sin proveedor **se queda en la cola** y no cuenta como fallo. No ha fallado
nada: falta un proveedor, y llenar de ruido la única lista que hay que mirar es la forma de que
nadie vuelva a mirarla. Las de recuperación de contraseña y verificación de correo llevan encoladas
desde la rebanada 04 y siguen ahí, esperando la misma cuenta.

**Dos correcciones a la spec**

- **La bandeja no es un canal apagable** (H-77). Con ella apagada, una actividad de cuya audiencia
  alguien forma parte no le deja rastro en ninguna parte mientras el resto de la empresa sí la ve.
  La elección se acota a los canales salientes; la bandeja es el registro.
- **El aviso de novedades se reinicia al abrir la bandeja**, no al disminuir el contador (H-78). Con
  la regla anterior, marcar una como leída borraba el aviso de las otras cuatro recién llegadas.

**Dos huecos del motor que sólo aparecen con el código delante**

- La política de escritura de las entregas no dejaba al destinatario **marcar la suya como leída**
  (H-76). El síntoma habría sido una fila que no cambia, sin error: una política que no deja pasar
  no falla, no encuentra la fila.
- `withSystem(operación, [])` **no es «sistema»** para el motor (H-79): `app.is_system()` pregunta
  por el alcance de empresas, y un trabajo global no declara ninguna. Hizo falta
  `app.declares_operation()`, que distingue lo que de verdad separa una operación de sistema de una
  petición de usuario.

**Comprobado**

Los seis paquetes, Biome sobre lo propio, y **793 pruebas** de vitest —160 de contratos, 97 del
sistema de diseño, 68 de datos, 414 de la API y 54 de web—, con las migraciones replicadas **desde
cero** tras borrar la base de pruebas. Cuarenta y dos son nuevas: 9 de datos, 12 del despachador, 7 de sus trabajos y 23 de la
bitácora y la bandeja.

**Una trampa de la base compartida, otra vez.** La primera pasada del conjunto entero falló con
sesenta y tres pruebas rotas en archivos que nadie había tocado, justo después de haber tenido el
servicio levantado contra la base de pruebas: sus conexiones seguían sujetando filas cuando la suite
fue a truncar. Es H-12 con otra cara — **con un servicio apuntando a la base de pruebas, la suite no
se puede correr**—. Apagado, la misma pasada da 793 en verde.

Y se miró en pantalla, con la aplicación levantada en puertos propios: la campana anunciando «3 sin
leer», marcar y archivar moviendo la fila entre filtros, el filtro de la bitácora llevándose la
dirección —de 6 asientos a 2—, el interruptor de empuje apagado y sin poder encenderse, y la autora
de los cambios **sin una sola notificación** de lo que hizo ella.

**Lo que queda de la rebanada**

Los dos proveedores, las ~35 rutas de escritura que aún no dejan asiento (H-82), y la clave de
permiso propia de la bitácora, que hoy usa la más cercana porque el catálogo está cerrado (H-81).

### 2026-08-19 · Lo que cuesta llevárselo

Rebanada **17 · `migrate-shipping-rates`**, de 0 a 29, más la parte de `order-fulfillment` que
cierra el ciclo de un envío. La 18 la esperaba.

**El motor va al paquete compartido, y por el mismo motivo que el de cotizaciones**

`computeShipping` es una función pura en `@tfv/contracts`, con un caso por escenario de la spec. El
defecto M-11 era el algoritmo **copiado palabra por palabra** en el servidor y en el navegador, con
las tarifas escritas en el código: cambiar una tarifa pedía dos despliegues y, entre uno y otro, la
estimación que veía el comprador no era lo que se le cobraba. Una implementación no puede divergir
de sí misma.

Las tarifas entran como dato, no como constante del módulo. `DEFAULT_SHIPPING_RATES` es el cuadro de
la spec y sirve para que una empresa recién dada de alta pueda cobrar envíos antes de que nadie
entre a configurarlos — no para calcular a espaldas de su cuadro.

**Los pesos no son dinero, y aun así tienen que ser exactos**

El dinero sale de `money.ts` y no se toca. Pero una libra son `0.453592` kilogramos y un peso
volumétrico es una división: con coma flotante, dos libras dan `0.9071839999999999` y el peso
facturable —el mayor entre el real y el volumétrico— se decide comparando números que nadie
escribió. Así que las magnitudes llevan su propia aritmética decimal sobre enteros grandes, y se
fijan a seis decimales **antes** de multiplicar la tarifa: es lo que hace que quien multiplique a
mano el peso facturable que ve escrito obtenga el importe variable que ve escrito.

La distancia sí es coma flotante, y a propósito: sólo se compara con un umbral y jamás multiplica un
importe.

**El defecto que apareció al escribir la prueba de que la estimación coincide con el cobro**

No se comprueba con dos números escritos a mano: se ejecutan **las dos vías reales** —la ruta que
consulta la interfaz y `estimateShipping` dentro de una transacción de sistema, que es como lo
llamará la 18— y se comparan los totales. Dieron `519.00` y `599.00`.

La causa: la lectura de `user_addresses` la concede su dueño **o una compra que apunte a ella**. Sin
compra que lo enlace, la materialización no ve el domicilio del comprador, la consulta sale vacía y
el cálculo lo tomaba por «sin coordenadas» —el caso que la spec manda calcular sin recargo—. El
envío perdía sus ochenta pesos de recargo por distancia y el importe seguía pareciendo plausible.
Faltar coordenadas y no ver la fila son dos cosas distintas y sólo una es normal: ahora la segunda
detiene el cálculo (H-98).

**El envío deja de ser cosa sólo del sistema**

La `0005` dejó la escritura de `shipments` con `app.is_system()`, correcto mientras lo único que le
pasaba a un envío fuera nacer. Marcarlo entregado a la paquetería lo hace una persona con su sesión,
así que la `0020` admite además a la empresa dueña del pedido y el manejador corre por
`withRequester`. El predicado **atraviesa hasta `companies`** en lugar de apoyarse en `buyer_orders`:
la lectura del pedido es más ancha que su escritura —el comprador lee el suyo—, y apoyarse en ella
habría dejado al comprador darse por servido (H-99).

El alta sigue siendo del sistema, y no es un descuido: el envío nace antes de que nada lo apunte.

**Una spec que no decidía**

«La recolección SHALL tener costo cero» y, dos requisitos más abajo, «el envío SHALL llevar un
recargo cuando supere los tres artículos», sin acotar modalidad. Una recolección de quince piezas
cumplía los dos y costaba cincuenta pesos. Corregida la spec, con sus escenarios (H-100).

**Llamable desde fuera, y dicho**

`estimateShipping(tx, …)` recibe la transacción y no la abre. El manejador de
`checkout.session.completed` que la rebanada 07 dejó pendiente sólo tiene que llamar ahí, dentro de
su propia transacción y con las mismas tarifas con las que se estimó. La 18 no necesita escribir
nada de cálculo.

**Lo que queda fuera, a propósito**

La estimación para un comprador **sin sesión** en una tienda pública. El cálculo está listo para
ella; resolver la tienda por su subdominio y decidir qué se enseña sin sesión es la rebanada 19, y
adelantarlo como una ruta pública suelta habría fijado esas decisiones desde el sitio equivocado
(H-101). Y las dos copias del algoritmo que la lista de trabajo manda retirar viven en
`tfv-frontend/`, que la regla 1 deja intacto: en la pila nueva no hay ninguna.

Los permisos son los más cercanos del catálogo cerrado, que no tiene ni uno de envíos (H-96, H-97).

**Verificación**

`pnpm test` en verde con **982** pruebas, 64 más que las 918 de partida: 31 del motor y 7 de la
máquina de estados en contratos, 7 de aislamiento en datos —incluida la política nueva, comprobada
en los tres lados— y 19 de extremo a extremo en la API. `pnpm check` y `pnpm lint` limpios. La
pantalla, ejercitada en un navegador: bajar la base local de `99` a `49` y ver el cálculo siguiente
pasar de `119.00` a `69.00` es el requisito «se cambia una tarifa sin desplegar», mirado.

### 2026-08-19 · La plataforma, con dónde administrarse y con qué responder

Un **área de administración de plataforma**, que no existía. Cierra lo que quedaba abierto de la
rebanada **10** —la bandeja de prospectos llevaba desde entonces implementada en el servidor y sin
pantalla— y la consola de la **29a**, con lo que le falta anotado.

**Por qué era otra navegación y no una sección más**

Lo que se mira aquí **atraviesa a todos los arrendatarios**. Ponerlo entre «Miembros» y «Roles» de
una empresa concreta habría invitado a confundir el alcance de lo que se está viendo, que es
exactamente la confusión que hay que evitar cuando la pantalla enseña datos de todos. Así que
`/platform` tiene su propio armazón, su propia navegación y una salida explícita.

Y un prospecto no cabía en el panel de ninguna empresa por la misma razón por la que su formulario
público está en la raíz: **no es de nadie** hasta que alguien lo convierte en cuenta.

**La elusión no se amplía: se usa**

La marca de administración de plataforma existe desde la rebanada 04 y la resuelven dos capas: la
sesión la trae de `users.is_platform_admin`, y el motor la vuelve a resolver por su cuenta con
`app.is_platform_admin()`. Aquí no se calcula nada nuevo. Las tres lecturas del área corren bajo
`withRequester` con la identidad de quien pregunta, **no por la vía elevada**, y la diferencia es lo
que queda si mañana alguien borra la comprobación de un manejador: un usuario corriente vería sus
propias empresas —que ya puede ver— en lugar de las de todos.

Cada ruta lleva su prueba de que un usuario corriente recibe `403`, y se comprobó también **con el
navegador**: `admin@tfv.dev` entra en las cuatro pantallas; `duena@tfv.dev`, que no es de
plataforma, no entra ni por el enlace —que no se le pinta— ni escribiendo la dirección, donde la
guarda del armazón la devuelve al panel y la API responde `403` a la petición que iba debajo.

**El poder que no deja rastro**

«Toda acción realizada bajo esa condición SHALL registrarse», dice `access-control`. Y la bitácora
que lo cumple **no podía registrar la mitad de ellas**: `company_activities.company_id` es no nulo,
y debe serlo —de ahí sale que su política se exprese contra el alcance del arrendatario—. Aceptar un
prospecto crea una cuenta que todavía no pertenece a nadie: no había dónde escribirlo, así que no se
escribía.

Se amplió la spec y se añadió `platform_activities` en la **0024**. No se aflojó `company_id` a
nulo: meter un caso especial dentro de un predicado de aislamiento es por donde se filtra. Es la
**única tabla del esquema sin política de arrendatario**, y su ausencia es la decisión —o la lee la
administración de plataforma o no la lee nadie—, y de sólo anexado por retirada de permiso, como la
de empresa. Aquí importa más que allí: quien la protagoniza es quien tiene la llave de todos los
arrendatarios (H-120).

Aceptar, corregir y descartar un prospecto escriben su asiento **dentro de la misma transacción que
la mutación**. Un `403` no escribe nada, y eso sale gratis por dónde vive la comprobación.

**El recuento que salía cero para todo el mundo**

`memberCount` daba `0` en el padrón entero. En la lista de selección, Drizzle emite las columnas
**sin cualificar**: `where m.company_id = ${companies.id}` se convierte en `where m.company_id =
"id"`, y dentro de una subconsulta sobre `company_members` —que también tiene una columna `id`— eso
resuelve contra la subconsulta. La correlación se rompe sin error. En un `where` sí se cualifica,
así que el mismo fragmento funciona en un sitio y miente en otro (H-122).

**Lo que queda fuera, y por qué**

- **Escribir datos de una empresa desde plataforma.** Leer sí; escribir es otra decisión y no tiene
  clave que la respalde. Los dos padrones no traen un solo botón que escriba.
- **Ampliar el catálogo de 255 claves.** El área entera se apoya en la marca y no en un permiso,
  igual que ya hacían la taxonomía global y la transferencia de propiedad. Delegarla a un rol pide
  una clave nueva y desalinearía el catálogo migrado: es la misma decisión pendiente de producto
  (H-121).
- Las dos superficies de plataforma que sus specs piden y sus rebanadas de servidor todavía no
  tienen: **reprocesar un evento de cobro** (`payment-webhooks`) y **habilitar servicios de una
  empresa** (`companies`).

**Verificación**

`pnpm test --force` en verde con **1118** pruebas, 21 más que las 1097 de partida: 17 del área en la
API y 4 de aislamiento en datos —la tabla nueva leída, escrita y rechazada desde los tres lados—.
`pnpm check` y `pnpm lint` limpios. Y el recorrido completo en el navegador, con la aplicación
levantada en puertos propios y contra una base propia: un contacto entrando por el formulario
público sin sesión, corregido y aceptado desde la bandeja, la cuenta apareciendo verificada en el
padrón, el prospecto saliendo de la bandeja por construcción, y los dos asientos —«Prospecto
corregido» y «Prospecto aceptado»— con quién los hizo y sobre quién.

**El bloque de progreso, vuelto a medir.** Traía cifras de hace varias tandas: las rutas decían 182
y son 190, las pantallas 48 y son 53. Dos estaban mal de origen y se corrigen: los **enumerados** son
50 y no 62 —hay exactamente 50 `pgEnum` en el esquema y 50 tipos enumerados en la base— y los
**únicos parciales** 41 y no 48, contados como índices únicos con predicado. Decir un número que no
se ha medido es la clase de cosa que este documento existe para no hacer.

### 2026-08-19 · Lo que se construye es lo que se sirve

Rebanada **19 · `migrate-websites-and-site-builder`**, la mitad que faltaba: **el constructor**. Los
sitios, la resolución por subdominio y la tienda ya estaban; lo que no había era con qué decidir qué
enseña esa tienda. De 21 a 38 de 49.

**La regla se escribe una vez, o la vista previa es una promesa que nadie comprueba**

La spec pide que la vista previa use «el mismo renderizado que el sitio público, de modo que lo que
se ve sea lo que se sirve». Eso no se consigue escribiendo dos implementaciones cuidadosas: se
consigue con una. Están en `packages/contracts/src/sections.ts` —qué tipos existen, cuál se omite,
en qué orden va, cuál de las personalizaciones manda hoy— y las usan el servidor para componer lo
que sirve y el navegador para componer lo que previsualiza.

En el servidor la costura es más estrecha todavía: `publicSitePage` y `previewSitePage` se
diferencian **sólo** en cómo llegan hasta la fila del sitio —una atraviesa las tres compuertas sin
credencial, la otra exige permiso— y de ahí en adelante llaman a la misma función. La prueba que lo
cubre no lee las dos implementaciones: **pide las dos respuestas y las compara**. Rota a mano la
composición, tres pruebas se ponen rojas.

Y en el navegador, el mismo componente pinta las dos: la portada de `/s/[slug]` y el marco de la
vista previa reciben `SiteSections`. Lo que cambia fuera es el borde.

**Reordenar es aritmética, no un evento del ratón**

Mover una sección de la tercera posición a la primera no tiene nada que ver con el puntero, y una
aritmética que sólo se puede ejercer arrastrando con la mano no la prueba nadie: los casos que
fallan —soltar sobre uno mismo, salirse de la lista, el movimiento hacia abajo, que no es simétrico
del de arriba— se descubren el día que alguien pierde una sección. La máquina está en
`packages/ui/src/lib/reorder.ts` con **22 pruebas** y el componente sólo traduce seis eventos del
puntero y dos teclas en llamadas a ella. Las flechas mueven la fila por la misma función que el
arrastre, así que la lista se puede ordenar sin ratón.

**Las secciones se escriben enteras, y no por casualidad**

El modelo guarda las secciones como un `jsonb` **sin identidad por elemento**. Eso decide tres cosas
seguidas: reordenar es mandar el arreglo en el orden que se quiere y que el servidor lo numere —no
hay ruta de reordenación, porque no hay a qué sección referirse—; un botón de desplazamiento sólo
puede apuntar a **un tipo de sección**, que es la única identidad estable que existe (H-114); y el
constructor le pone a cada fila una clave que vive sólo en el navegador, porque la posición es justo
el dato que está cambiando.

**Un tipo desconocido se guarda y se omite**

La spec dice qué hacer con él al renderizar: omitirlo sin romper la página. Rechazarlo al escribir
habría sido lo contrario de eso — un sitio trasvasado de la pila anterior no podría guardar ni la
corrección de una errata hasta que alguien borrara a mano la sección que estorba (H-117).

**El defecto C-09, cerrado por donde se veía**

`website/customize/delete.ts` borraba de la colección de **sitios** en vez de la de
personalizaciones: quien retiraba la campaña de diciembre se quedaba sin tienda. La prueba que lo
cubre no comprueba que la personalización desaparezca —eso lo comprueba otra—: comprueba que **el
sitio sigue respondiendo** después.

**Tres decisiones que la spec dejaba abiertas, adoptadas y anotadas**

El desempate entre campañas solapadas —gana la que empezó más tarde, y a igualdad, la de
identificador menor (H-116)—; que un sitio no se pueda quedar sin primaria, porque «la primera es
primaria» y «eliminar la primaria promueve otra» sólo tienen sentido si siempre hay una (H-115); y
la identidad de una sección, ya dicha (H-114).

**Comprobado en un navegador de verdad**

Construir arrastrando, guardar, publicar y abrir la tienda en una ventana **sin sesión**: seis
secciones sembradas por la vertical de almacén, «Características» arrastrada con el ratón de la
cuarta posición a la primera, un título editado que la vista previa enseñó sin guardar, y la tienda
pública sirviendo `features · hero · categories · products · faq · footer` con el mismo texto y cero
cookies en el contexto del visitante.

No se pudo hacer contra la base de desarrollo: **no tiene planes de suscripción ni ninguna categoría
de vertical**, así que la segunda compuerta cierra para toda tienda y todo sitio nace «en
construcción» (H-91 y H-92, ya abiertos). Se hizo contra la base de pruebas propia, que sí se puede
poblar. Mientras la siembra no cree esas dos cosas, la tienda pública no se puede ver en desarrollo
por mucho que funcione.

**Fuera de alcance, dicho a propósito**

La **portada de marketing** y la **tienda de mosaicos** no entran. La segunda es de Pixit, que está
pausado; el modelo la reconoce como vertical y su sitio se sirve como página en construcción, que es
lo que la spec pide para una vertical sin páginas propias.
### 2026-08-19 · Los marcadores que faltaban, y la puerta a S3

Dos cosas, y la segunda la pidió el propietario: cerrar lo que le faltaba a la rebanada 08 y dejar
que el almacenamiento se pueda cambiar sin reescribir nada.

**Un marcador de posición que sólo existía en la salvaguarda**

La `0017` trae un disparador que se niega a borrar un marcador, y `collections.ts` lo respeta con su
prueba. No había ninguno. La protección llevaba semanas cuidando de una fila que nadie había
escrito, y el escenario «una entidad sin imagen recibe el marcador» no se podía cumplir desde
ninguna parte.

Ahora los tres son **archivos de este repositorio** —dos vectores dibujados a mano, un PDF vectorial
de 736 bytes y dos segundos de video— y no direcciones de terceros como en la pila anterior, donde
la imagen que se enseñaba cuando faltaba otra dependía de que `w3.org` siguiera sirviéndola (O-06).
Se siembran **pidiendo autorización como la pide el navegador**: así sembrar funciona con cualquier
proveedor sin una segunda forma de subir. Y se comprueba objeto por objeto en vez de fiarse de la
fila, porque las dos mitades se separan: un depósito recreado deja la fila apuntando a bytes que ya
no están, y ahí «ya está sembrado» significaría «la imagen queda rota para siempre».

Referenciarlos obligó a una excepción que no se veía sin uno delante: el archivo se acota a una
empresa por el prefijo de la clave de su objeto, y el marcador **es de todas**, así que no cuelga
del prefijo de ninguna. La comprobación lo declaraba inexistente para todas a la vez (H-133). Lo que
sigue abierto es quién se lo asigna: hoy ninguna entidad **exige** archivo, así que el escenario no
tiene dónde ocurrir (H-134).

**Una costura, y detrás de ella dos proveedores**

Las tres funciones que hablaban la API HTTP del proveedor —firmar la escritura, componer la
dirección pública, retirar objetos— son ahora una interfaz. `uploads.ts` y `collections.ts` no
cambiaron ni una línea: siguen llamando a las mismas tres funciones.

El segundo proveedor habla S3, con la firma calculada a mano y sin cliente oficial. De todo lo que
hace `@aws-sdk/client-s3` aquí se usan tres cosas —una dirección prefirmada de `PUT`, un listado por
prefijo y un borrado por clave—, y los bytes no pasan por el servicio, así que no hace falta nada de
lo que ese paquete pesa: ni multiparte, ni reanudación, ni cadena de credenciales. La firma son
ciento y pico líneas de aritmética contra vectores publicados, y el protocolo lleva congelado desde
2012. El intercambio se invierte el día que haga falta subida multiparte o credenciales por rol.

**Ejercido, no supuesto**

La pila local ya tenía `[storage.s3_protocol] enabled = true`, así que el proveedor de S3 se prueba
**contra un servidor de verdad y sin credenciales de AWS**. La prueba de contrato no conoce a ningún
proveedor: recorre los que haya y les exige las mismas cinco propiedades. Y las pruebas de subida de
extremo a extremo pasan enteras con `STORAGE_PROVIDER=s3`.

En el navegador, los dos: se sube una foto de producto, se escriben los cinco objetos, la miniatura
se pinta en la ficha, y la autorización de un objeto sobre otro se rechaza —`400` con el proveedor de
hoy, `403 SignatureDoesNotMatch` con S3— sin dejar nada escrito.

**El defecto que apareció por el camino**

El reintento por objeto no funcionaba en el único caso para el que existe. El proveedor se niega a
**firmar** una clave ya ocupada, y la máquina de subida reintenta pidiendo autorización para el
archivo entero porque no sabe pedir cuatro de cinco: escrito el original y caída la miniatura,
reintentar respondía `500`. Es decir, en cuanto algo se escribía bien, recuperar lo que faltaba era
imposible. Se pide el permiso de sobrescritura al firmar, que no ensancha nada —la autorización
sigue acotada a una clave que inventa la API— y además hace que los dos proveedores digan lo mismo
(H-132).

**Mudarse no es cambiar una variable**

`STORAGE_PROVIDER` cambia dónde se escribe de ahora en adelante y no toca ni una de las direcciones
ya repartidas. Se recorrió el esquema buscando cuáles son: hoy **una sola tabla**, no lo que dice la
justificación de la spec —los documentos generados todavía no incrustan direcciones— y eso hace la
mudanza mucho más barata de lo que parecía (H-135). El requisito gana el escenario que le faltaba, y
la reescritura tiene guion: por prefijo, idempotente y sin aplicar por omisión, porque antes de mover
mil filas hay que poder contar cuántas se mueven.

**Lo que hace falta para apuntar a AWS de verdad**

Está en `.env.example` y se resume en cinco pasos: depósito con lectura pública y CORS, credencial
de escritura acotada al prefijo, copiar los objetos con `aws s3 sync` —este guion mueve direcciones,
no bytes—, poner las variables, reescribir las direcciones y volver a dejar los marcadores. El paso
que hoy no está escrito en ninguna parte es el primero: **el depósito lo creó alguien a mano** y no
hay migración ni guion que lo deje puesto (H-136).

**Verificación**

`pnpm test` en verde con **1132** pruebas, 35 más que las 1097 de partida: 11 de contrato contra los
dos proveedores, 9 de la reescritura, 7 de la firma sin red, 7 de los marcadores sembrados de verdad
y una del reintento que faltaba. `pnpm check` y `pnpm lint` limpios. El proveedor por omisión no
cambia, y hay una prueba que lo fija.

**Lo que hay que poner en el `.env` para que pasen.** Las dos credenciales del punto S3 local, que
imprime `pnpm db:status` como `S3_PROTOCOL_ACCESS_KEY_ID` y `S3_PROTOCOL_ACCESS_KEY_SECRET`. La
prueba de contrato **falla** si faltan en vez de saltarse: saltar el segundo proveedor sería decir
que sí sin haber mirado. Es la misma exigencia que ya tenía `STORAGE_SERVICE_KEY`, y está escrita en
`.env.example`.
### 2026-08-19 · La columna que estaba en cero

Rebanada **20 · `migrate-productions-core`**, de 0 a 7 de su lista más dos cosas que no figuraban en
ella. Es la primera vez que el servicio de producciones existe: había veintiséis tablas desde la
`0002` y **ninguna ruta llegaba a ellas**.

**Lo que entra: la producción como entidad, su equipo y su panel**

La producción con sus fechas, su publicación y su baja; la taxonomía que la organiza por
departamentos; los planes de trabajo con sus cinco estados; y el panel, que es lo primero que se
mira al abrir un rodaje. Veintiuna rutas.

Queda fuera, y se dice: guion, capítulos y escenas —rebanada 21—; jornadas, continuidad, personajes,
sets, videos, inventario de utilería y presupuesto —22 y 23—. El panel **cuenta** todas ellas
porque sus tablas ya existen, así que el día que otra rebanada las llene el resumen no hay que
tocarlo.

**La comprobación de habilitación que no había que escribir**

La spec pide que crear una producción exija el servicio contratado, y el almacén tiene esa
comprobación en su manejador. Copiarla habría sido lo cómodo. No corre: desde la rebanada 11 la
compuerta vive en el guardián y **deriva el servicio del primer nivel de la clave de permiso**, así
que responde `403 service_not_enabled` antes de que exista el manejador. Se vio al escribir su
prueba y ver que llegaba otra respuesta. Producciones no la lleva; las dos que quedan —en el almacén
y en sitios— son código muerto que se lee como si protegiera (H-108).

**Dos invariantes bajan al motor**

La `0022` no crea tablas: pone las dos reglas que `production-management` enuncia como propiedades
de la entidad. Que la fecha de fin no preceda al inicio, y que publicada exija identificador
legible. El manejador las comprueba también, y no sobra: arriba se responde `422` con el motivo, y
abajo se garantiza para quien escriba por la siembra, por el trasvase o a mano. Una producción que
termina antes de empezar no da error en ninguna pantalla — da recuentos negativos meses después.

**El equipo rentado sin devolver se lee del otro lado del mostrador**

La spec impide dar de baja una producción con órdenes de compra en curso o equipo sin devolver. Lo
segundo son **pedidos de almacén de otra empresa**, y se alcanzan porque la política de esa tabla
admite explícitamente la vía de la orden de compra (`app.reaches_purchase_order`, `0005`). No se
consulta la cotización del almacén, que es su documento interno: `delivered` ya significa que salió
y no ha vuelto. Es la primera lectura entre arrendatarios de esta columna, y funciona porque el
aislamiento está en dos capas y la segunda sabe quién puede ver qué.

**El rol de una categoría, y una clave foránea que no basta**

Una categoría de producción apunta a un rol, y ése es el mecanismo por el que el trabajo llega al
departamento correcto. La clave foránea sola no lo acota: **se comprueba con los permisos del dueño
de la tabla y se salta las políticas de fila**, así que el motor habría aceptado el rol de otra
productora. Quien lo escribiera no podría leerlo de vuelta, pero la referencia entre arrendatarios
quedaría escrita. Se corta en la capa que sabe de qué empresa es la producción, con su prueba —que
falla con `201` si se quita la comprobación—.

**Lo que la spec no decide, no se decide aquí**

`production-workflows` enumera cinco estados y dice que un plan nace pendiente, pero **no declara
qué transiciones son legales**, al revés que la cotización y el pedido de almacén, que las
transcriben. Se admite cualquiera de los cinco, que es la lectura literal, y queda anotado (H-111).
Escribir una tabla plausible habría fijado por nuestra cuenta una regla que nadie ha decidido, y la
pagaría un jefe de producción al que la aplicación le dijera que no puede reabrir una jornada.

Con él salieron otros dos desajustes del modelo de la 22: el código de un plan es único en toda la
plataforma y no distingue las bajas (H-109), y la spec manda buscar planes «por nombre» cuando la
tabla no tiene columna de nombre (H-110). Ninguno se toca: `productions-ops.ts` es de otro encargo.

**El panel es la portada, al revés que en el almacén**

Allí la portada es el catálogo, con tres razones escritas. Ninguna se da aquí: una producción no
tiene catálogo, la dirección es nueva y no hay enlaces compartidos que reinterpretar, y lo primero
que se pregunta al abrir un rodaje es cómo va. Quien no alcance el resumen —hace falta
`productions.budgets.view`, que es la única de las cuatro cifras que no cubre ver la producción
(H-112)— entra igual y ve la ficha.

El presupuesto sale de la fórmula que `production-budget` transcribe, con la aritmética decimal del
paquete compartido. No se inventa ninguna cifra más: las cuatro que la spec enumera y ninguna otra.

**Verificación**

`pnpm test --force` en verde con **1125**, 28 más que las 1097 de partida de este árbol: 5 de motor
en datos —los dos invariantes, comprobados también en su caso de frontera— y 23 de extremo a extremo
en la API. Fusionado con el área de administración de plataforma, que entró mientras tanto, el
conjunto da **1146**, también en verde, y ésa es la cifra de la tabla de arriba.
`pnpm check` y `pnpm lint` limpios. Las pantallas, conducidas en un navegador contra la base de
desarrollo: dar de alta, ver rechazar unas fechas invertidas, crear un equipo con su rol, anidar
otro dentro, crear un plan, **reprogramarlo en una sola operación** y ver el panel pasar de «0
planes» a «Reprogramado: 1».

De ahí salió el último hallazgo, y no de leer código: un enlace seguido antes de tiempo dejó
`undefined` en el camino y la respuesta fue `500`. Alcanza a las noventa rutas con parámetro de
identificador, no sólo a éstas, así que no se corrige en un módulo (H-113).
### 2026-08-19 · Comprar en la tienda, y que el pedido exista o no exista

Rebanada **18 · `add-transactional-checkout`**, de 0 a 37, y con ella los cuatro defectos más caros
del levantamiento: M-10, M-02, M-03 y M-01. Cierra además el H-88 que la 07 dejó esperando.

**Apartar y cobrar empiezan a existir en el mismo instante**

Comprobar existencia, apartar las unidades concretas, cotizar el envío, congelar la instantánea y
abrir la sesión de pago van en **una sola transacción**. Si el procesador falla, no queda ni compra
ni una unidad retirada del catálogo. La alternativa —apartar, confirmar, y llamar al procesador
después— deja una ventana en la que un fallo de red saca inventario de la tienda sin que nadie pueda
pagarlo ni soltarlo hasta que caduque.

El costo es que la transacción sostiene los bloqueos mientras dura una llamada de red. Se paga a
sabiendas: son unos cientos de milisegundos sobre las filas de un puñado de unidades.

`for update skip locked` es lo que hace que dos compradores no se lleven la misma cámara. Sin él, la
segunda transacción espera a la primera y acaba tomando las mismas filas; con él, salta lo bloqueado
y coge lo siguiente, y si no queda nada falla por existencia insuficiente — que es la verdad. Es el
defecto M-10, que la pila anterior tenía abierto por los dos lados: seleccionaba unidades **sin
marcarlas**, y sus checkouts pendientes **no caducaban nunca**.

**El orden de las escrituras no es casual, y el motivo es de la rebanada anterior**

La compra se inserta **antes** de calcular el envío. La lectura de `user_addresses` la concede su
dueño o **una compra que apunte a ella**, y esta transacción corre con el alcance de la empresa
vendedora, no con la sesión del comprador: sin la fila ya escrita, el domicilio no se ve, el cálculo
lo tomaría por «sin coordenadas» y el envío perdería su recargo por distancia en silencio. Es H-98
visto desde el otro lado — la 17 lo encontró comparando las dos vías, y aquí es lo que fija el orden.

**Por qué la materialización abre su propia transacción**

El receptor de webhooks corre por la vía **elevada**: tiene que escribir `payment_events`, cuya
política es `false` para todo el mundo salvo la administración de plataforma. Elevada significa *sin
políticas*, y materializar ahí dentro habría sido renunciar a la segunda capa de aislamiento en la
operación que más escribe de todo el sistema — ocho tablas de una empresa, disparadas por una señal
externa.

Así que abre la suya, con la empresa vendedora declarada. Lo que se pierde es que la reclamación del
evento y el trabajo dejen de ser la misma transacción; lo que **no** se pierde es la ejecución única,
porque nunca dependió de eso:

- si la materialización falla, lanza, el receptor revierte también la reclamación y el procesador
  vuelve a intentarlo entera;
- si la materialización cuaja y la reclamación no, el reintento encuentra `fulfilled_at` puesta y no
  duplica nada.

Las dos barreras siguen siendo dos, y cada una hace su trabajo donde sirve: la unicidad del evento
contra la doble entrega, la marca contra el mismo cobro anunciado por dos eventos distintos. La marca
se pone **al final**, que es el detalle que arruina todo lo demás si se equivoca: la pila anterior la
ponía antes de hacer el trabajo, así que un fallo dejaba una compra marcada como resuelta y sin
pedido, irreparable por reintento (M-03).

**Tres políticas que dejaban escribir a quien sólo debía mirar**

Aparecieron escribiendo las pruebas de aislamiento, y son el mismo error que la propia `0005` deja
advertido en su cabecera: **un `exists` se resuelve con la política de lectura del padre**.

- `checkouts` tenía una sola política para todo, «la empresa **o** el comprador». La instantánea es
  la fuente de la materialización, y su dueño podía reescribirla entre el pago y la confirmación.
- `payments` se escribía componiendo con `checkouts`, que el comprador lee: podía fabricar el asiento
  de su propio cobro.
- `warehouse_orders` admite componerse con `buyer_orders`, que el comprador lee: podía **insertar una
  orden de trabajo en el almacén de cualquier empresa**, porque con esa rama cierta el `warehouse_id`
  deja de estar acotado por nada.

Las tres corregidas en la `0021`, atravesando hasta `companies` como hizo la `0020` con los envíos, y
las tres con prueba por `withRequester`. Las dos de escritura se vieron **fallar con la política
vieja puesta** antes de darlas por buenas. Y por el otro lado faltaba lo contrario:
`buyer_order_lines` sólo tenía política de arrendatario, así que el comprador veía su pedido y su
total y no veía qué había comprado. H-102 y H-103.

**El precio sale de donde salió el que se vio**

El carrito no valora contra el catálogo por su cuenta: llama a `storefrontProduct`, la misma función
con la que la tienda pinta la ficha. Así el escaparate no puede decir una cifra y el cobro otra, y la
intersección de «qué producto alcanza la tienda» —publicado, no provisional, vivo, del almacén del
sitio— no se escribe dos veces. Cuesta una resolución de tienda por producto distinto del carrito, y
es un cambio barato por no tener dos definiciones de lo que se puede vender.

Al hacerlo apareció H-104: la ficha pública publica el precio del **producto**, y la precedencia del
catálogo dice que el de una medida es ése **más el ajuste de la medida**. Quien elige «Kit con
óptica» ve el precio del cuerpo suelto hasta que abre el carrito. La compra cobra lo correcto y el
carrito lo enseña antes de pagar; publicarlo por medida es cambiar lo que devuelve la tienda, que es
de la 19.

**Lo que la spec pedía y no se puede hacer todavía**

La compra **de renta** se rechaza con motivo. Su tarifa sale de una lista de precios y una lista se
aplica a un cliente concreto; quien mira una tienda pública no tiene ninguna, así que cobrarla
significaría inventarle una tarifa — exactamente lo que la ficha se niega a hacer al no enseñar
importes de renta. Es el criterio de la regla 5, señalado en el código y anotado (H-105).

Y el envío, según la fórmula transcrita, **lo paga el comprador y no llega al neto del comercio**.
Puede ser deliberado y no lo dice en ninguna parte; queda anotado para que la decisión se tome
mirándola y no descubriéndola en una conciliación (H-106).

**Bookkeeping heredado**

La rebanada **11** estaba implementada y fusionada con su lista intacta: el agente que la hizo no
llegó a marcarla. Repasadas las cuarenta contra `apps/api/src/billing/` y sus 61 pruebas, están todas
hechas. Lo único que le faltaba de verdad era su otro extremo —los manejadores del cobro en tienda,
H-88—, que llega con ésta: con ellos el libro de ingresos del comercio deja de estar vacío.

**Lo que queda fuera, a propósito**

La vertical de **mosaicos**, con sus cuatro casillas: sus artículos son de la rebanada 24, pausada. El
modelo ya los admite y el carrito los rechaza con su motivo, así que lo que falta es la vertical, no
la compra. El **aviso por fallo persistente** no se puede decidir hoy: la reclamación del evento se
revierte con el fallo, así que `payment_events.attempts` nunca crece y no hay con qué contar los
intentos —la incidencia sí queda registrada con su detalle—. Y el **reproceso manual** tiene su
garantía puesta y le falta la superficie que lo dispare, que es un área de administración de
plataforma que todavía no existe.

**Verificación**

`pnpm test` en verde con **1154** pruebas, 57 más que las 1097 de partida: 12 del cálculo y la
máquina de estados en contratos, 37 de extremo a extremo en la API —incluidas las cuatro que
justifican la rebanada— y 8 del carrito en el navegador. `pnpm check` y `pnpm lint` limpios, y las 22
migraciones replicadas desde cero.

Y **comprado en un navegador, de principio a fin y sin sesión al empezar**: catálogo, ficha, carrito,
entrar, apartar, pagar con el suplente y volver a la tienda. La página de vuelta dijo «estamos
confirmando» hasta que llegó el evento firmado, y entonces «compra confirmada». En la base quedaron
las ocho entidades y dos unidades pasaron de disponibles a vendidas — las otras dos siguen en el
catálogo.

### 2026-08-19 · Los cimientos que llevaban cinco meses a medias

**Cerrado — rebanadas 01 y 03**

- **Idempotencia** (`api-conventions`). Repetir una escritura con la misma clave produce un solo
  efecto y devuelve el resultado de la primera; con otro cuerpo, `409`. Tabla propia (`0026`),
  reclamación por `insert` con índice único, y su caducidad colgando del despachador de trabajos.
- **Campos calculados** (`computed-fields`). La spec entera estaba sin implementar: las diecisiete
  fórmulas están ahora en un solo sitio, puras, con 49 pruebas de valores concretos.
- **El cliente tipado generado** del contrato publicado: 186 endpoints, con su candado de desfase.
- **Límite de cuerpo y limitación de frecuencia** en el motor. Con eso, **la 03 queda cerrada del
  todo, 26 de 26** — la primera rebanada que se cierra entera.

**Lo que la clave de idempotencia no puede ser**

Un espacio de nombres global. Aquí se guarda un **cuerpo de respuesta ya calculado**, así que si la
unicidad fuera sobre la clave sola, quien acierte o adivine la de otro recibiría su respuesta —los
importes de un cobro, los datos de una persona—, servida por el mecanismo que existe para que nadie
pague dos veces. La terna es **(actor, empresa, clave)**, con el índice único y la política del
motor diciendo lo mismo por los dos lados, y una prueba que comprueba que repetir la clave de otro
no devuelve su resultado: sencillamente no encuentra nada y la petición corre con sus permisos.

Del cuerpo de entrada **sólo se guarda la huella**. Del de salida no hay alternativa —el requisito
es devolver *lo mismo*—, y lo que se acota es el riesgo: sólo la respuesta de una petición correcta,
sólo la alcanza su actor, y caduca en horas.

**El que encontró otro, y que no era de nadie por dominio sino de la capa**

La cadena `undefined` en el camino —la que deja una plantilla que interpola una variable que no
existe— **respondía `500`**. Medido con un barrido sobre la tabla de rutas antes de tocar nada:
**713 combinaciones de ruta y valor** devolvían `5xx`. Lo encontró quien escribía otra pantalla,
siguiendo un enlace antes de tiempo, y el síntoma —«el servidor se cayó»— no se parece a la causa
—un enlace roto—, que es **exactamente** lo que ya había pasado con `H-30`.

Se rechaza con `400`, que es la fila de «ruta que no cumple el esquema», y **antes del guardián**:
el guardián resuelve la membresía contra la empresa del camino, así que con `companyId` inválido el
fallo ocurría dentro del propio guardián. Eso es también por qué no valía validarlo en el esquema de
la ruta, que corre después. El candado **recorre la tabla registrada**, así que una ruta nueva entra
sola (H-144).

Con eso cambia una política, y queda escrita: una petición **sin credencial** con un identificador
mal formado recibe ahora `400` y no `401`. Es la misma categoría que un camino inexistente, que el
motor ya contesta con `404` a quien no ha entrado. La prueba que fijaba que el guardián alcanza los
caminos con parámetro **sigue fijando eso**: pide con un identificador bien formado, para que la
petición llegue hasta él en lugar de quedarse en la capa de antes.

**Dos defectos que aparecieron al cerrarla**

- `pnpm --filter @tfv/api contract` **apuntaba a un archivo que nunca se escribió**. Estaba
  declarado desde la rebanada 03 y nadie lo notó porque nada lo llamaba: el comando esperaba al
  cliente tipado y el cliente tipado esperaba al comando (H-126).
- **Las capas del motor se montaban por camino y no por verbo**, así que una ruta heredaba los
  guardianes de sus hermanas y el resultado dependía del orden de la tabla de rutas. Hoy hay 47
  caminos con más de un verbo y en 40 los regímenes difieren. Comprobado antes de tocarlo: una ruta
  pública declarada después de una autenticada sobre el mismo camino respondía `401`. Falla cerrado,
  así que no abrió nada; lo que rompía es peor de ver — **el permiso que una ruta exige de verdad no
  era el que declara** (H-127).

**Verificado, no supuesto**

- `pnpm test --force`: **1244** en verde, 147 más que las 1097 de partida. `pnpm check` y
  `pnpm lint` limpios.
- Contra el servicio en marcha, en un puerto propio: un cuerpo de dos megas responde `413` con la
  forma del contrato de error; el sexto intento de un origen con el cupo en cinco responde `429` con
  `Retry-After`, y **otro origen sigue pasando**; crear una empresa dos veces con la misma clave
  devuelve el mismo identificador y deja **una** empresa en la base, y con otro cuerpo responde
  `409` con `idempotency_key_reused`.
- La pantalla de sesiones activas, servida y renderizada, ya consume el **cliente tipado**: es la
  única de las cuarenta y ocho que se pasó, y a propósito.
- `GET /companies/undefined/warehouses` con sesión válida, que era el caso que lo destapó: `500`
  antes, `400` con el campo señalado ahora.

**Abierto, y por qué**

- **Las otras cuarenta y siete pantallas** (H-128). Seis encargos están dentro de ellas ahora mismo.
  `apiCall` convive con `apiGet` y `apiTyped` con `api()`, así que convertirlas es endpoint por
  endpoint y sin ronda de migración — cuando no haya nadie dentro.
- **Los campos calculados están definidos y sin consumir** (H-129). Esta rebanada da la definición
  única; llamarla es de cada dominio, y la mayoría de esos dominios aún no existen.
- **La idempotencia no llega a la compra pública** (H-131): no hay actor al que acotar la clave, y
  `defineRoute` lo impide al cargar. De dónde sale el alcance sin sesión lo decide la rebanada 18.
- **El limitador cuenta por proceso** (H-130). Es un guardarraíl de recursos, no un control de
  credenciales; el de intentos de acceso vive en la base precisamente por eso.
### 2026-08-19 · La novena, cerrada del todo

Rebanada **09 · `migrate-activity-and-notifications`**, **50 de 50**. La segunda que se cierra
entera en la historia del proyecto.

Quedaban seis tareas y ninguna esperaba a nadie. Lo interesante es que cuatro de las seis se habían
dejado abiertas por el mismo motivo equivocado —«esto necesita un proveedor», «esto es del
navegador»—, y al mirarlas de cerca lo que faltaba estaba entero de nuestro lado.

**Lo que se guardaba era español**

`company_activities.title` era prosa libre: «Editó los datos de la empresa». Y el cuerpo del aviso
se redactaba al escribirlo, pegando el nombre de quien actuó delante de esa frase con la primera
letra en minúscula.

Es H-67 otra vez —los hitos de la conversación del pedido, anotado y no resuelto— y esta vez en la
tabla que más filas acumula de todo el sistema. En una aplicación que se sirve en dos idiomas desde
el primer componente, la bitácora y la bandeja eran **las dos únicas pantallas que no cambiaban de
idioma**. La spec lo bendecía: «El cuerpo SHALL estar en español».

Y hay una razón más dura que la traducción: la concatenación no sobrevive. «Ana creó la empresa» se
compone bajando la primera letra del verbo; «Ana Created the company» no se compone así, porque el
verbo cambia de forma y de sitio. La frase entera tiene que ser una unidad traducible, con huecos.

Así que el asiento guarda **una clave del catálogo y sus parámetros**, y `title` se retira en lugar
de convivir con ella: dejar las dos formas habría sido una migración que no arregla nada, porque
basta que alguien escriba una y lea la otra para volver al principio. El catálogo vive en
`@tfv/contracts/activity` —el servidor lo escribe, el navegador lo lee— y es cerrado: una clave que
no exista no compila, y el tipo exige exactamente los parámetros que la clave declara, así que un
aviso que dijera «incorporó a » tampoco llega a compilar (H-153).

Se paga un precio y está escrito: el buscador de la bitácora ya no busca por la frase, porque no hay
frase. Busca por el nombre de la entidad, y lo que se hizo se acota con el filtro de acción, que es
la pregunta que esa búsqueda intentaba responder.

**Ningún aviso llevaba a ninguna parte**

Éste no lo esperaba. El asiento guardaba `/{companyId}`, `/{companyId}/miembros` y
`/{companyId}/warehouses/{id}`; el panel vive bajo `/c/{companyId}` y los miembros están en
`settings/members`. Las tres direcciones respondían `404`.

La bandeja las pinta como enlace desde que existe. Es decir: **pulsar cualquier notificación era
caer en una página que no existe**, desde el primer día, y la prueba que había afirmaba la dirección
rota tal cual —`expect(asiento?.url).toBe(\`/${companyId}\`)`—. Nadie lo vio porque escribir la
dirección y comprobar que hay una dirección es lo mismo; comprobar **a dónde lleva** es otra cosa, y
la primera vez que alguien la hace es al escribir «pulsar el aviso abre la entidad» (H-154).

El destino sale ahora de `activityTarget()`, una función pura con sus pruebas, y **no se puede pasar
desde fuera**: quitar el parámetro es lo que impide que vuelva. Y lo guarda una prueba de `web` que
**resuelve cada destino contra el árbol de rutas de Next**, aceptando directorio literal o de
parámetro y exigiendo su `page.tsx`. Una pantalla que se mueva de sitio rompe la prueba en lugar de
romper el enlace, meses después, en la bandeja de otra persona.

**Enfocar una pestaña no se escribe: se nombra**

«Si ya estaba abierta en otra pestaña, se enfoca esa» es comportamiento de navegador y no se prueba
con una función pura. Pero la parte que puede estar mal no es enfocar —eso lo hace el navegador—:
es **qué pestaña es la misma pestaña**. Esa mitad sí es lógica, y es `noticeWindowName`, con sus
cuatro pruebas: la misma para dos avisos de la misma entidad, distinta entre entidades, legal como
nombre de ventana, y sin confundir `/c/a/b` con `/c/a-b` — que es lo que pasa si se aplana todo al
mismo separador.

El enlace de la bandeja lleva ese nombre y ya está. La bandeja se queda donde está al pulsar, que
además es lo que se quiere: quien tiene cinco avisos los abre uno tras otro sin perder la lista, y
los tres de la misma cotización caen en la misma pestaña.

**El destinatario, y por qué no hacía falta ningún proveedor**

«Sincronizar los datos del destinatario» y «darlo de alta en el primer envío» se dejaron abiertas
porque no hay proveedor al que sincronizar. Lo que falta con proveedor es *el otro lado* del cable;
lo que faltaba aquí era el cable: **qué se le cuenta y cuándo**, que es decisión nuestra y se prueba
con un transporte de mentira sin necesidad de cuenta en ningún sitio (H-155).

`syncRecipient` entra en la misma costura que `send` y es opcional, porque no todo canal tiene a
quién presentar —la bandeja escribe en una fila nuestra—. Se llama **antes del primer envío de cada
pasada**, dentro del mismo `try`: un proveedor que no admite al destinatario tampoco va a admitir el
aviso, y el modo de fallo correcto es el mismo.

Dos decisiones que importan más que el código:

- **Es una operación, no dos.** Alta y actualización son la misma llamada vista en dos momentos.
  Partirlas obligaría a preguntar antes si existe, que es una carrera y un viaje de más.
- **No se guarda copia de lo que el proveedor sabe.** La lista de destinatarios es suya y se toca
  desde su panel; una tabla espejo nuestra empezaría a mentir el primer día que alguien la tocara.
  Lo que sí es nuestro es el momento, y el momento se prueba: una vez por persona y por pasada, no
  una por aviso.

El cambio de perfil encola `avisos.sincronizar-destinatario`, fuera de la transacción que lo guarda:
hablar con un tercero dentro de ella haría que un proveedor lento impidiera cambiarse el correo. Hoy
el correo es el único dato del perfil que la API deja cambiar, y es el que dispara la
sincronización; nombre, teléfono y avatar no tienen ruta de edición todavía.

**Retirar algo que nunca se escribió**

La administración de plantillas de notificación por API era una herramienta **sin autenticación** que
operaba sobre la cuenta real del proveedor, y la pila nueva nunca la reimplementó. Retirarla no es
borrar código: es impedir que vuelva y dejar constancia de que fue una decisión.

Lo primero lo vigila una prueba que recorre la tabla de rutas entera —ninguna las nombra, y ninguna
superficie de avisos queda pública—, que es la propiedad y no el nombre. Lo segundo es el delta
`REMOVED`, que `changes/README.md` asigna a esta rebanada y no a la 30: la 30 retira la **pila
anterior**, que es otra cosa. Es el primer delta de retirada del repositorio.

**Un hallazgo que se queda abierto**

Al pasar el aviso a clave y parámetros aparece una pregunta que antes no existía porque la respuesta
era «español y punto»: **en qué idioma se redacta un aviso saliente**. La bandeja no lo sufre —la
pinta el navegador de quien la mira, con su cookie delante—, pero un correo o un empuje no tienen
navegador. El idioma vive hoy en una cookie y no hay ninguna ruta que lo escriba en la cuenta. Una
columna `users.locale` es de `app-shell`, no de aquí, y la cola ya viaja con clave y parámetros, así
que el día que exista el transporte tiene todo lo que necesita (H-156).

**La trampa de las migraciones, otra vez**

La `0029` se generó con la herramienta y **no se aplicó**. H-145 en vivo: el motor lee cuál fue la
última aplicada y salta todo lo que no la supere, y la `0027` había quedado con una marca de tiempo
posterior a la `0028`, así que la `0029` recién generada nacía por debajo del listón. Se descubrió
con la prueba de políticas fallando por una columna que no existía. El sello se sube a mano por
encima de todos los del diario; mientras el orden del archivo y el del registro puedan discrepar,
generar una migración no basta.

**Comprobado**

`pnpm test --force` en verde con **1492** —1461 de partida y **31 nuevas**: 13 de contratos, 10 de la
API y 8 de web—. `pnpm check` y `pnpm lint` limpios.

La suite de navegador, contra una base propia de este árbol, con las **dos sesiones abiertas a la
vez**: la administración edita la empresa, y la propietaria ve el asiento con la frase armada en su
idioma y el aviso en su bandeja. Y ahora la prueba mira **a dónde apunta el enlace** —`/c/{id}`, con
su nombre de ventana— y abre esa dirección para ver que responde una pantalla. Esa comprobación es
la que no existía, y por eso el `404` vivió desde el primer día.

La pasada completa da **82 de 83**: la que cae es `suscripcion.spec.ts`, que exige que no haya
ningún plan que contratar mientras la siembra crea tres desde antes de esta rama (H-158). Y una de
cada tres vueltas de `avisos.spec.ts` cae en su última línea, la del contador de la campana, que es
H-146 y es anterior; las otras dos vueltas dan 3 de 3.

`pnpm lint` **fallaba con cinco errores desde `b67f309`**, todos de formato. Van corregidos con esta
rama porque la verificación lo exige limpio, y porque una comprobación que ya está roja al empezar
deja de avisar de nada.

**Lo que queda, y no es de esta rebanada**

Los dos proveedores salientes (H-80), las ~35 rutas de escritura que aún no dejan asiento y que cada
dominio añade al pasar por su módulo (H-82), una clave de permiso propia para la bitácora (H-81) y
el idioma de la cuenta (H-156). Ninguna depende de nadie de aquí.

Y una que sí es la misma corrección, en otra tabla: **la bitácora de plataforma guarda español**
igual que ésta lo guardaba —«Prospecto corregido», «Prospecto descartado»— y ahora es la única
superficie que no cambia de idioma. La receta está escrita y la tabla es de la rebanada 10, con su
esquema en la migración `0024`: cambiarla pide una migración que este encargo no tiene (H-157).

### 2026-08-19 · La red se puede volver a tender

La suite de extremo a extremo llevaba varias rondas sin correrse, y no por descuido: **no se podía
correr sin quitarle los datos a alguien**. Reutilizaba la API del `5000` —que es la de desarrollo,
apuntando a la base de desarrollo—, ocupaba el `3100` fijo, y sembraba en cada arranque. Lanzarla
con `pnpm dev` abierto era borrarle la sesión a quien estuviera mirando la aplicación, y dos árboles
de trabajo no podían lanzarla a la vez.

**Su base y sus puertos, deducidos del árbol**

Ahora levanta su propia API contra `tfv_test_e2e`, creada, migrada y sembrada **antes de que la API
abra su conexión** — que es el único sitio donde cabe, porque Playwright arranca los servidores
antes de correr la preparación global. Los puertos salen de la ruta del árbol de trabajo: estables
para el mismo árbol y distintos entre árboles, que con seis trabajando en paralelo es exactamente la
propiedad que hace falta. Unos fijos obligarían a que cada uno los escribiera en su `.env`; unos al
azar dejarían servidores huérfanos imposibles de reconocer.

Dos cerrojos contra el accidente que esto existe para evitar: la resolución se planta si la base
resulta ser la de desarrollo, y la preparación se planta ante el nombre con el que la levanta
Supabase. La siembra se invoca sin archivo de entorno, para que en la variable que decide a quién se
le borran los datos no haya que confiar en un orden de precedencia.

**Lo que la suite se había perdido**

En las rondas que no corrió entraron fotos de producto, documento de cotización con enlace público,
conversación del pedido, bandeja y bitácora, tienda pública, tarifas de envío y suscripciones. Dos
afirmaciones suyas se habían quedado viejas por el camino: el asistente de alta de producto ganó un
paso, y la ficha de una cotización dejó de imprimir la fecha en prosa.

Los recorridos nuevos se eligieron por lo que se rompe sin que nadie se entere, no por cuántas
pantallas tocan. El documento y su enlace público es el que más capas cruza —la dirección se compone
con el origen de la petición, así que se lee de la pantalla y se abre desde un navegador sin sesión
ni cookies—. Los avisos van con dos sesiones a la vez, porque el autor no recibe el suyo y una
bitácora con asientos sembrados pasaría igual aunque nada llegara a ella. Las fotos se suben de
verdad: los bytes no pasan por la API, y al quitar una se comprueba que su objeto deja de responder,
que es H-71 dicho como prueba. Y el cuadro de tarifas se guarda y se ve salir esa misma cifra por el
simulador, que es el defecto que la rebanada cerró, comprobado por los dos extremos.

**Y lo que no se puede recorrer, que es el hallazgo**

La tienda pública está terminada y **no hay puerta**: no hay pantalla que dé de alta un sitio, nada
la enlaza, y servirla exige suscripción vigente que no se puede contratar porque no hay planes ni
forma de crearlos. Las suscripciones caen con ella. Fabricar un plan escribiendo en la base habría
dado media docena de pruebas verdes sobre un camino que ninguna persona puede recorrer; en su lugar
quedan escritas las dos salidas que un visitante sí alcanza, y las ausencias anotadas como H-140 y
H-141 con pruebas que fallarán el día que dejen de ser ciertas.

Correr la suite dos veces seguidas sacó otro: **dar de alta un segundo perfil de facturación
responde `500`**, por un índice parcial que no excluye lo dado de baja mientras el de al lado sí lo
hace (H-139). Es la clase de defecto que sólo aparece repitiendo, y la razón de que la repetición
sea parte de la verificación.

**Comprobado**

La base borrada a mano y **dos vueltas seguidas en verde —83 pruebas cada una, 20 más que las 63 de
partida— sin limpiar nada entre medias**. `pnpm test --force` en verde con **1097**. `pnpm check` y
`pnpm lint` limpios. Y al terminar, la sesión de desarrollo del `3000` seguía viva, que es el punto
entero.

### 2026-08-19 · Contar lo que hay, no lo que se recuerda

No entró una línea de producto. Lo que entró es una **auditoría de las treinta listas de tareas**
contra el código, con una regla sola: una tarea se marca cuando se puede señalar el archivo que la
implementa **y** la prueba que lo demuestra. Sin prueba no se marca. Media tarea tampoco se marca:
el camino feliz cubierto y el borde no es una tarea abierta.

**El número era falso por los dos lados, y el error grande estaba en la 07**

La rebanada de eventos de cobro figuraba en **11/38** y está en **25/38**. Sus diez manejadores por
tipo decían «espera a suscripciones (11) y a la compra (17)», y las dos llegaron hace días: ocho de
los diez existen en `billing/events.ts`, y las seis pruebas de verificación de firma estaban
escritas enteras en `payments/webhooks.test.ts`. Es exactamente lo que pasó con la 11: código
fusionado, lista sin tocar. Los dos manejadores que **no** existen —`checkout.session.expired` e
`invoice.upcoming`— quedan abiertos diciéndolo, y otros dos quedan abiertos por la mitad que les
falta: registran el reembolso y la disputa, y **no avisan a nadie**.

Con esas catorce y veinte marcas más repartidas por otras trece rebanadas, el recuento pasa de
**691/1250 (55,3%)** a **725/1250 (58,0%)**. Sobre lo que se puede cerrar de verdad —descontando
las 32 no aplicables— es **59,5%**.

**Dos rebanadas se cierran, y una tercera queda sólo con lo inaplicable**

- La **13** llega a 31/31: faltaba la ejecución programada de la verificación de coherencia, y corre
  desde que la 09 trajo el despachador (`jobs/handlers.ts:227`, probada en `handlers.test.ts:153`).
- La **17** se queda sin nada aplicable abierto: sus dos últimas tareas piden borrar copias que
  viven en `tfv-frontend/`, y ese árbol no está aquí.
- La **11** ya estaba en 40/40, y la **03** en 26/26.

**Siete tareas se marcan `[~]` no aplicables, con el motivo en la línea**

Piden retirar código de `tfv-frontend/` y `tfv-backend/`, que la regla 1 deja intactos y que no
están en este árbol: las dos copias del cálculo de envío (17), la orquestación del mostrador (25),
los enlaces rotos al presupuesto compartido (19), y el modelo, las rutas y las pantallas de reservas
(27). **No se borran.** Perder por qué existieron es perder la historia de la migración, y la única
forma honesta de cerrarlas es la rebanada 30, al retirar la pila anterior.

**Lo que queda, reventado por tipo**

De las **493 tareas realmente abiertas**:

| | Tipo | Cuántas |
|---|---|---|
| **a** | Trabajo que podemos hacer ya | **334** |
| **b** | Espera a otra rebanada | **76** |
| **c** | Decisión de negocio o de producto | **17** |
| **d** | Infraestructura o configuración externa | **66** |

Dos tercios son trabajo sin excusa, y están concentrados: producciones (20 y 22) suman 76, Pixit
(24, 25 y 26) suma 114, y locaciones (27) 27. Lo que espera a otra rebanada casi todo espera a esas
mismas: la 23 con 39 y la 29 con 22. Y de las 66 de infraestructura, **40 son la propia rebanada
30**, que no puede empezar sin acceso a la pila anterior.

**Las cuatro decisiones que se tomaron, aplicadas**

- **M-04** ya estaba marcada, con la acuñación como prestación y su confirmación de llegada.
- **M-05** se cierra por su mitad decidida: el bloque fiscal **sólo calcula**, no aspira a
  cumplimiento formal, y el código ya lo cumple —una tabla de tratamiento y ni una línea de
  timbrado—. La convención de signo del ISR directo sigue sin decidir.
- **Rebanada 10**: la propiedad la mueve sólo quien la tiene y **no se añade clave al catálogo**. No
  mueve código: confirma el que hay, y su nota deja de decir «pendiente de decisión».
- **Rebanada 30**: las cuentas verificadas de la pila anterior **se creen**. Marcada por los dos
  lados, en la 04 y en la 30.

**Lo más valioso que salió: nueve implementadas sin prueba y ocho a medias**

El patrón se repite en la interfaz (`HALLAZGOS.md` H-151): la pantalla de planes
implementa contratar, cambiar, cancelar y reactivar, y su única prueba afirma que **sin plan** no
hay nada que pulsar; el constructor de sitios entero no tiene ninguna prueba que lo conduzca; la
tienda pública está escrita y **no se puede recorrer** porque no hay plan contratable (H-141). En el
servidor: `onSubscriptionDeleted` sin ninguna prueba que envíe su evento, la rama de **renta** de la
liquidación de reservas sin cubrir mientras la de venta sí, y la correlación del registro probada
sólo por el lado de la respuesta.

**Y un defecto que no se arregla aquí**

`HALLAZGOS.md` **H-147**: la spec exige `404` ante datos de una empresa ajena, para que no se pueda
inferir que existe, y la compuerta responde `403`. Lo que lo hace caro no es el código: es que
**cuatro suites lo dan por bueno**, y una de ellas se llama «una empresa ajena responde 404, no
403» mientras afirma `403`. No se toca porque el arreglo cruza la compuerta de permisos y cuatro
archivos de prueba que otros dos encargos están usando ahora mismo (regla 5).

**Comprobado**

`pnpm test --force` en verde con **1461** —393 contratos, 87 datos, 761 API, 101 web, 119 interfaz—,
que es exactamente el número de partida: no se tocó una línea de producto, y el número lo demuestra.
`pnpm check` limpio.

**`pnpm lint` no está limpio, y no lo estaba antes de esta rama.** Seis avisos en siete archivos,
todos de estilo, todos presentes tal cual en `b67f309` —comprobado con los cambios guardados
aparte—. No se arreglan aquí: viven en archivos de otros dos encargos (regla 5), y la entrada
anterior de esta bitácora los daba por limpios. Es la primera factura de no tener integración
continua, y queda anotada en `HALLAZGOS.md` H-150.
### 2026-08-19 · El depósito que nadie creaba, y la mudanza lista para ejecutar

Lo que le quedaba a la rebanada **08 · `migrate-media-storage`** eran tres cosas con el mismo aire:
las tres dependían de algo que no estaba escrito en ninguna parte. Quedan cerradas, y la lista de la
rebanada se queda sin ninguna tarea que dependa de nosotros.

**El depósito existía porque alguien lo creó a mano**

No había migración, ni guion, ni configuración que lo dejara puesto (H-136). En una máquina limpia
fallaba el primer archivo que alguien subiera, y desplegar exigía recordar un paso que nadie había
escrito. Ahora lo deja puesto `pnpm --filter @tfv/api bucket`, es idempotente y **reparadora** —un
depósito privado o sin tope de tamaño se corrige en vez de callarse—, y la corre `ensurePlaceholders`
antes de escribir nada, así que la vía que ya existía para producción arrastra el depósito consigo.
La pila local lo trae además declarado en `supabase/config.toml`, que es donde alguien lo buscará.

Lo importante no es que lo cree, sino que **no se fía**. Un informe compuesto leyendo lo que uno
mismo acaba de escribir es un informe sobre nuestra idea del almacenamiento. Así que la comprobación
mira desde donde mira el navegador: escribe un objeto con la autorización que se le daría a él, pide
el **preflight de `PUT`** contra esa misma dirección, y lo lee **sin credencial ninguna**. Si algo de
eso no responde, el guion se planta con el motivo y con la orden que lo arregla.

Las dos cosas que comprueba son las dos que deciden si una foto se ve. La primera es **lectura
pública**: las direcciones se persisten en la fila del archivo y acaban repartidas, así que no pueden
ir firmadas — una firma caduca y rompería un documento emitido hace un mes. La segunda es **CORS que
admita `PUT` desde el origen de la aplicación**, y es la que da miedo: este almacenamiento responde a
**cualquier** origen y un depósito de AWS recién creado no responde a ninguno. Sin comprobarlo, la
mudanza a S3 habría fallado sólo en producción mientras seguía funcionando en local, que es el peor
modo de fallo que hay.

**Lo que no se puede ejercer no se escribe aquí**

Al ir a poner la política de lectura y las reglas de CORS desde el proveedor de S3 apareció el motivo
para no hacerlo (H-159): la pila local admite `HeadBucket` y `CreateBucket` —y crea el depósito
**privado**— pero **ignora `?policy` y `?cors`**, y los responde como si fueran otra creación de
depósito. Una implementación nuestra de esas dos operaciones habría respondido «hecho» sin haber
hecho nada, y ninguna prueba podría haberlo notado. En el camino de dejar puesto el almacenamiento de
producción, eso no es cerrar un hueco: es taparlo.

Así que las pone `aws s3api`, y lo nuestro es **qué** se pide: las cuatro órdenes se componen del
depósito, la región y los orígenes que la aplicación ya declara, con la política de lectura pública,
las reglas de CORS y la credencial de escritura acotada al depósito fijadas por pruebas. El orden
tampoco es cosmético —la política se rechaza mientras siga puesto el bloqueo de acceso público, que
llega puesto de fábrica— y eso también está escrito donde se lee. `bucket --aws` las imprime para
revisarlas y `--aplicar` las ejecuta.

**La otra mitad de la mudanza: los bytes**

El guion de reescritura mueve direcciones. Los objetos los mueve `aws s3 sync`, y la decisión está
tomada a propósito: paralelismo, reanudación, multiparte, reintento y comparación por fecha son cinco
cosas que no se negocian en una mudanza de verdad —se corre en frío y otra vez en el corte— y
escribirlas costaría más que todo el módulo de archivos. Lo que sí es nuestro es el plan, y compuesto
trajo un hallazgo que se paga caro descubrir de madrugada: **la herramienta toma un solo punto de
acceso para las dos orillas**, así que copiar entre dos almacenamientos distintos no existe como una
sola orden — son dos, con escala en disco y sitio para todo lo que pese el depósito (H-162).

**El recolector, ejecutado por primera vez**

Estaba escrito desde la rebanada 08 y **no lo había corrido nadie**. Ahora tiene su prueba de extremo
a extremo: la subida vencida pierde su fila y sus cinco objetos, la que está ocurriendo ahora mismo
sobrevive a la misma pasada, y un marcador de posición no se toca aunque esté vencido.

Escribirla sacó el defecto (H-160). El recolector retiraba primero del almacenamiento y borraba
después, y quien decide si una fila se borra es el motor: la guarda de la `0017` **omite** el borrado
de un archivo referenciado. Un archivo pendiente sí puede estarlo —la entidad se guardó antes de que
llegara la confirmación, que es el caso que la propia guarda describe—, así que esa fila sobrevivía
apuntando a bytes que ya no existían: la imagen rota que la guarda existe para evitar, servida por el
mecanismo que la protege. Se borra primero y se retiran sólo los objetos de lo que el motor dejó
borrar, que es lo que el propio borrado devuelve.

**Dos cosas más que aparecieron por el camino**

El tope de 50 MB por objeto era una **declaración, no un límite** (H-161): la API valida el tamaño
que viene en la solicitud, y quien escribe es el navegador con una autorización prefirmada que no lo
ata. El único sitio donde se hace cumplir es el depósito, que hasta ahora nadie creaba — ahora se
crea con el tope puesto, tomado de la misma constante, y hay prueba de que el almacenamiento rechaza
lo que lo supera. Queda la mitad de S3, donde no existe un tope por depósito y atarlo pediría firmar
`content-length` dentro de la autorización.

Y la caducidad de la autorización, que llevaba sin probarse porque el proveedor de hoy la fija en dos
horas: el segundo proveedor **la declara**, así que se firma con un segundo, se espera, y el
almacenamiento responde que el permiso venció. Con su otra mitad en la misma prueba — reemitir vuelve
a escribir en el acto.

**Verificación**

`pnpm test --force` en verde con **1481** pruebas, 20 más que las 1461 de partida: 7 del depósito
contra depósitos de un solo uso, 9 de las órdenes de AWS y del plan de copia, 3 del recolector y 1 de
la caducidad. `pnpm check` limpio. En el navegador, `fotos.spec` entera: se sube una foto de verdad
desde la ficha del producto, se manda como portada y su objeto deja de responder al quitarla — con la
siembra pasando ya por el depósito que se deja puesto.

**Lo que queda para montar esto en producción, que no es código**

Una cuenta de AWS, un nombre de depósito y una credencial de administración con la que correr una
vez `bucket --aws`. Después: `copy-media-objects` en frío y otra vez en el corte, las variables
`STORAGE_*`, `rewrite-media-urls`, `placeholders`, y `bucket` al final para comprobar que el depósito
nuevo sirve. Está en `.env.example` y en la cabecera de `copy-media-objects`, en ese orden.

### 2026-08-19 · Contratar, y que la tienda se encienda detrás

Se podía pulsar «Contratar» y no pasaba nada. La sesión de pago se acuñaba, el navegador volvía a la
misma pantalla, y `company_subscriptions` seguía vacía: **nada activaba la suscripción**. Con ella se
quedaban sin recorrer cambiar de plan, cancelar, reactivar, el historial de cobros y —encadenada— la
tienda pública, que exige suscripción vigente antes de servir nada.

**El atajo que no se tomó**

La salida barata era que la pantalla de planes leyera el `?session=` que el suplente le devolvía y
activara ella la suscripción. Habría funcionado en una tarde, y habría sido lo peor de las dos
opciones: una vía que **producción no tiene** —allí la suscripción nace de un evento firmado que el
procesador manda a `/payments/events`— y, de paso, el camino que sí usará producción sin ejercerse
nunca. Dos formas de nacer una suscripción, y una de ellas sin firma ninguna.

**Lo que se hizo: el suplente recorre el camino real**

El suplente hace lo que hace el procesador. Tiene **su propia página de cobro**, servida por la API y
no por la aplicación, y cuando alguien paga en ella **firma dos eventos y los entrega por HTTP** a
`/payments/events`, con su firma, su ventana temporal y su unicidad. La pantalla de planes no cambió
ni una línea: sigue yendo a donde el procesador le diga y volviendo a mirar el resultado.

La página no es decoración: es **el disparador explícito** que hacía falta. Sin ella habría que
emitir el evento al abrir la sesión, y entonces contratar activaría sin que nadie pulsara nada — con
lo que se pierde el escenario que la spec pide poder recorrer, «abandonar el pago no deja
suscripción, y puede volver a intentarlo». Con página hay dos salidas de verdad, que son las dos que
ofrece un procesador.

Dos eventos y no uno, también como el procesador: `checkout.session.completed` hace nacer la
suscripción e `invoice.paid` cobra el primer periodo. El primero **no trae periodo** —el de verdad
tampoco—, así que sin el segundo no habría fecha de renovación que enseñar ni un solo cobro en el
historial. Los dos llevan identificador estable derivado de la sesión: reintentar el pago, o volver
atrás en el navegador, entrega los mismos y la unicidad los reconoce.

Todo lo del suplente vive en un archivo, `payments/local-processor.ts`, y sus dos rutas responden
`404` sin `PAYMENTS_PROVIDER=local`. El día que haya procesador de verdad se borra el archivo.

**Tres cosas que sólo aparecen recorriendo el ciclo**

- **Cancelar alargaba la suscripción** (H-164). El suplente no recordaba nada de lo que emitía, así
  que componía el periodo desde el instante de cada llamada: cancelar un día 20 devolvía un
  vencimiento un mes más tarde, y eso se escribía tal cual. Dar de baja movía el vencimiento hacia
  adelante. Ahora recuerda lo que emite, y al segundo —las marcas del procesador van en segundos, y
  un periodo con milisegundos deja de coincidir consigo mismo en cuanto viaja dentro de un evento—.
- **Los tres planes costaban cero** (H-165). El precio salía de los dígitos finales de la referencia
  del producto, y lo que la siembra deja es `local_plan_casa`: sin dígitos, nivel cero, importe cero.
  La pantalla ofrecía el catálogo entero de balde y el primer cobro se registraba en cero. El nivel
  pasa a leerse del catálogo, que es lo que el procesador de verdad sabe de su propio producto.
- **Volver del pago perdía la sesión** en la suite de navegador (H-167). El origen de vuelta decía
  `localhost` y la suite conduce por `127.0.0.1`: hosts distintos, credencial que no viaja. Llevaba
  ahí desde que existe la variable, sin que nadie pudiera verlo porque nadie podía completar un pago.

**Lo que la tienda pública dejó ver**

El encadenamiento es la prueba de que el círculo se cierra, y al recorrerlo apareció que **ninguna
tienda creada desde la pantalla puede servir catálogo** (H-166): la vertical se declara con una
categoría de la taxonomía global —`warehouse-store`— y la siembra no crea ninguna, así que todo sitio
nace sin vertical y su tienda dice «Estamos preparando esta tienda» para siempre. Con la categoría
puesta a mano, la misma tienda pasa de «no está disponible» a servir su catálogo en cuanto se
paga. La corrección es una fila de la siembra y queda anotada para quien lleve esa rebanada.

Y quedó anotado el motivo de que ese encadenamiento se fije en una prueba de la API y no en el
navegador (H-168): **no hay ninguna ruta que habilite un servicio a una empresa**, sólo la siembra
escribe `company_services`, así que una empresa creada por la prueba nunca podrá tener tienda — y la
única que la tiene es la sembrada, sobre la que otra prueba afirma justo lo contrario.

**Verificación**

`pnpm test --force` en verde con **1534** pruebas, 17 más que las 1517 de partida: el ciclo entero
contra el suplente con un servidor de verdad escuchando —la entrega es una petición HTTP contra el
endpoint público, no una llamada al manejador—, el precio, la idempotencia del reintento y el
encadenamiento con la tienda. `pnpm check` limpio y `pnpm lint` sin ninguna incidencia nueva: las
seis que salen son las de H-150, ninguna en los archivos de esta tanda.

`pnpm test:e2e` en verde, **83 de 83**, con `suscripcion.spec.ts` reescrita: afirmaba que no había
nada que contratar (H-158) y ahora conduce el recorrido entero. Sobre una empresa que la propia
prueba crea y borra, porque contratar cambia el estado de una empresa completa.

Y en un navegador de verdad, encadenado: la tienda dice «La empresa que la publica no tiene una
suscripción vigente» → se contrata «Casa de renta» con cinco asientos → la página del suplente cobra
1745,00 MXN → se vuelve y la suscripción está **activa, con sus cinco asientos y su fecha de
renovación** → el cobro aparece en el historial → **la misma tienda sirve su catálogo** → cancelar la
deja operando hasta el vencimiento y la tienda sigue sirviéndose → reactivar y cambiar de plan hacen
lo que dicen.

**Lo que queda fuera**

El **procesador real** (H-85), que es una cuenta con sus credenciales. La fila de la siembra que deja
la vertical de las tiendas (H-166) y la ruta que habilita servicios a una empresa (H-168), las dos de
otras rebanadas.

Y una observación que se deja dicha sin tocar nada: **nadie pasa a cancelada una suscripción cuyo
periodo terminó**. Deja de operar por la fecha —que es lo que las compuertas miran— pero la fila
sigue ahí y sigue siendo «la vigente», así que volver a contratar responde que ya hay una y el camino
es cambiar de plan, que funciona. No rompe ningún escenario de la spec; sí deja un estado que nadie
barre, al lado de la gracia, que sí se barre.

### 2026-08-19 · El desglose del guion: guiones, capítulos y escenas

**Cerrado — rebanada 20, sección «Desglose»: las once tareas, y las dos de «Referencias»**

Las tres entidades sobre las que se organiza un rodaje, con su API entera y sin pantallas:
`apps/api/src/productions/script.ts` y `apps/api/src/routes/script.ts`, veintidós rutas nuevas —de
228 a 250 en el contrato publicado—. Las tablas existían desde la `0002` y las políticas desde la
`0005`: **no hizo falta ninguna migración**.

- **Guiones** con su índice, su archivo y su marca de extracción. Nacen sin extraer, y el estado no
  se recibe por el cuerpo: admitirlo lo convertiría en un valor por omisión que cualquiera puede
  sobrescribir para decir que ya se extrajo.
- **Sustituir el archivo invalida la extracción**, y con ella las tres marcas que describían la del
  archivo anterior. Sustituir es cambiar por **otro**: reasignar el mismo archivo no tira una
  extracción porque alguien corrigió el nombre. Retirarlo sí la invalida.
- **Capítulos** con índice único en la producción, **escenas** con índice único en el capítulo, las
  dos con `409` en dos capas —consulta previa para el mensaje bueno, índice único parcial para la
  carrera de dos peticiones simultáneas—.
- **La etiqueta compuesta** sale de `sceneLabel()` de `@tfv/contracts`, no de una plantilla escrita
  aquí. Es una de las diecisiete fórmulas que H-129 dejó definidas y sin consumir; ésta ya se
  consume, y hace exactamente lo que su spec pide.
- **Recuentos**: escenas por capítulo y planes por escena, cada uno en una consulta por lote y
  nunca nulos, conforme a `computed-fields`.
- **Eliminar un capítulo arrastra sus escenas** —la cascada de la clave foránea es física y aquí la
  baja es lógica, así que la escribe el manejador— y **eliminar una escena desvincula jornadas y
  planes devolviéndolos a su estado inicial**. Las dos se componen: dar de baja un capítulo suelta
  también lo que referenciaba a sus escenas, o quedarían jornadas apuntando a escenas muertas.
- **Eliminar un guion desvincula sus capítulos**: de qué guion salió el texto es procedencia, no
  propiedad.
- **La estructura completa** como índice navegable, sin paginar, en dos consultas.

**La decisión que había que escribir: los índices no se renumeran**

Borrar el capítulo 2 de tres deja al 3 llamándose 3. En un guion real los números son la referencia
de todo el papeleo del equipo —el desglose de arte, la orden del día, las hojas de continuidad— y
renumerar dejaría a media producción hablando de un capítulo que ya es otro. Por eso en la industria
existen los «12A»: se intercala, no se recoloca. La propia spec lo confirma al pedir una consulta
del siguiente índice libre: si los índices se recompactaran, esa consulta sobraría.

De ahí sale la otra mitad, que es la que se equivoca sola: **el siguiente índice es el último más
uno, no el primer hueco**. Rellenar el hueco reutilizaría un número que el equipo ya usó, que es la
misma confusión por la puerta de atrás. El hueco queda libre y se puede pedir a mano — y pedirlo
funciona, que es lo que lo convierte en una posibilidad y no en un residuo.

Está escrito en la cabecera del módulo, en los dos manejadores de baja y en tres pruebas, porque es
exactamente el sitio donde alguien «arreglaría» algo que no está roto.

**Verificado, no supuesto**

- **R-08 y R-09 eran papel, y ahora consta que se miró.** Los dos defectos de la sección
  «Referencias» venían resueltos desde la `0002`. Se comprobó contra el **catálogo del motor** y no
  contra el código que declara las referencias, que es justamente lo que los defectos dicen que
  estaba mal: la única clave foránea que llega a `production_chapters` es `production_scenes.chapter_id`,
  y ninguna del capítulo lleva a órdenes de almacén (R-08); las notas de jornada y los comentarios de
  plan son tablas con su clave foránea y no campos derivados, y `production_workflow_coments` no
  existe porque los dos tipos de comentario se unificaron en `production_comments` (R-09). Con dos
  pruebas, **comprobadas invirtiéndolas** antes de fijarlas. H-177 y H-178.
- **El bloque se recorre contra un servidor de verdad**, no llamando a manejadores:
  `script-recorrido.test.ts` levanta la aplicación en un puerto efímero y la conduce con `fetch`.
  Un guion que nace sin extraer, tres capítulos, nueve escenas de 1.1 a 3.4, la estructura navegable,
  se borra el de en medio y el tres sigue siendo el tres, el siguiente libre dice cuatro, y el dos se
  puede intercalar a mano. La afirmación central se comprobó invirtiéndola: esperando `[1, 2]` —lo
  que daría renumerar— la prueba falla nombrando `[1, 3]`.
- **La estructura exige las dos claves.** La ruta declara la de capítulos y el manejador exige además
  la de escenas, porque la respuesta las contiene. Declarar sólo la primera ampliaría en silencio la
  autoridad de quien la tiene: es H-07 otra vez, resuelto igual, con su prueba.

**Cifras**, medidas sobre una base creada de cero para esta verificación: **1577 pruebas**, 43 más
que las 1534 de partida, y las 43 son de este encargo —42 en `script.test.ts` y el recorrido contra
servidor de verdad—. Por paquete: contratos 406, datos 90, interfaz 119, web 109 y **API 853**, que
sube desde 810. `pnpm check` limpio en los seis paquetes. `pnpm lint` con **las mismas 6 incidencias
de base** (H-150) y ninguna en los archivos de esta tanda.

**Abierto**

- **La escena que referencian las jornadas y los planes puede ser de otra producción** (H-180). La
  clave foránea garantiza que la escena existe, no que sea de su producción — el mismo agujero que
  el capítulo tenía con su guion y que aquí sí se cierra. Hoy es latente porque ninguna ruta escribe
  esos dos `scene_id`; la guarda va donde se escribe el vínculo, que es de otras rebanadas.
- **La spec llama al mismo campo del capítulo «sinopsis» y «descripción»** en dos requisitos
  contiguos (H-179). Implementado sobre `synopsis`, que es como lo llama el modelo.
- La **extracción asistida** del guion es la rebanada 21 y no se tocó: `productions.pdfs.sync` sigue
  siendo la única clave de guiones sin ruta, y está escrito en el código para que se lea como
  decisión y no como olvido.
