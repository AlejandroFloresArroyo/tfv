/**
 * Una foto ya subida, pintada tal cual.
 *
 * ## Por qué no es `next/image`
 *
 * `next/image` optimiza en el servidor y para eso necesita saber **de qué anfitriones** puede
 * traerse imágenes, declarado en la configuración del build. El anfitrión del almacenamiento se
 * configura en tiempo de ejecución —`STORAGE_URL` cambia entre desarrollo, la máquina de alguien y
 * producción—, así que la lista de patrones tendría que adivinarlo, y adivinarlo mal es una
 * pantalla llena de huecos rotos que sólo se ve fuera de desarrollo.
 *
 * Además, **ya viene optimizada**: el navegador subió el original y sus cuatro derivados, y quien
 * pinta elige el tamaño que le toca. Volver a redimensionar en el servidor sería pagar dos veces
 * por lo mismo.
 *
 * De ahí el silencio de la regla, dicho una vez y aquí, en lugar de repetido en cada pantalla que
 * enseñe una foto.
 */

export function Photo({
  src,
  className,
  /** Vacío a propósito cuando el nombre ya está al lado en texto: repetirlo lo dice dos veces. */
  alt = "",
}: {
  src: string
  className?: string | undefined
  alt?: string | undefined
}) {
  return (
    // biome-ignore lint/performance/noImgElement: el anfitrión es de ejecución y los derivados ya existen. Ver arriba.
    <img src={src} alt={alt} className={className} loading="lazy" decoding="async" />
  )
}
