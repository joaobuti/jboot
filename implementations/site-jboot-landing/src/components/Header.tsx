"use client";

import { useEffect, useState } from "react";
import { landingContent } from "@/content/landing-content";

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`site-header${isScrolled ? " site-header--scrolled" : ""}`}
      aria-label="Cabecalho"
    >
      <a className="brand-mark" href="/" aria-label="JBoot pagina inicial">
        <img className="brand-symbol" src="/icons/apple-touch-icon.png" alt="" width={34} height={34} />
        <span>{landingContent.brand}</span>
      </a>

      <nav className="header-actions" aria-label="Navegacao principal">
        <a className="nav-link" href={landingContent.secondaryCta.href}>
          Solucoes
        </a>
        <a className="button button-compact" href={landingContent.primaryCta.href}>
          {landingContent.primaryCta.label}
        </a>
      </nav>
    </header>
  );
}
