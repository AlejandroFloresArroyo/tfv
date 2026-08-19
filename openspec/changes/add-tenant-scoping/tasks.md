# 06 · Aislamiento entre arrendatarios — trabajo

## Decisión previa — bloquea el resto

- [x] Resolver cómo se propaga la identidad del solicitante hasta el motor en cada transacción
- [x] Definir la vía de acceso de los procesos de sistema
- [x] Documentar qué tablas admiten escritura bajo contexto de sistema y bajo qué operaciones
- [x] Decidir si las políticas se expresan de forma declarativa o como predicados

## Capa de aplicación

- [ ] Resolver la pertenencia del solicitante al iniciar cada petición
- [ ] Filtrar por empresa en toda lectura y escritura de datos de arrendatario
- [ ] Responder `404` ante datos de otra empresa, nunca `403`
- [x] Membresía desactivada pierde el acceso
- [x] Recursos hijos heredan el arrendatario de su raíz
- [ ] Verificar que ningún parámetro de consulta amplía el alcance

> La capa de aplicación llega con los manejadores de dominio, que aún no existen. Lo que ya está
> resuelto aquí es la capa de datos, que es la que tiene que aguantar cuando la otra falle.

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

- [ ] Prueba: sustituir el identificador de empresa devuelve `404`
- [x] Prueba: recurso hijo por identificador directo respeta el arrendatario
- [x] **Prueba de segunda capa**: con el filtro de la aplicación desactivado, el motor no devuelve
      filas ajenas
- [x] Prueba: filtro explícito por otra empresa no devuelve nada
- [x] Prueba: comprador no accede a pedidos de otro
- [x] Prueba: leer no implica escribir — la contraparte ve el documento y no lo modifica
- [x] Prueba estructural: ninguna tabla se queda sin políticas
- [ ] Barrido automatizado: por cada endpoint de arrendatario, intentar el acceso cruzado
