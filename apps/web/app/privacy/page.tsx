import type { Metadata } from "next";
import { LegalPage } from "@/components/self-service/LegalPage";

export const metadata: Metadata = { title: "Politica de confidențialitate" };

export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
