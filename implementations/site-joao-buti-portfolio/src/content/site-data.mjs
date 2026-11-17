import { cases } from "./cases.mjs";

export const shared = {
  name: "João Buti",
  email: "joaobuti@gmail.com",
  emailHref: "mailto:joaobuti@gmail.com",
  linkedin: "https://www.linkedin.com/in/butijoao/",
  whatsapp: "https://wa.me/5541997608825",
  heroImage: "/assets/signal-architecture-hero.webp",
  defaultUrl: "/pt/",
  locales: [
    { code: "pt", lang: "pt-BR", path: "/pt/", label: "PT", name: "Português" },
    { code: "en", lang: "en", path: "/en/", label: "EN", name: "English" },
    { code: "es", lang: "es", path: "/es/", label: "ES", name: "Español" },
  ],
};

const skillItems = [
  ["PHP", "Laravel", "Lumen", "NestJS", "TypeScript", "REST", "CQRS"],
  ["MySQL", "PostgreSQL", "SQL Server", "MongoDB", "RabbitMQ", "Redis", "Docker", "Linux"],
  ["CI/CD", "API contracts", "Multi-tenancy", "Automated tests", "Agent evaluations"],
  ["JavaScript", "React", "Vue.js", "Astro", "Next.js"],
];

export function casePath(locale, id) {
  return `/${locale}/cases/${id}/`;
}

