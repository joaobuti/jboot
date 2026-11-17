import Image from "next/image";
import { hubLocales, type HubHomeContent, type HubLocale } from "@/content/hub-home-content";

export function HubHeader({
  brandAsset,
  content,
  locale,
}: {
  brandAsset: string;
  content: HubHomeContent;
  locale: HubLocale;
}) {
  return (
    <header className="ai-header">
      <div className="ai-container ai-header__inner">
        <a href="#top" className="ai-brand" aria-label="JBoot — início">
          <Image src={brandAsset} alt="" width={38} height={38} priority />
          <span>{content.brand}</span>
        </a>
        <nav className="ai-nav" aria-label="Navegação principal">
          {content.navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>
        <div className="ai-header__actions">
          <nav className="ai-language-switcher" aria-label="Selecionar idioma">
            {hubLocales.map(item => (
              <a
                key={item.code}
                href={item.href}
                aria-label={item.name}
                aria-current={item.code === locale ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <a className="ai-button ai-button--compact ai-button--dark" href={content.login.href}>
            {content.login.label}
          </a>
        </div>
      </div>
    </header>
  );
}
