# Guia: Novo Projeto Do Zero

Este guia mostra como pedir um novo projeto dentro do JBoot para acionar corretamente o fluxo de orquestracao:

```text
PO -> PE -> Architect -> confirmacao humana -> branch dedicada -> PROJECT_CONTRACT -> agents/skills locais -> implementacao
```

## Regra Principal

Para projeto novo, nao existe `target_project` ainda. Portanto o modo correto e `architectural`.

Diretorios/arquivos `.codex.d`, `.claude`, `.cursor` e `.github/copilot-instructions.md` existem como adapters para ferramentas de IA. Eles ajudam o runtime, mas nao substituem os contratos do projeto.

Qualquer novo projeto, modulo, produto, landing, app, BFF, worker, servico ou integracao em `implementations/*` exige o fluxo:

```text
PO -> PE -> Architect -> confirmacao humana
```

Esse fluxo deve ocorrer antes de criar ou editar arquivos do projeto. A IA nao pode substituir essa etapa por inferencia propria, mesmo quando o contexto parecer suficiente.

Apos a confirmacao humana e antes de criar `PROJECT_CONTRACT.md`, `MODULE_CONTRACT.md`, estrutura de diretorios, agents, skills ou codigo, o executor deve criar/trocar automaticamente para uma branch Git dedicada seguindo as convencoes ja existentes no repositorio. Essa branch deve isolar o projeto/feature atual e nao misturar implementacoes sem relacao.

Antes de criar `PROJECT_CONTRACT.md`, `MODULE_CONTRACT.md`, agents, skills ou codigo, todas as perguntas abertas levantadas por PO, PE ou Architect devem ter decisao operacional explicita:

- respondida pelo usuario;
- marcada pelo usuario como pendencia nao bloqueante;
- assumida temporariamente com risco registrado e aprovado pelo usuario.

Se uma pergunta aberta puder afetar escopo, produto, marca, arquitetura, seguranca, dados, custo, deploy ou operacao, o agente deve perguntar ao usuario se quer decidir agora ou registrar para depois.

Projetos de marca, divulgacao, landing page, site institucional, SEO publico, campanha, copy comercial ou posicionamento publico exigem `docs/agents/orchestration/marketing-brand.md` antes de implementacao visual ou textual. Use `docs/mkt/jb-cyan.jpg` como default visual da marca JBoot e `docs/mkt/jb-cyan-white.png` para contextos clean/claros, salvo decisao humana em contrario.

Antes de qualquer codigo, devem existir:

- escopo funcional validado;
- recomendacao tecnica com pros/contras;
- confirmacao humana;
- nomes dos projetos em `implementations/*`;
- `PROJECT_CONTRACT.md` por projeto;
- agents e skills locais por projeto;
- artefato proprio de sprints/roadmap por produto ou conjunto de projetos;
- contrato visual quando houver web + app.

Antes de qualquer sprint funcional, tambem devem existir:

- modelo de dados da sprint;
- contratos de API/eventos/sync;
- regras de autorizacao/contexto;
- criterios de aceite funcionais e tecnicos;
- validacoes/testes minimos;
- projetos afetados;
- agents/skills locais responsaveis;
- riscos e fora de escopo.

Isso e minimo aceitavel, nao rigor opcional.

Antes de qualquer implementacao em `implementations/*`, a IA deve declarar o preflight:

- `execution_mode`;
- `target_project`;
- `target_module`, quando o projeto for uma platform modular;
- contratos carregados;
- gate da sprint usado;
- agents locais globais da platform;
- skills locais globais da platform;
- agents/skills do modulo, quando houver;
- ordem de execucao;
- validacoes esperadas;
- fora de escopo.

Sem esse preflight e sem o bloco `Agent Activation`, a implementacao nao deve iniciar.

## Plataformas Modulares

Para produtos web/backend com stack compartilhada, a direcao atual e usar platform modular:

```text
implementations/bff-jboot-platform
  agents/*
  skills/*
  modules/<module>/agents/*
  modules/<module>/skills/*

implementations/app-jboot-next-platform
  agents/*
  skills/*
  modules/<module>/agents/*
  modules/<module>/skills/*
```

