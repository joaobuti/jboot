import { routes } from "@/lib/routes";

export const v4Content = {
  brand: "JBoot",
  nav: [
    { label: "Por que", href: "#por-que" },
    { label: "Hub", href: "#hub" },
    { label: "Aplicacoes", href: "#aplicacoes" },
  ],
  hero: {
    eyebrow: "Hub de aplicacoes JBoot",
    headline: "Seu negocio nao precisa de mais telas. Precisa de um hub.",
    subheadline:
      "O JBoot coloca Identity, PDV, Juridico e novas aplicacoes contratadas em uma entrada unica, com contexto por cliente e permissao por modulo desde o primeiro acesso.",
    primaryCta: { label: "Entrar no JBoot", href: routes.login },
    secondaryCta: { label: "Ver o modelo", href: "#por-que" },
    proof: ["Login unico", "Applications por contrato", "Scopes por modulo", "Shell sem permissao generica"],
  },
  firstProof: {
    id: "por-que",
    eyebrow: "Primeira impressao certa",
    headline: "Em tres segundos, o visitante entende o que o JBoot resolve.",
    items: [
      {
        title: "Um ponto de entrada",
        text: "O usuario acessa o ambiente autenticado e encontra apenas as aplicacoes liberadas para o seu contexto.",
        icon: "ri-login-box-line",
      },
      {
        title: "Aplicacoes reais",
        text: "PDV, Juridico e novas frentes aparecem como produtos do ecossistema, nao como atalhos tecnicos.",
        icon: "ri-apps-2-line",
      },
      {
        title: "Controle operacional",
        text: "Roles, scopes, entitlements e contratos sustentam a experiencia sem expor complexidade desnecessaria.",
        icon: "ri-shield-check-line",
      },
    ],
  },
  hub: {
    id: "hub",
    eyebrow: "Modelo do hub",
    headline: "A marca publica mostra clareza. A operacao autenticada executa controle.",
    description:
      "A landing nao assume login, sessao, BFF ou coleta de dados. Ela aponta para o fluxo correto e comunica a arquitetura de produto: cada modulo com responsabilidade propria, dentro do mesmo ecossistema.",
    lanes: [
      "Landing publica",
      "Identity",
      "Seletor de applications",
      "Modulo contratado",
      "BFF do modulo",
    ],
  },
  applications: {
    id: "aplicacoes",
    eyebrow: "Aplicacoes centrais",
    headline: "O usuario escolhe produto, nao infraestrutura.",
    modules: [
      { name: "Identity", note: "Controle de acesso e contexto", icon: "ri-shield-keyhole-line" },
      { name: "PDV", note: "Operacao comercial e ponto de venda", icon: "ri-store-2-line" },
      { name: "Juridico", note: "Rotinas juridicas e automacoes controladas", icon: "ri-scales-3-line" },
      { name: "Novas aplicacoes", note: "Expansao por contrato e escopo", icon: "ri-add-box-line" },
    ],
  },
  finalCta: {
    headline: "O proximo passo obvio e entrar.",
    description:
      "Clientes e operadores seguem para o fluxo autenticado e acessam as aplicacoes habilitadas para seu contrato.",
    cta: { label: "Entrar no JBoot", href: routes.login },
  },
} as const;