export const pages = {
  pt: {
    lang: "pt-BR",
    path: "/pt/",
    seo: {
      title: "Engenheiro de Software Sênior e Tech Lead | João Buti",
      description: "João Buti, engenheiro de software sênior e Tech Lead. Cases de modernização em PHP/Laravel, arquitetura de plataformas e automação com IA.",
    },
    nav: ["Perfil","Engenharia de IA","Cases","Experiência","Stack","Contato"],
    labels: {
      navigation: "Seções",
      languages: "Selecionar idioma",
      highlights: "Destaques",
      viewCase: "Ver case",
      allCases: "Voltar aos cases",
    },
    hero: {
      title: "Engenheiro de Software Sênior e Tech Lead",
      summary: "Construo e modernizo sistemas de produção. Meu trabalho combina backend PHP/Laravel, liderança técnica e arquitetura de plataformas com controles automatizados para o uso de IA.",
      profile: "Curitiba, Brasil · Inglês B2",
      primaryCta: "Ver cases",
      secondaryCta: "Ver experiência",
    },
    signals: [
      { value: "60+ s → ~1,2 s", label: "Carregamento de uma tela em produção na CCOnet" },
      { value: "20", label: "Desenvolvedores orientados tecnicamente na CCOnet" },
      { value: "13", label: "Controles bloqueantes em CI na JBoot" },
    ],
    aiFirst: {
      title: "Governança de agentes na engenharia",
      body: "Na JBoot, contratos de projeto orientam a atuação de agentes e as verificações em integração contínua (CI).",
      points: [
        "Avaliações comportamentais verificam como os agentes seguem as regras do fluxo.",
        "Verificações de dependências comparam a implementação aos contratos de arquitetura e API.",
        "Registros de execução permitem rastrear as verificações realizadas.",
      ],
    },
    cases: {
      title: "Cases de engenharia",
      items: cases.pt,
    },
    experience: {
      title: "Experiência profissional",
      education: "Bacharelado em Sistemas de Informação · UNIPAR",
      items: [
        {
          company: "JBoot Studio",
          role: "Fundador e Arquiteto de Software",
          period: "jul/2021 – atual",
          detail: "Atividade independente em paralelo aos vínculos profissionais. Projetei uma plataforma modular e entreguei produtos de ERP, gestão esportiva e automação jurídica.",
          caseId: "jboot",
        },
        {
          company: "CCOnet Sistemas",
          role: "Engenheiro de Software Sênior",
          period: "out/2025 – abr/2026",
          detail: "Liderei a modernização por fases de um sistema PHP/Phalcon e orientei tecnicamente 20 desenvolvedores.",
          caseId: "cconet",
        },
        {
          company: "Bureau Veritas",
          role: "Desenvolvedor PHP/Laravel Sênior",
          period: "mai/2022 – jul/2025",
          detail: "Desenvolvi módulos para operações agrícolas e orientei tecnicamente uma equipe de 3 a 5 pessoas.",
          caseId: "bureau-veritas",
        },
        {
          company: "WebControl Empresas",
          role: "Desenvolvedor PHP → Gerente de TI",
          period: "2018 – jan/2022",
          detail: "Gerenciei de 6 a 10 pessoas em desenvolvimento, infraestrutura e suporte. Conduzi contratações e avaliações de desempenho e substituí solicitações em papel por um painel de trabalho da equipe.",
        },
        {
          company: "RCE Tecnologia",
          role: "Desenvolvedor Java Web / PHP",
          period: "nov/2012 – abr/2014",
          detail: "Desenvolvi aplicações web com Java, PHP, PrimeFaces, Hibernate e MongoDB.",
        },
      ],
    },
    stack: {
      title: "Competências técnicas",
      groups: ["Backend","Dados e infraestrutura","Plataforma e qualidade","Frontend"].map((name, index) => ({ name, items: skillItems[index] })),
    },
    contact: {
      title: "Vamos conversar sobre engenharia?",
      body: "Disponível para conversar sobre backend, liderança técnica, arquitetura e engenharia de plataformas.",
      email: "E-mail",
      linkedin: "LinkedIn",
      whatsapp: "WhatsApp",
    },
  },
  en: {
    lang: "en",
    path: "/en/",
    seo: {
      title: "Senior Software Engineer and Tech Lead | João Buti",
      description: "João Buti, Senior Software Engineer and Tech Lead. Case studies in PHP/Laravel modernization, platform architecture and AI-assisted engineering.",
    },
    nav: ["Profile","AI engineering","Case studies","Experience","Stack","Contact"],
    labels: {
      navigation: "Sections",
      languages: "Select language",
      highlights: "Highlights",
      viewCase: "View case study",
      allCases: "Back to case studies",
    },
    hero: {
      title: "Senior Software Engineer and Tech Lead",
      summary: "I build and modernize production systems. My work combines PHP/Laravel backend engineering, technical leadership and platform architecture with automated controls for AI-assisted development.",
      profile: "Curitiba, Brazil · English B2",
      primaryCta: "View case studies",
      secondaryCta: "View experience",
    },
    signals: [
      { value: "60+ s → ~1.2 s", label: "Load time for one production screen at CCOnet" },
      { value: "20", label: "Developers who received technical guidance at CCOnet" },
      { value: "13", label: "Blocking CI controls at JBoot" },
    ],
    aiFirst: {
      title: "Governance for AI-assisted engineering",
      body: "At JBoot, project contracts guide agent behavior and continuous integration (CI) checks.",
      points: [
        "Behavioral evaluations check how agents follow workflow rules.",
        "Dependency checks compare implementation against architecture and API contracts.",
        "Execution records make the checks traceable.",
      ],
    },
    cases: {
      title: "Engineering case studies",
      items: cases.en,
    },
    experience: {
      title: "Professional experience",
      education: "B.S. in Information Systems · UNIPAR",
      items: [
        {
          company: "JBoot Studio",
          role: "Founder and Software Architect",
          period: "Jul 2021 – Present",
          detail: "Independent work alongside employment. I designed a modular platform and delivered ERP, sports management and legal automation products.",
          caseId: "jboot",
        },
        {
          company: "CCOnet Sistemas",
          role: "Senior Software Engineer",
          period: "Oct 2025 – Apr 2026",
          detail: "I led the phased modernization of a PHP/Phalcon system and provided technical direction for 20 developers.",
          caseId: "cconet",
        },
        {
          company: "Bureau Veritas",
          role: "Senior PHP/Laravel Developer",
          period: "May 2022 – Jul 2025",
          detail: "I built agricultural operations modules and provided technical guidance to a team of three to five.",
          caseId: "bureau-veritas",
        },
        {
          company: "WebControl Empresas",
          role: "PHP Developer → IT Department Manager",
          period: "2018 – Jan 2022",
          detail: "I managed six to ten people across development, infrastructure and support. I handled hiring and performance reviews and replaced paper requests with a team dashboard.",
        },
        {
          company: "RCE Tecnologia",
          role: "Java Web / PHP Developer",
          period: "Nov 2012 – Apr 2014",
          detail: "I built web applications with Java, PHP, PrimeFaces, Hibernate and MongoDB.",
        },
      ],
    },
    stack: {
      title: "Technical skills",
      groups: ["Backend","Data and infrastructure","Platform and quality","Frontend"].map((name, index) => ({ name, items: skillItems[index] })),
    },
    contact: {
      title: "Let's talk about engineering",
      body: "Open to conversations about backend engineering, technical leadership, architecture and platform engineering.",
      email: "Email",
      linkedin: "LinkedIn",
      whatsapp: "WhatsApp",
    },
  },
  es: {
    lang: "es",
    path: "/es/",
    seo: {
      title: "Ingeniero de software sénior y líder técnico | João Buti",
      description: "João Buti, ingeniero de software sénior y líder técnico. Casos de modernización con PHP/Laravel, arquitectura de plataformas e ingeniería asistida por IA.",
    },
    nav: ["Perfil","Ingeniería de IA","Casos","Experiencia","Tecnologías","Contacto"],
    labels: {
      navigation: "Secciones",
      languages: "Seleccionar idioma",
      highlights: "Datos destacados",
      viewCase: "Ver caso",
      allCases: "Volver a los casos",
    },
    hero: {
      title: "Ingeniero de software sénior y líder técnico",
      summary: "Construyo y modernizo sistemas en producción. Combino ingeniería backend con PHP/Laravel, liderazgo técnico y arquitectura de plataformas con controles automatizados para el uso de IA.",
      profile: "Curitiba, Brasil · Inglés B2",
      primaryCta: "Ver casos",
      secondaryCta: "Ver experiencia",
    },
    signals: [
      { value: "60+ s → ~1,2 s", label: "Tiempo de carga de una pantalla en producción en CCOnet" },
      { value: "20", label: "Desarrolladores orientados técnicamente en CCOnet" },
      { value: "13", label: "Controles bloqueantes en CI en JBoot" },
    ],
    aiFirst: {
      title: "Gobernanza de agentes en ingeniería",
      body: "En JBoot, los contratos de proyecto guían el comportamiento de los agentes y las comprobaciones de integración continua (CI).",
      points: [
        "Las evaluaciones de comportamiento comprueban cómo los agentes siguen las reglas del flujo.",
        "Las comprobaciones de dependencias comparan la implementación con los contratos de arquitectura y API.",
        "Los registros de ejecución permiten rastrear las comprobaciones realizadas.",
      ],
    },
    cases: {
      title: "Casos de ingeniería",
      items: cases.es,
    },
    experience: {
      title: "Experiencia profesional",
      education: "Licenciatura en Sistemas de Información · UNIPAR",
      items: [
        {
          company: "JBoot Studio",
          role: "Fundador y arquitecto de software",
          period: "jul/2021 – actualidad",
          detail: "Actividad independiente en paralelo al trabajo por cuenta ajena. Diseñé una plataforma modular y entregué productos de ERP, gestión deportiva y automatización jurídica.",
          caseId: "jboot",
        },
        {
          company: "CCOnet Sistemas",
          role: "Ingeniero de software sénior",
          period: "oct/2025 – abr/2026",
          detail: "Lideré la modernización por etapas de un sistema PHP/Phalcon y orienté técnicamente a 20 desarrolladores.",
          caseId: "cconet",
        },
        {
          company: "Bureau Veritas",
          role: "Desarrollador PHP/Laravel sénior",
          period: "may/2022 – jul/2025",
          detail: "Desarrollé módulos para operaciones agrícolas y orienté técnicamente a un equipo de tres a cinco personas.",
          caseId: "bureau-veritas",
        },
        {
          company: "WebControl Empresas",
          role: "Desarrollador PHP → Gerente de TI",
          period: "2018 – ene/2022",
          detail: "Dirigí un equipo de seis a diez personas en desarrollo, infraestructura y soporte. Gestioné contrataciones y evaluaciones de desempeño y sustituí las solicitudes en papel por un panel de trabajo.",
        },
        {
          company: "RCE Tecnologia",
          role: "Desarrollador Java Web / PHP",
          period: "nov/2012 – abr/2014",
          detail: "Desarrollé aplicaciones web con Java, PHP, PrimeFaces, Hibernate y MongoDB.",
        },
      ],
    },
    stack: {
      title: "Competencias técnicas",
      groups: ["Backend","Datos e infraestructura","Plataforma y calidad","Frontend"].map((name, index) => ({ name, items: skillItems[index] })),
    },
    contact: {
      title: "Hablemos de ingeniería",
      body: "Disponible para conversar sobre backend, liderazgo técnico, arquitectura e ingeniería de plataformas.",
      email: "Correo",
      linkedin: "LinkedIn",
      whatsapp: "WhatsApp",
    },
  },
};

export const locales = Object.keys(pages);
