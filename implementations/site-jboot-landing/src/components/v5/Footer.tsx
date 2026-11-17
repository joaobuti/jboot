import { v5Content } from "@/content/v5-content";

export function Footer() {
  return (
    <footer className="v5-footer">
      <div className="v5-container v5-footer-grid">
        <a className="v5-brand" href="/v5/" aria-label="JBoot v5">
          <img src="/brand/jb-cyan-white.png" alt="" />
          <span>{v5Content.brand}</span>
        </a>
        <p>Landing publica experimental. Acesso operacional via fluxo autenticado.</p>
      </div>
    </footer>
  );
}
