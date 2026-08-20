# 28 · Fundación de interfaz sobre Tailwind — trabajo

Leyenda: `[x]` hecho y comprobado · `[~]` hecho en parte, con la parte que falta anotada.

## Decisiones previas

- [ ] Confirmar si la licencia del editor de imagen es transferible
- [ ] Si no lo es, elegir sustituto para el recorte de imagen
- [x] Decidir la estrategia de carga de iconos — **importe por icono**, no un paquete de trazados.
      Cada icono se importa por su nombre y el empaquetador deja fuera los que nadie usa, así que
      el problema de F-14 (catorce mil doscientas líneas servidas siempre) no se reproduce
- [ ] Inventariar y retirar las dependencias con cero usos

## 28a · Tokens y tema

- [x] Traducir los módulos de color, incluidas las rampas de claro y oscuro
- [x] Tipografía, tamaños, pesos y familia — los pesos van con la escala 100–900 de la herramienta,
      que coincide valor a valor con la del tema anterior
- [~] Espaciado, radios, transiciones y curvas. **Faltan las sombras**: no hay ninguna superficie
      que las necesite todavía y traducirlas a ciegas sería adivinar
- [x] Puntos de ruptura — corregido que `laptop` y `desktop` valían lo mismo
- [x] Estrategia de clase para claro y oscuro
- [x] Lectura de la preferencia en servidor desde la cookie
- [x] Aplicación antes del primer pintado, sin destello
- [x] Índices de superposición — por intención (`--z-dialog`, `--z-toast`), no las veinte capas
      numeradas del tema anterior

## 28b · Primitivos

- [~] Botón (cuatro variantes, tres tamaños, estado en curso), entrada de texto, **selección,
      casilla con estado intermedio e interruptor**. Faltan número y radio: no hay pantalla que los
      pida todavía
- [~] Insignia, esqueleto y separador. **Falta la indicación** (tooltip)
- [x] Icono con carga bajo demanda
- [ ] Banderas y códigos de país con carga bajo demanda

## 28c · Superficies

- [x] Diálogo con sus tres tamaños, título obligatorio y cierre bloqueable mientras hay envío
- [x] Cajón inferior por debajo del ancho de tableta — un diálogo centrado en un teléfono queda
      bajo el teclado en cuanto se toca un campo
- [ ] Panel dividido
- [x] Contenedor de página con sus ranuras
- [x] Navegación lateral y superior, con menú desplegable accesible
- [ ] Registros de diálogo y de panel por clave, conservando el contrato

## 28d · Exploración de colecciones

**El estado de exploración vive en la dirección.** Búsqueda, filtros, página y tamaño son
parámetros de la URL, no estado de un componente; de ahí salen las tres propiedades que la spec
pide —compartir por enlace, retroceder para deshacer, recargar sin perder— sin escribir código para
ninguna. La pantalla es de servidor y no guarda nada.

Antes hizo falta que la API supiera hablar: los seis listados devolvían una lista pelada. Ahora
hablan el lenguaje de `query-and-pagination`, con la gramática cerrada y el sobre uniforme.

- [x] Búsqueda con retardo, que reinicia la página. **Insensible a acentos en el motor**, no en el
      cliente: normalizar sólo el término buscado no encuentra «Cámara» al escribir «camara»,
      porque lo que hay que comparar son las mil filas
- [~] Filtros por tipo de control. Están **los cinco que algún recurso declara**: texto, selección
      simple, selección múltiple, booleano e intervalo de fechas. Faltan número, intervalo numérico
      y fecha suelta — ningún recurso los declara todavía, y un control sin nada que filtrar se
      escribe a ciegas. La spec enumera **ocho**, no nueve; esta lista decía nueve por error
- [x] Indicadores de filtro activo, con retirada individual — de una selección múltiple se quita
      **un** valor y los demás siguen
- [x] Limpieza total de filtros y búsqueda, conservando vista y tamaño de página: son cómo se mira
      la colección, no qué parte se mira
- [x] Paginación con ventana según ancho y selector de tamaño. La ventana se estrecha **con clases**
      y no midiendo, para que el servidor pinte ya lo correcto
