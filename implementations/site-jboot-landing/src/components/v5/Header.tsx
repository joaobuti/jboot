import { v5Content } from "@/content/v5-content";

export function Header() {
  return (
    <header className="v5-header">
      <a className="v5-brand" href="/v5/" aria-label="JBoot v5">
        <img src="/brand/jb-cyan-white.png" alt="" />
        <span>{v5Content.brand}</span>
      </a>
      <nav className="v5-nav" aria-label="Navegacao principal">
        {v5Content.nav.map(item => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <a className="v5-login" href={v5Content.hero.primaryCta.href}>
        <i className="ri-login-circle-line" aria-hidden="true" />
        <span>{v5Content.hero.primaryCta.label}</span>
      </a>
    </header>
  );
}
