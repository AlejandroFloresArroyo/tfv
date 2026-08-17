# Armazón de la aplicación

## Purpose

Lo que envuelve a todas las pantallas: quién puede entrar dónde, cómo se navega entre empresas y
servicios, y las preferencias que persisten entre sesiones.

El sistema tiene **cinco superficies** con reglas de acceso distintas:

| Superficie | Quién entra | Si no cumple |
|---|---|---|
| Marketing | Cualquiera | — |
| Autenticación | Sólo quien no ha iniciado sesión | Va al panel |
| Panel | Sesión iniciada | Va a iniciar sesión |
| Documento compartido | Cualquiera con el enlace | — |
| Tienda pública | Cualquiera, resuelta por subdominio | Ver `websites` |

Dentro del panel hay tres niveles anidados de guarda: cuenta, empresa y servicio. Cada uno se
comprueba por separado, y fallar uno lleva al nivel inmediatamente superior, nunca a la raíz.

## Requirements

### Requirement: Guarda de sesión en el panel

Toda ruta del panel SHALL exigir una sesión válida y SHALL redirigir a la pantalla de inicio de
sesión cuando no la haya.

Tras iniciar sesión, el usuario SHALL volver a la ruta que intentaba abrir.

#### Scenario: Se conserva el destino tras iniciar sesión

- **GIVEN** un usuario sin sesión que abre un enlace profundo del panel
- **WHEN** inicia sesión correctamente
- **THEN** llega a la ruta que había pedido, no a la portada del panel

#### Scenario: Una sesión caducada devuelve al inicio de sesión

- **GIVEN** un usuario cuya sesión ha caducado
- **WHEN** navega dentro del panel
- **THEN** se le lleva a iniciar sesión sin perder la ruta de destino

### Requirement: Las pantallas de acceso rechazan a quien ya entró

Las pantallas de inicio de sesión, registro y recuperación SHALL redirigir al panel cuando quien
las abre ya tiene sesión válida.

#### Scenario: Un usuario con sesión no ve el formulario

- **GIVEN** un usuario con sesión iniciada
- **WHEN** abre la pantalla de inicio de sesión
- **THEN** se le redirige al panel

### Requirement: Guarda de pertenencia a la empresa

Toda ruta bajo el ámbito de una empresa SHALL comprobar que el usuario tiene en ella una membresía
activa, y SHALL redirigir al selector de empresas cuando no sea así.

#### Scenario: Una empresa ajena devuelve al selector

- **GIVEN** un usuario con sesión que abre la ruta de una empresa a la que no pertenece
- **WHEN** se evalúa la guarda
- **THEN** se le redirige al selector de empresas

### Requirement: Guarda de habilitación del servicio

Toda ruta bajo un servicio SHALL comprobar que la empresa lo tiene habilitado, y SHALL llevar a la
portada de la empresa cuando no sea así.

Una ruta de un servicio inexistente SHALL mostrar la pantalla de no encontrado dentro del ámbito
de la empresa, conservando su navegación.

#### Scenario: Un servicio no contratado no se abre

- **GIVEN** una empresa sin el servicio de producciones habilitado
- **WHEN** un miembro abre una ruta de producciones
- **THEN** se le lleva a la portada de su empresa

#### Scenario: Un servicio desconocido no rompe la navegación

- **WHEN** se abre la ruta de un servicio que no existe
- **THEN** se muestra la pantalla de no encontrado
- **AND** la navegación de la empresa sigue disponible

### Requirement: Guarda de administración de plataforma

Las rutas de administración de plataforma SHALL exigir que el usuario esté marcado como
administrador de plataforma, y SHALL redirigir al panel cuando no lo esté.

#### Scenario: Un usuario común no entra en administración

- **GIVEN** un usuario sin marca de administrador de plataforma
- **WHEN** abre una ruta de administración
- **THEN** se le redirige al panel

### Requirement: Bloqueo por suscripción ausente

Cuando una empresa no tenga una suscripción vigente, el panel SHALL presentar la selección de plan
de forma bloqueante e impedir el acceso al resto de sus pantallas hasta resolverla.

Las pantallas de facturación y de plan SHALL seguir accesibles, para que el usuario pueda resolver
la situación.

#### Scenario: Sin suscripción no se opera

- **GIVEN** una empresa cuya suscripción no está vigente
- **WHEN** un miembro abre cualquier pantalla de esa empresa
- **THEN** se presenta la selección de plan de forma bloqueante

#### Scenario: La vía de solución permanece abierta

- **GIVEN** la misma situación
- **WHEN** el usuario abre la pantalla de planes o de facturación
- **THEN** puede usarla con normalidad

### Requirement: Cambio de empresa

El usuario SHALL poder cambiar de empresa desde cualquier pantalla del panel, y el sistema SHALL
llevarlo a la pantalla equivalente en la empresa destino cuando exista, o a su portada cuando no.