- [x] Supresión del reinicio de página con diálogo abierto. Sale gratis: guardar vuelve a resolver
      el árbol de servidor y **no toca la dirección**, y la página es la dirección
- [~] Rejilla y lista, con la misma tarjeta y las mismas acciones. **Falta el carrusel**: ninguna
      pantalla lo pide, y las que lo pedirán —tiendas públicas, 29e— traen sus propias medidas
- [x] Tarjeta universal, con el nombre en un encabezado y una lista de verdad debajo
- [x] Estados de vacío, sin resultados y error, con reintento sin recargar. **Sin estado de carga
      del listado**: lo resuelve el servidor, así que cuando se pinta los datos están; la espera que
      sí existe —volver a resolver tras cambiar un filtro— la lleva la barra, sin mover nada
- [x] **Invalidación por recurso**: `router.refresh()` vuelve a resolver el árbol entero desde el
      servidor. Una llamada por mutación, no una por consulta afectada
- [x] Retirar el reflejo global de resultados de consulta — no hay ninguno que retirar: con
      pantallas de servidor no hay caché de cliente que sincronizar

### Lo que la API tuvo que aprender

- [x] Puente del lenguaje de consulta a SQL, con **cuatro operadores y ni uno más**: igual,
      intervalo, conjunto y nulo. No hay forma de expresar otro desde la barra de direcciones
- [x] Declaración de recurso —qué se filtra, qué se busca, por qué se ordena— junto a cada listado
- [x] **Orden estable obligatorio**: el desempate va siempre al final, porque sin él paginar repite
      elementos en una página y se salta otros en la siguiente
- [x] Normalización de texto en el motor (`app.norm`, migración 0009), **inmutable** por si un día
      se indexa
- [x] Sobre de paginación uniforme y parámetros documentados en el contrato publicado
- [ ] La taxonomía global sigue sin paginar: su listado por defecto son **las raíces**, y «ausente»
      no es «nulo» en la gramática. Llega con las taxonomías de almacén y producción (12 y 20)

## 28e · Formularios

- [x] Cáscara con sus ranuras: etiqueta, ayuda y error atados al control por identificador, más el
      diálogo de formulario que las usa
- [~] Validación al enviar, con el esquema del servidor como autoridad. **Falta la validación al
      perder el foco**, que exige duplicar reglas en el cliente
- [x] Errores del servidor situados en su campo
- [x] Protección contra el envío doble
- [x] Asistente por pasos con validación por paso e indicación de error —
      `packages/ui/src/components/wizard.tsx` sobre la máquina de `lib/wizard.ts`. Probado en
      `lib/wizard.test.ts:18-84`: no avanza con el paso actual incompleto, **enseña el error sólo
      después de intentar avanzar**, no delata los pasos posteriores, recuerda hasta dónde se
      llegó al volver atrás y al enviar señala todos los que fallan, no sólo el que se mira
- [ ] Confirmación al cancelar con cambios
- [x] **Confirmación destructiva que muestra la entidad y enumera la cascada**, con el recuento real
      del servidor y no una frase genérica
- [~] **Selector de archivos con vista previa y reintento por archivo**, con lo que la 08 pide del
      lado del cliente: clasificación por extensión, reducción con `canvas` que nunca amplía el
      original, extracción de portada del video y progreso por archivo. La regla vive en
      `packages/ui/src/lib/` con 66 pruebas —la máquina de subida cubre el camino feliz, el fallo
      en cada uno de los cuatro pasos, el reintento, la reemisión de firmas caducadas y la regla de
      que sin el original no hay archivo, con los cuatro puertos del contrato fingidos—. **Falta comprobarlo en un navegador**: lo que toca `canvas`,
      `createImageBitmap` y el `<video>` no tiene prueba, ninguna pantalla lo usa todavía y los
      endpoints de subida no existían al escribirlo. Ver `H-51`, `H-52` y `H-53`