Exemplo para PDV:

```text
target_project: implementations/bff-jboot-platform
target_module: modules/pdv

target_project: implementations/app-jboot-next-platform
target_module: modules/pdv
```

`bff-jboot-identity` continua separado. App offline-first e fiscal podem continuar como projetos proprios quando runtime, risco ou operacao justificarem.

## Modelo De Pedido

Use este formato:

```text
Projeto novo do zero

Ideia do projeto:

Objetivo principal:

Canais/projetos previstos:

Usuarios/papeis:

Fluxos principais:

Dados principais:

Restricoes:

Preferencias ou tecnologias a considerar:

O que NAO queremos:

Modo esperado:
architectural
```

## Exemplo Validado: PDV

```text
Projeto novo do zero

Ideia do projeto:
Sistema/app de PDV, vendas e frente de caixa, generico, com especializacoes futuras por segmento.

Objetivo principal:
Criar uma plataforma PDV multi-tenant, com web online e app offline-first, usando login centralizado no Identity Hub existente.

Canais/projetos previstos:
- Backend PDV.
- Frontend web PDV.
- App mobile/tablet PDV.
- Servico fiscal separado, obrigatorio em sprint posterior.
- Possiveis servicos externos/integracoes: fiscal, pagamentos, TEF/maquininha, PIX, sincronizacao/eventos.

Usuarios/papeis:
- Operador de caixa/vendedor.
- Operador master/gestor.
- Supervisor/gerente.
- Cliente/tenant contratante.
- Servicos sistemicos de integracao.

Fluxos principais:
- Login via Identity Hub.
- Web administrativo e frente de caixa no mesmo frontend, com permissoes/telas diferentes.
- App mobile/tablet offline-first em base unica.
- Venda pode ser finalizada offline no app.
- Sincronizacao posterior com backend.
- Gestao de produtos, estoque, vendas, caixa, pagamentos, clientes e operadores.
- Integracoes externas previstas no roadmap.
- Servico fiscal obrigatorio, mas separado do core PDV.

Dados principais:
- `client_id` obrigatorio em todas as tabelas de negocio.
- produtos;
- categorias;
- estoque;
- clientes;
- operadores;
- vendas;
- itens de venda;
- pagamentos;
- caixa;
- configuracoes;
- eventos offline;
- fila/sync;
- configuracoes fiscais futuras.

Restricoes:
- Nao criar autenticacao propria.
- Usar Identity Hub existente.
- Nao misturar PDV dentro do `bff-jboot-identity`.
- Backend, frontend e app devem ser projetos separados.
- Banco compartilhado multi-tenant.
- App offline-first deve finalizar venda sem internet.
- Sync precisa ser idempotente.
- Fiscal sera servico separado e obrigatorio.
- Architect deve comparar Temporal, RabbitMQ, Redis/Valkey e alternativas para sync/idempotencia.

Modo esperado:
architectural
```

## Saida Esperada Dos Agents De Orquestracao

### PO

Deve retornar:

- objetivo;
- usuarios e papeis;
- fluxos principais;
- regras de negocio;
- dados envolvidos;
- criterios de aceite;
- sprints funcionais iniciais;
- gate funcional minimo antes de sprint;
- ambiguidades que impedem implementacao.

### PE

Deve retornar:

- `execution_mode: architectural`;
- `target_project: pendente`;
- projetos sugeridos;
- contratos necessarios;
- agents/skills locais que deverao existir depois da confirmacao;
- artefato de sprints/roadmap que devera ser criado apos confirmacao;
- gate minimo obrigatorio antes de qualquer sprint funcional;
- validacoes esperadas;
- riscos de retrabalho ou excesso de contexto.

### Architect

Deve retornar:

- tabela de pros/contras das stacks;
- tabela de pros/contras das arquiteturas;
- recomendacao tecnica;
- alternativas rejeitadas;
- riscos;
- criterio de aceite tecnico;
- impactos tecnicos por sprint;
- gate tecnico minimo antes de sprint funcional;
- `decision_status: pending_human_confirmation`.

## Recomendacao Aceita Para O Exemplo PDV

