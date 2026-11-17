import { Metadata } from "next";
import { Suspense } from "react";
import ClaudeConsentPage from "@/modules/kanban/components/claude/ClaudeConsentPage";

export const metadata: Metadata = { title: "Autorizar Claude | JBoot Flow" };

export default function OAuthConsentRoute() {
  return (
    <Suspense fallback={null}>
      <ClaudeConsentPage />
    </Suspense>
  );
}
