# PDV Sprints

## Objetivo

Detalhar as sprints do produto PDV após confirmação da arquitetura, com responsabilidades por projeto, agents/skills envolvidos, critérios de aceite, dependências, riscos e fora de escopo.

## Projetos

| Projeto | Responsabilidade |
|---|---|
| `implementations/bff-jboot-platform/modules/pdv` | Backend transacional PDV dentro da backend platform. |
| `implementations/app-jboot-next-platform/modules/pdv` | Web admin e frente de caixa online dentro da Next platform. |
| `implementations/app-jboot-pdv-mobile` | App mobile/tablet offline-first. |
| `implementations/svc-jboot-fiscal` | Serviço fiscal reutilizável. |

`implementations/bff-jboot-pdv` e `implementations/app-jboot-pdv-web` (origem da Sprint 1, pré-platform) foram removidos em 2026-07-17 após a migração estar concluída. Referência histórica arquivada em `implementations/bff-jboot-platform/modules/pdv/legacy-reference/bff-jboot-pdv/`.

## Sprint 0: Fundação

Objetivo: criar base contratual e operacional antes de código funcional.

Entregáveis:

- projetos em `implementations/*`;
- `PROJECT_CONTRACT.md` por projeto;
- agents locais por projeto;
- skills locais por projeto;
- ADR da plataforma PDV;
- documento de arquitetura PDV;
- contrato visual conforme `docs/design-system.md`;
- definição inicial de modelo multi-tenant;
- contrato inicial com Identity Hub;
- contrato inicial de sync offline.

Projetos afetados:

- `bff-jboot-platform/modules/pdv`;
- `app-jboot-next-platform/modules/pdv`;
- `app-jboot-pdv-mobile`;
- `svc-jboot-fiscal`.

Agents/skills envolvidos:

- `bff-jboot-platform/agents/backend-node-typescript.md`;
- `bff-jboot-platform/agents/platform-auth-context.md`;
- `bff-jboot-platform/modules/pdv/agents/pdv-domain.md`;
- `app-jboot-next-platform/agents/frontend-next-typescript.md`;
- `app-jboot-next-platform/modules/pdv/agents/pdv-web.md`;
- `app-jboot-pdv-mobile/agents/mobile-react-native.md`;
- `app-jboot-pdv-mobile/agents/offline-sync.md`;
- `svc-jboot-fiscal/agents/fiscal-service.md`.

Critérios de aceite:

- contratos criados e registrados;
- fronteiras entre projetos claras;
- regra de `client_id` obrigatória documentada;
- fiscal separado do core PDV;
- web e app com regra visual definida;
- nenhuma implementação funcional sem contrato.

Dependências:

- Identity Hub existente;
- `docs/design-system.md`;
- decisão arquitetural aceita.

Riscos:

- contratos genéricos demais geram retrabalho;
- fiscal pode avançar sem decisão técnica específica;
- sync offline pode ser subestimado.

Fora de escopo:

- código funcional;
- migrations reais;
- UI real;
- integração fiscal real;
- pagamentos integrados.

## Sprint 1: Core Administrativo

Objetivo: implementar base administrativa online para operação do PDV.

Gate obrigatório antes de código funcional:

- modelo de dados de produtos, categorias, clientes do estabelecimento, operadores e estoque;
- contratos OpenAPI da Sprint 1;
- regras de autorização/contexto via Identity Hub;
- critérios de aceite funcionais e técnicos;
- plano de validação/testes;
- fronteiras entre `bff-jboot-platform/modules/pdv` e `app-jboot-next-platform/modules/pdv`;
- revisão dos agents/skills locais envolvidos.

Artefatos do gate:

- `docs/product/pdv-sprint-1-gate.md`;
- `docs/data/pdv-sprint-1-data-model.md`;
- `docs/api/pdv-sprint-1-openapi.yaml`.

Entregáveis:

- produtos;
- categorias;
- clientes do estabelecimento;
- operadores/perfis;
- estoque básico;
- web admin para esses módulos;
- APIs administrativas;
- isolamento por `client_id`.

Projetos afetados:

- `bff-jboot-platform/modules/pdv`;
- `app-jboot-next-platform/modules/pdv`.

Agents/skills envolvidos:

- backend platform: `backend-node-typescript`, `platform-auth-context`, `platform-postgres`, `pdv-domain`, `pdv-crud`;
- web platform: `frontend-next-typescript`, `platform-layout`, `backend-contract-client`, `pdv-web`, `pdv-admin-api`, `pdv-web-ui`, `pdv-admin-api-client`.

