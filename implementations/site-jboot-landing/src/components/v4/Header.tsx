import { v4Content } from "@/content/v4-content";

export function Header() {
  return (
    <header className="v4-header">
      <a className="v4-brand" href="/v4/" aria-label="JBoot v4">
        <img src="/brand/jb-cyan-white.png" alt="" />
        <span>{v4Content.brand}</span>
      </a>
      <nav className="v4-nav" aria-label="Navegacao principal">
        {v4Content.nav.map(item => (
          <a href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <a className="v4-header-cta" href={v4Content.hero.primaryCta.href}>
        <i className="ri-arrow-right-line" aria-hidden="true" />
        <span>Entrar</span>
      </a>
    </header>
  );
}
