import { routes } from "@/lib/routes";

export const landingContent = {
  brand: "JBoot",
  headline: "Um ecossistema de aplicacoes para operar sua gestao com controle e clareza.",
  subheadline:
    "Centralize o acesso e organize modulos de negocio como PDV e Juridico em uma experiencia unica, preparada para evoluir com a operacao.",
  primaryCta: {
    label: "Entrar",
    href: routes.login,
  },
  secondaryCta: {
    label: "Conhecer solucoes",
    href: routes.solutions,
  },
  proofPoints: ["Acesso centralizado", "Modulos por contexto", "Base operacional integrada"],
  ecosystem: [
    {
      title: "PDV",
      icon: "PD",
      description:
        "Operacao comercial, frente de caixa e gestao do ponto de venda dentro do ecossistema JBoot.",
      cta: { label: "Experimentar", href: `${routes.login}?demo=1` },
    },
    {
      title: "Juridico",
      icon: "JR",
      description:
        "Modulo voltado a rotinas juridicas, acompanhamento operacional e automacoes controladas.",
      cta: { label: "Experimentar", href: `${routes.login}?demo=1` },
    },
    {
      title: "Acesso centralizado",
      icon: "AC",
      description:
        "Entrada unificada para usuarios, clientes, aplicacoes contratadas e contexto de operacao.",
    },
  ],
  trust: {
    eyebrow: "Ecossistema contratado",
    title: "Pensado para como clientes contratados realmente operam.",
    description:
      "Cada modulo contratado entra na mesma base, sem retrabalho de plataforma e sem expor a complexidade tecnica para quem usa no dia a dia.",
    highlights: [
      {
        title: "Multiplos modulos",
        description:
          "PDV, Juridico e novos modulos convivem sob o mesmo ecossistema, sem virar paineis isolados.",
      },
      {
        title: "Acesso por contexto",
        description:
          "Cada cliente contratado enxerga apenas os modulos habilitados para o seu contrato.",
      },
      {
        title: "Deploy independente",
        description:
          "Atualizacoes por modulo acontecem sem indisponibilidade cruzada entre solucoes.",
      },
      {
        title: "Pronto para crescer",
        description:
          "Arquitetura preparada para novos clientes contratados e novas frentes de negocio.",
      },
    ],
  },
  clients: {
    eyebrow: "Clientes atendidos",
    title: "Quem opera o ecossistema JBoot.",
    description: "Exemplos ilustrativos de operacoes que utilizam o ecossistema JBoot.",
    items: [
      { name: "Mendedes Assessoria Jurídica", segment: "Jurídico" },
      { name: "Ruiz e Buti Advogados", segment: "Jurídico" },
      { name: "Federação Paranaense de Futebol Americano", segment: "Esportes" },
      { name: "Recanto Binho", segment: "Lazer" },
      { name: "Super Diesel Mecânica", segment: "Comércio" },
      { name: "Sinai Medic", segment: "Comércio" },
      { name: "Anubis Games", segment: "Comércio" },
      { name: "Aviário Iguaçu", segment: "Pet Shop" },
    ],
  },
  values: [
    {
      title: "Controle",
      description:
        "Aplicacoes acessadas por contexto, com separacao clara entre identidade, modulos e operacao.",
    },
    {
      title: "Modularidade",
      description:
        "Novas frentes podem ser adicionadas sem transformar a experiencia em um painel generico.",
    },
    {
      title: "Manutencao",
      description:
        "Base tecnica organizada para evoluir com rastreabilidade, deploy independente e governanca.",
    },
  ],
  finalCta: {
    title: "Acesse o ambiente JBoot",
    description:
      "Clientes e operadores podem entrar pelo fluxo autenticado e selecionar as aplicacoes disponiveis para seu contexto.",
    label: "Entrar",
    href: routes.login,
  },
  footer: {
    description: "Ecossistema de aplicacoes para operacao e gestao, organizado por modulos.",
    columns: [
      {
        title: "Solucoes",
        links: [{ label: "Modulos do ecossistema", href: routes.solutions }],
      },
      {
        title: "Ecossistema",
        links: [
          { label: "Como clientes operam", href: "#confianca" },
          { label: "Clientes atendidos", href: "#clientes" },
        ],
      },
      {
        title: "Acesso",
        links: [{ label: "Entrar", href: routes.login }],
      },
    ],
  },
};
