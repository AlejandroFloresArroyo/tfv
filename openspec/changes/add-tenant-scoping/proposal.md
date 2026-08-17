# 06 · Aislamiento entre arrendatarios

> Bloque crítico de seguridad. No exponer tráfico público sin esta rebanada.

## Por qué

Es el agujero más grande del sistema actual. **El alcance de los datos depende únicamente del
parámetro de la ruta**, y ningún manejador comprueba que quien pide pertenezca a la empresa que la
URL nombra (`DEFECTS.md` S-06).

Cambiar un identificador en la barra de direcciones devuelve datos de otra empresa: su catálogo, sus
clientes, sus cotizaciones, sus pedidos. No hace falta ninguna herramienta ni ningún conocimiento
técnico.

Las únicas comprobaciones de pertenencia que existen están en tres endpoints del núcleo, y no
protegen nada de lo que cuelga de ellos.

## Qué entra

- Filtrado por pertenencia en la capa de aplicación: la ruta selecciona, la membresía concede.
- Respuesta `404` —no `403`— ante datos de otra empresa, para no revelar su existencia.
- Políticas en el motor de datos como segunda capa, de modo que un fallo de la aplicación no filtre.
- Propagación de la identidad del solicitante hasta el motor en cada transacción.
- Segregación de la vía de acceso de los procesos de sistema, que necesitan cruzar empresas.
- Comprobación de que ningún parámetro de consulta puede ampliar el alcance.

## La decisión que hay que cerrar aquí

**Una credencial de servicio omite las políticas del motor por completo.** Si el servicio se conecta
siempre con ella, la segunda capa no protege de nada y esta rebanada no cumple su objetivo.

Hay que resolver cómo viaja la identidad del solicitante hasta la base en cada transacción, y qué
vía usan los procesos que legítimamente cruzan empresas —el abanico de compras de la rebanada 23, la
materialización de pedidos de la 18, los trabajos en segundo plano—.

Esa decisión determina si las políticas se expresan de forma declarativa o como predicados de la
aplicación, así que **bloquea el resto de la rebanada**.

## Criterios de aceptación

- Sustituir el identificador de empresa en cualquier ruta devuelve `404`.
- Una membresía desactivada pierde el acceso de inmediato.
- Un recurso hijo solicitado por su identificador directo respeta el arrendatario de su raíz.
- Un manejador al que se le quite el filtro por empresa **sigue sin devolver datos ajenos**.
- Ningún filtro de la cadena de consulta amplía el alcance.
- Las conexiones que atienden peticiones de usuario nunca operan sin identidad propagada.
- Los procesos de sistema usan una vía distinta y auditable.

## Riesgos

**La prueba que importa es la de la segunda capa**, y es fácil escribirla mal. No basta con
comprobar que la aplicación filtra: hay que comprobar que **con el filtro de la aplicación
desactivado** el motor sigue sin devolver filas ajenas. Conviene que sea una prueba explícita y
difícil de borrar por descuido.

**Toda tabla de negocio necesita una vía inequívoca hasta su empresa.** Las que la tengan a tres
saltos harán las políticas costosas. Es la razón de que la rebanada 02 lo documente.

## Specs

`access-control` · `query-and-pagination` (los filtros no amplían el alcance)
