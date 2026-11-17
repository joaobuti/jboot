"use client";

import { usePathname } from "next/navigation";

export type CurrentModule = "pdv" | "juridico" | "flow";

export function useCurrentModule(): CurrentModule {
  const pathname = usePathname();
  if (pathname.startsWith("/juridico")) {
    return "juridico";
  }
  if (pathname.startsWith("/flow")) {
    return "flow";
  }
  return "pdv";
}
