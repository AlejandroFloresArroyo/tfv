# 03 · Tiempo de ejecución de la API

## Por qué

La implementación anterior descubría sus rutas **recorriendo el sistema de archivos**: cada valor
exportado por el archivo índice de cada carpeta de servicio se registraba como ruta. No existía
tabla de rutas en ninguna parte.

Eso tiene tres consecuencias que hay que dejar atrás:

- **No hay forma de saber qué expone la API** sin ejecutarla. Exportar por error un objeto de una
  carpeta de servicio publica una ruta.
- **Nada obliga a declarar el régimen de acceso.** Olvidarlo deja la ruta abierta, que es
  exactamente cómo sesenta y nueve de noventa y un módulos quedaron sin autenticación
  (`DEFECTS.md` S-05).
- Las carpetas cuyo nombre lleva guion bajo se saltan, lo que hace que el mecanismo dependa de una
  convención de nombres invisible.

## Qué entra

- Registro explícito de rutas: una tabla que se puede leer.
- Cada ruta declara su régimen de acceso; omitirlo la deja protegida, nunca abierta.
- Enganche de la validación, la serialización y el contrato de error de la rebanada 01.
- Publicación de la descripción legible por máquina y generación del cliente tipado.
- Endpoint de salud.
- Configuración por entorno, validada al arrancar.
- Registro estructurado con correlación de peticiones.
- Límites de tamaño de cuerpo por endpoint y limitación de frecuencia.
- Arranque que **falla** si no hay base de datos.

## Qué no entra

- Los manejadores de dominio. Aquí sólo el armazón y una ruta de ejemplo que lo ejercite.
- La comprobación de permisos y de arrendatario, que son las rebanadas 05 y 06 — pero el punto de
  enganche se deja preparado.

## Delta de requisitos

`REMOVED` — Se retiran la página de bienvenida y los endpoints de prueba (`project.md`, D-09). Los
sustituyen el endpoint de salud y la publicación del contrato.

## Criterios de aceptación

- Existe una tabla de rutas legible sin ejecutar el servicio.
- Una ruta nueva sin régimen de acceso declarado responde `401` sin credencial.
- El servicio no arranca si falta una variable de configuración obligatoria.
- El servicio no arranca si la base de datos no responde.
- La descripción publicada coincide con lo que se valida en ejecución.
- El cliente tipado se genera de esa descripción y su desfase rompe la integración continua.
- Cada petición aparece en el registro con un identificador que permite correlacionar su error.

## Riesgos

**El registro explícito hace visible cuántas rutas hay realmente.** Son seiscientas dieciséis. Es
buen momento para decidir cuáles no se reimplementan, en lugar de arrastrarlas por inercia.

## Specs

`api-conventions` · `access-control` (punto de enganche)
