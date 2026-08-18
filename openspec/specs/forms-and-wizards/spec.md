# Formularios y asistentes

## Purpose

El otro patrón que se repite decenas de veces. Un formulario aquí no es sólo un conjunto de campos:
casi siempre incluye subida de archivos, a veces se reparte en pasos, y su confirmación puede
disparar efectos que el usuario debe entender antes de aceptar.

Los formularios por pasos merecen atención especial: hay asistentes de cinco pasos —crear un
producto de almacén— con validación **por paso**, de modo que se puede avanzar teniendo incompletos
los pasos posteriores pero no el actual. Ese matiz es lo que hace usable un formulario de treinta
campos.

Y los formularios que suben archivos tienen un orden de operaciones que importa: la entidad se crea
primero y los archivos se asocian después, porque la subida es directa al almacenamiento y puede
fallar por su cuenta.

## Requirements

### Requirement: Validación al perder el foco y al enviar

Un campo SHALL validarse cuando el usuario termine de editarlo y de nuevo al enviar el formulario.

No SHALL mostrarse un error en un campo que el usuario aún no ha tocado, salvo tras un intento de
envío.

#### Scenario: Un campo intacto no muestra error

- **GIVEN** un formulario recién abierto con campos obligatorios vacíos
- **WHEN** el usuario aún no ha interactuado
- **THEN** no se muestra ningún error

#### Scenario: Enviar revela todos los errores

- **WHEN** el usuario envía un formulario con tres campos obligatorios vacíos
- **THEN** los tres muestran su error
- **AND** el foco se sitúa en el primero

### Requirement: Los errores del servidor se sitúan en su campo

Cuando el servidor rechace un envío señalando campos concretos, el formulario SHALL mostrar cada
mensaje junto a su campo correspondiente.

Un error que no corresponda a ningún campo SHALL mostrarse como aviso general del formulario.

#### Scenario: Un correo duplicado se señala en su campo

- **WHEN** el servidor rechaza el envío porque el correo ya existe
- **THEN** el mensaje aparece junto al campo de correo
- **AND** el resto del formulario conserva lo que el usuario había escrito

#### Scenario: Un error general se muestra arriba

- **WHEN** el servidor rechaza el envío por un motivo no atribuible a un campo
- **THEN** el mensaje aparece como aviso general del formulario

### Requirement: Envío protegido contra duplicados

Mientras un envío esté en curso, el formulario SHALL impedir enviarlo de nuevo e indicar
visualmente que está trabajando.

#### Scenario: Pulsar dos veces produce un solo envío

- **WHEN** el usuario pulsa el botón de guardar dos veces seguidas
- **THEN** se realiza un único envío

### Requirement: Validación por paso en los asistentes

Un formulario por pasos SHALL validar **únicamente el paso actual** al avanzar, y SHALL validar
todos los pasos al enviar.

El indicador de pasos SHALL señalar qué pasos tienen errores pendientes, y SHALL permitir volver a
un paso anterior sin perder lo introducido.

#### Scenario: Se avanza con pasos posteriores vacíos

- **GIVEN** un asistente de cinco pasos con el primero completo
- **WHEN** el usuario avanza al segundo
- **THEN** avanza sin que los pasos tres a cinco produzcan error

#### Scenario: Un paso incompleto impide avanzar

- **GIVEN** el paso actual con un campo obligatorio vacío
- **WHEN** el usuario intenta avanzar
- **THEN** permanece en el paso y ve el error

#### Scenario: Volver atrás conserva lo escrito

- **GIVEN** un usuario en el paso cuatro
- **WHEN** vuelve al paso dos
- **THEN** encuentra todo lo que había introducido

#### Scenario: El indicador señala los pasos con error

- **WHEN** el usuario intenta enviar con errores en los pasos dos y cuatro
- **THEN** el indicador los marca
- **AND** el formulario no se envía

### Requirement: Cancelar con cambios pide confirmación

Cuando el usuario intente cerrar o cancelar un formulario con cambios sin guardar, el sistema SHALL
pedir confirmación antes de descartarlos.

Un formulario sin cambios SHALL cerrarse directamente.

#### Scenario: Se avisa antes de descartar

- **GIVEN** un formulario con campos modificados
- **WHEN** el usuario intenta cerrarlo
- **THEN** se le pide confirmación

#### Scenario: Sin cambios no se molesta al usuario

- **GIVEN** un formulario abierto y sin tocar
- **WHEN** el usuario lo cierra
- **THEN** se cierra sin preguntar

### Requirement: Confirmación de acciones destructivas

Toda eliminación SHALL exigir una confirmación explícita que **muestre la entidad concreta** que se
va a eliminar, no un mensaje genérico.

Cuando la eliminación arrastre otras entidades, la confirmación SHALL enumerar qué más se perderá.

#### Scenario: La confirmación identifica lo que se borra

- **WHEN** el usuario elimina un producto
- **THEN** la confirmación muestra ese producto, con su nombre y su imagen

#### Scenario: Se advierte del alcance de una cascada

- **GIVEN** un almacén con productos, cotizaciones y pedidos
- **WHEN** el usuario intenta eliminarlo
- **THEN** la confirmación enumera qué se eliminará con él
- **AND** exige una acción deliberada, no un simple aceptar

### Requirement: Los archivos se suben tras crear la entidad

Un formulario que incluya archivos SHALL crear primero la entidad y asociar los archivos después,
informando del progreso de subida.

