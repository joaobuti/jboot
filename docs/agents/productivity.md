# Produtividade dos Agentes

## Decisao

Skills ajudam quando encapsulam conhecimento ou procedimentos recorrentes que o agente nao deve reconstruir do zero a cada tarefa.

O `product-engineer` e o responsavel por decidir quando criar, reutilizar, ajustar ou remover skills, playbooks, templates, schemas, evals e validadores.

Elas melhoram produtividade, consistencia e uso de tokens quando seguem tres regras:

- conter apenas contexto necessario;
- usar disclosure progressivo;
- incluir scripts/templates quando a tarefa exigir repetibilidade.

Skills ruins pioram o sistema: aumentam tokens, cristalizam decisoes erradas e fazem agentes seguirem passos genericos demais.

## Quando criar skill

Crie uma skill quando houver:

- workflow recorrente;
- stack com padroes idiomaticos;
- operacao fragil que exige sequencia correta;
- ferramenta/API com detalhes especificos;
- validacao repetivel;
- template ou script reutilizavel.

Nao crie skill para conhecimento generico que o modelo ja domina ou para decisao que depende fortemente do contexto.

Antes de criar ou alterar uma skill, revisar o fluxo completo:

```text
pedido -> product-owner -> product-engineer -> architect? -> human-confirmation? -> project-contract -> implementation-agent -> validacao -> product-engineer
```

Se a skill nao melhora esse fluxo de ponta a ponta, nao deve ser criada.

## Localizacao De Skills

- Skills globais ficam em `docs/skills/*` somente quando servem a varios projetos ou ao grupo de orquestracao.
- Skills de projeto ficam em `implementations/<project>/skills/*` e devem ser preferidas quando existir `target_project`.
- Se uma skill global for necessaria em um projeto especifico, criar uma versao local enxuta ou referenciar explicitamente a global no `PROJECT_CONTRACT.md`.
- Nao carregar skills de outro projeto sem justificativa cross-project.

## Outras alavancas

### 1. Playbooks

Guias curtos para decisoes recorrentes.

Exemplos:

- escolher broker: Redis Streams vs RabbitMQ vs Kafka vs Temporal;
- escolher banco: PostgreSQL vs MongoDB vs vector DB;
- escolher backend: TypeScript vs Python vs Go vs JVM.

### 2. Schemas e contratos

Todo agente deve preferir saida estruturada quando outro agente ou codigo consumir o resultado.

Use:

- JSON Schema;
- OpenAPI;
- AsyncAPI;
- protobuf;
- Zod/Pydantic;
- MCP tool/resource/prompt contracts.

### 3. Evals

Evals medem se prompts, agentes e skills continuam bons depois de mudancas.

Devem cobrir:

- tarefas felizes;
- casos ambiguos;
- falhas esperadas;
- custo/token budget;
- regressao de qualidade;
- seguranca e dados sensiveis.

### 4. Templates

Templates reduzem variacao inutil.

Usar para:

- ADR;
- decision record;
- plano de implementacao;
- contrato de agente;
- checklist de review;
- scaffold de servico.

### 5. Validadores

Scripts pequenos devem validar o que seria caro explicar em texto.

Exemplos:

- validar schema;
- checar links entre agentes;
- checar que todo agente tem regras globais;
- medir tamanho de prompts/skills;
- rodar smoke tests.

### 6. Memoria operacional

Decisoes tomadas devem virar artefato versionado.

Use:

- `docs/stacks/radar.md`;
- ADRs;
- logs de decisoes;
- criterios de aceite;
- changelog de prompts/agentes.

### 7. Observabilidade

Agentes precisam gerar rastros operacionais quando executarem tarefas reais:

- task id;
- agent id;
- stack id;
- prompt/skill version;
- tools usadas;
- custo estimado;
- tokens;
- latencia;
- erro estruturado.

## Backlog inicial de skills

Prioridade alta:

- `crud-jboot-identity`: padrao de CRUD admin no `bff-jboot-identity`; versao executora local em `implementations/bff-jboot-identity/skills/crud-jboot-identity.md`.
- `stack-decision`: ajuda o architect a escolher stack com base no radar.
- `broker-decision`: Redis/Valkey vs RabbitMQ vs Kafka/Redpanda/NATS vs Temporal.
- `ai-evals`: cria e executa avaliacoes de prompts, agentes e RAG.
- `contract-first-api`: gera OpenAPI/AsyncAPI/schema antes da implementacao.
- `agent-review`: revisa agentes, regras globais, custo de tokens e riscos.

Prioridade media:

- `nextjs-console`: padroes para console web SENIOR.
- `fastapi-ai-service`: servicos Python de IA/RAG.
- `laravel-backoffice`: backoffice Laravel idiomatico.
- `go-worker`: workers/gateways Go.
- `observability-otel`: telemetria padronizada.

## Regra final

Boost bom reduz decisao repetitiva e aumenta validacao.

Boost ruim adiciona texto, regras e abstracoes que o agente precisa carregar sem necessidade.

Qualquer boost deve reduzir retrabalho real, nao apenas aumentar a quantidade de agentes, documentos ou automacoes.
