# JBoot

Hub multiproduto com arquitetura modular e engenharia governada por IA.

## Objetivo

O repositorio concentra Identity, Platform modular, sites, apps, servicos,
workers e infraestrutura compartilhada. IA e parte central do processo de
engenharia e governanca; o runtime de IA dos produtos permanece planejado e
deve ser ativado somente pelo gate descrito em `src/ai/README.md`.

## Estado Atual

- `AI-first engineering`: conformant por contrato executavel, schemas, agents,
  skills, contexto deterministico, preflight diff-aware, evals, attestations,
  seguranca e adapters. O claim vale quando `make ai-conformance` estiver verde;
  consulte `docs/ai-governance/evidence/AI_FIRST_EVIDENCE.md`.
- `AI product runtime`: planejado; ainda nao existem providers ou chamadas de
  modelos implementadas na camada raiz `src/ai`.
- implementacoes: inventariadas em `implementations/README.md`, com maturidade
  definida por `docs/architecture/implementation-lifecycle.md`.

`functional` e `production_ready` sao estados diferentes. Consulte o contrato
do projeto antes de inferir maturidade pela presenca de codigo.

## Regra de ouro

Toda decisao deve considerar um operador de nivel SENIOR em linguagens de programacao, analise, arquitetura, seguranca, operacao e qualquer outro aspecto envolvido na area de atuacao do que for requisitado.

Isso significa que o projeto deve priorizar profundidade tecnica, controle fino, rastreabilidade, extensibilidade, explicabilidade e capacidade de auditoria. Interfaces, automacoes e agentes devem ser eficientes para usuarios experientes, sem esconder informacao critica ou simplificar decisoes importantes alem do aceitavel.

## Estrutura

```text
docs/
  agents/                Orquestracao global e referencias de stack
  architecture/          Decisoes estruturais do hub de implementacoes
  infra/                 Infra local e containers Docker
  stacks/                Recomendacoes tecnicas por plataforma
  decision-principles.md  Principios de decisao do projeto
  ai-architecture.md      Arquitetura, padroes e guardrails de IA
  product-brief.md        Visao inicial do produto
src/
  ai/                     Orquestracao de modelos, prompts, agentes e avaliacao
  app/                    Camada de aplicacao
  core/                   Dominio e regras centrais
  integrations/           APIs externas e conectores
tests/                    Testes automatizados
```

Implementacoes reais ficam em `implementations/<project>`. Cada projeto deve ter `PROJECT_CONTRACT.md`, `agents/*` e `skills/*` para que execucoes usem contexto local e economizem tokens.

## Principios iniciais

- Decisoes devem assumir operadores SENIOR como publico operacional padrao.
- IA deve ser observavel: logs, custos, latencia, modelos usados e resultados relevantes devem ser rastreaveis.
- Prompts e ferramentas devem ser versionados como codigo.
- Saidas de IA que afetam usuarios, dinheiro, saude, juridico ou operacoes criticas precisam de validacao explicita.
- O projeto deve suportar troca de modelos e provedores sem reescrever a aplicacao.
- Dados sensiveis devem ser minimizados antes de chegar a qualquer provedor externo.

## Proximos passos tecnicos do runtime de IA

1. Aprovar o primeiro caso de uso de IA em runtime e seu impacto operacional.
2. Registrar ADR de provider/stack, dados, retencao e observabilidade.
3. Implementar a primeira integracao exclusivamente em `src/ai`.
4. Criar testes e evals automatizados antes de habilitar o fluxo em producao.
5. Medir modelo, prompt version, custo, latencia, status e falhas.

## Infra local

Veja `docs/infra/docker.md`.

Atalhos:

```bash
make infra-up
make shell
```

## Governanca De IA

Antes de iniciar implementacao funcional em `implementations/*`, rode:

```bash
make ai-check
```

Esse comando executa os validadores/evals locais da arquitetura de IA:

- adapters de runtime;
- contratos e modules;
- preflight com `Agent Activation`;
- checks de governanca.

Para consultar os indicadores consolidados:

```bash
make ai-report
```

CI sera tratado depois; por enquanto esta e a rotina local recomendada.
