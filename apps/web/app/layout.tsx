import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import { HydrationMarker } from "@/components/HydrationMarker";
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

export const metadata: Metadata = {
  title: { default: "Memories", template: "%s · Memories" },
  description: "Pozele și filmările invitaților, într-un singur loc.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: PAPER,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ro" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        {children}
        <HydrationMarker />
      </body>
    </html>
  );
}