Si la subida falla, la entidad SHALL permanecer creada y el formulario SHALL ofrecer reintentar
únicamente los archivos fallidos.

#### Scenario: Una subida fallida no pierde el trabajo

- **GIVEN** un formulario de producto con cuatro imágenes
- **WHEN** la entidad se crea y falla la subida de una imagen
- **THEN** el producto existe con las tres imágenes correctas
- **AND** se ofrece reintentar sólo la fallida

#### Scenario: Se informa del progreso

- **WHEN** se suben varios archivos
- **THEN** el formulario indica cuántos van completados

### Requirement: Selector de archivos con vista previa

El selector de archivos SHALL aceptar arrastrar y soltar y selección manual, SHALL mostrar una
vista previa de lo seleccionado, y SHALL permitir quitar un archivo antes de enviar.

SHALL rechazar en el momento de la selección los archivos que excedan el tamaño admitido o cuyo
tipo no esté permitido, explicando el motivo.

Cuando el navegador no sepa descodificar el formato —`heic` y `heif` fuera de Apple, y los
contenedores de video que no trae de casa—, el selector SHALL **decir que esa vista previa no se
puede mostrar aquí** en lugar de dejar el hueco. Un recuadro gris se lee como «este archivo no se
subió», que es lo contrario de lo que pasa: el archivo se admite y se sube igual (ver `H-51`).

#### Scenario: Un tipo no admitido se rechaza al seleccionarlo

- **WHEN** el usuario arrastra un archivo de tipo no permitido
- **THEN** se rechaza en el acto
- **AND** se indica qué tipos se admiten

#### Scenario: Las imágenes se previsualizan

- **WHEN** el usuario selecciona imágenes
- **THEN** ve una miniatura de cada una antes de enviar
- **AND** puede quitar cualquiera

#### Scenario: Un formato de cámara de móvil se previsualiza donde el navegador sabe

- **GIVEN** un navegador que descodifica el formato —Safari con un `heic`, por ejemplo—
- **WHEN** el usuario selecciona una imagen en un formato propio de cámaras de teléfono
- **THEN** la vista previa se muestra correctamente

#### Scenario: Y donde no sabe, se dice

- **GIVEN** un navegador que no descodifica el formato
- **WHEN** el usuario selecciona una imagen en un formato propio de cámaras de teléfono
- **THEN** se indica que esa imagen no se puede previsualizar aquí
- **AND** el archivo se admite y se sube igual

### Requirement: Captura de firma

El sistema SHALL permitir capturar una firma trazada en pantalla, con puntero o con el dedo,
SHALL permitir rehacerla antes de confirmarla, y SHALL almacenarla como archivo asociado a la
entidad que la requiere.

Una firma confirmada no SHALL poder modificarse.

#### Scenario: La firma se puede rehacer antes de confirmar

- **GIVEN** una firma trazada y no confirmada
- **WHEN** el usuario la borra
- **THEN** el área queda limpia para volver a firmar

#### Scenario: Una firma confirmada queda fija

- **GIVEN** una nota de entrega ya firmada
- **WHEN** se abre de nuevo
- **THEN** la firma se muestra y no puede alterarse

### Requirement: Editor de texto enriquecido

Los campos que admitan texto enriquecido SHALL ofrecer negrita, cursiva, subrayado, listas,
encabezados, enlaces, alineación y color.

El contenido SHALL sanearse antes de almacenarse y antes de mostrarse, de modo que no pueda
introducirse marcado ejecutable.

#### Scenario: El marcado peligroso no sobrevive

- **WHEN** se pega contenido que incluye marcado ejecutable
- **THEN** se almacena sin él
- **AND** al mostrarse no se ejecuta nada

### Requirement: Selector de ubicación en mapa

Los formularios de dirección SHALL permitir buscar una dirección con sugerencias, ajustar la
posición exacta sobre un mapa, y SHALL rellenar automáticamente los componentes de la dirección a
partir de la selección.

El usuario SHALL poder corregir manualmente cualquier componente rellenado automáticamente.

#### Scenario: Elegir una sugerencia rellena los campos

- **WHEN** el usuario elige una dirección de las sugerencias
- **THEN** se rellenan calle, número, colonia, ciudad, estado, país y código postal
- **AND** el mapa se centra en esa posición

#### Scenario: El ajuste manual prevalece

- **GIVEN** una dirección rellenada automáticamente
- **WHEN** el usuario corrige el número
- **THEN** se conserva su corrección al guardar

### Requirement: Entrada de importes y de teléfonos con formato

Los campos de importe SHALL mostrar el valor con formato de moneda mientras se escribe y SHALL
entregar un valor numérico al enviarse.

Los campos de teléfono SHALL permitir elegir el código de país por separado del número.

#### Scenario: Un importe con formato se envía como número

- **WHEN** el usuario escribe un importe y el campo lo muestra con separadores de miles
- **THEN** el valor enviado es numérico, sin separadores ni símbolo

### Requirement: Los diálogos se adaptan al ancho

Los formularios presentados en diálogo SHALL ocupar la pantalla completa en anchos pequeños y
presentarse como diálogo centrado en anchos mayores.

En ambos casos, el encabezado y las acciones de confirmar y cancelar SHALL permanecer accesibles
sin depender del desplazamiento.

#### Scenario: Las acciones no se pierden al desplazarse

- **GIVEN** un formulario largo en una pantalla estrecha
- **WHEN** el usuario se desplaza hasta la mitad
- **THEN** las acciones de guardar y cancelar siguen alcanzables
