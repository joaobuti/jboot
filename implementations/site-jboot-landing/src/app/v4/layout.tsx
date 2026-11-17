import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "remixicon/fonts/remixicon.css";
import "./v4.css";

export const metadata: Metadata = {
  title: "JBoot | Hub de aplicacoes para o seu negocio",
  description:
    "Variante experimental da landing JBoot focada em primeira impressao, acesso centralizado e aplicacoes por contrato.",
  alternates: {
    canonical: "https://jboot.com.br/v4/",
  },
  openGraph: {
    title: "JBoot | Hub de aplicacoes para o seu negocio",
    description:
      "Entenda o JBoot como hub de aplicacoes: Identity, PDV, Juridico e novos modulos em uma experiencia centralizada.",
    url: "https://jboot.com.br/v4/",
    siteName: "JBoot",
    images: [
      {
        url: "/brand/jb-cyan.jpg",
        width: 1200,
        height: 630,
        alt: "Identidade visual JBoot em ciano.",
      },
    ],
  },
  robots: { index: false, follow: false },
};

export default function V4Layout({ children }: { children: React.ReactNode }) {
  return <div className="jb-v4">{children}</div>;
}
