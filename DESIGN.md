---
name: TFV — Hoja de Llamado
description: La hoja de llamado como superficie de control oscura, donde cada estado toma una temperatura de set.
colors:
  canvas: "#f1f2f6"
  panel: "#ffffff"
  panel-raised: "#f8f9fc"
  panel-sunken: "#e7e9f0"
  edge: "#d8dce6"
  edge-control: "#7c8496"
  content: "#0b0d12"
  content-muted: "#4a5162"
  content-faint: "#5c6375"
  accent: "#ffd038"
  on-accent: "#0b0d12"
  focus: "#0a6ea8"
  danger-fill: "#b02418"
  luz-reposo: "#8b93a5"
  luz-curso: "#4fd8f5"
  luz-firme: "#33d98a"
  luz-aparta: "#ffd038"
  luz-cuida: "#ff9f45"
  luz-alto: "#ff5c4d"
  luz-leido: "#ff6fa8"
  tinta-curso: "#0a5f7a"
  tinta-firme: "#0f6b45"
  tinta-aparta: "#6e5300"
  tinta-cuida: "#8a4a00"
  tinta-alto: "#b02418"
  tinta-leido: "#a3175c"
  canvas-dark: "#08090c"
  panel-dark: "#0f1117"
  panel-raised-dark: "#161922"
  edge-dark: "#2a2f3c"
  edge-control-dark: "#646d82"
  content-dark: "#f2f4f8"
  content-muted-dark: "#a9b0be"
  content-faint-dark: "#8a92a2"
  focus-dark: "#6fdcf5"
  danger-fill-dark: "#ff5c4d"
  tinta-curso-dark: "#6fdcf5"
  tinta-firme-dark: "#6ae8a8"
  tinta-aparta-dark: "#ffd038"
  tinta-cuida-dark: "#ffb067"
  tinta-alto-dark: "#ff8a80"
  tinta-leido-dark: "#ff8fbc"
typography:
  display:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 6vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.015em"
    fontVariation: "wdth 118"
  headline:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "1.3125rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.09em"
    lineHeight: 1.2
    fontVariation: "wdth 108"
  code:
    fontFamily: "Atkinson Hyperlegible Mono Variable, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontFeature: "tnum 1"
rounded:
  xs: "0.375rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  2xl: "1.5rem"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  xxl: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "var(--control-h)"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.content}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "var(--control-h)"
  button-danger:
    backgroundColor: "{colors.danger-fill}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "var(--control-h)"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.content}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.content}"
    rounded: "{rounded.lg}"
    padding: "0 0.75rem"
    height: "var(--control-h)"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-reposo}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
---

# Design System: TFV — Hoja de Llamado

Documenta el sistema **tal como está construido**. Fuente: `packages/ui/src/styles/tokens.css` y
los componentes de `packages/ui/src/components/`. La referencia viva se mira en `/sistema`.

El contrato de dirección se emite en el marcado de `apps/web`, de primer hijo del cuerpo.

## Overview

**Creative North Star: "Hoja de Llamado"**

La hoja de llamado es el documento que toda la industria audiovisual lee cada mañana: todo lo del
día en una sola superficie, los hechos duros arriba —fecha, día X de Y, citación, puesta de sol— y
los bloques debajo. Este sistema conserva esa arquitectura y **cambia su materia**: no es papel, es
un panel oscuro iluminado.

La cromática no está inventada. Son **temperaturas de set**: tungsteno a 3200 K, HMI a 5600 K, la
magenta de la hora mágica, el rojo de la luz de seguridad. Cada estado del sistema toma una, así que
el color dice algo antes de que nadie lea la etiqueta, y lo que dice es vocabulario que esta gente
ya usa.

Rechazos confirmados y vinculantes: **no puede parecer un panel de startup**, **no puede parecer
una herramienta gringa traducida**, **no puede sentirse como papel**, y **no puede ser crudo** —una
iteración anterior se descartó entera por eso: correcta, austera y sin alma.

**Key Characteristics:**
- Lienzo oscuro de partida, con el claro como par legítimo y no como modo alterno.
- Tarjetas con degradado teñido por temperatura y filo superior de luz.
- Al pasar el ratón cambia el **color**, nunca la posición.
- Voz de display expandida al 118%, del eje de ancho de la propia familia de texto.
- Radios generosos.
- Todo contraste **medido**, no estimado.

## Colors

### Primary
- **Oro de marca** (`#ffd038`): compromiso de marca, y aquí por fin trabaja. Es la acción primaria
  —relleno con tinta encima, 13.26:1— y es el estado `aparta`, que es el estado propio de TFV: la
  unidad física comprometida contra una cotización. En la iteración anterior el oro no podía ser
  texto sobre claro (1.6:1) y quedaba invisible; sobre relleno rinde en los dos temas.