Critérios de aceite:

- CRUDs separados por domínio;
- DTOs e contratos tipados;
- filtros por `client_id`;
- listagens paginadas;
- estados de loading/empty/error/success no web;
- validação de permissão por contexto do Identity Hub.

Dependências:

- Sprint 0 concluída;
- contrato Identity Hub -> PDV definido.

Riscos:

- duplicar regra de autorização no frontend;
- criar CRUD genérico centralizado;
- permitir input manual de `client_id`.

Fora de escopo:

- venda;
- caixa;
- sync offline;
- emissão fiscal;
- pagamentos integrados.

## Sprint 1.5: Controles Operacionais de Caixa

Objetivo: fechar as lacunas de controle de caixa e correção de erro que impedem uso real por um lojista, identificadas em avaliação de negócio de 2026-07-17 sobre o escopo já implementado (Sprints 0-5). Nenhum destes itens estava nomeado nas sprints originais.

Estado de entrega: `concluida` em 2026-08-25.

Evidência de implementação/QA:

- backend: `docker compose exec -T jboot bash -lc 'cd implementations/bff-jboot-platform && npm run typecheck'` aprovado em 2026-08-25;
- backend: specs focadas de cashier, sales e comanda aprovadas em 2026-08-25 (`54` testes);
- backend: suíte completa `docker compose exec -T jboot bash -lc 'cd implementations/bff-jboot-platform && npm test'` aprovada em 2026-08-25 (`163` testes);
- frontend: `docker compose exec -T jboot bash -lc 'cd implementations/app-jboot-next-platform && npm run type-check'` aprovado em 2026-08-25;
- frontend: `docker compose exec -T jboot bash -lc 'cd implementations/app-jboot-next-platform && npm run build'` aprovado em 2026-08-25, com warning não bloqueante existente de SCSS/autoprefixer (`color-adjust` deprecated).

Entregáveis:

- [x] impressão de cupom/recibo na tela de frente de caixa;
- [x] sangria e suprimento de caixa (registro de saída/entrada de dinheiro fora de venda, com motivo e operador responsável);
- [x] fechamento de caixa com conferência física: operador informa o valor contado, sistema calcula e registra a diferença entre saldo esperado (soma de pagamentos, abertura e movimentações) e saldo contado. **Decisão (2026-07-17): sistema alerta o operador no momento do fechamento quando há diferença, e registra o valor faltante/sobrando junto ao caixa fechado — não bloqueia o fechamento**;
- [x] cancelamento/estorno de venda já `completed` (não só `open`), com trilha de auditoria do motivo. **Decisão (2026-07-17): estorno sempre repõe o estoque baixado pela venda original**;
- [x] exposição no BFF do PDV do cancelamento de documento fiscal já emitido (o `svc-jboot-fiscal` já expõe `POST /v1/documentos/{id}/cancelamento`; o `SalesController` consome via `FiscalIntegrationService`);
- [x] `ScopeGuard`/`RequireScopes` em `SalesController` e `CashierController` (2026-07-17) — escopos `pdv:sales:read`/`pdv:sales:write` e `pdv:cashier:read`/`pdv:cashier:write` aplicados por handler, seguindo o padrão de `customers.controller.ts`; seed atualizado em `docker/postgres/init/007_identity_pdv_dev_seed.sql` (Operador Senior e Usuário Teste) para não quebrar acesso existente; testes automatizados criados: `guards/scope.guard.spec.ts`, `sales/sales.controller.spec.ts`, `sales/sales.service.spec.ts`, `cashier/cashier.controller.spec.ts`, `cashier/cashier.service.spec.ts` (27 testes, todos passando).

Projetos afetados:

- `bff-jboot-platform/modules/pdv` (sales, cashier);
- `app-jboot-next-platform/modules/pdv` (frente de caixa);
- `svc-jboot-fiscal` (nenhuma mudança de contrato esperada — endpoint de cancelamento já existe).

Agents/skills envolvidos:

- backend: `backend-node-typescript`, `postgres-pdv`, `pdv-domain`, `platform-auth-context`;
- web: `frontend-web`, `pdv-cashier-ui`, `backend-contract-client`.

Critérios de aceite:

