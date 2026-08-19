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
- [~] Recolector de archivos pendientes, con plazo configurable. Escrito y sin ejecutar: quien lo
      dispararía es el despachador de trabajos de la rebanada 09
- [~] El recolector nunca toca archivos referenciados. Sólo mira los **pendientes**, que por
      definición no los referencia nadie todavía; comprobarlo pide ejecutarlo, y quien lo dispara es
      el despachador de la rebanada 09
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
- [ ] Copia de los objetos entre depósitos. No es de este guion —mueve direcciones, no bytes— y
      hacerlo desde aquí sería reimplementar mal lo que `aws s3 sync` hace bien
- [ ] Creación del depósito y su política de lectura pública. Hoy el depósito local existe porque
      alguien lo creó a mano: no hay ni migración ni guion que lo deje puesto (H-136)

## Verificación

- [~] Prueba: autorización caducada se rechaza. La caducidad la fija el almacenamiento en dos
      horas y no se puede adelantar desde aquí; lo que sí está probado es la **reemisión**, que es
      lo que la caducidad obliga a hacer
- [x] Prueba: autorización de un objeto no sirve para otro
- [x] Prueba: un derivado no se amplía por encima del original — `file-derivatives.test.ts`, sobre
      la política, que es donde se decide el tamaño
- [ ] Prueba: la subida abandonada se recoge
