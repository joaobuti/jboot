# Arquitetura do Hub de Implementacoes

## Decisao

Usar uma arquitetura contract-first, modular e orientada a adaptadores para o hub. Cada implementacao concreta deve aplicar arquitetura hexagonal internamente quando houver dominio relevante, mas o hub como um todo nao deve ser desenhado como uma unica aplicacao hexagonal.

Resumo:

```text
control-plane
  -> decision layer
  -> contracts
  -> project contracts
  -> local implementation agents
  -> adapters/tools
  -> observability/evals
```

## Por que nao apenas hexagonal

Arquitetura hexagonal e excelente para proteger dominio de frameworks, bancos e provedores externos. Ela deve ser usada dentro de cada servico ou implementacao quando existir dominio real.

Para um hub de varias stacks, o problema principal e outro:

- roteamento de tarefas para stacks diferentes;
- padronizacao de contratos entre implementacoes;
- selecao do projeto alvo antes de executar codigo;
- isolamento de runtimes;
- interoperabilidade entre agentes, ferramentas e sistemas;
- avaliacao comparavel entre stacks;
- observabilidade transversal;
- versionamento de decisoes e artefatos.

Hexagonal sozinha nao resolve esses pontos. Ela organiza bem o interior de uma implementacao, mas nao define o protocolo entre varias implementacoes heterogeneas.

## Arquitetura recomendada

### 1. Control plane

Camada que registra implementacoes, agentes, capacidades, decisoes, execucoes e resultados.

Responsabilidades:

- catalogo de stacks;
- catalogo de agentes;
- identity hub, clientes, aplicacoes e roteamento de contexto;
- registro de decisoes;
- execucao de workflows;
- controle de permissao;
- auditoria;
- telemetria.

### 2. Contract-first

Toda implementacao deve expor contratos claros.

Contratos recomendados:

- OpenAPI para HTTP APIs;
- AsyncAPI para eventos;
- protobuf/gRPC quando performance e contratos binarios forem relevantes;
- MCP para tools, resources e prompts usados por agentes;
- schemas JSON/Zod/Pydantic para payloads internos.

### 3. Implementacoes por plataforma, modulo ou servico

Cada stack deve viver em seu proprio projeto, modulo, servico ou pacote, com fronteiras explicitas. Cada implementacao real deve ter `PROJECT_CONTRACT.md`, agents locais e skills locais.

Para produtos web/backend que compartilham stack, autenticacao, tenant context e operacao, a preferencia e uma platform modular:

```text
implementations/bff-jboot-platform
  -> agents/skills globais do backend platform
  -> modules/<produto>/agents
  -> modules/<produto>/skills

implementations/app-jboot-next-platform
  -> agents/skills globais do frontend platform
  -> modules/<produto>/agents
  -> modules/<produto>/skills
```

Produtos com runtime, risco ou escala proprios continuam separados, por exemplo app offline-first e servico fiscal.

Exemplos:

```text
implementations/
  web-next/
  api-fastapi/
  api-nest/
  app-expo/
  app-flutter/
  desktop-tauri/
```

Agentes globais de stack sao catalogo de referencia. A execucao concreta usa:

- `implementations/<project>/agents/*` e `skills/*` para padroes do projeto/platform;
- `implementations/<project>/modules/<module>/agents/*` e `skills/*` para dominio especifico do modulo.

### 4. Hexagonal dentro de cada implementacao

Use hexagonal onde houver dominio:

```text
domain -> application ports -> adapters -> framework
```

Evite forcar hexagonal em prototipos descartaveis, paginas estaticas, scripts simples ou integracoes sem dominio proprio.

### 5. Event-driven e workflows duraveis quando necessario

Use eventos e workflows quando houver:

- tarefas longas;
- retries;
- compensacao;
- aprovacao humana;
- multiagentes;
- integracao com varios sistemas;
- necessidade de auditoria de etapas.

### 6. Observabilidade transversal

Todas as stacks devem emitir telemetria comparavel:

- trace id;
- task id;
- agent id;
- stack id;
- modelo de IA;
- custo estimado;
- latencia;
- tool calls;
- status;
- erro estruturado.

## Regra pratica

- Hub: contract-first + plugin/adapters + control plane.
- Execucao: projeto alvo + modulo alvo quando houver + `PROJECT_CONTRACT.md` + agents/skills da platform + agents/skills do modulo.
- Servicos com dominio: hexagonal.
- Fluxos longos: workflow orchestration.
- Integracoes de agentes: MCP.
- Comunicacao externa: OpenAPI/AsyncAPI/protobuf conforme contexto.