- [x] cupom/recibo impresso ou exportável ao concluir venda;
- [x] sangria/suprimento registrados com valor, motivo, operador e timestamp, refletidos no resumo do caixa;
- [x] fechamento de caixa exige valor contado, exibe alerta quando há diferença (sobra/falta) e registra o valor da diferença no caixa fechado, sem bloquear o fechamento;
- [x] venda `completed` pode ser cancelada/estornada com motivo obrigatório, gerando registro auditável e repondo o estoque baixado pela venda original;
- [x] cancelamento de venda com nota fiscal emitida também cancela o documento fiscal correspondente (ou bloqueia com erro claro se o cancelamento fiscal falhar);
- [x] rotas de venda e caixa exigem escopo explícito (`pdv:sales:read`/`write`, `pdv:cashier:read`/`write`), consistente com o padrão já usado em customers/operators/inventory/catalog, com seed dos papéis existentes já atualizado (2026-07-17);
- [x] diferença de caixa fica visível no histórico de caixas fechados (`GET /pdv/cashiers/:id/summary` ou equivalente), não só gravada no banco sem exposição em API/UI.

Dependências:

- Sprint 1 e Sprint 2 (parcialmente já implementada) concluídas;
- endpoint de cancelamento do `svc-jboot-fiscal` disponível (já existe).

Riscos:

- estorno sempre repor estoque pode distorcer saldo se a mercadoria devolvida estiver danificada/não puder voltar ao estoque vendável — avaliar se é necessário um motivo de estorno que desvie para baixa/perda em vez de reposição direta, antes de generalizar para devolução parcial (fora de escopo desta sprint, mas afeta o desenho da reposição);
- diferença de caixa apenas alertada e registrada (não bloqueia fechamento) depende de relatório/dashboard que exponha esse histórico para o gestor revisar depois — se esse relatório não existir, a diferença fica registrada mas invisível na prática;
- [x] adicionar `ScopeGuard` em rotas já em uso pode quebrar operadores existentes sem o scope necessário — mitigado: `docker/postgres/init/007_identity_pdv_dev_seed.sql` já concede `pdv:sales:*`/`pdv:cashier:*` a Operador Senior e Usuário Teste no mesmo commit do guard (2026-07-17). Atenção ao aplicar em ambientes com outros papéis/operadores além desses dois: precisam do mesmo scope antes do deploy do guard.

Fora de escopo:

- devolução/troca formal com reposição de mercadoria diferente da vendida;
- desconto por item (permanece só a nível de venda);
- integração com hardware fiscal dedicado (impressora fiscal, gaveta eletrônica via SDK) — impressão desta sprint é via impressora comum/navegador;
- TEF/maquininha/pagamento integrado (Sprint 4).

## Sprint 2: Caixa Online

Objetivo: permitir venda online no web.

Entregáveis:

- tela de frente de caixa web;
- carrinho;
- criação de venda;
- itens da venda;
- pagamento manual;
- abertura e fechamento de caixa;
- auditoria operacional inicial.

Projetos afetados:

- `bff-jboot-platform/modules/pdv`;
- `app-jboot-next-platform/modules/pdv`.

Agents/skills envolvidos:

- backend: `backend-node-typescript`, `postgres-pdv`, `pdv-domain`;
- web: `frontend-web`, `pdv-cashier-ui`, `backend-contract-client`.

Critérios de aceite:

- venda auditável;
- pagamento com status;
- movimento de estoque registrado;
- caixa com estado consistente;
- UI rápida e clara para operação repetitiva;
- ações destrutivas com confirmação.

Dependências:

- Sprint 1 concluída;
- produtos e estoque disponíveis.

Riscos:

- tratar pagamento como campo simples;
- baixa de estoque sem movimento auditável;
- UI lenta para operação de caixa.

Fora de escopo:

- venda offline;
- TEF/maquininha/PIX integrado;
- fiscal.

## Sprint 3: App Offline-First

Objetivo: permitir venda offline real no app mobile/tablet.

Entregáveis:

- app base;
- banco SQLite local;
- bootstrap de dados necessários para venda;
- carrinho offline;
- venda offline;
- fila local de eventos;
- upload idempotente;
- status de sync/conflito.

Projetos afetados:

- `app-jboot-pdv-mobile`;
- `bff-jboot-platform/modules/pdv`.

Agents/skills envolvidos:

- mobile: `mobile-react-native`, `offline-sync`, `pdv-mobile-ui`, `offline-first-pdv`, `local-storage-contract`;
- backend platform: `backend-node-typescript`, `platform-auth-context`, `pdv-sync`, `pdv-offline-contract`.

Critérios de aceite:

- app finaliza venda sem internet;
- restart do app não perde venda pendente;
- reenvio não duplica venda/pagamento/estoque;
- conflitos ficam visíveis ou são reconciliados por política explícita;
- status de sync é visível ao operador.