- [ ] Editor de texto enriquecido con saneado
- [~] Captura de firma — `packages/ui/src/components/signature-pad.tsx`, y ya la usa la nota
      de entrega de la 22. El orden de dispositivos manda: `touch-action: none`, captura de
      puntero, y los trazos guardados como coordenadas normalizadas para que girar el aparato
      no borre la firma. Devuelve el PNG cuando se le pide y no sube nada. **Falta
      comprobarlo en un navegador**, como el selector de archivos: lo que toca `canvas` y los
      eventos de puntero no tiene prueba
- [ ] Selector de ubicación en mapa
- [ ] Entradas con formato de importe y de teléfono — **falta la de teléfono**. La de importe está
      y bien probada: `packages/ui/src/lib/amount-input.ts` con diecisiete pruebas, incluida la
      que importa —devuelve la cadena decimal sin pasar por coma flotante—. De teléfono no hay
      nada en el paquete

## 28f · Transporte y sesión

- [x] **Renovación ante `401` con reintento transparente** — con una sola renovación en curso; ver
      la nota de abajo, porque no serializarla cierra la sesión del usuario
- [x] Credencial en cookie no accesible por script
- [x] **Retirar la recarga de página al iniciar y cerrar sesión.** Falta el cambio de correo, que
      todavía no tiene pantalla
- [x] Resolver el error de compilación hoy suprimido — la pila nueva no suprime ninguno, y
      `pnpm check` pasa sin excepciones
- [x] Traducciones desacopladas del empaquetador — `import()` a secas, español e inglés
- [x] Retirar los ajustes de compilación que sobrescriben el minimizador y añaden hilos — no se
      arrastran
- [x] Configuración pública por entorno, sin secretos en el código

> **La renovación tiene que ir serializada.** La credencial de renovación rota en cada uso y
> presentar una consumida es indicio de robo: la API corta la cadena entera. Si caduca el acceso con
> tres peticiones en vuelo, las tres reciben `401`, las tres renuevan, y la segunda dispara la
> detección de robo **contra el usuario legítimo**. El cliente mantiene una sola renovación en curso
> y las demás esperan su resultado.

## Verificación

**Herramienta adoptada: Playwright**, que es lo que la tabla de herramientas ya declaraba desde el
principio y nunca se había ejecutado. Vive en `apps/e2e`, porque ejercita el sistema entero —
navegador, aplicación, API y base— y no el paquete web por su cuenta.

Corre contra un **build de producción en su propio puerto**, no contra el servidor de desarrollo:
así se prueba lo que se despliega, y correr las pruebas no interfiere con el `pnpm dev` abierto.

- [x] No hay destello de tema al cargar — comprobado en el **HTML que llega**, no tras hidratar
- [x] La elección de idioma manda sobre la preferencia del navegador, y sin elección se respeta
- [x] Las guardas encadenan y conservan el destino en `?next=`
- [x] La navegación muestra sólo los servicios contratados
- [x] **Ocultar no es proteger**: una sección sin permiso no se ofrece y el servidor la niega igual
- [x] Cerrar sesión limpia el estado **sin recargar**, y la credencial deja de servir de inmediato
- [x] Un `401` renueva y reintenta sin que la persona se entere
- [x] **Una sola renovación** con varias peticiones en vuelo — en `apps/web`, donde el reloj y la
      red los pone la prueba y contar es fiable
- [x] Crear un elemento lo hace aparecer en su listado **sin recargar**, y persiste
- [x] La confirmación destructiva nombra la entidad y enumera la cascada
- [x] **Editar desde una página interior no devuelve a la primera** — lo que faltaba era paginación
- [x] Un listado filtrado se comparte por enlace, retroceder deshace y recargar conserva
- [x] **Escribir ocho caracteres dispara una sola consulta** — contadas las peticiones que salen de
      verdad, que es lo único que distingue un retardo puesto de uno que no se aplica
- [x] Buscar «nunez» encuentra a Núñez
- [x] Sin resultados se ofrece limpiar y **no** crear
- [x] El panel aplica al confirmar, no a cada casilla
- [x] Un filtro que la gramática no admite responde `400` y la pantalla lo presenta con reintento
- [x] Cambiar el tamaño de página vuelve a la primera
- [x] Cambiar de vista no cambia el conjunto ni toca la consulta
- [ ] Medición del peso del paquete servido, antes y después

