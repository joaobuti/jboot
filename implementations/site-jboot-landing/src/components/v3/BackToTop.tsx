"use client";

import { useEffect, useState } from "react";

export function BackToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="btn btn-primary btn-icon position-fixed end-0 me-4"
      id="back-to-top"
      aria-label="Voltar ao topo"
      style={{ zIndex: 20, borderRadius: "50%", width: 44, height: 44 }}
    >
      <i className="ri-arrow-up-line" />
    </button>
  );
}
