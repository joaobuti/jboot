import Image from "next/image";
import { aiFirstHomeContent as content } from "@/content/ai-first-home-content";

export function AiFirstHeader({ brandAsset }: { brandAsset: string }) {
  return (
    <header className="ai-header">
      <div className="ai-container ai-header__inner">
        <a href="#top" className="ai-brand" aria-label="JBoot — início">
          <Image src={brandAsset} alt="" width={38} height={38} priority />
          <span>{content.brand}</span>
        </a>
        <nav className="ai-nav" aria-label="Navegação principal">
          {content.navigation.map(item => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
        </nav>
        <a className="ai-button ai-button--compact ai-button--dark" href={content.login.href}>
          {content.login.label}
        </a>
      </div>
    </header>
  );
}
