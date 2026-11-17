// Generated on 2026-11-15 from JBoot main at 3f844483d with tools/ai/architecture-graph.py.
export const architectureGraphSnapshot = {
  date: "2026-11-15",
  nodes: 835,
  relationships: 1216,
  endpoints: 470,
  copy: {
    pt: {
      title: "Cobertura do grafo de arquitetura",
      description: "O grafo é gerado a partir de contratos, registros de arquitetura e do catálogo de APIs. Seus nós incluem serviços, módulos, agentes e registros de governança.",
      nodes: "Nós no grafo",
      relationships: "Relações mapeadas",
      endpoints: "Endpoints de API catalogados",
    },
    en: {
      title: "Architecture graph coverage",
      description: "The graph is generated from contracts, architecture records and the API catalog. Its nodes include services, modules, agents and governance records.",
      nodes: "Graph nodes",
      relationships: "Mapped relationships",
      endpoints: "Cataloged API endpoints",
    },
    es: {
      title: "Cobertura del grafo de arquitectura",
      description: "El grafo se genera a partir de contratos, registros de arquitectura y del catálogo de API. Sus nodos incluyen servicios, módulos, agentes y registros de gobernanza.",
      nodes: "Nodos del grafo",
      relationships: "Relaciones mapeadas",
      endpoints: "Endpoints de API catalogados",
    },
  },
};