**31 pruebas de extremo a extremo** en unos 9 segundos, más **28 en Vitest** entre el transporte y
la lógica de exploración, y **19 de la API** sobre la colección.

> **La siembra creció con la 28d, y no es cosmético.** Con cuatro cuentas y cero clientes la
> búsqueda siempre encuentra, los filtros nunca quitan nada y la paginación no aparece: las tres se
> ven funcionar sólo cuando hay más elementos que los que caben en una página. Ahora hay treinta y
> seis personas, ciento veintiocho clientes, sesenta proveedores y veintiocho direcciones — y los
> nombres llevan acentos a propósito.

## Hallazgos

**En desarrollo, entrar por `127.0.0.1` dejaba la aplicación sin hidratar.** Next sirve su paquete
de cliente sólo a los orígenes que reconoce, y `127.0.0.1` no está entre ellos por omisión: la
página se pinta entera, se ve perfecta, y **ningún botón responde**. No falla nada visible, así que
sólo se descubre al intentar pulsar algo — que es exactamente lo que pasó al abrir el primer
diálogo. Se resuelve declarando el origen (`allowedDevOrigins`); sólo afecta a desarrollo.

**La primera suite encontró un defecto que llevaba semanas en pie.** El contrato de error pone los
problemas por campo en `message`, como lista; el cliente esperaba `{ error: { message, fields } }`,
que es la forma de otras APIs. Consecuencias: **ningún error por campo llegaba nunca a su campo**
—todos los `Field error={…}` eran código muerto— y una validación se pintaba como `[object Object]`.

Sus pruebas de unidad pasaban en verde porque **inventaban la misma forma equivocada**. Lo descubrió
la primera prueba contra el servidor real. La moraleja quedó escrita en el propio archivo: una
prueba con una respuesta inventada comprueba la invención, no el contrato.

**Y un fallo de diseño de las propias pruebas, propio de este sistema.** Tres pruebas de roles
fallaron con la pantalla de acceso delante sin haber tocado nada de sesiones: todas compartían la
misma sesión guardada, y la prueba que cierra sesión **la revoca de verdad en el servidor**. Aquí
las sesiones son revocables, así que reutilizar una es seguro sólo mientras nadie la cierre. Las que
cierran sesión abren la suya.

**Y una etiqueta que cambiaba sola.** El nombre accesible de la casilla que gobierna un grupo era
«companies.users 0 de 8» —incluía el contador—, así que **cambiaba al marcarla**. Un lector de
pantalla anunciaría un nombre distinto para el mismo control cada vez que se vuelve a él. El
recuento pasó a la descripción: el nombre es la identidad, el contador es estado.

**Un indicador que se leía «Estado:Inactiva».** El nombre del campo y su valor iban en dos cajas de
disposición separadas, con el espacio puesto por CSS. Visualmente perfecto; el texto leído no lleva
espacio. Un lector de pantalla anuncia las dos palabras pegadas y una búsqueda en la página no
encuentra la frase que se ve. **El espacio entre palabras es texto, no separación**: se arregló
metiendo las dos partes en un único nodo con su espacio de verdad.

**Y dos botones llamados igual en la misma pantalla.** Sin resultados, la barra ofrecía «Limpiar
todo» y el estado vacío ofrecía otro «Limpiar todo». No se pueden distinguir al recorrer la página
ni nombrar por voz. El del estado vacío pasó a decir qué hace de verdad: «Quitar los filtros y ver
todo».

**Y el intervalo de fechas, roto por debajo del análisis.** Es el único tipo de filtro que ninguna
pantalla usaba, así que se descubrió mirándolo a mano. El esquema publicado declaraba cada parámetro
como cadena, y un intervalo es la misma clave dos veces: el validador del transporte lo mataba antes
de llegar a la gramática. Pasada esa, la traducción a SQL envolvía la columna en una expresión y con
ello **perdía el codificador de la columna**, así que la fecha llegaba al conductor como objeto y
respondía `500`. Las pruebas de `parseQuery` pasaban las dos veces: el análisis era correcto, y el
defecto estaba en las capas que lo rodean. Ahora hay pruebas que atraviesan el transporte y llegan
al motor.
