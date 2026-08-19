# 08 · Almacenamiento de archivos — trabajo

## Protocolo

- [x] Emisión de autorización de escritura, acotada al objeto y con vigencia. **Comprobado
      contra el almacenamiento**: escribe su objeto sin credencial, y sobre otro responde que la
      firma no vale
- [x] Clave del objeto derivada del identificador del archivo, bajo el prefijo de su empresa
- [x] Cinco objetos por imagen: original y cuatro derivados
- [x] Cinco por video: el video y cuatro portadas
- [x] Objeto único para el resto de tipos
- [x] Confirmación de subida y estados del archivo, diciendo **qué variantes se escribieron**:
      sin el original queda en erróneo, y con él y derivados de menos queda subido

## Validación

- [x] Nombre con nombre y extensión
- [x] Clasificación por extensión
- [x] Tipos de contenido admitidos
- [x] Coherencia entre tipo declarado y extensión, **por familias**: `image/png` para un `.jpg`
      no es mentir; un `.pdf` declarado imagen sí
- [x] Rechazo de tipos no admitidos

## Correcciones

- [x] Sustitución de colecciones que **diferencia**, no intersecta. En `media/collections.ts`, con
      varios llamantes: la galería del producto y la imagen única del almacén y de la ubicación
- [x] Prueba con las imágenes A, B, C → A, D: se eliminan B y C, se conservan A y D. Transcrita en
      `warehouses/catalog.test.ts`, sobre un producto de verdad y su ruta
- [x] Conservar los archivos aún referenciados por otra entidad. Lo responde el motor —
      `app.upload_is_referenced`— y no una lista escrita a mano de las treinta y dos columnas que
      hoy apuntan a `uploads`
- [x] Nunca eliminar un marcador de posición
- [x] Recolector de archivos pendientes, con plazo configurable. Ejecutado y probado de extremo a
      extremo: la subida vencida pierde su fila y sus cinco objetos, y la que está ocurriendo ahora
      mismo sobrevive a la misma pasada
- [x] El recolector nunca toca archivos referenciados. **Ni la fila ni los objetos**: un archivo
      pendiente sí puede estar referenciado —la entidad se guardó antes de que llegara la
      confirmación— y retirar los objetos antes de borrar dejaba esa fila viva apuntando a bytes que
      ya no existían (H-160). Se borra primero y se retira sólo lo que el motor dejó borrar
- [x] Marcadores de posición como activos propios. Los tres activos viven en
      `media/assets/` —dos vectores dibujados a mano, un PDF vectorial y dos segundos de video—, y
      `ensurePlaceholders` los escribe por el mismo camino que el navegador y registra sus filas
      bajo el prefijo `sistema/`. Idempotente y **reparadora**: repone el objeto que falte sin tocar
      la fila. La corre la siembra y también `pnpm --filter @tfv/api placeholders`, que es la vía en
      producción, donde la siembra no corre. Referenciarlos exigió admitirlos en el acotamiento por
      arrendatario (H-133)

## Cliente

- [x] Reducción de imágenes antes de subir, sin ampliar las pequeñas — en el selector (28e)
- [x] Extracción de portada en los videos — en el selector (28e)
- [~] Vista previa de los formatos de cámara de teléfono. Resuelto como dice H-51 —se dice lo que no
      se puede previsualizar— y corregido H-68: el ciclo de comprobación de React dejaba la vista
      previa apuntando a una dirección revocada al cambiar de paso
- [x] Informe de progreso y reintento **por objeto**: que falle la miniatura no obliga a resubir
      el original

## Pantallas

- [x] Galería del producto: añadir, reordenar, elegir portada y quitar, en su propio diálogo
- [x] Paso de fotos en el asistente de alta, con la subida **después** de crear el producto
- [x] Imagen única del almacén y de la ubicación, en su alta y en su edición
- [x] La portada viaja en la rejilla del catálogo y en el listado de almacenes, en una sola consulta
- [x] Ejercitadas en el navegador de principio a fin: se sube una foto de verdad, se reordena, se
      cambia la portada, se quita — y el objeto retirado deja de responder

