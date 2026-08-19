---
name: TFV — Motor de Rayado
description: Un motor traza la estructura a un píxel de dispositivo, y el estado es una marca, no un relleno.
colors:
  canvas: "#ededeb"
  panel: "#fafaf9"
  panel-sunken: "#dedddb"
  panel-hover: "#e4e4e1"
  rule: "#cfcfca"
  rule-strong: "#84847e"
  field: "#6e7075"
  content: "#101114"
  content-muted: "#55585e"
  content-faint: "#64676d"
  accent: "#101114"
  on-accent: "#fafaf9"
  rubric: "#ffd038"
  rubric-ink: "#6b5200"
  focus: "#1877d4"
  danger-fill: "#b3261e"
  marca-reposo: "#84847e"
  marca-curso: "#1877d4"
  marca-firme: "#178a50"
  marca-aparta: "#a66200"
  marca-cuida: "#b36b00"
  marca-alto: "#ce3129"
  marca-leido: "#6d5ce0"
  tinta-reposo: "#55585e"
  tinta-curso: "#0f5fa6"
  tinta-firme: "#116a3e"
  tinta-aparta: "#7a4a00"
  tinta-cuida: "#8a5200"
  tinta-alto: "#b3261e"
  tinta-leido: "#5b4bc4"
  canvas-dark: "#0d0e10"
  panel-dark: "#16171a"
  panel-sunken-dark: "#08090a"
  rule-dark: "#303339"
  rule-strong-dark: "#686c74"
  field-dark: "#7a7d84"
  content-dark: "#f1f1ef"
  content-muted-dark: "#a5a8ae"
  content-faint-dark: "#90939a"
  accent-dark: "#f1f1ef"
  on-accent-dark: "#0d0e10"
  rubric-ink-dark: "#ffd038"
  focus-dark: "#4fa8f0"
  danger-fill-dark: "#ff8a82"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  code:
    fontFamily: "Atkinson Hyperlegible Mono Variable, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    fontFeature: "tnum 1"
rounded:
  all: "0"
spacing:
  xxs: "0.25rem"
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.5rem"
  xxl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.all}"
    padding: "0 1rem"
    height: "var(--control-h)"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.content}"
    rounded: "{rounded.all}"
    padding: "0 1rem"
    height: "var(--control-h)"
  button-danger:
    backgroundColor: "{colors.danger-fill}"
    textColor: "#ffffff"
    rounded: "{rounded.all}"
    padding: "0 1rem"
    height: "var(--control-h)"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.content}"
    rounded: "{rounded.all}"
    padding: "0 0.75rem"
    height: "var(--control-h)"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.content}"
    rounded: "{rounded.all}"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-reposo}"
    typography: "{typography.label}"
    rounded: "{rounded.all}"
---

# Design System: TFV — Motor de Rayado

Documenta el sistema **tal como está construido**, no como se pretendía. Fuente:
`packages/ui/src/styles/tokens.css` y los componentes de `packages/ui/src/components/`. La
referencia viva se mira en la ruta `/sistema`.

El contrato de dirección se emite en el marcado de `apps/web`, de primer hijo del cuerpo, bajo la
clave de semilla `9f316c9f`.

## Overview

**Creative North Star: "Motor de Rayado"**

Un motor traza la estructura de la pantalla. Los filetes no son bordes de CSS: miden **un píxel de
dispositivo**, resueltos por resolución de pantalla, de modo que en una iPad a 2dppx la línea son
0,5 px de CSS y sale del grosor que el panel puede dibujar en vez del que el navegador redondea.
De ahí sale el carácter: nitidez de instrumento de precisión, no suavidad de aplicación de consumo.

Las superficies se separan por **línea y escalón de valor**, jamás por sombra ni por esquina
redondeada. Una sombra difusa sugiere separación; un filete la afirma. Y el estado nunca se dice
con un relleno de color: se dice con una **muesca trazada acompañada de su nombre**, siempre los
dos, porque once estados de unidad y cuatro tipos de pedido no caben en una paleta que alguien
pueda memorizar, y porque quien no distingue el verde del ámbar tiene el mismo derecho a saber en
qué va una cotización.

Rechazos confirmados por el cliente, y vinculantes: **no puede parecer un panel de startup**
—tarjetas redondeadas flotando, degradados, gráficas de juguete—, **no puede parecer una
herramienta gringa traducida**, y **no puede sentirse como hojas de papel**. Claro y oscuro son los
dos ciudadanos de primera: la escena de uso son las tres a la vez —nave de almacén con luz mixta,
oficina de producción con luz constante, y set—, así que ninguno es «el modo alterno».

