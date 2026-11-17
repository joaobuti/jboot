# Implementation Contracts

## Objetivo

Definir contratos por implementacao para que agentes e skills carreguem apenas o contexto necessario ao projeto alvo.

Antes de alterar codigo em `implementations/*`, identificar o contrato do projeto e seguir seus agents, skills, entrypoints, restricoes e validacoes.

Adapters de runtime em `.codex.d`, `.claude`, `.cursor` e `.github/copilot-instructions.md` apenas refletem estes contratos. Eles nao sao fonte primaria.

## Contratos Atuais

| Implementacao | Responsabilidade | Contrato |
|---|---|---|
| `implementations/bff-jboot-identity` | Backend do Identity Hub | `implementations/bff-jboot-identity/PROJECT_CONTRACT.md` |
| `implementations/app-jboot-identity-admin` | Frontend admin global | `implementations/app-jboot-identity-admin/PROJECT_CONTRACT.md` |
| `implementations/bff-jboot-platform` | Backend platform modular de produtos | `implementations/bff-jboot-platform/PROJECT_CONTRACT.md` |
| `implementations/app-jboot-next-platform` | Frontend web platform modular Next.js | `implementations/app-jboot-next-platform/PROJECT_CONTRACT.md` |
| `implementations/app-jboot-pdv-mobile` | App offline-first do produto PDV | `implementations/app-jboot-pdv-mobile/PROJECT_CONTRACT.md` |
| `implementations/svc-jboot-fiscal` | Servico fiscal reutilizavel | `implementations/svc-jboot-fiscal/PROJECT_CONTRACT.md` |
| `implementations/svc-jboot-payments` | Servico interno provider-neutral de cobrancas e pagamentos | `implementations/svc-jboot-payments/PROJECT_CONTRACT.md` |
| `implementations/svc-jboot-ai-gateway` | Gateway interno provider-neutral para credenciais BYOK, agentes e execucoes de IA | `implementations/svc-jboot-ai-gateway/PROJECT_CONTRACT.md` |
| `implementations/svc-jboot-juridico-data` | Servico interno para dados juridicos oficiais | `implementations/svc-jboot-juridico-data/PROJECT_CONTRACT.md` |
| `implementations/wrk-jboot-juridico` | Workers de automacao juridica | `implementations/wrk-jboot-juridico/PROJECT_CONTRACT.md` |
| `implementations/wrk-jboot-marketing` | Worker local de publicacao Instagram da JBoot | `implementations/wrk-jboot-marketing/PROJECT_CONTRACT.md` |
| `implementations/site-jboot-landing` | Landing institucional publica | `implementations/site-jboot-landing/PROJECT_CONTRACT.md` |
| `implementations/site-joao-buti-portfolio` | Portfolio profissional estatico | `implementations/site-joao-buti-portfolio/PROJECT_CONTRACT.md` |
| `implementations/ops-jboot-observability` | Plataforma interna de telemetria OpenTelemetry/LGTM | `implementations/ops-jboot-observability/PROJECT_CONTRACT.md` |

O estado operacional de cada projeto segue
`docs/architecture/implementation-lifecycle.md` e deve ser lido no respectivo
contrato. Presenca nesta tabela nao significa prontidao para producao.

`implementations/bff-jboot-pdv` e `implementations/app-jboot-pdv-web` (legado/origem de migracao do PDV) foram removidos em 2026-07-17. Referencia historica arquivada em `implementations/bff-jboot-platform/modules/pdv/legacy-reference/bff-jboot-pdv/`.

## Regra Platform + Modulo

Quando o projeto alvo for uma platform modular, a execucao deve declarar:

- `target_project`: platform afetada;
- `target_module`: modulo afetado, quando houver;
- agents/skills globais da platform;
- agents/skills especificos do modulo;
- fronteira entre regra compartilhada e regra do modulo.

Exemplo:

```text
target_project: implementations/bff-jboot-platform
target_module: modules/pdv
using_agent:
  - implementations/bff-jboot-platform/agents/backend-node-typescript.md
  - implementations/bff-jboot-platform/modules/pdv/agents/pdv-domain.md
using_skill:
  - implementations/bff-jboot-platform/skills/nest-module-pattern.md
  - implementations/bff-jboot-platform/modules/pdv/skills/pdv-crud.md
```

## Regra De Escopo

- Se a tarefa citar um projeto, usar o `PROJECT_CONTRACT.md` desse projeto como contexto inicial.
- Se a tarefa citar uma tela, rota ou arquivo especifico, revisar esse alvo antes de abrir contexto amplo.
- Se a tarefa cruzar frontend e backend, carregar os dois contratos e declarar o limite entre eles.
- Nao inferir agents/skills por preferencia; usar o contrato e justificar excecoes.
- Usar agents locais em `implementations/<project>/agents/*` como executores.
- Usar skills locais em `implementations/<project>/skills/*` como procedimentos do projeto.
- Em platform modular, usar tambem agents/skills de `implementations/<project>/modules/<module>/*`.
- Usar `docs/agents/stacks/*` apenas como referencia tecnica para decisao ou atualizacao de agents locais.
- Se o contrato nao declarar agent/skill local necessario, atualizar o contrato antes da implementacao.
- Se a mudanca alterar regra de execucao de IA, atualizar `.codex.d`, `.claude`, `.cursor` e `.github/copilot-instructions.md`.

## Preflight Antes De Implementar

Antes de alterar codigo em `implementations/*`, declarar:

- `execution_mode`;
- `target_project`;
- `PROJECT_CONTRACT.md` carregado para cada projeto;
- gate da sprint usado;
- agents locais;
- skills locais;
- ordem de execucao;
- validacoes esperadas;
- fora de escopo.

Sem esse preflight, a implementacao nao deve iniciar.

## Gate Minimo Antes De Codigo Funcional

Nenhuma sprint funcional deve iniciar apenas com descricao macro.

Antes de codigo funcional, devem existir ou ser criados:

- modelo de dados;
- contratos de API/eventos/sync;
- regras de autorizacao/contexto;
- criterios de aceite;
- teste automatizado para cada feature/funcao nova (endpoint, service/repository, regra de negocio, agregacao, integracao) — ou, se o projeto/modulo ainda nao tiver test runner configurado, pendencia explicita registrada no gate sobre essa lacuna, nao uma omissao silenciosa;
- projetos afetados;
- agents/skills locais responsaveis;
- riscos e fora de escopo.

Esse gate e parte da qualidade minima do projeto. Nao deve ser apresentado como opcional.

## Formato Obrigatorio

Cada contrato deve declarar:

- lifecycle status e evidencia conforme `docs/architecture/implementation-lifecycle.md`;
- stack;
- responsabilidade;
- agents aplicaveis;
- skills aplicaveis;
- entrypoints;
- contratos externos/internos;
- comandos de validacao;
- restricoes;
- riscos conhecidos.
- gate minimo antes de codigo funcional, quando aplicavel.

## Modos De Uso

| Modo | Contratos carregados | Regra |
|---|---|---|
| `project` | Um `PROJECT_CONTRACT.md` | Executar com agents/skills locais do projeto. |
| `cross_project` | Dois ou mais contratos | Declarar fronteiras e validar cada projeto afetado. |
| `architectural` | Contratos existentes + catalogo global | Architect recomenda; usuario confirma; contratos locais sao atualizados antes de codigo. |
| `local_reference` | Alvo citado + contrato do projeto | Revisar somente rota/tela/arquivo indicado e entorno indispensavel. |
