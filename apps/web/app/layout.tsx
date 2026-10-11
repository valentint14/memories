import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import { HydrationMarker } from "@/components/HydrationMarker";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { t } from "@/lib/i18n";
import { PAPER } from "@/lib/ui";
import "./globals.css";

// Fonturile se descarcă la build și se servesc de pe domeniul propriu (CSP: `font-src 'self'`);
// `latin-ext` acoperă ă, ș, ț.
const serif = Newsreader({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--font-newsreader", display: "swap" });
const sans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
});

const DESCRIPTION = "Pozele și filmările invitaților, într-un singur loc.";

// `metadataBase` face absolute adresele din etichetele Open Graph (imaginea din `opengraph-image.png`),
// altfel previzualizarea din mesagerie nu o găsește. Lipsa `APP_URL` (de ex. la build) nu oprește aplicația.
export function generateMetadata(): Metadata {
  const appUrl = process.env.APP_URL;
  return {
    metadataBase: appUrl ? new URL(appUrl) : undefined,
    title: { default: "Memories", template: "%s · Memories" },
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: { type: "website", siteName: "Memories", locale: "ro_RO", description: DESCRIPTION },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: PAPER,
  // Pe Android, tastatura micșorează pagina (și `dvh`) în loc să se suprapună peste ea; iOS ignoră
  // setarea, acolo dialogurile urmăresc zona vizibilă (`ui.overlay`).
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ro" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-dvh flex-col bg-paper font-sans text-ink antialiased">
        <a
          href="#continut"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xs focus:bg-ink focus:px-4 focus:py-3 focus:font-semibold focus:text-paper-raised"
        >
          {t("nav.skipToContent")}
        </a>
        {children}
        <SiteFooter />
        <HydrationMarker />
      </body>
    </html>
  );
}
