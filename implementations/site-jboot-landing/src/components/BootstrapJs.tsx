"use client";

import { useEffect } from "react";

export function BootstrapJs() {
  useEffect(() => {
    let tooltips: { dispose: () => void }[] = [];

    import("bootstrap").then(({ Tooltip }) => {
      const triggers = document.querySelectorAll('[data-bs-toggle="tooltip"]');
      tooltips = Array.from(triggers).map(el => new Tooltip(el));
    });

    return () => {
      tooltips.forEach(tooltip => tooltip.dispose());
    };
  }, []);

  return null;
}
