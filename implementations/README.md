# Implementations

Implementacoes concretas do hub. Cada servico/app deve viver em diretorio proprio e explicito.

## Atual

Os estados seguem `docs/architecture/implementation-lifecycle.md`. `functional`
nao significa `production_ready`.

| Projeto | Responsabilidade | Lifecycle |
|---|---|---|
| `bff-jboot-identity` | Backend NestJS do Identity Hub | `functional` |
| `app-jboot-identity-admin` | Frontend Next.js do painel admin global | `functional` |
| `bff-jboot-platform` | Backend modular monolith de produtos | `functional` |
| `app-jboot-next-platform` | Frontend web modular Next.js de produtos | `functional` |
| `app-jboot-pdv-mobile` | App React Native/Expo offline-first do PDV | `planned` |
| `svc-jboot-fiscal` | Servico fiscal Laravel reutilizavel | `scaffolded` |
| `svc-jboot-juridico-data` | Servico interno Python para dados juridicos oficiais | `planned` |
| `svc-jboot-payments` | Servico interno Go provider-neutral de cobrancas | `in_progress` |
| `svc-jboot-ai-gateway` | Cofre BYOK, agentes e execucao Anthropic/OpenAI | `in_progress` |
| `wrk-jboot-juridico` | Workers Python/Playwright via Temporal | `functional` |
| `wrk-jboot-marketing` | Worker local de publicacao Instagram da JBoot | `scaffolded` |
| `ops-jboot-observability` | Telemetria interna com OpenTelemetry e Grafana LGTM | `functional` |
| `site-jboot-landing` | Landing institucional publica JBoot | `functional` |
| `site-joao-buti-portfolio` | Portfolio profissional Astro | `functional` |
| `templates/original/Next-TS` | Template reutilizavel; nao e implementacao | `N/A` |

`bff-jboot-pdv` e `app-jboot-pdv-web` (backend/frontend legados do PDV pre-platform) foram removidos em 2026-07-17. Referencia historica (PROJECT_CONTRACT.md, AI_CONTEXT.md, agents, skills) arquivada em `bff-jboot-platform/modules/pdv/legacy-reference/bff-jboot-pdv/`.

`bff-jboot-juridico` e `app-jboot-juridico` (backend/frontend legados do Juridico pre-platform) foram removidos em 2026-07-17. Referencia historica arquivada em `bff-jboot-platform/modules/juridico/legacy-reference/bff-jboot-juridico/`.

## Contratos

Cada implementacao real deve ter um `PROJECT_CONTRACT.md` com stack, agents, skills, entrypoints, contratos, validacoes e restricoes.

Antes de alterar uma implementacao, leia primeiro o contrato do projeto alvo:

- `bff-jboot-identity/PROJECT_CONTRACT.md`
- `app-jboot-identity-admin/PROJECT_CONTRACT.md`
- `bff-jboot-platform/PROJECT_CONTRACT.md`
- `app-jboot-next-platform/PROJECT_CONTRACT.md`
- `app-jboot-pdv-mobile/PROJECT_CONTRACT.md`
- `svc-jboot-fiscal/PROJECT_CONTRACT.md`
- `svc-jboot-juridico-data/PROJECT_CONTRACT.md`
- `svc-jboot-payments/PROJECT_CONTRACT.md`
- `svc-jboot-ai-gateway/PROJECT_CONTRACT.md`
- `wrk-jboot-juridico/PROJECT_CONTRACT.md`
- `wrk-jboot-marketing/PROJECT_CONTRACT.md`
- `ops-jboot-observability/PROJECT_CONTRACT.md`
- `site-jboot-landing/PROJECT_CONTRACT.md`
- `site-joao-buti-portfolio/PROJECT_CONTRACT.md`

## Agents E Skills Locais

Cada projeto real deve declarar seus executores no proprio diretorio:

- `agents/*`: agentes locais do projeto.
- `skills/*`: procedimentos locais recorrentes do projeto.

O grupo global em `docs/agents/orchestration/*` decide fluxo, projeto alvo e governanca. O catalogo `docs/agents/stacks/*` serve como referencia tecnica. A execucao de codigo deve usar primeiro os agents e skills locais do projeto alvo.

## Platform + Modulos

Projetos platform possuem dois niveis de contexto:

- `agents/*` e `skills/*`: padroes globais da stack/projeto.
- `modules/<module>/agents/*` e `modules/<module>/skills/*`: dominio especifico do modulo.

Antes de implementar em uma platform, declarar `target_project` e `target_module`.
