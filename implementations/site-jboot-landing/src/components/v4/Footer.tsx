import { v4Content } from "@/content/v4-content";

export function Footer() {
  return (
    <footer className="v4-footer">
      <div className="v4-container v4-footer-grid">
        <a className="v4-brand" href="/v4/" aria-label="JBoot v4">
          <img src="/brand/jb-cyan-white.png" alt="" />
          <span>{v4Content.brand}</span>
        </a>
        <p>Landing experimental. Sem coleta de dados nesta pagina.</p>
      </div>
    </footer>
  );
}
