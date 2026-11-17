import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "remixicon/fonts/remixicon.css";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "@/styles/velzon-shared.css";
import "./v3.css";
import { BootstrapJs } from "@/components/BootstrapJs";

export const metadata: Metadata = {
  title: "JBoot — Ecossistema modular",
  description: "Variante experimental da landing institucional JBoot (v3).",
  robots: { index: false, follow: false },
};

export default function V3Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="jb-landing-v3 velzon-shell">
      <BootstrapJs />
      {children}
    </div>
  );
}
