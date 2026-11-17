import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "remixicon/fonts/remixicon.css";
import "./v5.css";

export const metadata: Metadata = {
  title: "JBoot | Hub de aplicacoes",
  description:
    "Variante experimental da landing JBoot para comunicar o hub de aplicacoes, acesso centralizado e operacao modular.",
  alternates: {
    canonical: "https://jboot.com.br/v5/",
  },
  openGraph: {
    title: "JBoot | Hub de aplicacoes",
    description:
      "Ecossistema JBoot para organizar identidade, contratos e aplicacoes de negocio em uma experiencia centralizada.",
    url: "https://jboot.com.br/v5/",
    siteName: "JBoot",
    images: [
      {
        url: "/brand/jb-cyan.jpg",
        width: 1200,
        height: 630,
        alt: "Assinatura visual JBoot em ciano.",
      },
    ],
  },
  robots: { index: false, follow: false },
};

export default function V5Layout({ children }: { children: React.ReactNode }) {
  return <div className="jb-v5">{children}</div>;
}
