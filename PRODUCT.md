# Product

<!-- impeccable:product-schema 1 -->

Verdad de producto de TFV. Es el registro duradero: qué es el sistema, para quién, y qué debe
preservar cualquier trabajo futuro. **No decide nada visual** — el mundo visual vive en `DESIGN.md`
y en los briefs de superficie.

Encabezados en inglés porque son estructura que la herramienta lee. La prosa en español, como en
`openspec/`.

## Platform

web

## Users

Tres perfiles cargan el peso del diseño. Los tres son miembros de una **empresa** (el arrendatario)
y actúan bajo un **rol** con permisos propios de esa empresa.

- **Operador de almacén.** Trabaja en piso: recibe equipo, levanta cotizaciones, aparta unidades
  físicas concretas, imprime etiquetas y entrega. Sesiones cortas e interrumpidas, con el equipo
  delante. Es la cuenta con la que se comprueba que las compuertas hacen algo: el rol sembrado
  `almacenista@tfv.dev` tiene **5 de 255** permisos.
- **Coordinador de producción.** Trabaja en escritorio: desglosa el guion en capítulos y escenas,
  lleva continuidad por jornada de rodaje, arma planes de trabajo, controla presupuesto contra
  gasto y compra equipo a almacenes de otras empresas. Lectura larga y captura densa.
- **Dueño o administrador de empresa.** Configura empresa, roles, membresías, plan, cobros,
  direcciones y sitios públicos. Pocas sesiones, decisiones de alto impacto. **Los propietarios
  eluden toda comprobación de permisos** (`GLOSARIO.md`).

Dos audiencias más existen y son reales, pero no son el centro de gravedad del diseño:

- **Comprador de tienda pública.** Renta o compra desde una tienda servida por subdominio, sin
  conocer el vocabulario interno. Por la decisión D-01 **es la misma entidad** que un usuario del
  panel: padrón único, correo único global. Un mismo principal puede ser miembro de una empresa y
  comprador en la tienda de otra.
- **Administrador de plataforma.** Opera por encima de los arrendatarios; recibe una membresía
  sintética de propietario en cualquier empresa.

## Product Purpose

TFV ("The Film Vault") es una plataforma SaaS multi-arrendatario para la industria audiovisual,
cinematográfica y de renta de equipo en México. Una empresa se suscribe y activa uno o más
**servicios**, y cada servicio es un dominio de negocio completo:

| Servicio | Qué resuelve |
|---|---|
| `warehouses` | Renta y venta de equipo con inventario a nivel de unidad física, cotizaciones con fiscalidad mexicana y chat en tiempo real con el cliente |
| `productions` | Gestión de rodajes: guion → capítulos → escenas, continuidad, planes de trabajo, presupuesto y compras a almacenes de otras empresas |
| `websites` | Constructor de sitios y tiendas públicas servidas por subdominio |
| `locations` | Directorio de locaciones para rodaje |
| `pixit` | Fabricación de mosaicos de ladrillo a partir de fotos (**pausado**, ver constraints) |

Sobre esos servicios se apoya un núcleo común: identidad, empresas, membresías, roles, direcciones,
contrapartes, taxonomías, archivos, notificaciones, suscripciones y cobros.

El éxito es que el trabajo de un día quepa en la aplicación sin salirse a hojas de cálculo,
WhatsApp o papel: que la unidad que se apartó sea la que se entregó, que la cotización impresa
cuadre con su total, y que quien no puede hacer algo entienda por qué.

## Positioning

Dos afirmaciones que un competidor —Rentman, Current RMS, StudioBinder, Yamdu— no podría copiar
con verdad:

1. **Renta y producción son un solo circuito.** Una producción emite una orden de compra que se
   abre en N pedidos de almacén, uno por cada almacén implicado —incluidos almacenes de **otras
   empresas** dentro de la misma plataforma— y se liquida ahí mismo. Las contrapartes se espejan:
   cuando A le compra a B, se crea un cliente en B y un proveedor en A. Las herramientas del
   mercado resuelven un lado o el otro; aquí las dos partes de la transacción viven en el mismo
   sistema.
2. **Hecho para México, no traducido.** Fiscalidad mexicana en las cotizaciones, español como
   idioma base con inglés disponible, cobros y envíos locales. El inglés es traducción; el español
   es el original.

## Operating Context

- **El almacén se lleva por pieza, no por cantidad.** Una fila = un objeto físico, con su propio
  código y once estados posibles. La reserva aparta unidades concretas contra una cotización.
- **Se imprime.** Las medidas generan etiquetas con código de barras y QR (`jsbarcode`, `qrcode`);
  hay una ruta dedicada a la hoja de etiquetas. El papel sigue existiendo en piso.
