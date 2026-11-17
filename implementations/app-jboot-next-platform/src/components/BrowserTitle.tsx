"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const BRAND = "JBoot";

const exactTitles: Record<string, string> = {
  "/": BRAND,
  "/login": `Login | ${BRAND}`,
  "/pdv": `PDV | ${BRAND}`,
  "/juridico": `JBoot Jurídico | ${BRAND}`,
  "/dashboard": `Home | Platform | ${BRAND}`,
  "/clientes": `Clientes | PDV | ${BRAND}`,
  "/categorias": `Categorias | PDV | ${BRAND}`,
  "/produtos": `Produtos | PDV | ${BRAND}`,
  "/estoque": `Estoque | PDV | ${BRAND}`,
  "/usuarios": `Usuários | PDV | ${BRAND}`,
  "/flow": `Home | JBoot Flow | ${BRAND}`,
  "/flow/boards": `Boards | JBoot Flow | ${BRAND}`,
  "/flow/usuarios": `Usuários | JBoot Flow | ${BRAND}`,
  "/flow/escritorios": `Escritórios | JBoot Flow | ${BRAND}`,
  "/flow/leads": `Leads | JBoot Flow | ${BRAND}`,
  "/juridico/captacao": `Captação | JBoot Jurídico | ${BRAND}`,
  "/juridico/consultas/processo": `Consulta processual | JBoot Jurídico | ${BRAND}`,
  "/juridico/acompanhamentos": `Acompanhamentos | JBoot Jurídico | ${BRAND}`,
  "/juridico/prazos": `Prazos | JBoot Jurídico | ${BRAND}`,
  "/juridico/prazos/calendarios": `Calendários | JBoot Jurídico | ${BRAND}`,
  "/juridico/eproc": `e-Proc | JBoot Jurídico | ${BRAND}`,
  "/juridico/pje": `PJe | JBoot Jurídico | ${BRAND}`,
  "/juridico/esaj": `e-SAJ | JBoot Jurídico | ${BRAND}`,
  "/juridico/projudi": `Projudi | JBoot Jurídico | ${BRAND}`,
  "/juridico/portais": `Portais | JBoot Jurídico | ${BRAND}`,
};

function titleForPath(pathname: string): string {
  if (exactTitles[pathname]) {
    return exactTitles[pathname];
  }

  if (pathname.startsWith("/flow/boards/") && pathname.endsWith("/settings/profiles")) {
    return `Perfis | JBoot Flow | ${BRAND}`;
  }

  if (pathname.startsWith("/flow/boards/") && pathname.endsWith("/settings/tags-status")) {
    return `Tags e Status | JBoot Flow | ${BRAND}`;
  }

  if (pathname.startsWith("/flow/boards/")) {
    return `Board | JBoot Flow | ${BRAND}`;
  }

  if (pathname.startsWith("/juridico/")) {
    return `JBoot Jurídico | ${BRAND}`;
  }

  return `Platform | ${BRAND}`;
}

export default function BrowserTitle() {
  const pathname = usePathname();

  useEffect(() => {
    document.title = titleForPath(pathname || "/");
  }, [pathname]);

  return null;
}
