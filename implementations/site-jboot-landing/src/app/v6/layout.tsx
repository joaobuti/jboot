import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JBoot | Versão 6",
  description: "Versão 6 da landing institucional JBoot.",
  alternates: { canonical: "https://jboot.com.br/v6/" },
  robots: { index: false, follow: false },
};

export default function V6Layout({ children }: { children: React.ReactNode }) {
  return children;
}
