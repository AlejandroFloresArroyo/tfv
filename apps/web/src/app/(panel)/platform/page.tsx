import { redirect } from "next/navigation"

/**
 * La portada del área.
 *
 * No pinta nada: reparte. La bandeja de prospectos es lo único que aquí pide atención —lo demás son
 * padrones que se consultan cuando hace falta—, así que es lo que se abre. Una portada con cuatro
 * tarjetas que sólo repitieran la navegación sería un clic de más para todo el mundo.
 */
export default function PlatformPage() {
  redirect("/platform/prospects")
}
