import { routes } from "@/lib/routes";

export const v2Content = {
  brand: "JBoot",
  nav: [
    { label: "Confianca", href: "#confianca" },
    { label: "Clientes", href: "#clientes" },
    { label: "Solucoes", href: "#solucoes" },
    { label: "Niveis", href: "#niveis" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    headline: "Um ecossistema de aplicacoes para operar sua gestao com controle e clareza.",
    subheadline:
      "Centralize o acesso e organize modulos de negocio como PDV e Juridico em uma experiencia unica, preparada para evoluir com a operacao.",
    primaryCta: { label: "Entrar", href: routes.login },
    secondaryCta: { label: "Conhecer solucoes", href: "#solucoes" },
    modules: [
      { title: "Identity", description: "Acesso centralizado" },
      { title: "PDV", description: "Operacao comercial" },
      { title: "Juridico", description: "Rotinas juridicas" },
    ],
  },
  trust: {
    id: "confianca",
    headline: "Pensado para como clientes contratados realmente operam.",
    items: [
      {
        title: "Multiplos modulos",
        description: "PDV, Juridico e novos modulos convivem sob o mesmo ecossistema, sem virar paineis isolados.",
      },
      {
        title: "Acesso por contexto",
        description: "Cada cliente contratado enxerga apenas os modulos habilitados para o seu contrato.",
      },
      {
        title: "Deploy independente",
        description: "Atualizacoes por modulo acontecem sem indisponibilidade cruzada entre solucoes.",
      },
      {
        title: "Pronto para crescer",
        description: "Arquitetura preparada para novos clientes contratados e novas frentes de negocio.",
      },
    ],
  },
  clients: {
    id: "clientes",
    headline: "Quem opera o ecossistema JBoot",
    description: "Exemplos ilustrativos de operacoes que utilizam o ecossistema JBoot.",
    items: [
      { name: "Mercado Vertice", segment: "Varejo" },
      { name: "Construtora Altiplano", segment: "Multi-unidades" },
      { name: "Bastos & Lima Advocacia", segment: "Juridico" },
      { name: "Rede Cedro Calcados", segment: "Varejo" },
      { name: "Distribuidora Boreal", segment: "Distribuicao" },
      { name: "Grupo Atlas Comercio", segment: "Varejo" },
      { name: "Studio Convex", segment: "Servicos" },
      { name: "Comercial Nortelandia", segment: "Comercio" },
    ],
  },
  services: {
    id: "solucoes",
    eyebrow: "Capacidades",
    headline: "Capacidades do ecossistema",
    subheadline:
      "Uma base operacional unica para sustentar modulos de negocio diferentes, sem perder controle sobre quem acessa o que.",
    icons: [
      "ri-stack-line",
      "ri-shield-keyhole-line",
      "ri-history-line",
      "ri-rocket-2-line",
      "ri-layout-grid-line",
      "ri-line-chart-line",
      "ri-door-lock-line",
      "ri-refresh-line",
      "ri-building-2-line",
    ],
    items: [
      {
        title: "Modularidade",
        description: "Cada frente de negocio entra como um modulo independente, sem reescrever a base do ecossistema.",
      },
      {
        title: "Controle de acesso",
        description: "Permissoes organizadas por contexto, contrato e aplicacao habilitada.",
      },
      {
        title: "Auditoria e rastreabilidade",
        description: "Acoes e acessos organizados para permitir acompanhamento ao longo do tempo.",
      },
      {
        title: "Deploy independente por modulo",
        description: "Atualizacoes de um modulo nao exigem parar os demais.",
      },
      {
        title: "Organizacao por contexto",
        description: "Identidade, modulos e operacao tratados como camadas separadas e coerentes entre si.",
      },
      {
        title: "Escalabilidade",
        description: "Estrutura preparada para receber novos modulos sem retrabalho de plataforma.",
      },
      {
        title: "Acesso centralizado",
        description: "Um unico ponto de entrada para todas as aplicacoes contratadas.",
      },
      {
        title: "Continuidade operacional",
        description: "Evolucao tecnica planejada para nao interromper a operacao do dia a dia.",
      },
      {
        title: "Base unica para multiplos modulos",
        description: "PDV, Juridico e futuras solucoes compartilham a mesma fundacao tecnica.",
      },
    ],
  },
  features: [
    {
      eyebrow: "Controle",
      title: "Controle de acesso e organizacao por contexto",
      description:
        "Cada cliente contratado enxerga apenas os modulos habilitados para o seu contrato, com identidade, permissoes e operacao tratadas em camadas separadas.",
      checklist: [
        "Acesso definido por contrato e modulo habilitado",
        "Separacao clara entre identidade, modulos e operacao",
        "Experiencia unica mesmo com multiplos modulos ativos",
      ],
    },
    {
      eyebrow: "Estrutura",
      title: "Rastreabilidade e evolucao tecnica",
      description:
        "A base tecnica e organizada para evoluir com governanca, permitindo acompanhar acoes e liberar atualizacoes sem comprometer a operacao em andamento.",
      checklist: [
        "Estrutura preparada para acompanhamento de acoes ao longo do tempo",
        "Deploy por modulo, sem indisponibilidade cruzada",
        "Arquitetura pronta para novas frentes de negocio",
      ],
    },
  ],
  tiers: {
    id: "niveis",
    headline: "Niveis de adocao do ecossistema",
    subheadline: "Comece por um modulo ou contrate o ecossistema completo. Sem valores fixos publicados — cada contrato reflete o escopo combinado.",
    items: [
      {
        title: "Modulo unico",
        subtitle: "Para quem precisa de uma frente especifica do ecossistema.",
        icon: "ri-book-mark-line",
        highlighted: false,
        checklist: [
          "Acesso ao modulo contratado (PDV, Juridico ou outro disponivel)",
          "Entrada unificada via acesso centralizado",
          "Organizacao por contexto desde o primeiro modulo",
          "Base preparada para adicionar novos modulos depois",
          "Continuidade operacional garantida pela arquitetura do ecossistema",
          "Suporte ao fluxo de acesso autenticado",
        ],
        cta: { label: "Entrar", href: routes.login },
      },
      {
        title: "Ecossistema",
        subtitle: "Para operacoes que combinam mais de um modulo de negocio.",
        icon: "ri-medal-line",
        highlighted: true,
        checklist: [
          "Multiplos modulos contratados sob o mesmo acesso",
          "Acesso por contexto para cada modulo habilitado",
          "Deploy independente entre modulos contratados",
          "Experiencia unica entre PDV, Juridico e demais frentes",
          "Rastreabilidade organizada entre os modulos ativos",
          "Estrutura pronta para crescer com novas frentes",
        ],
        cta: { label: "Entrar", href: routes.login },
      },
      {
        title: "Enterprise",
        subtitle: "Para clientes contratados com operacao em maior escala.",
        icon: "ri-stack-line",
        highlighted: false,
        checklist: [
          "Arquitetura preparada para volume de operacao maior",
          "Organizacao por contexto em multiplas frentes de negocio",
          "Base operacional integrada entre todos os modulos contratados",
          "Evolucao tecnica continua sem interromper a operacao",
          "Governanca de acesso alinhada ao contrato",
          "Acompanhamento estruturado para novas necessidades do ecossistema",
        ],
        cta: { label: "Falar sobre este nivel", href: routes.login },
      },
    ],
  },
  faq: {
    id: "faq",
    headline: "Perguntas frequentes",
    items: [
      {
        question: "O que e o JBoot?",
        answer:
          "E um ecossistema de aplicacoes de gestao organizado em modulos, como PDV e Juridico, acessados a partir de uma entrada unica e centralizada.",
      },
      {
        question: "Como funciona o acesso centralizado?",
        answer:
          "O acesso e feito por um unico ponto de entrada. A partir dele, cada cliente contratado enxerga somente os modulos habilitados para o seu contrato.",
      },
      {
        question: "Posso usar apenas um modulo?",
        answer:
          "Sim. O ecossistema e contratado por modulo, entao e possivel comecar com uma frente especifica e operar somente o que for necessario.",
      },
      {
        question: "Como contratar mais modulos?",
        answer:
          "Novos modulos sao habilitados dentro do mesmo contrato e passam a aparecer automaticamente no acesso centralizado, sem mudar a forma como a operacao acontece.",
      },
    ],
  },
  useCases: {
    id: "casos-de-uso",
    headline: "Casos de uso",
    items: [
      {
        title: "Operacao comercial no PDV",
        description: "Frente de caixa e gestao do ponto de venda organizadas dentro do mesmo ecossistema, com acesso controlado por contexto.",
      },
      {
        title: "Rotinas juridicas acompanhadas",
        description: "Acompanhamento operacional e automacoes controladas para o dia a dia do modulo Juridico.",
      },
      {
        title: "Multiplos modulos, um unico acesso",
        description: "Times que operam PDV e Juridico simultaneamente, sem alternar entre paineis isolados.",
      },
      {
        title: "Expansao de modulos contratados",
        description: "Clientes que comecam com um modulo e adicionam novas frentes conforme a operacao cresce.",
      },
      {
        title: "Controle de quem acessa o que",
        description: "Organizacoes que precisam separar claramente o que cada perfil de usuario pode acessar dentro do ecossistema.",
      },
      {
        title: "Continuidade durante atualizacoes",
        description: "Operacoes que precisam manter um modulo no ar enquanto outro recebe atualizacoes, sem indisponibilidade cruzada.",
      },
    ],
  },
  ecosystemOrg: {
    id: "ecossistema",
    headline: "Como o ecossistema e organizado",
    items: [
      {
        title: "Identity",
        icon: "ri-fingerprint-line",
        description: "Entrada unificada para usuarios, clientes e aplicacoes contratadas, definindo o contexto de cada acesso.",
      },
      {
        title: "PDV",
        icon: "ri-store-2-line",
        description: "Operacao comercial, frente de caixa e gestao do ponto de venda dentro do ecossistema JBoot.",
      },
      {
        title: "Juridico",
        icon: "ri-scales-3-line",
        description: "Modulo voltado a rotinas juridicas, acompanhamento operacional e automacoes controladas.",
      },
    ],
  },
  finalCta: {
    headline: "Acesse o ambiente JBoot",
    description: "Clientes e operadores podem entrar pelo fluxo autenticado e selecionar as aplicacoes disponiveis para seu contexto.",
    cta: { label: "Entrar", href: routes.login },
  },
  footer: {
    columns: [
      {
        title: "Solucoes",
        links: [{ label: "Solucoes", href: "#solucoes" }],
      },
      {
        title: "Ecossistema",
        links: [
          { label: "Niveis de adocao", href: "#niveis" },
          { label: "FAQ", href: "#faq" },
        ],
      },
      {
        title: "Acesso",
        links: [{ label: "Entrar", href: routes.login }],
      },
    ],
  },
};
