import ClientProviders from "@/components/ClientProviders";
import { Metadata } from "next";
import React from "react";
// import { hkGrotesk } from '@/config/fonts';
import "../assets/scss/themes.scss";
// ApexCharts default styles
import "apexcharts/dist/apexcharts.css";
// Swiper styles
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

// Forca renderizacao dinamica em toda a arvore de rotas. Sem isso, paginas
// que o Next marca "Static" saem do build com Cache-Control: s-maxage=1 ano
// (pensado pra CDN que sabe invalidar no deploy). O LiteSpeed da Configr
// nao sabe -- prende o HTML antigo (hashes de chunk que o rsync ja apagou)
// ate alguem desabilitar/reabilitar o Website na mao. Ja bateu 2x em
// producao (admin.jboot.com.br e app.jboot.com.br). App autenticado nao
// precisa de cache estatico de pagina; o custo de SSR aqui e irrelevante.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Identity Admin | JBoot",
    template: "%s | Identity Admin | JBoot",
  },
  applicationName: "JBoot",
  description: "Administração de identidade do ecossistema JBoot",
  appleWebApp: {
    title: "JBoot",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-qb-installed="true"
      data-theme="minimal"
      data-bs-theme="dark"
      data-sidebar="dark"
      data-topbar="dark"
    >
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" />
      </head>
      <body
        suppressHydrationWarning={true}
        data-theme="minimal"
        data-bs-theme="dark"
        data-sidebar="dark"
        data-topbar="dark"
      >
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
