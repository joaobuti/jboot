import { routes } from "@/lib/routes";

export const hubLocales = [
  { code: "pt", label: "PT", name: "Portugues", href: "/" },
  { code: "en", label: "EN", name: "English", href: "/en/" },
  { code: "es", label: "ES", name: "Espanol", href: "/es/" },
] as const;

export type HubLocale = (typeof hubLocales)[number]["code"];

export const hubHomePages = {
  pt: {
    lang: "pt-BR",
    path: "/",
    seo: {
      title: "JBoot | Ecossistema de aplicacoes",
      description:
        "Ecossistema JBoot de aplicacoes de negocio com identidade centralizada, modulos independentes e engenharia governada.",
    },
    brand: "JBoot",
    navigation: [
      { label: "Solucoes", href: "#produtos" },
      { label: "Fundamentos", href: "#fundamentos" },
      { label: "Processo", href: "#processo" },
      { label: "Pipeline de agentes", href: "#pipeline" },
    ],
    login: { label: "Entrar", href: routes.login },
    hero: {
      eyebrow: "PDV · Juridico · identidade centralizada",
      title: {
        firstLine: "Um hub de aplicacoes",
        emphasis: "fundamentos",
        lastLine: "compartilhados.",
      },
      description:
        "A JBoot organiza aplicacoes de negocio sobre uma base comum de identidade, governanca e engenharia. Cada modulo preserva seu contexto, suas permissoes e seu ciclo de evolucao.",
      primaryCta: { label: "Ver as solucoes", href: "#produtos" },
      secondaryCta: { label: "Como a base funciona", href: "#fundamentos" },
      signals: [
        ["Identity", "acesso centralizado"],
        ["Modulos", "evolucao independente"],
        ["Human review", "gate de engenharia"],
      ],
    },
    pipeline: {
      eyebrow: "AI-first · simulacao local",
      title: "Um requisito entra. Uma entrega revisavel emerge.",
      description:
        "Acompanhe um cenario ilustrativo de arquitetura, selecao de agents e skills, confirmacao humana e execucao especializada. Nenhum arquivo e enviado ao servidor.",
    },
    solutions: {
      title: "Aplicacoes especializadas. Um mesmo plano de controle.",
      description:
        "Os modulos compartilham acesso e governanca sem perder responsabilidades, permissoes ou ciclos de deploy proprios.",
      items: [
        {
          id: "01",
          name: "PDV",
          segment: "Operacao comercial",
          claim: "Frente de caixa e gestao do ponto de venda no contexto do cliente.",
          detail:
            "Aplicacao modular com roles e scopes proprios, preparada para operacao comercial e evolucao independente.",
          signal: "Aplicacao selecionavel no Identity",
        },
        {
          id: "02",
          name: "Juridico",
          segment: "Operacao juridica",
          claim: "Rotinas juridicas organizadas com automacoes controladas.",
          detail:
            "Modulo orientado a contexto e rastreabilidade, com separacao entre interface, BFF e processamento especializado.",
          signal: "Contexto e permissoes proprios",
        },
        {
          id: "03",
          name: "Flow",
          segment: "CRM e automação",
          claim: "Gerencie leads e etapas de atendimento em quadros Kanban.",
          detail:
            "Configure regras por coluna para acionar agentes de IA quando um card entra ou sai de uma etapa.",
          signal: "Aplicação selecionável no Identity",
        },
        {
          id: "04",
          name: "Identity",
          segment: "Plano de controle",
          claim: "Entrada centralizada para clientes, usuarios e aplicacoes contratadas.",
          detail:
            "Administra contratos, entitlements e o contexto selecionado sem se apresentar como produto comercial final.",
          signal: "Acesso centralizado",
        },
      ],
    },
    foundations: {
      eyebrow: "Fundamentos compartilhados",
      title: "A aplicacao fica na ponta. A consistencia vem das camadas abaixo.",
      layers: [
        {
          id: "01",
          title: "Contexto e acesso",
          body: "Identity centraliza clientes, aplicacoes contratadas, roles e scopes por modulo.",
        },
        {
          id: "02",
          title: "Fronteiras modulares",
          body: "PDV e Juridico mantem contratos tecnicos e ciclos de deploy independentes.",
        },
        {
          id: "03",
          title: "Engenharia governada",
          body: "Agents, skills, testes e gates registram decisoes e preservam revisao humana nas mudancas materiais.",
        },
      ],
    },
    process: {
      title: "Da necessidade operacional a uma entrega verificavel.",
      steps: [
        ["Descoberta", "Escopo, criterios de aceite e perguntas abertas sao explicitados antes do codigo."],
        ["Arquitetura", "Stack, fronteiras e riscos sao avaliados contra o contrato real da entrega."],
        ["Implementacao", "Agentes especializados executam o menor escopo correto com testes equivalentes."],
        ["Validacao", "Build, qualidade, seguranca e operacao produzem evidencia para revisao humana."],
      ],
    },
    finalCta: {
      title: "Acesse o ecossistema JBoot.",
      description:
        "Entre no ambiente autenticado para visualizar as aplicacoes disponiveis para o seu contexto.",
      action: { label: "Entrar", href: routes.login },
    },
  },
  en: {
    lang: "en",
    path: "/en/",
    seo: {
      title: "JBoot | Application ecosystem",
      description:
        "JBoot business application ecosystem with centralized identity, independent modules and governed engineering.",
    },
    brand: "JBoot",
    navigation: [
      { label: "Solutions", href: "#produtos" },
      { label: "Foundations", href: "#fundamentos" },
      { label: "Process", href: "#processo" },
      { label: "Agent pipeline", href: "#pipeline" },
    ],
    login: { label: "Sign in", href: routes.login },
    hero: {
      eyebrow: "POS · Legal · centralized identity",
      title: {
        firstLine: "An application hub",
        emphasis: "shared",
        lastLine: "foundations.",
      },
      description:
        "JBoot organizes business applications on a common base of identity, governance and engineering. Each module preserves its context, permissions and evolution cycle.",
      primaryCta: { label: "View solutions", href: "#produtos" },
      secondaryCta: { label: "How the base works", href: "#fundamentos" },
      signals: [
        ["Identity", "centralized access"],
        ["Modules", "independent evolution"],
        ["Human review", "engineering gate"],
      ],
    },
    pipeline: {
      eyebrow: "AI-first · local simulation",
      title: "A requirement enters. A reviewable delivery emerges.",
      description:
        "Follow an illustrative scenario of architecture, agent and skill selection, human confirmation and specialized execution. No file is sent to the server.",
    },
    solutions: {
      title: "Specialized applications. One control plane.",
      description:
        "Modules share access and governance without losing their own responsibilities, permissions or deployment cycles.",
      items: [
        {
          id: "01",
          name: "POS",
          segment: "Commercial operation",
          claim: "Point-of-sale operation and management in the customer context.",
          detail:
            "A modular application with its own roles and scopes, prepared for commercial operation and independent evolution.",
          signal: "Selectable application in Identity",
        },
        {
          id: "02",
          name: "Legal",
          segment: "Legal operation",
          claim: "Legal routines organized with controlled automations.",
          detail:
            "A context and traceability oriented module, separated across interface, BFF and specialized processing.",
          signal: "Dedicated context and permissions",
        },
        {
          id: "03",
          name: "Flow",
          segment: "CRM and automation",
          claim: "Manage leads and track their progress on Kanban boards.",
          detail:
            "Configure column rules to trigger AI agents when a card enters or leaves a stage.",
          signal: "Available through Identity",
        },
        {
          id: "04",
          name: "Identity",
          segment: "Control plane",
          claim: "Centralized entry for clients, users and contracted applications.",
          detail:
            "Manages contracts, entitlements and selected context without being presented as the final commercial product.",
          signal: "Centralized access",
        },
      ],
    },
    foundations: {
      eyebrow: "Shared foundations",
      title: "The application stays at the edge. Consistency comes from the layers below.",
      layers: [
        {
          id: "01",
          title: "Context and access",
          body: "Identity centralizes clients, contracted applications, roles and scopes per module.",
        },
        {
          id: "02",
          title: "Modular boundaries",
          body: "POS and Legal keep technical contracts and deployment cycles independent.",
        },
        {
          id: "03",
          title: "Governed engineering",
          body: "Agents, skills, tests and gates register decisions and preserve human review for material changes.",
        },
      ],
    },
    process: {
      title: "From operational need to verifiable delivery.",
      steps: [
        ["Discovery", "Scope, acceptance criteria and open questions are made explicit before code."],
        ["Architecture", "Stack, boundaries and risks are evaluated against the real delivery contract."],
        ["Implementation", "Specialized agents execute the smallest correct scope with equivalent tests."],
        ["Validation", "Build, quality, security and operation produce evidence for human review."],
      ],
    },
    finalCta: {
      title: "Access the JBoot ecosystem.",
      description:
        "Enter the authenticated environment to view the applications available for your context.",
      action: { label: "Sign in", href: routes.login },
    },
  },
  es: {
    lang: "es",
    path: "/es/",
    seo: {
      title: "JBoot | Ecosistema de aplicaciones",
      description:
        "Ecosistema JBoot de aplicaciones de negocio con identidad centralizada, modulos independientes e ingenieria gobernada.",
    },
    brand: "JBoot",
    navigation: [
      { label: "Soluciones", href: "#produtos" },
      { label: "Fundamentos", href: "#fundamentos" },
      { label: "Proceso", href: "#processo" },
      { label: "Pipeline de agentes", href: "#pipeline" },
    ],
    login: { label: "Entrar", href: routes.login },
    hero: {
      eyebrow: "POS · Juridico · identidad centralizada",
      title: {
        firstLine: "Un hub de aplicaciones",
        emphasis: "fundamentos",
        lastLine: "compartidos.",
      },
      description:
        "JBoot organiza aplicaciones de negocio sobre una base comun de identidad, gobernanza e ingenieria. Cada modulo preserva su contexto, permisos y ciclo de evolucion.",
      primaryCta: { label: "Ver soluciones", href: "#produtos" },
      secondaryCta: { label: "Como funciona la base", href: "#fundamentos" },
      signals: [
        ["Identity", "acceso centralizado"],
        ["Modulos", "evolucion independiente"],
        ["Human review", "gate de ingenieria"],
      ],
    },
    pipeline: {
      eyebrow: "AI-first · simulacion local",
      title: "Entra un requisito. Emerge una entrega revisable.",
      description:
        "Acompane un escenario ilustrativo de arquitectura, seleccion de agents y skills, confirmacion humana y ejecucion especializada. Ningun archivo se envia al servidor.",
    },
    solutions: {
      title: "Aplicaciones especializadas. Un mismo plano de control.",
      description:
        "Los modulos comparten acceso y gobernanza sin perder responsabilidades, permisos ni ciclos de despliegue propios.",
      items: [
        {
          id: "01",
          name: "POS",
          segment: "Operacion comercial",
          claim: "Punto de venta y gestion de la operacion comercial en el contexto del cliente.",
          detail:
            "Aplicacion modular con roles y scopes propios, preparada para operacion comercial y evolucion independiente.",
          signal: "Aplicacion seleccionable en Identity",
        },
        {
          id: "02",
          name: "Juridico",
          segment: "Operacion juridica",
          claim: "Rutinas juridicas organizadas con automatizaciones controladas.",
          detail:
            "Modulo orientado a contexto y trazabilidad, con separacion entre interfaz, BFF y procesamiento especializado.",
          signal: "Contexto y permisos propios",
        },
        {
          id: "03",
          name: "Flow",
          segment: "CRM y automatización",
          claim: "Gestiona leads y su progreso en tableros Kanban.",
          detail:
            "Configura reglas por columna para activar agentes de IA cuando una tarjeta entra o sale de una etapa.",
          signal: "Disponible en Identity",
        },
        {
          id: "04",
          name: "Identity",
          segment: "Plano de control",
          claim: "Entrada centralizada para clientes, usuarios y aplicaciones contratadas.",
          detail:
            "Administra contratos, entitlements y el contexto seleccionado sin presentarse como producto comercial final.",
          signal: "Acceso centralizado",
        },
      ],
    },
    foundations: {
      eyebrow: "Fundamentos compartidos",
      title: "La aplicacion queda en la punta. La consistencia viene de las capas inferiores.",
      layers: [
        {
          id: "01",
          title: "Contexto y acceso",
          body: "Identity centraliza clientes, aplicaciones contratadas, roles y scopes por modulo.",
        },
        {
          id: "02",
          title: "Fronteras modulares",
          body: "POS y Juridico mantienen contratos tecnicos y ciclos de despliegue independientes.",
        },
        {
          id: "03",
          title: "Ingenieria gobernada",
          body: "Agents, skills, pruebas y gates registran decisiones y preservan revision humana en cambios materiales.",
        },
      ],
    },
    process: {
      title: "De la necesidad operacional a una entrega verificable.",
      steps: [
        ["Descubrimiento", "Alcance, criterios de aceptacion y preguntas abiertas se explicitan antes del codigo."],
        ["Arquitectura", "Stack, fronteras y riesgos se evaluan contra el contrato real de la entrega."],
        ["Implementacion", "Agentes especializados ejecutan el menor alcance correcto con pruebas equivalentes."],
        ["Validacion", "Build, calidad, seguridad y operacion producen evidencia para revision humana."],
      ],
    },
    finalCta: {
      title: "Accede al ecosistema JBoot.",
      description:
        "Entra en el entorno autenticado para ver las aplicaciones disponibles para tu contexto.",
      action: { label: "Entrar", href: routes.login },
    },
  },
} as const;

export const hubHomeContent = hubHomePages.pt;
export type HubHomeContent = (typeof hubHomePages)[HubLocale];