### Las temperaturas
Cada estado tiene dos valores: `luz-*`, el tono puro del que sale el degradado de la tarjeta, que
**nunca se usa como texto**; y `tinta-*`, el color con el que se escribe, medido a 4.5:1 mínimo.

| Estado | Significa | Luz | Fuente |
|---|---|---|---|
| `reposo` | Borrador, sin comprometer | `#8b93a5` | sin luz |
| `curso` | En revisión, en proceso | `#4fd8f5` | HMI · 5600 K |
| `firme` | Entregado, pagado, aprobado | `#33d98a` | verde |
| `aparta` | Apartado, reservado | `#ffd038` | oro de marca |
| `cuida` | Por vencer, requiere atención | `#ff9f45` | tungsteno · 3200 K |
| `alto` | Bloqueado, rechazado, error | `#ff5c4d` | luz de seguridad |
| `leido` | Extraído por el modelo, sin revisar | `#ff6fa8` | hora mágica |

### Neutral
Lienzo, panel, panel elevado y hundido forman cuatro escalones, más **panel-hover**: la superficie
de paso del puntero, que en claro baja hacia el hundido y en oscuro sube hacia el elevado — ninguna
superficie fija sirve para ambos temas. En oscuro el lienzo es
`#08090c` —negro azulado, no negro puro, para que las tarjetas tengan de dónde despegarse—. El
borde vivo separa capas; el borde de control delimita algo que se puede tocar y llega a 3:1.

### Named Rules

**La regla del color que no viaja solo.** Ningún estado se muestra sin su nombre escrito al lado.
El color acelera a quien ya conoce el sistema; el nombre es lo que lo hace utilizable por quien no,
y por quien no distingue el ámbar del verde.

**La regla de la temperatura.** Un estado nuevo entra tomando una temperatura de set, con su `luz` y
su `tinta` medidas. Nunca un color suelto de una rampa.

**La regla del relleno medido aparte.** Una luz se mide contra el lienzo que la rodea; un relleno
contra el texto que lleva encima. Por eso `danger-fill` existe separado de `luz-alto`.

### La rúbrica en la navegación

La sección activa lleva el oro **en su versión de tinta** (`tinta-aparta`): el icono de la entrada
actual, la página actual de la paginación, el paso activo del asistente, la vista elegida. El oro
puro sobre panel claro da 1.6:1, así que como señal de posición siempre viaja en la tinta o como
relleno con tinta encima — nunca como trazo fino sobre claro.

## Typography

**Familia:** Archivo Variable, con su **eje de ancho** (62–125). El cuerpo va al 100% y el display
al 118%: la letra de rótulo de panel de control sale de la misma familia en vez de una tipografía
disfraz de ciencia ficción.

**Mono:** Atkinson Hyperlegible Mono, para códigos, folios e importes. Sobrevive por una razón de
producto: confundir `0` con `O` o `1` con `l` en un código de unidad es un error de operación.

### Named Rules

**La regla de la leyenda.** Las versalitas espaciadas nombran columnas, estados y metadatos. **No**
se usan para etiquetas de formulario: en español son largas y en versalitas dejan de leerse. El
mundo manda en la leyenda; la tarea manda en el formulario.

**La regla de las cifras tabulares.** Todo número comparable en columna va tabular.

## Layout

**Dos calibraciones.** El orden de dispositivos es **iPad → celular → escritorio →
ultrapanorámico**. Las alturas de control salen de variables: en tacto `--control-h` mide 44 px, en
escritorio 36. La calibración de escritorio exige **ancho y puntero fino** a la vez, porque una
iPad Pro apaisada mide 1024 px y se sigue tocando con el dedo.

**Tablas.** Por debajo de tableta una tabla no se desplaza en horizontal: cada fila se despliega en
bloque con el nombre de su columna al lado del valor. El desplazamiento lateral esconde tarifa y
estado sin anunciarlo.

## Elevation & Depth

Capas reales. Cada tarjeta lleva sombra suave y un **filo superior de luz** —un degradado de 1 px
en el borde de arriba, teñido de su propia temperatura— que es lo que separa una tarjeta de un
rectángulo pintado. Sobre un lienzo oscuro, el degradado solo se lee como mancha; el filo es lo que
lo convierte en superficie.

- **Tarjeta**: `0 1px 2px rgb(0 0 0 / 0.08), 0 8px 24px -12px rgb(0 0 0 / 0.28)`
- **Menú**: `0 12px 32px -8px rgb(0 0 0 / 0.28)` (0.7 en oscuro)
- **Diálogo**: `0 24px 64px -16px rgb(0 0 0 / 0.4)` (0.8 en oscuro)

