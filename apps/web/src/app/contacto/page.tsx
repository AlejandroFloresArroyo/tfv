import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Logo } from "~/components/logo.tsx"
import { ContactForm } from "./contact-form.tsx"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("contact"))("title") }
}

/**
 * El formulario público de contacto.
 *
 * Ver `openspec/specs/user-accounts/spec.md`, «Captura pública de prospectos».
 *
 * Está en la raíz y no dentro de una tienda porque **un prospecto no es de ninguna empresa**: es
 * una intención de contacto con la plataforma, y quien lo atiende es la administración de
 * plataforma desde su bandeja. La ruta que lo recibe ya lo decía —«no escribe sobre ninguna
 * empresa»—; esto es su otra mitad.
 *
 * Vive fuera de `(auth)` y de `(panel)` por lo mismo que la hoja del documento compartido: es una
 * página que se abre sin cuenta, y meterla bajo una disposición que da por hecha una sesión
 * llevaría a la pantalla de acceso a quien viene a preguntar cuánto cuesta.
 */
export default async function ContactPage() {
  const t = await getTranslations("contact")

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 px-5 py-10">
      <Link href="/" aria-label="TFV">
        <Logo />
      </Link>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-h3 font-bold tracking-tight text-content">{t("title")}</h1>
        <p className="text-body1 text-content-muted">{t("subtitle")}</p>
      </div>

      <ContactForm />

      <p className="text-body2 text-content-muted">
        {t("hasAccount")}{" "}
        <Link href="/login" className="font-semibold text-content underline underline-offset-2">
          {t("login")}
        </Link>
      </p>
    </main>
  )
}
