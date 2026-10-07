import { t, type MessageKey } from "@/lib/i18n";
import { serverSupabase } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import { capTrim, Wordmark } from "../ui/Wordmark";
import { MobileMenu, NavLinks, PublicAction, SignOutButton } from "./SiteNav";

/** Unde se află utilizatorul: fiecare zonă are linkurile ei. Pagina invitatului nu are bară. */
export type NavContext = "public" | "organizer" | "admin";

const LINKS: Record<Exclude<NavContext, "public">, { href: string; key: MessageKey }[]> = {
  organizer: [
    { href: "/events", key: "organizer.myEvents" },
    { href: "/events/new", key: "organizer.newEvent" },
  ],
  admin: [
    { href: "/admin/events", key: "admin.events" },
    { href: "/admin/retention", key: "admin.retention" },
    { href: "/admin/package", key: "admin.package.nav" },
    { href: "/admin/discounts", key: "admin.discounts.nav" },
  ],
};

/**
 * Bara de navigare a aplicației, lipită sus. Pe ecrane late: numele produsului, linkurile zonei și
 * contul; pe telefon, linkurile și contul stau în „Meniu”.
 *
 * `email` vine de la layout-urile care au citit deja utilizatorul; lipsa lui înseamnă că bara îl
 * citește singură (paginile publice).
 */
export async function SiteHeader({ context, email }: { context: NavContext; email?: string | null }) {
  let current = email;
  if (current === undefined) {
    const { data } = await (await serverSupabase()).auth.getUser();
    current = data.user?.email ?? null;
  }

  const inner = "mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-8";

  if (context === "public") {
    return (
      <header className="sticky top-0 z-40 border-b border-rule bg-paper">
        <div className={inner}>
          <Wordmark trim />
          <PublicAction signedIn={current !== null} />
        </div>
      </header>
    );
  }

  const links = LINKS[context].map((l) => ({ href: l.href, label: t(l.key) }));
  const label = t(context === "admin" ? "admin.nav" : "organizer.nav");
  const home = links[0]?.href ?? "/";
  const kicker = context === "admin" ? t("admin.title") : undefined;

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper">
      <div className={inner}>
        <div className="flex min-w-0 items-center gap-10">
          <span className="flex items-baseline gap-3">
            <Wordmark href={home} trim />
            {kicker !== undefined && <span className={`${ui.kicker} ${capTrim} block text-accent`}>{kicker}</span>}
          </span>
          <NavLinks links={links} label={label} />
        </div>

        <div className="hidden min-w-0 items-center gap-5 md:flex">
          {/* Pe tabletă emailul nu încape lângă linkuri; apare de la 1024 px (și mereu în meniul de pe telefon). */}
          {current !== null && <span className="hidden max-w-56 truncate text-sm text-ink-muted lg:inline">{current}</span>}
          <SignOutButton className={ui.buttonSecondaryCompact} />
        </div>
        <MobileMenu links={links} label={label} email={current} wordmarkHref={home} kicker={kicker} />
      </div>
    </header>
  );
}
