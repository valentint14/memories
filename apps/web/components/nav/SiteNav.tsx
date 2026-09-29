"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Dialog, DialogTrigger, Modal, ModalOverlay } from "react-aria-components";
import { signOut } from "@/lib/actions/auth";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { CloseIcon, MenuIcon } from "../ui/icons";
import { capTrim, Wordmark } from "../ui/Wordmark";

export interface NavLink {
  href: string;
  label: string;
}

/** Linkul paginii curente: cel mai lung href care se potrivește („/events/new” bate „/events”). */
function activeHref(links: NavLink[], pathname: string): string | null {
  const matches = links.filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

/** Linkurile din bară, pe ecrane late: pagina curentă în cerneală, subliniată în teracotă. */
export function NavLinks({ links, label }: { links: NavLink[]; label: string }) {
  const active = activeHref(links, usePathname());
  return (
    <nav aria-label={label} className="hidden items-center gap-7 md:flex">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.href === active ? "page" : undefined}
          className={`inline-flex min-h-11 items-center text-sm font-medium underline-offset-[10px] ${
            l.href === active ? "text-ink underline decoration-accent decoration-2" : "text-ink-muted no-underline hover:text-ink"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** „Ieși din cont”: formular simplu către acțiunea de server. */
export function SignOutButton({ className }: { className: string }) {
  return (
    <form action={signOut}>
      <button type="submit" className={className}>
        {t("nav.signOut")}
      </button>
    </form>
  );
}

/** Acțiunea din dreapta pe paginile publice; pe paginile de autentificare nu apare nimic. */
export function PublicAction({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) return null;
  return signedIn ? (
    <Link href="/events" className={`${ui.link} text-sm`}>
      {t("organizer.myEvents")}
    </Link>
  ) : (
    <p className="text-sm text-ink-muted">
      <span className="hidden sm:inline">{t("home.haveAccount")} </span>
      <Link href="/login" className={ui.link}>
        {t("home.login")}
      </Link>
    </p>
  );
}

/**
 * Meniul de pe telefon: o foaie care coboară de sus, cu linkurile mari, numerotate ca pașii de pe
 * pagina principală, și contul dedesubt.
 */
export function MobileMenu({
  links,
  label,
  email,
  wordmarkHref,
  kicker,
}: {
  links: NavLink[];
  label: string;
  email: string | null;
  wordmarkHref: string;
  kicker?: string | undefined;
}) {
  const active = activeHref(links, usePathname());
  return (
    <DialogTrigger>
      <Button className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xs border border-ink px-3 text-sm font-medium text-ink md:hidden">
        <MenuIcon className="size-4" />
        {t("nav.menu")}
      </Button>
      <ModalOverlay isDismissable className="fixed inset-0 z-50 bg-ink/40">
        <Modal className="absolute inset-x-0 top-0 max-h-dvh overflow-y-auto border-b border-ink bg-paper">
          <Dialog aria-label={label} className="outline-none">
            {({ close }) => (
              <div className="flex flex-col px-4 pb-6">
                <div className="flex h-16 items-center justify-between gap-4">
                  <span className="flex items-baseline gap-3">
                    <Wordmark href={wordmarkHref} trim />
                    {kicker !== undefined && <span className={`${ui.kicker} ${capTrim} block text-accent`}>{kicker}</span>}
                  </span>
                  <Button
                    onPress={close}
                    aria-label={t("nav.closeMenu")}
                    className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xs border border-ink text-ink"
                  >
                    <CloseIcon />
                  </Button>
                </div>

                <nav aria-label={label}>
                  <ol className="flex flex-col border-t border-ink">
                    {links.map((l, i) => (
                      <li key={l.href} className="border-b border-rule">
                        <Link
                          href={l.href}
                          onClick={close}
                          aria-current={l.href === active ? "page" : undefined}
                          className="flex min-h-16 items-baseline gap-5 py-4 no-underline"
                        >
                          <span className={`${ui.data} text-sm ${l.href === active ? "text-accent" : "text-ink-muted"}`}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className={`font-serif text-3xl leading-tight ${l.href === active ? "text-ink" : "text-ink-muted"}`}>
                            {l.label}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </nav>

                {email !== null && (
                  <div className="mt-8 flex flex-col gap-3">
                    <p className={`${ui.kicker} text-ink-muted`}>{t("nav.account")}</p>
                    <p className="text-sm break-all">{email}</p>
                    <SignOutButton className={`${ui.buttonSecondary} w-full`} />
                  </div>
                )}
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
