/**
 * Lo que el servicio necesita de un almacenamiento de objetos.
 *
 * Ver `openspec/specs/media-storage/spec.md`.
 *
 * Son **tres operaciones y ninguna más**, y esa cortedad es el punto: mientras el resto del sistema
 * sólo sepa pedir permiso, componer una dirección y retirar objetos, cambiar de proveedor es
 * escribir otra implementación de esta interfaz. Lo que la hace posible es que los bytes no pasan
 * por aquí — el modelo de subida directa no deja al servicio en medio del camino de datos, así que
 * no hay flujos, ni cargas parciales, ni reanudación que portar.
 *
 * ## La regla que ninguna implementación puede romper
 *
 * **La credencial de servicio no sale del servidor.** Lo que viaja al navegador es una autorización
 * acotada a un objeto y con caducidad. Un proveedor que no sepa emitir eso no vale, por muy bien
 * que haga las otras dos: entregar la llave al navegador es entregar el almacenamiento entero, y
 * ninguna comodidad lo compensa.
 *
 * Las cinco propiedades que se le exigen están escritas como prueba en `storage.test.ts`, y esa
 * prueba **no conoce a ningún proveedor**: recorre los que haya.
 */

export interface WriteAuthorization {
  /** Dirección absoluta a la que escribir. Lleva el permiso dentro. */
  readonly url: string
  readonly method: "PUT"
  readonly headers: Readonly<Record<string, string>>
  readonly expiresAt: string
}

export interface StorageProvider {
  /** Cómo se llama en `STORAGE_PROVIDER`. Sale en los mensajes y en la prueba de contrato. */
  readonly name: string

  /**
   * Autoriza a escribir **ese** objeto y ninguno más.
   *
   * La autorización caduca, y `expiresAt` dice cuándo según el almacenamiento: el cliente reintenta
   * en función de eso, y una vigencia inventada aquí le haría descubrirlo a mitad de una subida.
   *
   * Tiene que permitir **sobrescribir la misma clave**. El reintento por objeto vuelve a pedir
   * autorización para el archivo entero —no sabe pedir cuatro de cinco—, así que un proveedor que
   * se niegue ante una clave ya escrita cierra el reintento justo cuando algo salió bien (H-132).
   */
  authorizeWrite(path: string, contentType: string): Promise<WriteAuthorization>

  /**
   * Dirección pública de lectura de un objeto ya escrito.
   *
   * **Estable**: se persiste en la fila del archivo y acaba incrustada en documentos generados y en
   * enlaces repartidos. Cambiarla es un cambio de datos, no de configuración; por eso existe
   * `scripts/rewrite-media-urls.ts`.
   */
  publicUrl(path: string): string

  /**
   * Retira del almacenamiento todo lo que cuelga de esos prefijos.
   *
   * **Por prefijo, no por clave**, y esa distinción cuesta un defecto de los caros: un archivo son
   * cinco objetos cuyas extensiones no se pueden dar por sabidas —el original conserva la suya y
   * los derivados llevan la del formato que el navegador supo escribir—, y de una subida
   * interrumpida puede haber cualquier subconjunto. Deducir la lista borra de menos y deja basura
   * que ya nadie reclama (`HALLAZGOS.md` H-71).
   *
   * No falla cuando no hay nada: es el caso normal del recolector de subidas abandonadas.
   */
  removeObjects(prefixes: readonly string[]): Promise<void>
}
