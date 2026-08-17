# 10 · Identidad y arrendatarios

## Por qué

Cuentas, empresas, membresías, direcciones, contrapartes y taxonomías. Es la base sobre la que
cuelga todo el dominio, así que abre las dos columnas de trabajo paralelas (comercio y
producciones).

Es en su mayor parte reimplementación, con tres cambios de fondo:

- **Las cascadas de borrado pasan a ser transaccionales y declarativas.** Hoy son unas veinte
  funciones escritas a mano, y la mayor recorre dieciocho colecciones. Tres de ellas, además, tras
  ejecutar la cascada **borran de la tabla de empresas** usando el identificador de la entidad
  (`DEFECTS.md` C-08).
- **El borrado de entidades de negocio pasa a ser lógico** (`project.md`, D-02).
- **Incorporar a un miembro y ampliar la suscripción son una sola operación.** Hoy puede quedar la
  membresía creada y la ampliación sin hacer.

## Qué entra

- Cuentas: registro, perfil, activación, baja, prospectos y su aceptación.
- Empresas: creación, edición, propiedad, baja.
- Membresías: invitación, retirada, activación, rol, transferencia de propiedad.
- Habilitación de servicios por empresa.
- Direcciones de usuario y de empresa, con la regla de dirección primaria.
- Contrapartes, con su aprovisionamiento idempotente en pareja.
- Las tres taxonomías jerárquicas.

## Correcciones incluidas

| Ref | Corrección |
|---|---|
| C-08 | Las cascadas dejan de borrar de la tabla de empresas |
| L-02 | Aceptar un prospecto lo retira efectivamente de la bandeja |
| L-03 | La marca de última actividad se escribe |
| L-06 | Eliminar un servicio arrastra sus habilitaciones |
| L-10 | La búsqueda de servicio por clave funciona |
| L-11 | Se retira la escritura a un campo no declarado en la empresa |

## Criterios de aceptación

- Ninguna cascada borra de una tabla que no le corresponde.
- Una baja de empresa deja su contenido inaccesible y conserva su historial contable.
- No se puede retirar la propiedad al último propietario.
- No se puede dar de baja a quien sea único propietario de una empresa activa.
- Incorporar a un miembro con la ampliación fallida no deja membresía huérfana.
- Un correo liberado por una baja vuelve a estar disponible.
- Aceptar un prospecto lo retira de la bandeja.
- Eliminar una categoría arrastra sus descendientes y deja sin categoría a lo clasificado.

## Specs

`user-accounts` · `companies` · `addresses` · `clients-and-providers` · `category-trees`