## Motion

Con moderación, y con una regla que lo gobierna todo: **sólo se anima lo que de verdad está
ocurriendo**. Hay exactamente dos movimientos autorales y una transición.

**El encendido.** Al cargar una superficie, el teñido de cada tarjeta sube desde cero hasta su
reposo, escalonado por columnas: un panel de control alimentándose. Es **un solo momento**, no una
entrada distinta por sección. El contenido está visible desde el primer fotograma; lo que entra es
la luz, no el dato.

**La respiración.** El único movimiento continuo, y se gana diciendo la verdad: va exclusivamente
en tarjetas cuyo trabajo está corriendo ahora mismo —una extracción de guion en segundo plano, una
reserva a punto de expirar—. De adorno, en dos días nadie miraría la señal, que es lo contrario de
que el sistema se sienta vivo.

**El hover.** Cambia el degradado y el borde. **Nada se mueve de sitio**: en una rejilla densa, una
tarjeta que se levanta obliga al ojo a recolocar todo lo que tiene al lado.

### El teñido es una propiedad registrada

Un navegador **no sabe interpolar un `linear-gradient`**: `transition: background` sobre un
degradado no lo funde, lo salta. Registrando el porcentaje con `@property` y tipo `<percentage>`,
lo que se anima es un número —que sí interpola— y el degradado se recalcula por fotograma. Sin
esto, el hover de color parpadea en vez de encenderse.

### Named Rules

**La regla del dato que no espera.** Una cifra animada se pinta completa en el servidor. La cuenta
es un añadido del cliente y sólo corre con movimiento permitido: sin JavaScript, con
`prefers-reduced-motion` o antes de hidratar, el número está ahí y es correcto. Una cifra que hay
que esperar para leer no es una animación, es un dato escondido.

**La regla del último fotograma.** Toda cuenta se fija al valor exacto al terminar, nunca al que
calcule la curva. Una salida exponencial no llega a uno —vale 0.999— y sobre 1284 redondea a 1283.
Aquí las cifras son existencias y dinero.

**La regla del peor caso.** El descenso al origen ocurre dentro del primer fotograma, no antes de
pedirlo. Si el navegador nunca lo entrega —pestaña en segundo plano, batería baja— el peor caso es
que la cifra real se quede quieta, no que se quede un cero en pantalla.

## Shapes

Radios generosos: 6 px en marcas pequeñas, 12–16 en tarjetas y controles, 24 en diálogos. Una
iteración anterior los puso todos en cero y el resultado se leyó como una hoja de cálculo vieja.

## Components

### Cards
El degradado nace en la esquina superior izquierda a `--tint-rest` y se disuelve en el panel al
58%. La dosis cambia por tema —22% en claro, 15% en oscuro— porque sobre blanco un teñido bajo se
disuelve y sobre casi negro el mismo valor ya es un campo de color.

**Sólo las tarjetas que llevan a algún sitio reaccionan** (`live`). Encender una tarjeta de sólo
lectura enseña a desconfiar de la señal, que es peor que no tenerla.

### Buttons
Primario en oro relleno. Secundario con borde de control. **Deshabilitado sale del color de la
variante y cae a neutro**: un primario en oro al 55% se lee como un oro enfermo y enseña a dudar
del color de marca en el resto de la pantalla.

### Badge
Punto de la temperatura pura junto al nombre. Lleva `w-fit`: dentro de una columna flexible los
hijos se estiran en el eje transversal, y una insignia estirada de borde a borde deja de leerse
como marca.

## Do's and Don'ts

**Do**
- Medir el contraste antes de fijar un color y anotar el número junto al valor.
- Escribir el nombre del estado junto a su color, siempre.
- Sacar las alturas de control de las variables de calibración.
- Reaccionar al ratón sólo con color.

**Don't**
- No animar nada que no esté ocurriendo de verdad en el sistema.
- No mover, escalar ni levantar nada al pasar el ratón. En una rejilla densa obliga al ojo a
  recolocar todo lo que hay al lado.
- No usar `luz-*` como color de texto: son tonos de degradado y no están medidos para eso.
- No usar una rampa numerada heredada en código nuevo: la rampa `gray` sólo sobrevive porque la usa
  la hoja de cotización impresa, que **no debe seguir al tema**.
- No usar la leyenda para etiquetas de formulario.
- No forzar el tema oscuro por defecto: `DEFAULT_THEME` es `system` y respeta la preferencia del
  sistema operativo, que es lo que la spec de `app-shell` manda.
