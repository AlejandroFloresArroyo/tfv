# 08 · Almacenamiento de archivos

## Por qué

Unas cuarenta entidades referencian archivos, así que esta rebanada bloquea a casi todas las de
dominio. Se adelanta por eso, no por complejidad.

El protocolo actual —autorización de escritura firmada, con la clave del objeto derivada del
identificador, y cinco objetos por imagen— es correcto y se conserva. Lo que cambia es el proveedor
y tres defectos:

| Ref | Problema |
|---|---|
| L-01 | Al sustituir una colección de archivos se **intersecta en vez de diferenciar**: se borran los que se conservaron y quedan huérfanos los que se quitaron |
| O-05 | Los archivos en estado pendiente no tienen recolector; una subida interrumpida deja la fila para siempre |
| O-06 | Los marcadores de posición apuntan a dominios de terceros |

## Qué entra

- Portar el almacenamiento conservando el protocolo de autorización firmada.
- Corregir la sustitución de colecciones para que diferencie.
- Recolector de archivos pendientes con plazo configurable.
- Marcadores de posición como activos propios.
- Validación de tipo de contenido y de coherencia con la extensión.
- Confirmación de subida y estados de archivo.

## Criterios de aceptación

- Sustituir una colección elimina exactamente lo retirado y conserva lo que permanece.
- Un archivo referenciado por dos entidades no se elimina al sustituirlo en una.
- Un marcador de posición nunca se elimina.
- Una subida abandonada desaparece tras el plazo, junto con su objeto parcial.
- Ningún marcador apunta a un dominio de terceros.
- Una autorización de escritura no sirve para otro objeto ni después de su vigencia.

## Riesgos

**Las direcciones públicas cambian de host.** Están persistidas en unas cuarenta tablas y también
incrustadas en documentos ya generados y en enlaces compartidos. La reescritura es un paso
verificado de la rebanada 30, no un efecto secundario.

## Specs

`media-storage`
