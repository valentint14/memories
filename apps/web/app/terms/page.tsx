import type { Metadata } from "next";
import { LegalPage } from "@/components/self-service/LegalPage";

export const metadata: Metadata = { title: "Termeni și condiții" };

export default function TermsPage() {
  return <LegalPage kind="terms" />;
}
