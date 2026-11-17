import { routes } from "@/lib/routes";

export const v5Content = {
  brand: "JBoot",
  nav: [
    { label: "Hub", href: "#hub" },
    { label: "Aplicacoes", href: "#aplicacoes" },
    { label: "Operacao", href: "#operacao" },
    { label: "Arquitetura", href: "#arquitetura" },
  ],
  hero: {
    eyebrow: "Hub de aplicacoes para operacoes reais",
    headline: "Um comando central para cada aplicacao que move o seu negocio.",
    subheadline:
      "O JBoot organiza identidade, contratos, modulos e rotinas operacionais em uma experiencia unica, sem transformar a plataforma em produto comercial nem misturar contextos de cliente.",
    primaryCta: { label: "Entrar", href: routes.login },
    secondaryCta: { label: "Ver o hub", href: "#hub" },
    signals: ["Acesso centralizado", "Modulos contratados", "Contexto por cliente", "Deploy independente"],
  },
  hub: {
    id: "hub",
    eyebrow: "Experiencia interativa",
    headline: "Selecione uma frente e veja como o hub organiza a operacao.",
    description:
      "A tela publica comunica o valor do ecossistema; a operacao autenticada continua em seus apps e BFFs proprios.",
    modules: [
      {
        name: "Identity",
        role: "Plano de controle",
        icon: "ri-shield-keyhole-line",
        status: "Organiza login, cliente, application_slug, roles e scopes.",
        focus: ["Login unico", "Entitlements", "Escopos administrativos"],
        accent: "control",
      },
      {
        name: "PDV",
        role: "Aplicacao de varejo",
        icon: "ri-store-2-line",
        status: "Entrega frente de caixa e gestao do ponto de venda dentro do contexto contratado.",
        focus: ["Produtos", "Vendas", "Usuarios do modulo"],
        accent: "commerce",
      },
      {
        name: "Juridico",
        role: "Aplicacao operacional",
        icon: "ri-scales-3-line",
        status: "Concentra rotinas juridicas e automacoes controladas sem vazar permissoes genericas.",
        focus: ["Processos", "Sessoes externas", "Auditoria"],
        accent: "legal",
      },
      {
        name: "Novos modulos",
        role: "Expansao governada",
        icon: "ri-node-tree",
        status: "Novas frentes entram como applications proprias quando ha contrato e valor operacional.",
        focus: ["Contrato", "Seed de acesso", "Runtime dedicado"],
        accent: "growth",
      },
    ],
  },
  applications: {
    id: "aplicacoes",
    eyebrow: "Aplicacoes, nao atalhos soltos",
    headline: "Cada produto aparece para o usuario certo, no cliente certo.",
    items: [
      {
        title: "Catalogo pos-login",
        text: "O seletor mostra PDV, Juridico e outras aplicacoes contratadas. O shell tecnico nao vira opcao de negocio.",
        icon: "ri-apps-2-line",
      },
      {
        title: "Permissao por escopo",
        text: "Cada modulo valida roles e scopes proprios, evitando liberacao ampla por permissoes genericas.",
        icon: "ri-lock-password-line",
      },
      {
        title: "Operacao multi-cliente",
        text: "Cliente, contrato e application_slug preservam o contexto de uso para uma operacao auditavel.",
        icon: "ri-building-4-line",
      },
      {
        title: "Base preparada para evolucao",
        text: "Novas aplicacoes podem nascer sem reescrever a identidade, o menu global ou o modelo de acesso.",
        icon: "ri-git-branch-line",
      },
    ],
  },
  operatingModel: {
    id: "operacao",
    eyebrow: "Modelo operacional",
    headline: "A experiencia premium vem da disciplina operacional.",
    steps: [
      {
        title: "Contratar",
        text: "O cliente recebe acesso apenas as aplicacoes vinculadas ao contrato ativo.",
      },
      {
        title: "Provisionar",
        text: "Entitlements, roles e scopes administrativos sao criados desde o seed de desenvolvimento.",
      },
      {
        title: "Operar",
        text: "Cada usuario acessa o modulo com contexto limpo e menus coerentes com seu produto.",
      },
      {
        title: "Auditar",
        text: "Eventos criticos, autorizacao e integracoes seguem contratos rastreaveis por modulo.",
      },
    ],
  },
  architecture: {
    id: "arquitetura",
    eyebrow: "Arquitetura orientada a produto",
    headline: "O hub vende clareza. A plataforma entrega controle.",
    description:
      "O JBoot separa marca publica, identidade, shell, BFFs, workers e servicos internos. Isso reduz acoplamento e permite evoluir cada frente com cadencia propria.",
    lanes: [
      "Landing publica indexavel",
      "Identity como controle de acesso",
      "Aplicacoes selecionaveis por contrato",
      "BFF proprio por modulo",
      "Servicos internos fora do seletor",
    ],
  },
  finalCta: {
    headline: "Entre no ambiente JBoot.",
    description:
      "Clientes e operadores acessam o hub autenticado para selecionar as aplicacoes disponiveis no seu contexto.",
    cta: { label: "Entrar", href: routes.login },
  },
} as const;
