import type { Metadata } from "next";
import "./globals.css";
import "./home.css";

const siteUrl = "https://jboot.com.br/";
const description =
  "Ecossistema JBoot de aplicacoes de negocio com identidade centralizada, modulos independentes e engenharia governada.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "JBoot | Ecossistema de aplicações",
  description,
  alternates: {
    canonical: siteUrl,
    languages: {
      "pt-BR": siteUrl,
      en: `${siteUrl}en/`,
      es: `${siteUrl}es/`,
    },
  },
  openGraph: {
    title: "JBoot | Ecossistema de aplicações",
    description,
    url: siteUrl,
    siteName: "JBoot",
    images: [
      {
        url: "/brand/jb-cyan-white.png",
        width: 1280,
        height: 720,
        alt: "JBoot",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
