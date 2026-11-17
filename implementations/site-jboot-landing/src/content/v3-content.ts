import { routes } from "@/lib/routes";

export const v3Content = {
  brand: "JBoot",
  nav: [
    { label: "Como funciona", href: "#como-funciona" },
    { label: "Areas atendidas", href: "#areas" },
    { label: "Clientes", href: "#clientes" },
    { label: "Capacidades", href: "#capacidades" },
    { label: "Frentes", href: "#frentes" },
  ],
  hero: {
    headline: "Um ecossistema de aplicacoes para operar sua gestao com controle e clareza.",
    subheadline:
      "Centralize o acesso e organize modulos de negocio como PDV e Juridico em uma experiencia unica, preparada para evoluir com a operacao.",
    quickNavLabel: "Navegue pelo ecossistema",
    quickNav: [
      { label: "Identity", href: "#capacidades" },
      { label: "PDV", href: "#areas" },
      { label: "Juridico", href: "#areas" },
      { label: "Solucoes", href: "#como-funciona" },
    ],
    trendingLabel: "Topicos em alta:",
    trending: ["Multi-tenant", "Controle de acesso", "Modulos por contexto", "Deploy independente"],
    primaryCta: { label: "Entrar", href: routes.login },
  },
  process: {
    id: "como-funciona",
    headline: "Como funciona",
    description: "Do primeiro modulo contratado a operacao em escala, o caminho e o mesmo para todo cliente do ecossistema.",
    steps: [
      {
        title: "Contratar modulo",
        description: "Escolha os modulos de negocio que a operacao precisa, como PDV ou Juridico.",
      },
      {
        title: "Provisionar acesso",
        description: "O acesso centralizado libera os modulos habilitados para cada cliente contratado.",
      },
      {
        title: "Operar no ecossistema",
        description: "Usuarios entram por um unico ponto e operam apenas o que esta dentro do seu contexto.",
      },
      {
        title: "Expandir modulos",
        description: "Novas frentes de negocio podem ser adicionadas ao mesmo contrato conforme a operacao evolui.",
      },
    ],
  },
  areas: {
    id: "areas",
    eyebrow: "Areas atendidas",
    headline: "Frentes de negocio que o ecossistema atende",
    description: "Cada area opera dentro do seu proprio contexto, sob o mesmo acesso centralizado.",
    icons: [
      "ri-store-2-line",
      "ri-scales-3-line",
      "ri-briefcase-4-line",
      "ri-building-4-line",
      "ri-shield-keyhole-line",
      "ri-add-circle-line",
      "ri-refresh-line",
      "ri-government-line",
    ],
    items: [
      { title: "Comercio/PDV", description: "Frente de caixa e gestao do ponto de venda organizadas dentro do ecossistema." },
      { title: "Juridico", description: "Rotinas juridicas e acompanhamento operacional com automacoes controladas." },
      { title: "Operacoes administrativas", description: "Organizacao de acesso e contexto para rotinas administrativas do dia a dia." },
      { title: "Multi-unidades", description: "Estrutura preparada para operacoes com mais de uma unidade ou frente simultanea." },
      { title: "Gestao de acesso", description: "Controle de quem entra em qual modulo, dentro de cada contrato." },
      { title: "Expansao de modulos", description: "Operacoes que comecam pequenas e adicionam novas frentes ao longo do tempo." },
      { title: "Continuidade operacional", description: "Times que precisam manter a operacao no ar durante atualizacoes tecnicas." },
      { title: "Governanca de contratos", description: "Organizacoes que precisam alinhar modulos habilitados ao que foi contratado." },
    ],
  },
  ecosystemStat: {
    id: "ecossistema",
    headline: "Um ecossistema pensado para multiplos clientes contratados",
    description:
      "O JBoot foi construido para que cada cliente contratado opere dentro do seu proprio contexto, com os modulos habilitados para o seu contrato, sem expor a complexidade tecnica do ecossistema nem misturar dados ou acessos entre operacoes diferentes.",
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
  capabilities: {
    id: "capacidades",
    eyebrow: "Capacidades",
    headline: "O que sustenta a operacao modular",
    items: [
      {
        title: "Controle de acesso por modulo",
        description: "Cada modulo habilitado segue regras de acesso proprias dentro do mesmo contrato.",
        tags: ["Acesso", "Modulos", "Contexto"],
      },
      {
        title: "Auditoria de acoes",
        description: "Estrutura organizada para acompanhar o que acontece dentro de cada modulo ao longo do tempo.",
        tags: ["Rastreabilidade", "Governanca"],
      },
      {
        title: "Provisionamento por contrato",
        description: "Modulos sao liberados de acordo com o que foi contratado, sem configuracao manual avulsa.",
        tags: ["Contrato", "Provisionamento"],
      },
      {
        title: "Acesso centralizado",
        description: "Um unico ponto de entrada para todas as aplicacoes contratadas pelo cliente.",
        tags: ["Identity", "Login unico"],
      },
      {
        title: "Deploy independente por modulo",
        description: "Atualizacoes em um modulo nao afetam a disponibilidade dos demais.",
        tags: ["Deploy", "Continuidade"],
      },
      {
        title: "Organizacao por contexto",
        description: "Identidade, modulos e operacao tratados como camadas separadas e coerentes.",
        tags: ["Contexto", "Estrutura"],
      },
      {
        title: "Base operacional integrada",
        description: "Modulos diferentes compartilham a mesma fundacao tecnica do ecossistema.",
        tags: ["Integracao", "Base unica"],
      },
      {
        title: "Escalabilidade modular",
        description: "Arquitetura preparada para receber novos modulos sem retrabalho de plataforma.",
        tags: ["Escalabilidade", "Crescimento"],
      },
    ],
  },
  squads: {
    id: "frentes",
    headline: "Frentes de atuacao",
    items: [
      { title: "Time de implantacao", icon: "ri-flag-line", description: "Responsavel por organizar a entrada dos modulos contratados na operacao do cliente." },
      { title: "Operacao", icon: "ri-settings-3-line", description: "Acompanha o uso diario dos modulos habilitados dentro do ecossistema." },
      { title: "Suporte", icon: "ri-customer-service-2-line", description: "Apoia clientes contratados no uso dos modulos e no fluxo de acesso centralizado." },
      { title: "Juridico", icon: "ri-scales-3-line", description: "Cuida das rotinas e automacoes controladas dentro do modulo Juridico." },
      { title: "Engenharia de plataforma", icon: "ri-code-s-slash-line", description: "Mantem a base tecnica do ecossistema preparada para evoluir com novos modulos." },
    ],
  },
  resources: {
    id: "recursos",
    headline: "Recursos institucionais",
    items: [
      { title: "Conheca as solucoes", description: "Veja como os modulos do ecossistema se organizam para atender diferentes frentes de negocio.", href: "#areas" },
      { title: "Como funciona o acesso", description: "Entenda como o acesso centralizado organiza identidade, modulos e contexto operacional.", href: "#como-funciona" },
      { title: "Capacidades do ecossistema", description: "Veja em detalhe as capacidades que sustentam a operacao modular do JBoot.", href: "#capacidades" },
    ],
  },
  finalCta: {
    headline: "Acesse o ambiente JBoot",
    description: "Clientes e operadores podem entrar pelo fluxo autenticado e selecionar as aplicacoes disponiveis para seu contexto.",
    cta: { label: "Entrar", href: routes.login },
  },
  footer: {
    columns: [
      { title: "Solucoes", links: [{ label: "Areas atendidas", href: "#areas" }] },
      { title: "Ecossistema", links: [{ label: "Como funciona", href: "#como-funciona" }, { label: "Capacidades", href: "#capacidades" }] },
      { title: "Acesso", links: [{ label: "Entrar", href: routes.login }] },
    ],
  },
};