El cambio no SHALL exigir volver a autenticarse.

#### Scenario: Se conserva la pantalla equivalente

- **GIVEN** un usuario en el listado de productos de la empresa A, miembro también de la B
- **WHEN** cambia a la empresa B, que también tiene almacenes habilitados
- **THEN** llega al listado de productos de la empresa B

#### Scenario: Sin equivalente se va a la portada

- **GIVEN** el mismo usuario
- **WHEN** cambia a una empresa sin almacenes habilitados
- **THEN** llega a la portada de esa empresa

### Requirement: La navegación refleja lo habilitado y lo permitido

La navegación SHALL mostrar únicamente los servicios que la empresa tiene habilitados, y dentro de
ellos únicamente las secciones que el rol del usuario le permite.

Ocultar una entrada de navegación no SHALL considerarse control de acceso: la comprobación real
ocurre en el servidor.

#### Scenario: Un servicio no habilitado no aparece

- **GIVEN** una empresa sin el servicio de Pixit habilitado
- **WHEN** un miembro abre la navegación
- **THEN** Pixit no figura entre los servicios

#### Scenario: Ocultar no sustituye a proteger

- **GIVEN** una sección oculta por falta de permiso
- **WHEN** se accede escribiendo su dirección directamente
- **THEN** el servidor la rechaza igualmente

### Requirement: Tema claro y oscuro persistente

El usuario SHALL poder elegir entre tema claro y oscuro, y la elección SHALL persistir entre
sesiones y entre dispositivos del mismo navegador.

El tema elegido SHALL aplicarse **antes del primer pintado**, sin destello del tema contrario.

#### Scenario: No hay destello al cargar

- **GIVEN** un usuario que eligió el tema oscuro
- **WHEN** carga cualquier pantalla
- **THEN** se pinta directamente en oscuro, sin mostrar antes el claro

### Requirement: Idioma seleccionable y persistente

El usuario SHALL poder elegir el idioma de la interfaz entre los disponibles, y la elección SHALL
persistir entre sesiones.

Cuando no haya elección previa, SHALL usarse el idioma preferido del navegador si está disponible,
y el idioma por defecto en caso contrario.

#### Scenario: Se respeta la preferencia del navegador

- **GIVEN** un visitante sin elección previa cuyo navegador prefiere un idioma disponible
- **WHEN** abre la aplicación
- **THEN** la ve en ese idioma

#### Scenario: La elección explícita prevalece

- **GIVEN** un usuario que eligió un idioma distinto al de su navegador
- **WHEN** vuelve a entrar
- **THEN** ve el idioma que eligió

### Requirement: Instalación como aplicación

La aplicación SHALL poder instalarse en el dispositivo, y SHALL ofrecerlo cuando el navegador lo
permita y el usuario aún no la haya instalado.

El ofrecimiento SHALL poder descartarse y no SHALL repetirse de forma insistente.

#### Scenario: No se ofrece si ya está instalada

- **GIVEN** la aplicación abierta en modo instalado
- **WHEN** se carga
- **THEN** no se ofrece instalarla

#### Scenario: Descartar el ofrecimiento se recuerda

- **WHEN** el usuario descarta el ofrecimiento de instalación
- **THEN** no vuelve a mostrarse en esa sesión

### Requirement: Un cambio de sesión no exige recargar

Iniciar sesión, cerrarla o cambiar el correo de la cuenta SHALL surtir efecto inmediato en la
aplicación, sin necesidad de recargar la página completa.

Este requisito existe porque la implementación anterior fijaba la credencial al cargar el módulo y
obligaba a una recarga completa en los tres casos (ver `DEFECTS.md` F-01).

#### Scenario: Cerrar sesión limpia el estado al instante

- **WHEN** el usuario cierra sesión
- **THEN** se le lleva a la pantalla de acceso
- **AND** no queda en memoria ningún dato de la sesión anterior
- **AND** no ha hecho falta recargar la página

#### Scenario: Una credencial renovada se usa de inmediato

- **GIVEN** una sesión cuya credencial se renueva
- **WHEN** se realiza la siguiente petición
- **THEN** usa la credencial nueva sin recargar

### Requirement: Pantalla de error y de no encontrado

La aplicación SHALL disponer de una pantalla para rutas inexistentes y otra para fallos no
previstos, ambas dentro del armazón que corresponda al ámbito donde ocurrió.

Un fallo en una pantalla no SHALL dejar la aplicación en blanco ni impedir navegar a otra.

#### Scenario: Un fallo no tumba la navegación

- **GIVEN** una pantalla del panel que falla al cargar sus datos
- **WHEN** se muestra el error
- **THEN** la navegación lateral y el cambio de empresa siguen operativos
