import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { LAYOUT_MODE_TYPES } from "@/constants/layout";
import LightDark from "./LightDark";

type ButtonElement = ReactElement<{
  "aria-label": string;
  children: ReactElement<{ className: string }>;
  onClick: () => void;
}>;

const renderButton = (layoutMode: string) => {
  const onChangeLayoutMode = vi.fn();
  const tree = LightDark({ layoutMode, onChangeLayoutMode });

  expect(isValidElement(tree)).toBe(true);

  const container = tree as ReactElement<{ children: ReactNode }>;
  const button = container.props.children as ButtonElement;

  return { button, onChangeLayoutMode };
};

describe("LightDark", () => {
  it("requests light mode when current mode is dark", () => {
    const { button, onChangeLayoutMode } = renderButton(
      LAYOUT_MODE_TYPES.DARKMODE,
    );

    button.props.onClick();

    expect(onChangeLayoutMode).toHaveBeenCalledWith(LAYOUT_MODE_TYPES.LIGHTMODE);
    expect(button.props["aria-label"]).toBe("Ativar modo claro");
    expect(button.props.children.props.className).toContain("bx-sun");
  });

  it("requests dark mode when current mode is light", () => {
    const { button, onChangeLayoutMode } = renderButton(
      LAYOUT_MODE_TYPES.LIGHTMODE,
    );

    button.props.onClick();

    expect(onChangeLayoutMode).toHaveBeenCalledWith(LAYOUT_MODE_TYPES.DARKMODE);
    expect(button.props["aria-label"]).toBe("Ativar modo escuro");
    expect(button.props.children.props.className).toContain("bx-moon");
  });
});
