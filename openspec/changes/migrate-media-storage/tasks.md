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

- [ ] Sustitución de colecciones que **diferencia**, no intersecta
- [ ] Prueba con las imágenes A, B, C → A, D: se eliminan B y C, se conservan A y D
- [ ] Conservar los archivos aún referenciados por otra entidad
- [ ] Nunca eliminar un marcador de posición
- [~] Recolector de archivos pendientes, con plazo configurable. Escrito y sin ejecutar: quien lo
      dispararía es el despachador de trabajos de la rebanada 09
- [ ] El recolector nunca toca archivos referenciados
- [ ] Marcadores de posición como activos propios

## Cliente

- [x] Reducción de imágenes antes de subir, sin ampliar las pequeñas — en el selector (28e)
- [x] Extracción de portada en los videos — en el selector (28e)
- [ ] Vista previa de los formatos de cámara de teléfono
- [x] Informe de progreso y reintento **por objeto**: que falle la miniatura no obliga a resubir
      el original

## Verificación

- [~] Prueba: autorización caducada se rechaza. La caducidad la fija el almacenamiento en dos
      horas y no se puede adelantar desde aquí; lo que sí está probado es la **reemisión**, que es
      lo que la caducidad obliga a hacer
- [x] Prueba: autorización de un objeto no sirve para otro
- [ ] Prueba: un derivado no se amplía por encima del original
- [ ] Prueba: la subida abandonada se recoge
