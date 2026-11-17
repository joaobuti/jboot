import { routes } from "@/lib/routes";

export const aiFirstHomeContent = {
  brand: "JBoot",
  navigation: [
    { label: "Soluções", href: "#solucoes" },
    { label: "Arquitetura", href: "#arquitetura" },
    { label: "Processo", href: "#processo" },
    { label: "Pipeline", href: "#pipeline" },
  ],
  login: { label: "Entrar", href: routes.login },
  hero: {
    eyebrow: "Engenharia AI-first · aplicações verticais · revisão humana",
    title: "Aplicações de negócio com uma base técnica preparada para evoluir.",
    description:
      "A JBoot organiza produtos como PDV e Jurídico em um ecossistema com identidade centralizada, módulos independentes e engenharia assistida por agentes especializados.",
    primaryCta: { label: "Conhecer as soluções", href: "#solucoes" },
    secondaryCta: { label: "Ver o pipeline", href: "#pipeline" },
    signals: [
      ["Static export", "site público"],
      ["Human review", "gate obrigatório"],
      ["Deploy isolado", "por aplicação"],
    ],
  },
  solutions: [
    {
      id: "01",
      name: "PDV",
      segment: "Operação comercial",
      claim: "Frente de caixa e gestão do ponto de venda no contexto do cliente.",
      detail:
        "Aplicação modular com acesso por roles e scopes próprios, preparada para operação comercial e evolução independente.",
      signal: "Módulo selecionável no Identity",
    },
    {
      id: "02",
      name: "Jurídico",
      segment: "Operação jurídica",
      claim: "Rotinas jurídicas organizadas com automações controladas.",
      detail:
        "Módulo orientado a contexto, rastreabilidade e separação clara entre experiência web, BFF e processamento especializado.",
      signal: "Contexto e permissões próprios",
    },
    {
      id: "03",
      name: "Identity",
      segment: "Plano de controle",
      claim: "Uma entrada centralizada para clientes, usuários e aplicações.",
      detail:
        "O Identity administra contratos, entitlements e o contexto selecionado sem transformar o shell técnico em produto comercial.",
      signal: "Acesso centralizado",
    },
  ],
  architecture: {
    eyebrow: "Arquitetura",
    title: "Cada aplicação mantém sua fronteira. A governança conecta o ecossistema.",
    layers: [
      {
        id: "01",
        title: "Contexto e acesso",
        body: "Identity centraliza clientes, aplicações contratadas, roles e scopes por módulo.",
      },
      {
        id: "02",
        title: "Aplicações modulares",
        body: "PDV e Jurídico operam com contratos e ciclos de deploy independentes.",
      },
      {
        id: "03",
        title: "Engenharia governada",
        body: "Agents, skills, testes e gates registram decisões e mantêm revisão humana nas mudanças materiais.",
      },
    ],
  },
  process: {
    title: "Da necessidade operacional a uma entrega verificável.",
    steps: [
      ["Descoberta", "Escopo, critérios de aceite e perguntas abertas são explicitados antes do código."],
      ["Arquitetura", "Stack, fronteiras e riscos são avaliados contra o contrato real da entrega."],
      ["Implementação", "Agentes especializados executam no menor escopo correto, com testes equivalentes."],
      ["Validação", "Build, qualidade, segurança e operação produzem evidência para revisão humana."],
    ],
  },
  finalCta: {
    title: "Acesse o ecossistema JBoot.",
    description:
      "Entre no ambiente autenticado para visualizar as aplicações disponíveis para o seu contexto.",
    action: { label: "Entrar", href: routes.login },
  },
} as const;
