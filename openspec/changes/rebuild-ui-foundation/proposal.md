# 28 · Fundación de interfaz sobre Tailwind

## Por qué

Abandonar Mantine y vanilla-extract por Tailwind implica reconstruir **ciento diecisiete componentes
compartidos, doscientos quince archivos de estilos y un tema de setecientas líneas**. Es la rebanada
más grande del programa y no cabe como una sola unidad de trabajo.

Además de la capa visual, hay cinco problemas de arquitectura del frontend que se arreglan aquí
porque tocan los mismos archivos:

| Ref | Problema |
|---|---|
| F-01 | La credencial se fija al cargar el módulo, lo que **obliga a recargar la página entera** al iniciar sesión, cerrarla o cambiar el correo. No hay renovación ante un `401` |
| F-02 | **Mil doscientas ochenta y siete llamadas manuales de refresco** repartidas en trescientos cincuenta y un archivos, y cero invalidaciones de caché |
| F-03 | Cada resultado de consulta se refleja en átomos globales con una serialización completa en cada render |
| F-05 | Se suprime un error de compilación real en lugar de resolverlo |
| F-07 | Los recursos de traducción se cargan con una interfaz exclusiva de un empaquetador concreto |

## Sub-rebanadas

Secuenciales; cada una habilita la siguiente.

| | Contenido |
|---|---|
| **28a** | **Tokens y tema.** Traducir los módulos de color, tipografía, espaciado, radios, sombras, transiciones y puntos de ruptura. Claro y oscuro con la estrategia de clase, conservando la cookie leída en servidor para evitar el destello |
| **28b** | **Primitivos sin estado.** Botón, entrada, selección, interruptor, casilla, insignia, indicación, esqueleto, icono |
| **28c** | **Superficies.** Diálogo con sus variantes, panel, cajón inferior bajo el ancho de tableta, contenedor de página, navegación lateral. Se conservan los registros de diálogo por clave |
| **28d** | **Exploración de colecciones.** Búsqueda, filtros con sus nueve tipos de control, indicadores de filtro activo, paginación, rejilla, lista, carrusel, tarjeta y estados vacío, carga y error |
| **28e** | **Formularios.** Cáscara con sus ranuras, confirmación destructiva, asistente por pasos con error por paso, selector de archivos, editor de texto enriquecido, firma, mapa, entrada con formato |
| **28f** | **Transporte y sesión.** Renovación ante `401`, credencial en cookie no accesible por script, resolución del error de compilación suprimido, traducciones desacopladas del empaquetador |

## Decisiones que hay que cerrar

**Los iconos son catorce mil doscientas líneas de trazados incrustadas en el paquete servido**, más
casi seis mil de banderas y códigos de país (`DEFECTS.md` F-14). Deben pasar a carga bajo demanda.

**El editor de imagen es un producto comercial de cuarenta y tres mil líneas** incrustado en el
repositorio, un veintiuno por ciento del código del frontend por líneas (`DEFECTS.md` F-13). Hay que
confirmar si su licencia es transferible al frontend nuevo. Si no lo es, hace falta un sustituto
para el recorte de imagen, que es lo único que se usa de él.

**Dependencias declaradas con cero usos** que no deben arrastrarse: máquina de estados, biblioteca
de gráficas alterna, compresión, utilidades de rutas, fechas y dos de procesamiento de imagen.

## Qué sobrevive intacto

El generador de documentos **no depende de Mantine**, así que las seis familias de documentos pasan
sin cambios. Tampoco dependen el organigrama de ubicaciones, la captura de firma, el reproductor, los
códigos legibles por máquina, el mapa y la biblioteca de animación que sostiene el arrastrar y
soltar del constructor.

## Criterios de aceptación

- El tema elegido se aplica antes del primer pintado, sin destello.
- Iniciar sesión, cerrarla y cambiar el correo surten efecto sin recargar la página.
- Un `401` renueva la credencial y reintenta, de forma transparente.
- La credencial no es accesible por script.
- La actualización tras una mutación se declara por recurso, no llamando al refresco de cada
  consulta.
- No queda ninguna supresión de errores de compilación.
- Las traducciones se cargan sin depender de un empaquetador concreto.
- El paquete servido no incluye el conjunto completo de iconos ni de banderas.

## Specs

`app-shell` · `collection-browsing` · `forms-and-wizards` · `pdf-documents`