Dependências:

- Sprint 2 concluída;
- contrato de sync definido;
- política inicial de conflito de estoque.

Riscos:

- duplicidade por falha de idempotência;
- perda de eventos locais;
- divergência de estoque;
- armazenamento local sem migrations.

Fora de escopo:

- fiscal;
- pagamentos integrados;
- resolução avançada de conflitos.

## Sprint 4: Pagamentos Integrados

Estado de entrega: `em andamento`. A fatia Checkout Pix InfinitePay no PDV web
foi concluida em 2026-10-05; cartao, TEF/maquininha, mobile/offline e
conciliacao operacional completa permanecem pendentes.

Objetivo: integrar meios de pagamento externos.

Entregáveis:

- contratos de pagamento;
- PIX/cartão/gateway/TEF/maquininha conforme decisão técnica;
- status de pagamento;
- retries controlados;
- auditoria de pagamento;
- conciliação inicial.

Projetos afetados:

- `bff-jboot-platform/modules/pdv`;
- `app-jboot-next-platform/modules/pdv`;
- `app-jboot-pdv-mobile`;
- possível serviço/gateway futuro.

Agents/skills envolvidos:

- backend platform: `backend-node-typescript`, `platform-auth-context`, `pdv-domain`, `pdv-sync`;
- web/mobile: agents locais de UI e API;
- Architect deve revisar provider/TEF antes da implementação.

Critérios de aceite:

- pagamento não duplica em retry;
- erro externo estruturado;
- status rastreável;
- auditoria mínima;
- operação manual ainda possível quando integração falhar.

Dependências:

- Sprint 2;
- Sprint 3 se integração também operar no app offline;
- decisão técnica do provedor.

Riscos:

- acoplamento forte a fornecedor;
- inconsistência entre venda e pagamento;
- baixa observabilidade.

Fora de escopo:

- emissão fiscal completa, salvo contrato necessário.

## Sprint 5: Serviço Fiscal

Objetivo: implementar serviço fiscal separado e integração PDV -> fiscal.

Entregáveis:

- decisão técnica específica do fiscal;
- contratos fiscais versionados;
- solicitação de emissão;
- status de emissão;
- eventos fiscais;
- cancelamento quando aplicável;
- tratamento de erro externo;
- auditoria fiscal.

Projetos afetados:

- `svc-jboot-fiscal`;
- `bff-jboot-platform/modules/pdv`;
- web/mobile conforme UX de status fiscal.

Agents/skills envolvidos:

- fiscal: `fiscal-service`, `fiscal-integrations`, `fiscal-contracts`, `fiscal-risk-review`;
- backend platform PDV: `backend-node-typescript`, `platform-auth-context`, `pdv-domain`;
- Architect para decisão técnica fiscal.

Critérios de aceite:

- fiscal separado do core PDV;
- contrato PDV -> Fiscal versionado;
- segredos/certificados não expostos;
- retries/timeouts definidos;
- auditoria completa;
- erros estruturados.

Dependências:

- decisão legal/técnica por documento/UF/regime;
- Sprint 2;
- dados fiscais configurados.

Riscos:

- regras variam por UF/regime;
- indisponibilidade externa;
- segurança de certificados;
- alto impacto legal.

Fora de escopo:

- especializações avançadas por segmento.

## Sprint 6: Segmentos

Objetivo: habilitar especializações por segmento sem poluir o core genérico.

Entregáveis:

- configuração de segmento;
- especialização mercado;
- restaurante/comandas como módulo inicial;
- ajustes de view por segmento;
- regras segmentadas isoladas.

Projetos afetados:

- `bff-jboot-platform/modules/pdv`;
- `app-jboot-next-platform/modules/pdv`;
- `app-jboot-pdv-mobile`.

Agents/skills envolvidos:

- backend platform: `pdv-domain`, `backend-node-typescript`, `platform-auth-context`;
- web/mobile: UI local;
- Architect se algum segmento exigir projeto próprio.

Critérios de aceite:

- core PDV permanece genérico;
- regra de segmento é isolada;
- UI varia por configuração;
- comandas não contaminam fluxo de varejo comum.

Dependências:

- Sprints 1 a 3;
- decisão de segmentação.

Riscos:

- transformar core em código cheio de condicionais;
- restaurante/comandas crescer e exigir produto separado;
- UX inconsistente entre segmentos.

Fora de escopo:

- delivery completo;
- KDS/cozinha avançado;
- produção industrial;
- marketplace.