export const cases = {
  pt: [
    {
      id: "cconet",
      name: "CCOnet · Modernização de legado",
      type: "Desempenho e liderança técnica",
      summary: "Uma tela operacional em produção passou de mais de 60 s para cerca de 1,2 s, exibindo mais de 500 registros em vez de aproximadamente 40.",
      stack: ["PHP","Laravel","Phalcon","SQL","MongoDB","RabbitMQ"],
      sections: [
        {
          title: "Modernização por etapas",
          body: "Liderei a evolução de uma aplicação PHP 7.4/Phalcon em direção a PHP 8.3/Laravel 13. Usei CQRS seletivamente para criar modelos de leitura e mantive o SQL como fonte oficial dos dados.",
        },
        {
          title: "Continuidade da operação",
          body: "Projetei a sincronização do SQL para MongoDB via RabbitMQ. A leitura podia voltar ao SQL. Falhas de sincronização tinham até cinco tentativas, registro persistente e alerta por e-mail após o esgotamento das tentativas.",
        },
        {
          title: "Orientação técnica",
          body: "Orientei tecnicamente 20 desenvolvedores com padrões MVCS, ferramentas reutilizáveis para CRUD, revisão de código e mentoria. Também criei um agente de revisão acionado manualmente que sinalizava problemas para a equipe.",
        },
      ],
    },
    {
      id: "jboot",
      name: "JBoot · Arquitetura de plataforma",
      type: "Plataforma multi-tenant",
      summary: "Projetei uma plataforma modular com identidade compartilhada. O módulo Flow, de automação jurídica, entrou em produção para um cliente externo.",
      stack: ["NestJS","TypeScript","Next.js","PostgreSQL","CI/CD"],
      sections: [
        {
          title: "Identidade e módulos",
          body: "Separei serviços de identidade de funcionalidades de negócio e usei contratos de API e verificações de dependências para manter os limites entre componentes.",
        },
        {
          title: "Controles de engenharia",
          body: "Implementei 13 controles bloqueantes de conformidade em CI, incluindo avaliações comportamentais e verificações arquiteturais. Um cenário negativo de avaliação verifica o contexto gerado para agentes: se o contrato muda e o contexto fica desatualizado, a verificação falha até que ele seja regenerado.",
        },
        {
          title: "Produtos em operação",
          body: "Como fundador da JBoot Studio, entreguei um ERP usado em produção por 28 clientes e uma plataforma esportiva independente para a FPFA. A base de clientes do ERP se refere a esse produto.",
        },
      ],
    },
    {
      id: "bureau-veritas",
      name: "Bureau Veritas · Operações agrícolas",
      type: "Backend em produção",
      summary: "Implementei módulos de estimativa de safra, transporte e operações de silos em uma plataforma agrícola em produção.",
      stack: ["PHP 8.3","Laravel 11","GeoPHP","KML","APIs REST"],
      sections: [
        {
          title: "Regras de domínio e integrações",
          body: "Implementei mapeamento e cálculo de áreas com GeoPHP/KML, considerando parâmetros governamentais em regras agrícolas. Também desenvolvi integrações de autenticação documental com terceiros.",
        },
        {
          title: "Liderança funcional",
          body: "Orientei uma equipe de 3 a 5 pessoas em Laravel e colaborei com o Product Owner e demais envolvidos para identificar lacunas de requisitos antes da entrega.",
        },
      ],
    },
    {
      id: "fpfa",
      name: "FPFA · Gestor Esportivo",
      type: "Produto independente",
      summary: "Entreguei uma plataforma de gestão de campeonatos para a Federação Paranaense de Futebol Americano.",
      stack: [],
      sections: [
        {
          title: "Papel e escopo",
          body: "Entreguei a plataforma no contexto da JBoot Studio. É um produto dedicado à operação de campeonatos da FPFA, com escopo próprio.",
        },
      ],
    },
    {
      id: "munisaude",
      name: "MuniSaude · Assistência médica",
      type: "Projeto de backend para saúde pública",
      summary: "Backend para gestão municipal de saúde, com separação por organização, sincronização assíncrona e validação automatizada.",
      stack: ["Laravel","PostgreSQL","Redis","MongoDB","Sanctum","PHPUnit"],
      sections: [
        {
          title: "Escopo técnico",
          body: "O projeto reúne uma API Laravel, persistência relacional, componentes de sincronização e uma suíte de validação. Seu escopo é a gestão de saúde municipal.",
        },
      ],
    },
  ],
  en: [
    {
      id: "cconet",
      name: "CCOnet · Legacy Modernization",
      type: "Performance and technical leadership",
      summary: "A production screen went from over 60 s to about 1.2 s while displaying 500+ records, up from roughly 40.",
      stack: ["PHP","Laravel","Phalcon","SQL","MongoDB","RabbitMQ"],
      sections: [
        {
          title: "Phased modernization",
          body: "I led the evolution of a PHP 7.4/Phalcon application toward PHP 8.3/Laravel 13. I introduced CQRS-style read models for selected features and retained SQL as the system of record.",
        },
        {
          title: "Operational resilience",
          body: "I designed RabbitMQ-based synchronization from SQL to MongoDB. Reads could fall back to SQL. Synchronization failures had up to five attempts, persistent logging and an email alert when attempts were exhausted.",
        },
        {
          title: "Technical guidance",
          body: "I provided technical direction for 20 developers through MVCS standards, reusable CRUD tooling, code review and mentoring. I also built a manually triggered code-review agent that flagged issues for the team.",
        },
      ],
    },
    {
      id: "jboot",
      name: "JBoot · Platform Architecture",
      type: "Multi-tenant platform",
      summary: "I designed a modular platform with shared identity. Its Flow legal automation module went into production for one external customer.",
      stack: ["NestJS","TypeScript","Next.js","PostgreSQL","CI/CD"],
      sections: [
        {
          title: "Identity and module boundaries",
          body: "I separated identity services from business capabilities and used API contracts and dependency checks to preserve component boundaries.",
        },
        {
          title: "Engineering controls",
          body: "I implemented 13 blocking CI conformance controls, including behavioral evaluations and architecture checks. One negative evaluation checks the agent context generated from a project contract: if the contract changes and the context becomes stale, the check fails until it is regenerated.",
        },
        {
          title: "Products in production",
          body: "As founder of JBoot Studio, I delivered an ERP used in production by 28 customers and a standalone sports platform for FPFA. The ERP customer count refers to that product.",
        },
      ],
    },
    {
      id: "bureau-veritas",
      name: "Bureau Veritas · Agricultural Operations",
      type: "Production backend",
      summary: "I implemented crop-yield estimation, transportation and storage-silo modules for a live agricultural operations platform.",
      stack: ["PHP 8.3","Laravel 11","GeoPHP","KML","REST APIs"],
      sections: [
        {
          title: "Domain rules and integrations",
          body: "I implemented geographic mapping and area calculations with GeoPHP/KML, using government parameters in agricultural rules. I also integrated third-party document authentication.",
        },
        {
          title: "Technical guidance",
          body: "I provided Laravel guidance to a team of three to five and worked with the Product Owner and stakeholders to identify requirements gaps before delivery.",
        },
      ],
    },
    {
      id: "fpfa",
      name: "FPFA · Sports Management",
      type: "Standalone product",
      summary: "I delivered a league management platform for the American Football Federation of Paraná, Brazil.",
      stack: [],
      sections: [
        {
          title: "Role and scope",
          body: "I delivered the platform through JBoot Studio. Its scope is the operation of FPFA competitions.",
        },
      ],
    },
    {
      id: "munisaude",
      name: "MuniSaude · Health Services",
      type: "Public health backend project",
      summary: "A backend for municipal health administration with tenant separation, asynchronous synchronization and automated validation.",
      stack: ["Laravel","PostgreSQL","Redis","MongoDB","Sanctum","PHPUnit"],
      sections: [
        {
          title: "Technical scope",
          body: "The project brings together a Laravel API, relational storage, synchronization components and a validation suite for municipal health administration.",
        },
      ],
    },
  ],
  es: [
    {
      id: "cconet",
      name: "CCOnet · Modernización de sistemas heredados",
      type: "Rendimiento y liderazgo técnico",
      summary: "Una pantalla en producción pasó de más de 60 s a cerca de 1,2 s y mostró más de 500 registros frente a unos 40.",
      stack: ["PHP","Laravel","Phalcon","SQL","MongoDB","RabbitMQ"],
      sections: [
        {
          title: "Modernización por etapas",
          body: "Lideré la evolución de una aplicación PHP 7.4/Phalcon hacia PHP 8.3/Laravel 13. Incorporé modelos de lectura con CQRS en funciones seleccionadas y mantuve SQL como fuente oficial de los datos.",
        },
        {
          title: "Continuidad operativa",
          body: "Diseñé la sincronización de SQL a MongoDB con RabbitMQ. Las lecturas podían volver a SQL. Los fallos de sincronización tenían hasta cinco intentos, registro persistente y aviso por correo al agotarse los intentos.",
        },
        {
          title: "Orientación técnica",
          body: "Orienté técnicamente a 20 desarrolladores con estándares MVCS, herramientas CRUD reutilizables, revisión de código y mentoría. También creé un agente de revisión manual que señalaba problemas al equipo.",
        },
      ],
    },
    {
      id: "jboot",
      name: "JBoot · Arquitectura de plataforma",
      type: "Plataforma multiinquilino",
      summary: "Diseñé una plataforma modular con identidad compartida. Su módulo Flow de automatización jurídica entró en producción para un cliente externo.",
      stack: ["NestJS","TypeScript","Next.js","PostgreSQL","CI/CD"],
      sections: [
        {
          title: "Identidad y módulos",
          body: "Separé los servicios de identidad de las funciones de negocio y utilicé contratos de API y controles de dependencias para preservar los límites entre componentes.",
        },
        {
          title: "Controles de ingeniería",
          body: "Implementé 13 controles de conformidad bloqueantes en CI, incluidas evaluaciones de comportamiento y verificaciones de arquitectura. Una evaluación negativa comprueba el rechazo si el contrato cambia y el contexto generado para los agentes queda desactualizado.",
        },
        {
          title: "Productos en operación",
          body: "Como fundador de JBoot Studio, entregué un ERP utilizado en producción por 28 clientes y una plataforma deportiva independiente para FPFA. La cifra de clientes del ERP corresponde a ese producto.",
        },
      ],
    },
    {
      id: "bureau-veritas",
      name: "Bureau Veritas · Operaciones agrícolas",
      type: "Backend en producción",
      summary: "Implementé módulos de estimación de cosechas, transporte y operaciones de silos en una plataforma agrícola en producción.",
      stack: ["PHP 8.3","Laravel 11","GeoPHP","KML","APIs REST"],
      sections: [
        {
          title: "Reglas e integraciones",
          body: "Implementé mapas y cálculos de superficie con GeoPHP/KML y parámetros gubernamentales para reglas agrícolas. También integré servicios de autenticación documental de terceros.",
        },
        {
          title: "Orientación técnica",
          body: "Orienté a un equipo de tres a cinco personas en Laravel y colaboré con el Product Owner y otras partes interesadas para detectar carencias en los requisitos antes de la entrega.",
        },
      ],
    },
    {
      id: "fpfa",
      name: "FPFA · Gestión deportiva",
      type: "Producto independiente",
      summary: "Entregué una plataforma de gestión de campeonatos para la Federación de Fútbol Americano de Paraná, Brasil.",
      stack: [],
      sections: [
        {
          title: "Función y alcance",
          body: "Entregué la plataforma a través de JBoot Studio. Su alcance es la operación de los campeonatos de FPFA.",
        },
      ],
    },
    {
      id: "munisaude",
      name: "MuniSaude · Asistencia médica",
      type: "Proyecto de backend para salud pública",
      summary: "Backend para la gestión municipal de salud, con separación por organización, sincronización asíncrona y validación automatizada.",
      stack: ["Laravel","PostgreSQL","Redis","MongoDB","Sanctum","PHPUnit"],
      sections: [
        {
          title: "Alcance técnico",
          body: "El proyecto reúne una API Laravel, almacenamiento relacional, componentes de sincronización y un conjunto de validaciones para la gestión municipal de salud.",
        },
      ],
    },
  ],
};
