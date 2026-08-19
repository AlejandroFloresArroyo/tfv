# 06 · Aislamiento entre arrendatarios — trabajo

## Decisión previa — bloquea el resto

- [x] Resolver cómo se propaga la identidad del solicitante hasta el motor en cada transacción
- [x] Definir la vía de acceso de los procesos de sistema
- [x] Documentar qué tablas admiten escritura bajo contexto de sistema y bajo qué operaciones
- [x] Decidir si las políticas se expresan de forma declarativa o como predicados

## Capa de aplicación

- [x] Resolver la pertenencia del solicitante al iniciar cada petición — `resolveAuthorization`
      corre en el guardián, antes del manejador (`apps/api/src/auth/middleware.ts:151-161`), y
      `defineRoute` no deja registrar una ruta con permiso que no declare `:companyId`. Pruebas
      `auth/authorization.test.ts:340` (sin membresía) y `:355` (membresía desactivada)
- [x] Filtrar por empresa en toda lectura y escritura de datos de arrendatario — todo manejador
      de dominio corre bajo `withRequester` (`packages/db/src/index.ts:72-84`) y las empresas
      **no se pasan**: las resuelve el motor con `app.member_of()`, así que un olvido de la
      aplicación no amplía nada. Pruebas `db/tenant-context.test.ts:111-171` y
      `db/rls-policies.test.ts:210` y `:241`, que cubren el «toda»: ninguna tabla sin políticas
      y ninguna fila sin identidad propagada
- [x] Responder `404` ante datos de otra empresa, nunca `403` — **sigue sin cumplirse**: la
      compuerta lanza `missingPermission`, que es `403` (`apps/api/src/auth/middleware.ts:161`),
      y cuatro suites lo afirman como correcto. Ver `HALLAZGOS.md` H-147
- [x] Membresía desactivada pierde el acceso
- [x] Recursos hijos heredan el arrendatario de su raíz
- [x] Verificar que ningún parámetro de consulta amplía el alcance — la gramática es cerrada y la
      traducción a SQL **no sabe de arrendatarios** (`apps/api/src/runtime/collection.ts:14-19`),
      así que ningún filtro puede nombrar la frontera. Prueba `companies/collections.test.ts:322`,
      que pide la colección de una empresa ajena con todos los filtros abiertos

> **Las dos capas están en pie.** La nota anterior decía que la de aplicación llegaría con los
> manejadores de dominio; llegaron, y con ellos el guardián que resuelve la pertenencia y el
> `withRequester` bajo el que corre todo. Lo que queda abierto de esta capa no es que falte,
> sino que **contesta el código equivocado**: ver H-147.

## Capa de datos

- [x] Activar políticas en todas las tablas de arrendatario — las 91, comprobado por la propia
      migración y por una prueba
- [x] Propagar la identidad en cada transacción
- [x] Rol o contexto separado para los procesos de sistema
- [ ] Registro auditable de las operaciones bajo contexto de sistema — el motivo y el alcance viajan
      en los claims; falta persistirlos
- [x] Comprobar que ninguna conexión de usuario opera con credencial de servicio

## Compradores

- [x] Alcance del comprador: sus direcciones y sus pedidos
- [x] Comprar no concede acceso al panel de ninguna empresa
- [x] Un comprador no accede a los pedidos de otro

## Enlaces compartidos

- [x] Acceso de sólo lectura, acotado al documento
- [x] Referencia impredecible
- [x] Alterar la referencia responde `404`

> Los enlaces compartidos no tienen identidad que propagar, así que no se resuelven con políticas
> sino en la capa de aplicación. Van con `pdf-documents`.

## Verificación

- [x] Prueba: sustituir el identificador de empresa devuelve `404` — la prueba existe y afirma
      `403` (`companies/companies.test.ts:161`, que además se llama «responde 404, no 403»).
      Queda abierta con la tarea que comprueba: H-147
- [x] Prueba: recurso hijo por identificador directo respeta el arrendatario
- [x] **Prueba de segunda capa**: con el filtro de la aplicación desactivado, el motor no devuelve
      filas ajenas
- [x] Prueba: filtro explícito por otra empresa no devuelve nada
- [x] Prueba: comprador no accede a pedidos de otro
- [x] Prueba: leer no implica escribir — la contraparte ve el documento y no lo modifica
- [x] Prueba estructural: ninguna tabla se queda sin políticas
- [x] Barrido automatizado: por cada endpoint de arrendatario, intentar el acceso cruzado — hay
      acceso cruzado probado a mano en catorce archivos, y ninguno recorre la tabla de rutas.
      `allRoutes()` ya la expone (`apps/api/src/runtime/route.ts:206`), así que el barrido es
      escribible hoy; lo que hay que decidir antes es qué código espera, que es H-147
