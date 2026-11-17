"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const BRAND = "JBoot";
const APP = "Identity Admin";

const exactTitles: Record<string, string> = {
  "/": `${APP} | ${BRAND}`,
  "/login": `Login | ${BRAND}`,
  "/register": `Cadastro | ${BRAND}`,
  "/apps": `Escolha de Aplicativo | ${BRAND}`,
  "/clientes": `Clientes | ${APP} | ${BRAND}`,
  "/identity/clientes": `Clientes | ${APP} | ${BRAND}`,
  "/usuarios": `Usuários | ${APP} | ${BRAND}`,
  "/app-databases": `Databases | ${APP} | ${BRAND}`,
  "/onboarding-clientes": `Onboarding de Clientes | ${APP} | ${BRAND}`,
};

function humanizeSegment(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleForPath(pathname: string): string {
  if (exactTitles[pathname]) {
    return exactTitles[pathname];
  }

  const lastSegment = pathname.split("/").filter(Boolean).pop();
  if (!lastSegment) {
    return `${APP} | ${BRAND}`;
  }

  return `${humanizeSegment(lastSegment)} | ${APP} | ${BRAND}`;
}

export default function BrowserTitle() {
  const pathname = usePathname();

  useEffect(() => {
    document.title = titleForPath(pathname || "/");
  }, [pathname]);

  return null;
}