- **El documento se comparte fuera.** Las cotizaciones se generan como PDF con enlace público
  (`/d/[reference]`), abierto a cualquiera que tenga la dirección. Ese documento lo lee alguien que
  nunca entrará al panel.
- **Se conversa dentro del pedido.** Chat en tiempo real cliente ↔ proveedor sobre el pedido de
  almacén, con protocolo heredado de la pila anterior.
- **El guion es un PDF.** Se sube y de él se extraen capítulos y escenas; el desglose a mano de un
  guion de noventa páginas es trabajo de horas.
- **La tienda pública es del arrendatario.** Cada sitio se sirve en un subdominio derivado de su
  slug, con su propio carrito, checkout y cuenta de comprador.
- **El acceso pasa por tres compuertas independientes**: suscripción vigente, servicio habilitado y
  permiso de rol. Ninguna implica a las otras, y fallar una lleva al nivel inmediatamente superior,
  nunca a la raíz.
- **Cinco superficies con reglas de acceso distintas**: marketing (abierta), autenticación (sólo sin
  sesión), panel (con sesión), documento compartido (con enlace) y tienda pública (por subdominio).

- **El orden de los dispositivos es una constante, no una consecuencia.** La prioridad confirmada
  es **iPad → celular → escritorio → escritorio ultrapanorámico**. La tablet no es un tamaño
  intermedio al que la interfaz se adapta: es el dispositivo de referencia, y el escritorio es la
  ampliación. Cualquier decisión que sólo funcione con ratón y mil trescientos píxeles de ancho
  contradice esto.

## Capabilities and Constraints

**Contrato.** El comportamiento está especificado en `openspec/specs/` — 45 capabilities agrupadas
en contratos de plataforma, identidad, dinero, almacenes, producciones, sitios y Pixit. Las specs
describen **el destino**, no lo que hoy se observa; los defectos confirmados viven en
`openspec/DEFECTS.md` y quedan fuera de la base.

**Vocabulario congelado.** `openspec/GLOSARIO.md` es contrato, no glosario de cortesía. Importa
sobre todo porque **"pedido" designa cuatro entidades distintas**: pedido de comprador, pedido de
almacén, orden de compra de producción y pedido web de Pixit. La interfaz nunca escribe "pedido" a
secas.

**Reglas transversales que el diseño no puede contradecir** (decisiones D-01 a D-09):

- Padrón único de identidad: comprador y miembro son la misma entidad, correo único global.
- Borrado lógico en entidades de negocio; un correo liberado vuelve a estar disponible.
- Dinero en decimal exacto con redondeo por línea, para que un documento impreso siempre cuadre.
- Toda lectura pública acepta identificador **o** slug en la misma posición de la ruta.
- Aislamiento entre arrendatarios en dos capas: aplicación **y** motor de datos.
- Búsqueda insensible a mayúsculas y acentos, con coincidencia parcial.
- 255 permisos con forma `<servicio>.<recurso>.<acción>`. Los roles son propios de cada empresa; no
  hay roles globales.

**Idiomas.** Español por defecto, inglés disponible. La elección explícita vive en cookie y manda
sobre la preferencia del navegador. Tema claro/oscuro por elección del usuario, escrita por el
servidor en `<html>` antes de pintar: la elección manda sobre la del sistema operativo.

**Inteligencia artificial.** Hoy existe **una sola** función de IA: la extracción asistida del
guion (`openspec/specs/script-ai-sync/spec.md`). El modelo devuelve la estructura —capítulo y lista
de escenas con su encabezado— y el sistema recupera los cuerpos por coincidencia aproximada sobre
el texto; el reparto es deliberado. Corre como trabajo durable en segundo plano, expone estado
(pendiente, en curso, completada, fallida) y sus fallos llegan al usuario con motivo y con si puede
reintentarse.

*Decisión abierta, registrada a propósito:* la IA se ampliará a más superficies, pero **no está
comprometido cuáles**. El trabajo de diseño puede establecer un patrón de IA reutilizable —trabajo
en segundo plano, progreso visible sin recargar, revisión de lo extraído, fallo con motivo y
reintento— siempre que **la interfaz sólo afirme lo que existe**. No se anuncian, insinúan ni
maquetan funciones de IA que no estén implementadas.

**Estado de construcción.** El monorepo es una reescritura sobre stack nuevo de dos repositorios
que siguen en producción (`tfv-backend`, `tfv-frontend`, ~200k líneas). 19 de 30 rebanadas
empezadas. Lo que **todavía no existe** y no debe darse por hecho:

- **La portada de marketing no existe.** La raíz redirige: al panel con sesión, a la pantalla de
  acceso sin ella. Las rampas `ink` / `manila` / `chalk` / `signal` están declaradas en los tokens
  para esa portada pero no tienen uso real.
- **Pixit está pausado** (rebanadas 24–27 y 29d). El modelo de datos y los permisos se conservan;
  el servicio no se diseña ni se construye por ahora.
