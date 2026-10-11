import type { Metadata } from "next";
import Link from "next/link";
import { AuthPage, authIntro } from "@/components/ui/AuthPage";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Pagina nu a fost găsită" };

/**
 * Pagina 404 a întregii aplicații. Aceeași pentru o adresă inexistentă și pentru una la care
 * utilizatorul nu are acces (zona de administrare, evenimentul altui organizator): textul nu
 * trebuie să dezvăluie dacă pagina există.
 */
export default function NotFound() {
  return (
    <AuthPage title={t("notFound.title")} intro={<p className={authIntro}>{t("notFound.body")}</p>}>
      <div>
        <Link href="/" className={ui.buttonPrimary}>
          {t("notFound.home")}
        </Link>
      </div>
    </AuthPage>
  );
}
