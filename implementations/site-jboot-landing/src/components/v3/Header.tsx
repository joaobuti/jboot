"use client";

import { useEffect, useState } from "react";
import { v3Content } from "@/content/v3-content";
import { routes } from "@/lib/routes";

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`navbar navbar-expand-lg navbar-landing fixed-top ${isScrolled ? "is-sticky" : ""}`}>
      <div className="container-fluid" style={{ maxWidth: 1320 }}>
        <a href={routes.home} className="navbar-brand d-flex align-items-center gap-2 fw-bold">
          <img className="rounded" src="/icons/brand-mark-dark.png" alt="" width={32} height={32} />
          {v3Content.brand}
        </a>

        <button
          className="navbar-toggler border-0 fs-20"
          type="button"
          onClick={() => setIsOpen(open => !open)}
          aria-expanded={isOpen}
          aria-label="Abrir menu"
        >
          <i className={isOpen ? "ri-close-line" : "ri-menu-line"} />
        </button>

        <div className={`collapse navbar-collapse ${isOpen ? "show" : ""}`}>
          <ul className="navbar-nav mx-auto mt-2 mt-lg-0">
            {v3Content.nav.map(item => (
              <li className="nav-item" key={item.href}>
                <a className="nav-link" href={item.href} onClick={() => setIsOpen(false)}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="d-flex gap-2">
            <a href={routes.home} className="btn btn-link text-decoration-none text-body">
              Ver v1
            </a>
            <a href={routes.login} className="btn btn-primary">
              Entrar
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
