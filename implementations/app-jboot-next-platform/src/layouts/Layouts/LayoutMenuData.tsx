"use client";

import React, { useState } from "react";
import { getApplicationScopes } from "@/lib/module-auth-token";
import {
  canManageModuleUsers,
  moduleSettings,
  PlatformModuleSlug,
} from "@/config/module-settings";

function currentModule(): "pdv" | "juridico" | "flow" | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (window.location.pathname.startsWith("/juridico")) {
    return "juridico";
  }
  if (window.location.pathname.startsWith("/flow")) {
    return "flow";
  }
  return "pdv";
}

const Navdata = () => {
  const pdvScopes = getApplicationScopes("app:pdv", "pdvAccessToken");
  const hasPdvScope = (scope: string) => pdvScopes.includes(scope);
  // Item so de navegacao; a barreira e o backend (`flow:admin`).
  const isFlowAdmin = getApplicationScopes("app:flow").includes("flow:admin");
  const module = currentModule();
  const currentScopes = module ? getApplicationScopes(`app:${module}`) : [];

  // `Navdata()` e invocado durante o render do VerticalLayout, entao este
  // state pertence aquele componente — mesmo padrao do template original.
  const [isComandaOpen, setIsComandaOpen] = useState(
    typeof window !== "undefined" &&
      window.location.pathname.startsWith("/pdv/comanda"),
  );

  /**
   * DataJud e uma fonte de dados independente dos portais (eProc, ESAJ,
   * Projudi) e do DJEN: agrupar por fonte deixa explicito de onde vem cada
   * consulta, seguindo a convencao ja usada no resto do menu juridico.
   */
  const [isDataJudOpen, setIsDataJudOpen] = useState(
    typeof window !== "undefined" &&
      (window.location.pathname.startsWith("/juridico/consultas") ||
        window.location.pathname.startsWith("/juridico/acompanhamentos")),
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(
    typeof window !== "undefined" &&
      window.location.pathname.includes("/configuracoes/") &&
      !window.location.pathname.includes("/configuracoes/ia/"),
  );
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(
    typeof window !== "undefined" &&
      window.location.pathname.includes("/configuracoes/ia/"),
  );

  const settingsMenu = (target: PlatformModuleSlug): any[] => {
    const settings = moduleSettings(target, currentScopes).filter(
      (item) => !item.group,
    );
    if (settings.length === 0) return [];
    return [
      {
        id: `${target}-configuracoes`,
        label: "Configurações",
        icon: "ri-settings-3-line",
        link: "/#",
        stateVariables: isSettingsOpen,
        click: function (e: any) {
          e.preventDefault();
          setIsSettingsOpen(!isSettingsOpen);
        },
        subItems: settings.map((item) => ({
          id: `${target}-${item.id}`,
          label: item.label,
          icon: item.icon,
          link: item.href(target),
          parentId: `${target}-configuracoes`,
        })),
      },
    ];
  };

  /**
   * IA e um grupo de primeiro nivel (dois niveis, como DataJud/Comanda), nao
   * um submenu de Configuracoes: evita o terceiro nivel aninhado.
   */
  const aiMenu = (target: PlatformModuleSlug): any[] => {
    const aiItems = moduleSettings(target, currentScopes).filter(
      (item) => item.group === "ai",
    );
    if (aiItems.length === 0) return [];
    return [
      {
        id: `${target}-ia`,
        label: "IA",
        icon: "ri-robot-2-line",
        link: "/#",
        stateVariables: isAiSettingsOpen,
        click: function (e: any) {
          e.preventDefault();
          setIsAiSettingsOpen(!isAiSettingsOpen);
        },
        subItems: aiItems.map((item) => ({
          id: `${target}-${item.id}`,
          label: item.label,
          icon: item.icon,
          link: item.href(target),
          parentId: `${target}-ia`,
        })),
      },
    ];
  };

  /**
   * Comanda tem 7 telas de staff, cada uma de um papel/estacao diferente.
   * Como itens de primeiro nivel elas dominavam o menu do PDV; agrupadas, o
   * menu volta a caber. O filtro por escopo continua item a item: cozinha so
   * ve Cozinha, bar so ve Bar.
   */
  const comandaSubItems: any[] = [
    ...(hasPdvScope("pdv:comanda:balcao")
      ? [
          {
            id: "comanda-salao",
            label: "Salão",
            icon: "ri-layout-grid-line",
            link: "/pdv/comanda/salao",
          },
          {
            id: "comanda-triagem",
            label: "Triagem",
            icon: "ri-list-check-2",
            link: "/pdv/comanda/triagem",
          },
          {
            id: "comanda-fechamento",
            label: "Fechamento",
            icon: "ri-bill-line",
            link: "/pdv/comanda/fechamento",
          },
        ]
      : []),
    ...(hasPdvScope("pdv:comanda:cozinha")
      ? [
          {
            id: "comanda-cozinha",
            label: "Cozinha",
            icon: "ri-restaurant-2-line",
            link: "/pdv/comanda/cozinha",
          },
        ]
      : []),
    ...(hasPdvScope("pdv:comanda:bar")
      ? [
          {
            id: "comanda-bar",
            label: "Bar",
            icon: "ri-goblet-line",
            link: "/pdv/comanda/bar",
          },
        ]
      : []),
    ...(hasPdvScope("pdv:comanda:balcao") ||
    hasPdvScope("pdv:comanda:cozinha") ||
    hasPdvScope("pdv:comanda:bar")
      ? [
          {
            id: "comanda-painel",
            label: "Painel",
            icon: "ri-tv-2-line",
            link: "/pdv/comanda/painel",
          },
        ]
      : []),
    ...(hasPdvScope("pdv:comanda:balcao") || hasPdvScope("pdv:admin:read")
      ? [
          {
            id: "comanda-mesas",
            label: "Mesas",
            icon: "ri-qr-code-line",
            link: "/pdv/comanda/mesas",
          },
        ]
      : []),
  ];

  // Um filho so nao justifica um nivel de aninhamento: cozinha e bar veem um
  // item plano, como antes do agrupamento.
  const comandaMenuItems: any[] =
    comandaSubItems.length === 0
      ? []
      : comandaSubItems.length === 1
        ? [
            {
              id: comandaSubItems[0].id,
              label: `Comanda · ${comandaSubItems[0].label}`,
              icon: comandaSubItems[0].icon,
              link: comandaSubItems[0].link,
            },
          ]
        : [
            {
              id: "comanda",
              label: "Comanda",
              icon: "ri-restaurant-line",
              link: "/#",
              stateVariables: isComandaOpen,
              click: function (e: any) {
                e.preventDefault();
                setIsComandaOpen(!isComandaOpen);
              },
              subItems: comandaSubItems.map((subItem) => ({
                ...subItem,
                parentId: "comanda",
              })),
            },
          ];

  const pdvMenuItems: any = [
    {
      label: "PDV",
      isHeader: true,
    },
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "ri-dashboard-2-line",
      link: "/pdv",
    },
    {
      id: "pdv",
      label: "PDV",
      icon: "ri-shopping-cart-line",
      link: "/pdv/pdv",
    },
    {
      id: "products",
      label: "Produtos",
      icon: "ri-shopping-bag-3-line",
      link: "/pdv/produtos",
    },
    {
      id: "categories",
      label: "Categorias",
      icon: "ri-price-tag-3-line",
      link: "/pdv/categorias",
    },
    {
      id: "customers",
      label: "Clientes",
      icon: "ri-user-3-line",
      link: "/pdv/clientes",
    },
    {
      id: "lojas",
      label: "Lojas",
      icon: "ri-store-2-line",
      link: "/pdv/lojas",
    },
    {
      id: "pdv-fiscal-config",
      label: "Config. Fiscal",
      icon: "ri-file-settings-line",
      link: "/pdv/configuracao-fiscal",
    },
    {
      id: "pdv-payments",
      label: "Pagamentos",
      icon: "ri-secure-payment-line",
      link: "/pdv/pagamentos",
    },
    ...comandaMenuItems,
    ...settingsMenu("pdv"),
  ];

  const juridicoMenuItems: any = [
    {
      label: "Jurídico",
      isHeader: true,
    },
    {
      id: "juridico-home",
      label: "Jurídico",
      icon: "ri-scales-3-line",
      link: "/juridico",
    },
    {
      id: "juridico-captacao",
      label: "Captação",
      icon: "ri-inbox-archive-line",
      link: "/juridico/captacao",
    },
    {
      id: "juridico-datajud",
      label: "DataJud",
      icon: "ri-database-2-line",
      link: "/#",
      stateVariables: isDataJudOpen,
      click: function (e: any) {
        e.preventDefault();
        setIsDataJudOpen(!isDataJudOpen);
      },
      subItems: [
        {
          id: "juridico-consulta-processual",
          label: "Consulta processual",
          icon: "ri-search-eye-line",
          link: "/juridico/consultas/processo",
          parentId: "juridico-datajud",
        },
        {
          id: "juridico-acompanhamentos",
          label: "Acompanhamentos",
          icon: "ri-radar-line",
          link: "/juridico/acompanhamentos",
          parentId: "juridico-datajud",
        },
      ],
    },
    {
      id: "juridico-prazos",
      label: "Prazos",
      icon: "ri-calendar-check-line",
      link: "/juridico/prazos",
    },
    {
      id: "juridico-calendarios",
      label: "Calendários",
      icon: "ri-calendar-event-line",
      link: "/juridico/prazos/calendarios",
    },
    {
      id: "juridico-projudi",
      label: "PROJUDI",
      icon: "ri-building-2-line",
      link: "/juridico/projudi",
    },
    {
      id: "juridico-esaj",
      label: "ESAJ",
      icon: "ri-government-line",
      link: "/juridico/esaj",
    },
    {
      id: "juridico-eproc",
      label: "EPROC",
      icon: "ri-file-list-3-line",
      link: "/juridico/eproc",
    },
    {
      id: "juridico-pje",
      label: "PJE",
      icon: "ri-mail-open-line",
      link: "/juridico/pje",
    },
    ...settingsMenu("juridico"),
  ];

  const flowMenuItems: any = [
    {
      label: "Flow",
      isHeader: true,
    },
    {
      id: "flow-home",
      label: "Home",
      icon: "ri-home-5-line",
      link: "/flow",
    },
    {
      id: "flow-boards",
      label: "Boards",
      icon: "ri-layout-grid-line",
      link: "/flow/boards",
    },
    // CRM de leads, Sprint 4: fila do gestor (o backend restringe ao flow:admin).
    ...(isFlowAdmin
      ? [
          {
            id: "flow-leads",
            label: "Leads",
            icon: "ri-inbox-archive-line",
            link: "/flow/leads",
          },
        ]
      : []),
    {
      id: "flow-clientes",
      label: "Clientes",
      icon: "ri-user-3-line",
      link: "/flow/clientes",
    },
    // Importacao de processos por planilha (flow-process-import-sprints.md): o backend exige papel no board e a capacidade monitoramento-processual (ADR 021).
    {
      id: "flow-importar-processos",
      label: "Importar processos",
      icon: "ri-file-excel-2-line",
      link: "/flow/importar-processos",
    },
    // CRM de leads, Sprint 3.5: escritorios (o backend restringe ao flow:admin).
    ...(isFlowAdmin
      ? [
          {
            id: "flow-escritorios",
            label: "Escritórios",
            icon: "ri-building-line",
            link: "/flow/escritorios",
          },
        ]
      : []),
    ...aiMenu("flow"),
    ...(canManageModuleUsers(currentScopes)
      ? [
          {
            id: "flow-usuarios",
            label: "Usuários",
            icon: "ri-group-line",
            link: "/flow/usuarios",
          },
        ]
      : []),
    ...settingsMenu("flow"),
  ];

  const menuItems = module === "juridico" ? juridicoMenuItems : module === "flow" ? flowMenuItems : pdvMenuItems;

  return <React.Fragment>{menuItems}</React.Fragment>;
};

export default Navdata;
