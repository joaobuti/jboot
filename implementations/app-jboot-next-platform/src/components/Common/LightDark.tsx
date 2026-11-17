import React from "react";

//constants
import { LAYOUT_MODE_TYPES } from "@/constants/layout";

interface LightDarkProps {
  layoutMode: string;
  onChangeLayoutMode: (mode: string) => void;
}
const LightDark = ({ layoutMode, onChangeLayoutMode }: LightDarkProps) => {
  const isDarkMode = layoutMode === LAYOUT_MODE_TYPES["DARKMODE"];
  const mode = isDarkMode
    ? LAYOUT_MODE_TYPES["LIGHTMODE"]
    : LAYOUT_MODE_TYPES["DARKMODE"];
  const label = isDarkMode ? "Ativar modo claro" : "Ativar modo escuro";

  return (
    <div className="ms-1 header-item d-none d-sm-flex">
      <button
        onClick={() => onChangeLayoutMode(mode)}
        type="button"
        aria-label={label}
        title={label}
        className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle light-dark-mode"
      >
        <i className={`bx ${isDarkMode ? "bx-sun" : "bx-moon"} fs-22`}></i>
      </button>
    </div>
  );
};

export default LightDark;