**Key Characteristics:**
- Cero radios. No hay una sola esquina redondeada en el sistema.
- Filetes de un píxel de dispositivo, no de CSS.
- El estado es una marca trazada con su nombre al lado, nunca un chip de color.
- Dos calibraciones de densidad: tacto de partida, densidad de escritorio.
- Ley de paleta: siete entradas semánticas fijas, y nada se pinta fuera de ellas.
- Todo contraste está **medido**, no estimado.

## Colors

Una paleta corta y legislada: tres valores de superficie, tres de tinta, una rúbrica de marca, y
una escalera semántica de siete entradas donde cada color significa exactamente una cosa.

### Primary
- **Inversión de tinta** (`#101114` claro / `#f1f1ef` oscuro): la acción primaria es el contrario
  del fondo. Negro sobre claro, claro sobre negro. Es la señal más fuerte disponible sin gastar
  ningún color que la escalera semántica necesite para significar algo.

### Secondary
- **Oro de marca** (`#ffd038`): compromiso de marca, fijo. Es la **rúbrica**: marca la posición
  activa —la clave del raíl, la opción elegida de un menú— y nada más. Sobre fondo claro **no puede
  ser texto** (1,6:1); ahí se usa como relleno con tinta encima, o se sustituye por su versión de
  tinta `#6b5200`. Sobre oscuro sí es legible (12,2:1) y ahí sí puede escribir.

### Neutral
- **Lienzo** (`#ededeb` / `#0d0e10`): la superficie técnica de fondo. Gris neutro frío, nunca crema
  ni hueso: el papel está explícitamente descartado.
- **Panel** (`#fafaf9` / `#16171a`): la superficie elevada, un escalón por encima del lienzo.
- **Hundido** (`#dedddb` / `#08090a`): un escalón por debajo, para prefijos y ranuras.
- **Filete suave** (`#cfcfca` / `#303339`): separa **dentro** de un grupo. Queda a propósito por
  debajo de 3:1; subirlo convertiría cada tabla en una reja.
- **Filete fuerte** (`#84847e` / `#686c74`): separa **regiones**. Llega a 3:1 medido.
- **Borde de control** (`#6e7075` / `#7a7d84`): sólo para lo que se puede escribir o pulsar.
- **Tinta** (`#101114` / `#f1f1ef`), **atenuada** (`#55585e` / `#a5a8ae`), **tenue** (`#64676d` /
  `#90939a`): las tres voces de texto, todas por encima de 4,5:1 en su peor caso.

### La escalera semántica

Siete entradas fijas y numeradas. Cada una tiene dos valores: la **marca** que se traza (mínimo
3:1 contra el lienzo) y la **tinta** con la que se escribe (mínimo 4,5:1).

| Entrada | Significa | Marca (claro / oscuro) |
|---|---|---|
| `reposo` | Borrador, sin comprometer | `#84847e` / `#686c74` |
| `curso` | En curso, activo, en proceso | `#1877d4` / `#4fa8f0` |
| `firme` | Confirmado, entregado, pagado | `#178a50` / `#3fbf77` |
| `aparta` | Reservado, apartado | `#a66200` / `#e09a2b` |
| `cuida` | Por vencer, requiere atención | `#b36b00` / `#f5b518` |
| `alto` | Bloqueado, rechazado, error | `#ce3129` / `#f5675c` |
| `leido` | Extraído por el modelo, falta revisar | `#6d5ce0` / `#9c8bff` |

`aparta` y `leido` no existían en el sistema anterior y son los dos estados propios de este
producto: la unidad física comprometida contra una cotización, y lo que la extracción del guion
sacó y todavía nadie ha revisado.

### Named Rules

**La regla de la ley de paleta.** La escalera es cerrada. Un estado nuevo entra como entrada nueva
de la escalera, con su marca y su tinta medidas; nunca como un color suelto de una rampa.

**La regla del color que no viaja solo.** Ninguna marca de estado se muestra sin su nombre escrito
al lado. El color acelera la lectura de quien ya conoce el sistema; el nombre es lo que lo hace
utilizable por quien no, y por quien no distingue esos dos tonos.

**La regla de la rúbrica.** El oro marca dónde estás, y nada más. No decora, no enfatiza, no
celebra.

