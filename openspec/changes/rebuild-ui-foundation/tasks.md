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

Sin empezar. Llega cuando haya colecciones que explorar — hoy no hay ningún manejador de dominio.

- [ ] Búsqueda con retardo, que reinicia la página
- [ ] Filtros con los nueve tipos de control
- [ ] Indicadores de filtro activo, con retirada individual
- [ ] Limpieza total de filtros y búsqueda
- [ ] Paginación con ventana según ancho y selector de tamaño
- [ ] Supresión del reinicio de página con diálogo abierto
- [ ] Rejilla, lista y carrusel
- [ ] Tarjeta universal
- [ ] Estados de carga, vacío, sin resultados y error
- [ ] **Invalidación por recurso, sustituyendo las llamadas manuales de refresco**
- [ ] Retirar el reflejo global de resultados de consulta

## 28e · Formularios

- [x] Cáscara con sus ranuras: etiqueta, ayuda y error atados al control por identificador, más el
      diálogo de formulario que las usa
- [~] Validación al enviar, con el esquema del servidor como autoridad. **Falta la validación al
      perder el foco**, que exige duplicar reglas en el cliente
- [x] Errores del servidor situados en su campo
- [x] Protección contra el envío doble
- [ ] Asistente por pasos con validación por paso e indicación de error
- [ ] Confirmación al cancelar con cambios
- [x] **Confirmación destructiva que muestra la entidad y enumera la cascada**, con el recuento real
      del servidor y no una frase genérica
- [ ] Selector de archivos con vista previa y reintento por archivo
- [ ] Editor de texto enriquecido con saneado
- [ ] Captura de firma
- [ ] Selector de ubicación en mapa
- [ ] Entradas con formato de importe y de teléfono

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
- [ ] Editar desde una página interior no devuelve a la primera — necesita paginación (28d)
- [ ] Medición del peso del paquete servido, antes y después

**18 pruebas de extremo a extremo** en unos 8 segundos, más **9 del transporte** en Vitest.

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