## Proveedor de almacenamiento

- [x] Interfaz de proveedor con las tres operaciones que hablaban HTTP —firmar la escritura,
      componer la dirección pública, retirar objetos—, y el proveedor de hoy como primera
      implementación. Nadie más cambia: `uploads.ts` y `collections.ts` siguen llamando a las
      mismas tres funciones
- [x] Prueba de contrato que **no conoce a ningún proveedor**: recorre los que haya y les exige lo
      mismo, contra el almacenamiento de verdad. Cinco propiedades, las de la spec
- [x] Segundo proveedor hablando el protocolo de S3: dirección prefirmada de `PUT` con SigV4,
      `ListObjectsV2` por prefijo y borrado por clave. Sin cliente oficial, y el motivo escrito en
      la cabecera del módulo de firma
- [x] La firma, contra los **vectores publicados** por AWS: el resumen de la petición canónica del
      ejemplo de `GET Object` prefirmado y la derivación de la clave de firma
- [x] **Ejercido contra un servidor de verdad**: la pila local expone su punto S3, así que el
      proveedor se prueba sin credenciales de AWS. Las pruebas de subida de extremo a extremo pasan
      enteras con `STORAGE_PROVIDER=s3`
- [x] El proveedor por omisión **no cambia**: lo que se despliega hoy sigue siendo el de ahora, y
      hay una prueba que lo fija
- [x] Reescritura de las direcciones ya persistidas, con su guion y su prueba. Por prefijo,
      idempotente, y sin aplicar por omisión: lo primero que hay que poder hacer antes de mover mil
      filas es contar cuántas se mueven. Escenario nuevo en la spec (H-135)
- [x] Copia de los objetos entre depósitos. **Decidido: no es código nuestro.** Lo mueve
      `aws s3 sync` —paralelismo, reanudación, multiparte y reintento, ninguno negociable en una
      mudanza de verdad—; lo nuestro es **qué** sincronizar, que compone `media/transfer.ts` desde la
      configuración y ejecuta `copy-media-objects`. Con su hallazgo: la herramienta toma un solo
      punto de acceso para las dos orillas, así que una copia entre almacenamientos distintos son dos
      órdenes y una escala en disco (H-162)
- [x] Creación del depósito y su política de lectura pública. `media/bucket.ts` lo deja puesto,
      **repara** el que esté privado o sin tope de tamaño, y comprueba lo que importa desde donde
      mira el navegador: lee un objeto recién escrito **sin credencial** y pide el preflight de `PUT`
      desde el origen de la aplicación. Se planta con el motivo si algo falla. Lo corre
      `pnpm --filter @tfv/api bucket` y la siembra por su cuenta; la pila local lo trae declarado en
      `supabase/config.toml` y AWS tiene sus cuatro órdenes en `bucket --aws` (H-136, H-159)

## Verificación

- [x] Prueba: autorización caducada se rechaza. Se podía desde que hay un segundo proveedor: la
      vigencia la **declara** él, así que se firma con un segundo, se espera, y el almacenamiento
      responde que el permiso venció. Con la otra mitad en la misma prueba: reemitir vuelve a
      escribir en el acto
- [x] Prueba: autorización de un objeto no sirve para otro
- [x] Prueba: un derivado no se amplía por encima del original — `file-derivatives.test.ts`, sobre
      la política, que es donde se decide el tamaño
- [x] Prueba: la subida abandonada se recoge. De extremo a extremo y contra el almacenamiento de
      verdad, en `media/uploads.test.ts`: se registra, se escriben sus cinco objetos, se envejece la
      fila y la recolección se lleva registro y objetos. Con las tres fronteras que importan —la
      subida en curso sobrevive a la misma pasada, el archivo referenciado conserva fila y objetos, y
      el marcador de posición no se toca aunque esté vencido