| Area | Decisao |
|---|---|
| Backend PDV | Modulo `pdv` em `bff-jboot-platform` com Node.js 24 + TypeScript + NestJS + PostgreSQL |
| Web PDV | Modulo `pdv` em `app-jboot-next-platform` com React + Next.js + TypeScript |
| App PDV | React Native + Expo + SQLite local |
| Banco | PostgreSQL compartilhado multi-tenant com `client_id` obrigatorio |
| Sync critico | Temporal + outbox no PostgreSQL |
| Mensageria | RabbitMQ quando comandos/eventos assincronos justificarem |
| Estado efemero | Redis/Valkey para cache, locks, rate limit e estado efemero |
| Fiscal | Servico separado em sprint posterior |

## Identidade Visual

Para projetos com web e app, a identidade visual deve ser tratada como contrato compartilhado.

No exemplo PDV:

- o web pode reutilizar diretamente uma copia derivada do template `implementations/templates/original/Next-TS` porque a stack aceita para o web PDV e React + Next.js + TypeScript;
- se outro projeto escolher outra stack web, deve usar a versao equivalente do template para aquela tecnologia, vinda do diretorio raiz de templates quando ele existir;
- o app nao deve reutilizar componentes React/Next/DOM;
- o app deve implementar componentes nativos equivalentes em React Native/Expo;
- ambos devem compartilhar tokens visuais: cores, tema, tipografia, espacamento, icones, estados e densidade;
- a referencia global e `docs/design-system.md`;
- cada projeto deve ter skill local de UI.

Projetos esperados:

```text
implementations/app-jboot-next-platform/modules/pdv/skills/pdv-web-ui.md
implementations/app-jboot-pdv-mobile/skills/pdv-mobile-ui.md
```

Regra: consistencia visual nao pode prejudicar ergonomia nativa. Web pode ser mais denso; app deve ser otimizado para toque, operacao rapida e offline-first.

## Projetos Sugeridos Para O Exemplo PDV

```text
implementations/bff-jboot-platform/modules/pdv
implementations/app-jboot-next-platform/modules/pdv
implementations/app-jboot-pdv-mobile
implementations/svc-jboot-fiscal
```

O servico fiscal e obrigatorio no roadmap, mas nao precisa ser implementado na primeira sprint.

## Sprints Do Exemplo PDV

| Sprint | Objetivo | Entregas |
|---|---|---|
| 0 | Fundacao | Projetos, contratos, agents/skills locais, contrato visual, modelo multi-tenant e contrato com Identity Hub. |
| 1 | Core administrativo | Produtos, categorias, clientes, operadores, estoque basico e web admin. |
| 2 | Caixa online | Carrinho, venda, itens, pagamento manual, abertura/fechamento de caixa. |
| 3 | App offline-first | SQLite local, venda offline, fila local, sync idempotente e resolucao inicial de conflitos. |
| 4 | Pagamentos | PIX/cartao/gateway/TEF/maquininha conforme decisao tecnica. |
| 5 | Fiscal | `svc-jboot-fiscal`, contratos fiscais e integracao PDV -> fiscal. |
| 6 | Segmentos | Mercado, restaurante/comandas como modulo inicial e outros segmentos. |

Após confirmação humana, essas sprints devem ser registradas em artefato proprio, por exemplo:

```text
docs/product/pdv-sprints.md
```

Esse artefato deve detalhar por sprint:

- objetivo;
- entregaveis;
- projetos afetados;
- agents/skills envolvidos;
- criterios de aceite;
- dependencias;
- riscos;
- fora de escopo.

## Confirmacao Humana

Somente apos a confirmacao humana a IA pode criar:

- diretorios em `implementations/*`;
- `PROJECT_CONTRACT.md`;
- agents locais;
- skills locais;
- artefato proprio de sprints/roadmap;
- scaffolds de codigo;
- migrations;
- telas;
- endpoints.

Mesmo apos confirmacao humana da arquitetura, codigo funcional de sprint so pode iniciar depois do gate minimo da sprint.

Exemplo de confirmacao:

```text
Confirmo a recomendacao tecnica e autorizo criar a estrutura dos projetos da Sprint 0.
```
