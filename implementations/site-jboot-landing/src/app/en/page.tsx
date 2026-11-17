import type { Metadata } from "next";
import { HubLanding } from "@/components/hub/HubLanding";
import { hubHomePages } from "@/content/hub-home-content";

const siteUrl = "https://jboot.com.br";
const page = hubHomePages.en;

export const metadata: Metadata = {
  title: page.seo.title,
  description: page.seo.description,
  alternates: {
    canonical: `${siteUrl}${page.path}`,
    languages: {
      "pt-BR": `${siteUrl}/`,
      en: `${siteUrl}/en/`,
      es: `${siteUrl}/es/`,
    },
  },
  openGraph: {
    title: page.seo.title,
    description: page.seo.description,
    url: `${siteUrl}${page.path}`,
    locale: "en",
  },
};

export default function EnglishHome() {
  return <HubLanding locale="en" />;
}
