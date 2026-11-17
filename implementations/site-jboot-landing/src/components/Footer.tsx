import { landingContent } from "@/content/landing-content";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-about">
            <div className="footer-brand">
              <img className="brand-symbol" src="/icons/apple-touch-icon.png" alt="" width={28} height={28} />
              <strong>{landingContent.brand}</strong>
            </div>
            <p>{landingContent.footer.description}</p>
          </div>

          <div className="footer-columns">
            {landingContent.footer.columns.map(column => (
              <div className="footer-column" key={column.title}>
                <h3>{column.title}</h3>
                <ul>
                  {column.links.map(link => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} {landingContent.brand}
          </p>
        </div>
      </div>
    </footer>
  );
}