**La regla del único color escrito dos veces.** El lienzo aparece a mano en `viewport.themeColor`
de `apps/web/src/app/layout.tsx`, porque el navegador lo lee antes de que exista ninguna hoja de
estilos y ahí no se puede referenciar una variable. Es el único sitio del sistema donde un color se
duplica; si `--canvas` cambia, ese par cambia con él.

**La regla del relleno medido aparte.** Una marca se mide contra el lienzo que la rodea; un relleno
contra el texto que lleva encima. Son dos preguntas distintas y dan dos valores distintos, por eso
`danger-fill` existe separado de `marca-alto`.

## Typography

**Body / Display Font:** Atkinson Hyperlegible Next Variable (reserva: `ui-sans-serif`, `system-ui`)
**Mono Font:** Atkinson Hyperlegible Mono Variable (reserva: `ui-monospace`)

**Character:** No es una elección de gusto. Este sistema está lleno de códigos —unidades de
existencia, folios, medidas, códigos de barras— donde confundir `0` con `O`, o `1` con `l`, es un
error de operación y no de estética. Esta familia se diseñó exactamente para que esos pares no se
confundan, lo que además responde a la exigencia de que la interfaz sea legible para alguien que la
abre por primera vez.

### Hierarchy
- **Display** (700, `1.75rem`, 1.15): título de pantalla. Uno por vista.
- **Headline** (700, `1.375rem`, 1.2): título de sección mayor.
- **Title** (700, `1.125rem`, 1.3): título de bloque y de diálogo.
- **Body** (400, `0.9375rem`, 1.5): el texto de la aplicación. Medida máxima 65–75 caracteres.
- **Label / aparato** (600, `0.6875rem`, `0.08em`, versalitas): la voz que **nombra** —columnas,
  estados, metadatos— frente a la voz que dice.
- **Code** (400, `0.8125rem`, `tnum`): códigos, folios e importes.

### Named Rules

**La regla del aparato.** Las versalitas de once píxeles nombran cosas que se recorren con la vista:
encabezados de columna, estados, etiquetas de metadato. **No** se usan para etiquetas de formulario:
en español son largas —«Frecuencia de cobro», «Correo de acceso»— y en versalitas apretadas dejan
de leerse y empiezan a descifrarse. El mundo manda en el aparato; la tarea manda en el formulario.

**La regla de las cifras tabulares.** Todo número que se pueda comparar en columna va en cifras
tabulares. Sin ellas, cambiar un `1` por un `8` mueve el resto de la fila.

## Layout

**Dos calibraciones, no una escala fluida.** El orden de dispositivos del producto es
**iPad → celular → escritorio → ultrapanorámico**: la tablet es el dispositivo de referencia y el
escritorio la ampliación. Las alturas de control salen de variables, no de valores fijos:

| Variable | Tacto (por defecto) | Escritorio |
|---|---|---|
| `--control-h` | `2.75rem` (44 px) | `2.125rem` |
| `--control-h-sm` | `2.25rem` | `1.75rem` |
| `--control-h-lg` | `3.25rem` | `2.5rem` |
| `--row-h` | `3rem` | `2.25rem` |

La calibración de escritorio exige **ancho y puntero fino** a la vez
(`min-width: 64rem` **and** `pointer: fine`). El ancho por sí solo daría la calibración equivocada
justo en el dispositivo de referencia: una iPad Pro apaisada mide 1024 px y se sigue tocando con el
dedo.

**Puntos de ruptura:** `phone` 30rem, `tablet` 48rem, `laptop` 64rem, `desktop` 80rem, `ultra`
108rem. En ultrapanorámico el contenido **no se estira**: mantiene su medida y el margen ancho
absorbe el sobrante.

**Escala de espaciado:** cuatro píxeles de base, de `0.25rem` a `3rem`. Más espacio encima de un
encabezado que debajo.

**Tablas.** Por debajo de tableta una tabla **no se desplaza en horizontal**: cada fila se despliega
en bloque con el nombre de su columna al lado del valor. El desplazamiento lateral esconde las
últimas columnas —que en este sistema son la tarifa y el estado— y las esconde sin anunciarlo.

## Elevation & Depth

**Este sistema es plano.** La profundidad se comunica por **escalón de valor y filete**, no por
sombra. Hundido, lienzo y panel forman tres niveles de superficie que el filete delimita.

### Shadow Vocabulary

Sólo hay dos sombras en todo el sistema, y las dos son para capas que flotan sobre contenido vivo,
donde el filete solo no basta para decir qué está encima:

- **Diálogo** (`box-shadow: 0 8px 28px rgb(0 0 0 / 0.22)`; en oscuro `0.6`): la ventana modal.
- **Menú** (`box-shadow: 0 6px 20px rgb(0 0 0 / 0.18)`; en oscuro `0.55`): el desplegable.

Las dos llevan desplazamiento y difuminado reales. Un halo de color a desplazamiento cero es
decoración y no existe aquí.

### Named Rules

**La regla del filete que afirma.** Si dos cosas tienen que distinguirse, se separan con una línea
y un escalón de valor. La sombra se reserva para lo que literalmente está encima de otra cosa.

## Shapes

**Cero radios.** Todos los tokens de radio valen `0`, incluidos los valores por defecto de
Tailwind. No es un ajuste: es la ley del mundo, y es además la palanca que aplanó las pantallas ya
escritas sin tocarlas una por una.

La forma recurrente es la **muesca**: un cuadrado de 8 px con trazo de 1,5 px que dice estado.
Hueca en reposo, **maciza cuando el estado es terminal** —entregado, pagado, rechazado—, de manera
que «de aquí ya no se sale» se lee sin leer. La misma muesca marca la posición activa del raíl y la
opción elegida de un menú: repetirla es lo que la hace legible sin leyenda.

El avatar es cuadrado. El interruptor es una vía rectangular con un bloque que corre por ella.
Ninguna forma redonda sobrevive.

## Components

### Buttons
- **Shape:** sin radio (`0`). Altura de la calibración activa.
- **Primary:** inversión de tinta (`accent` / `on-accent`), `0 1rem` de relleno horizontal.
- **Secondary:** panel con borde de control de **un píxel de CSS completo**, no un filete: el
  límite de un control tiene que verse.
- **Ghost:** sin fondo ni borde, tinta atenuada que se aclara al pasar por encima.
- **Danger:** `danger-fill` con su propio texto medido (6,54:1 claro, 8,47:1 oscuro).
- **Hover / Focus:** sólo transición de color, 150 ms, amortiguada y **sin rebote**. El foco es el
  anillo global del sistema.
- **Loading:** el botón queda inservible y lo anuncia con `aria-busy`. No es cosmético: impide el
  envío doble, que en un formulario de cobro significa cobrar dos veces.

### Badge — la marca de estado
- Muesca + nombre en voz de aparato, sin fondo. `filled` para estados terminales.
- Los nombres del sistema anterior (`neutral`, `success`, `warning`, `danger`, `accent`) siguen
  funcionando, mapeados a la escalera.

### Inputs
- Borde de control de 1 px, altura de la calibración, sin radio.
- El error se escribe en `tinta-alto` y el borde pasa a `marca-alto`.
- Los importes van en la cuota monoespaciada con cifras tabulares y alineados a la derecha.

### Rail — el raíl de claves
- La pieza de composición del mundo: una columna de claves con su muesca, que en tacto corre
  **arriba y en horizontal** porque una columna a la izquierda de una iPad es espacio que el pulgar
  no alcanza y que la tabla necesita.
- La clave activa lleva la muesca maciza en rúbrica.

### Dialog
- Sin radio, filete fuerte, y la sombra de diálogo.
- Debajo de tableta ocupa el borde inferior a todo el ancho: centrado en un teléfono queda bajo el
  teclado en cuanto se toca un campo.

### Callout
- Caja rayada **sin relleno tintado**. El tono vive en el icono —cuatro formas distintas, no el
  mismo icono repintado— y el texto se queda en tinta normal, que es lo que permite leer un aviso
  largo.

## Do's and Don'ts

**Do**
- Medir el contraste antes de fijar un color, y anotar el número junto al valor.
- Escribir el nombre del estado junto a su marca, siempre.
- Sacar las alturas de control de las variables de calibración, no de un valor fijo.
- Usar cifras tabulares en todo lo que se compare en columna.
- Separar con filete y escalón de valor.

**Don't**
- No redondear una esquina. Ninguna.
- No pintar un estado con un relleno de color de fondo.
- No usar una rampa numerada heredada en código nuevo: la rampa `gray` sólo sobrevive porque la
  usa la hoja de cotización impresa, que **no debe seguir al tema** —un documento que alguien
  imprime o guarda en PDF no cambia de color porque el panel esté en oscuro.
- No poner el oro de marca como texto sobre fondo claro.
- No animar con rebote, ni escalar al aparecer: un solo eje, amortiguado.
- No numerar secciones salvo que el orden sea información que alguien necesita.
- No usar el aparato para etiquetas de formulario.
- No añadir una sombra que no sea la del diálogo o la del menú.
