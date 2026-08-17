# 08 · Almacenamiento de archivos — trabajo

## Protocolo

- [ ] Emisión de autorización de escritura, acotada al objeto y con vigencia
- [ ] Clave del objeto derivada del identificador del archivo
- [ ] Cinco objetos por imagen: original y cuatro derivados
- [ ] Cinco por video: el video y cuatro portadas
- [ ] Objeto único para el resto de tipos
- [ ] Confirmación de subida y estados del archivo

## Validación

- [ ] Nombre con nombre y extensión
- [ ] Clasificación por extensión
- [ ] Tipos de contenido admitidos
- [ ] Coherencia entre tipo declarado y extensión
- [ ] Rechazo de tipos no admitidos

## Correcciones

- [ ] Sustitución de colecciones que **diferencia**, no intersecta
- [ ] Prueba con las imágenes A, B, C → A, D: se eliminan B y C, se conservan A y D
- [ ] Conservar los archivos aún referenciados por otra entidad
- [ ] Nunca eliminar un marcador de posición
- [ ] Recolector de archivos pendientes, con plazo configurable
- [ ] El recolector nunca toca archivos referenciados
- [ ] Marcadores de posición como activos propios

## Cliente

- [ ] Reducción de imágenes antes de subir, sin ampliar las pequeñas
- [ ] Extracción de portada en los videos
- [ ] Vista previa de los formatos de cámara de teléfono
- [ ] Informe de progreso y reintento de los archivos fallidos

## Verificación

- [ ] Prueba: autorización caducada se rechaza
- [ ] Prueba: autorización de un objeto no sirve para otro
- [ ] Prueba: un derivado no se amplía por encima del original
- [ ] Prueba: la subida abandonada se recoge