- **No hay proveedor de correo registrado.** Verificación, recuperación e invitación se encolan y
  se escriben en el registro del servicio.
- **No hay procesador de pagos real conectado** (H-85); es configuración externa pendiente.
- Los estados de la interfaz que dependen de rebanadas de servidor sin cerrar (29c–29e) todavía no
  tienen pantalla.

## Brand Commitments

- **Nombre: TFV — The Film Vault.** Fijo.
- **Logotipo: el carrete.** La perforación de la película es de donde sale la identidad. Fijo.
- **Oro de marca `#ffd038`.** Fijo, y **separado a propósito** de la rampa `gold`, que es otro tono
  usado como acento por defecto. Los dos coexisten y no se funden.
- **Voz.** Español de México, de tú, directa y sin adornos, y **explica la consecuencia antes de
  que ocurra**: "Al cambiarla se cierran todas tus sesiones, incluida ésta"; "Los asientos no se
  pueden modificar ni borrar". Los mensajes de error dicen qué pasó y qué hacer, no se disculpan.
- **Los textos de interfaz citados literalmente en las specs son contrato** (mensajes de error,
  etiquetas de estado). No se reescriben por gusto de redacción.

Todo lo demás del sistema visual actual —tipografía, escala, componentes, superficies, densidad—
es evidencia y punto de partida, no compromiso.

## Evidence on Hand

**Real y disponible:**

- `openspec/specs/` — 45 capabilities especificadas con escenarios verificables.
- `openspec/GLOSARIO.md` — vocabulario congelado con su origen en la pila anterior.
- `openspec/DEFECTS.md` y `openspec/HALLAZGOS.md` — defectos confirmados y hallazgos de
  implementación.
- `IMPLEMENTATION.md` — estado vivo de las 30 rebanadas.
- Datos sembrados con los que se puede entrar y ver la aplicación funcionando: cuatro cuentas
  (`admin@`, `duena@`, `almacenista@`, `compradora@` en `tfv.dev`), dos empresas con servicios
  distintos, catálogo, cotizaciones y producciones.
- `packages/ui/src/styles/tokens.css` — tokens con las razones documentadas y contrastes **medidos**,
  no estimados.

**Ausencias que el trabajo futuro no debe rellenar inventando:**

- No hay clientes citables, testimonios, logotipos de terceros, casos de éxito, prensa ni métricas
  de uso. Cualquiera de esas cosas sería fabricada.
- No hay fotografía propia de producciones, equipo, almacenes ni personas.
- No hay precios públicos definidos: los planes existen como entidad (`tier 0` es el gratuito) y
  los precios viven en el procesador de pagos, no en el repo.
- La empresa sembrada *Renta Fílmica del Norte* es **dato de prueba**, no un cliente real.

## Product Principles

1. **Nada se afirma que no exista.** Vale para funciones, para clientes y sobre todo para la IA: se
   destaca donde está implementada y no se insinúa donde no. La sensación de sistema moderno se
   gana con la interfaz, no con promesas.
2. **El circuito cerrado manda.** Producción y almacén son el mismo sistema. Ninguna decisión de
   producto o de interfaz debe romper que una producción compre a un almacén ajeno y lo liquide
   dentro.
3. **La pieza física es la verdad.** Se aparta una unidad, no una cantidad. Lo que la aplicación
   muestre tiene que corresponder a un objeto que alguien puede ir a buscar a un estante.
4. **La compuerta se ve.** Suscripción, habilitación de servicio y permiso son tres comprobaciones
   independientes. Cuando algo no se puede, se dice cuál de las tres falló — nunca un botón que no
   responde.
5. **El vocabulario no se improvisa.** El glosario es contrato: cuatro tipos de pedido tienen cuatro
   nombres, y la interfaz los usa completos aunque sean más largos.

## Accessibility & Inclusion

Compromisos ya vigentes en el código, que son piso y no techo:

- **Contraste medido, no estimado.** Texto a 4.5:1 mínimo; borde de control a 3:1 mínimo, porque el
  borde de un campo no es decoración: es lo que dice dónde se puede escribir. Cuatro papeles se
  apartaron del tema anterior justamente por no llegar (`tokens.css`, nota de contraste).
- **El anillo de foco se declara una vez y no se retira nunca.** Quitarlo por estética deja la
  aplicación inservible con teclado.
- **`prefers-reduced-motion` se respeta con `!important`**, a propósito, para que gane a cualquier
  animación declarada después, incluidas las de línea. Sin eso la preferencia sería una sugerencia.
- **Español e inglés**, con el nombre de cada idioma escrito en sí mismo.
- **Claro y oscuro** como elección del usuario, con `color-scheme` para que los controles nativos
  del navegador no se pinten con el tema contrario.
