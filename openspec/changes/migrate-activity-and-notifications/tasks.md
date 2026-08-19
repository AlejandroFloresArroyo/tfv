# 09 · Bitácora y notificaciones — trabajo

## Bitácora

- [x] Modelo de asiento: acción, entidad, autor, instante, origen, referencia navegable
- [x] Escritura en la misma transacción que la mutación
- [x] Sólo anexado: revocar modificación y borrado
- [x] Consulta paginada y filtrable por servicio, acción, autor y fechas
- [x] Consulta de la actividad propia a través de todas las empresas

> **Emiten asiento seis operaciones**, las de empresa y membresía: es donde se probó el mecanismo
> entero. Las otras ~35 rutas de escritura lo añaden al pasar por su módulo, con la misma clave que
> protege la ruta (`HALLAZGOS.md` H-82).

## Audiencia

- [x] Selección por la clave de permiso declarada en la acción
- [x] Propietarios siempre incluidos
- [x] Varias claves exigen todas
- [x] Excluir al autor de su propia notificación

## Entrega

- [x] Cola de entrega, asíncrona respecto de la mutación
- [x] Reintento ante fallo transitorio, sin duplicar lo ya entregado
- [x] Un fallo del proveedor no hace fallar la operación de negocio
- [x] Sincronización de los datos del destinatario al cambiar el perfil
- [x] Alta del destinatario en el primer envío

> `Transport.syncRecipient` entra en la misma costura que `send`: se llama **antes del primer envío
> de cada pasada** —una vez por persona, no una por aviso— y cuando el perfil cambia, por la cola.
> **No se guarda copia** de lo que el proveedor sabe: esa lista es suya. Lo que falta es la cuenta
> del otro lado, no el cable (`HALLAZGOS.md` H-155, que acota lo que H-80 daba por bloqueado).
>
> Hoy el único dato del perfil que la API deja cambiar es el correo, y es el que dispara la
> sincronización. Nombre, teléfono y avatar no tienen ruta de edición todavía; el día que la tengan,
> llaman a `scheduleRecipientSync` y ya está.

## Bandeja

- [x] Listado paginado, ordenado de más reciente a más antiguo
- [x] Marcar leída y no leída
- [x] Archivar y desarchivar
- [x] Filtros por no leídas, leídas y archivadas
- [x] Contador de no leídas y aviso de novedades

## Push

- [x] Registro de dispositivo asociado a la cuenta
- [x] Varios dispositivos sin duplicados
- [x] Revocación de dispositivo
- [x] Título, cuerpo y referencia del aviso
- [x] Saneado del texto antes de mostrarlo
- [x] Pulsar el aviso abre la entidad, enfocando una pestaña existente si la hay

> **Título**: el nombre de la entidad, que es dato y viaja escrito. **Cuerpo**: clave y parámetros,
> con el nombre de quien actuó dentro del sobre —viaja lejos de la fila que lo diría—, y redactado
> por quien lo lee, en su idioma. Guardarlo redactado era repetir H-67 en la tabla que más filas
> acumula del sistema (`HALLAZGOS.md` H-153). **Referencia**: `activityTarget()`, la única
> traducción de entidad a pantalla; las que se escribían a mano no eran ninguna, así que pulsar
> cualquier aviso caía en un `404` (H-154).
>
> Y el saneado se mueve con el cuerpo: ahora la frase es nuestra y el marcado sólo puede entrar por
> los huecos, así que lo que se sanea es cada parámetro.
>
> **Enfocar la pestaña** es del navegador y no se escribe: el enlace lleva un nombre de ventana
> estable por destino, y el navegador reutiliza y enfoca la que ya se llame así. Lo que sí es
> decisión nuestra —qué pestaña es la misma pestaña— es `noticeWindowName`, y tiene sus pruebas.
> Un aviso **de empuje** sigue sin existir hasta que haya proveedor y trabajador de servicio; lo que
> esta tarea pedía —que pulsar lleve a donde dice— se cumple en el canal que hay.

## Preferencias

- [x] Elección de canal por categoría
- [x] Recuperación y verificación siempre por correo

## Retirada de alcance

- [x] Retirar la administración de plantillas por API
- [x] Delta de requisitos `REMOVED`

> La pila nueva nunca la escribió, así que retirarla no es borrar código: es **impedir que vuelva**
> y dejar constancia de que fue una decisión. Lo primero lo vigila una prueba que recorre la tabla
> de rutas entera —ninguna las nombra, y ninguna superficie de avisos queda pública—; lo segundo es
> el delta, que `README.md` asigna a esta rebanada y no a la 30: la 30 retira la **pila anterior**,
> que es otra cosa.

## Verificación

- [x] Prueba: mutación revertida no deja asiento
- [x] Prueba: acción denegada no registra ni notifica
- [x] Prueba: sólo la audiencia correcta recibe
- [x] Prueba: proveedor caído no rompe la operación
- [x] Prueba: ninguna carga útil contiene una contraseña
- [x] Prueba: ninguna referencia de la bitácora apunta fuera del panel
- [x] Prueba: cada destino resuelve contra el árbol de rutas de la interfaz
- [x] Prueba: toda clave del catálogo tiene frase en los dos idiomas
- [x] Prueba: el alta del destinatario va antes del envío, y una sola vez por pasada

## Despachador de trabajos en segundo plano

No estaba en esta lista y bloqueaba dos rebanadas.

- [x] Cola con estados explícitos, toma con bloqueo y salto de lo bloqueado
- [x] Reintentos acotados con espera creciente, y rendición visible
- [x] Un trabajo que falla no se lleva por delante a los demás
- [x] Recuperación del que quedó en curso al caerse el proceso
- [x] Trabajos periódicos, sin solaparse
- [x] Recolector de subidas abandonadas, con plazo configurable (rebanada 08)
- [x] Verificación de coherencia de existencias, programada (rebanada 13, H-11)
- [x] Entrega de avisos encolados

## Pantallas

- [x] Bandeja, con sus filtros en la dirección y su contador
- [x] Preferencias de canal, diciendo cuáles no tienen proveedor
- [x] Bitácora de la empresa, filtrable y de sólo lectura
- [x] Campana con el número de no leídas

## Lo que queda fuera, y por qué no es de esta rebanada

**Cerrada: 50 de 50.** Lo que sigue abierto no depende de nadie de aquí.

| Qué | Dónde vive |
|---|---|
| Los dos proveedores salientes, empuje y correo | Configuración de despliegue. La costura está puesta y probada (`HALLAZGOS.md` H-80) |
| Las ~35 rutas de escritura que aún no dejan asiento | Cada rebanada de dominio, al pasar por su módulo (H-82) |
| Una clave de permiso propia para la bitácora | Decisión de producto: el catálogo está cerrado en 255 (H-81) |
| El idioma de la cuenta, para redactar un aviso saliente | `app-shell`: hoy el idioma vive en una cookie del navegador (H-156) |
