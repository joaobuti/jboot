# Roadmap de Sprints: JBoot Jurídico

Produto: automação jurídica SaaS multi-tenant.
ADR: `docs/architecture/decisions/004-jboot-juridico.md`
Projetos: `bff-jboot-platform/modules/juridico`, `wrk-jboot-juridico`, `app-jboot-next-platform/modules/juridico`

> `app-jboot-juridico` e o BFF standalone foram substituidos por modulos da Platform. Frontend em `implementations/app-jboot-next-platform/modules/juridico`; backend em `implementations/bff-jboot-platform/modules/juridico` e runtime esperado em `src/modules/juridico`.
>
> **Estrutura de menus adotada:** cada portal tem sua própria rota e página (`/juridico/esaj`, `/juridico/projudi`, `/juridico/eproc`). Não existe página de overview com cards. `Captação` (`/juridico/captacao`) é o robô de busca de processos. Credenciais e consultas ficam dentro da página do portal correspondente.

---

## Sprint 1 — Fundação ✅ Concluída

**Objetivo:** Infraestrutura base e scaffolding dos projetos.

**Entregáveis concluídos:**
- `bff-jboot-platform/modules/juridico`: contrato criado; guard (`juridico-auth.guard.ts`), repositório e service de portais criados em `src/modules/juridico`.
- `wrk-jboot-juridico`: estrutura Python, Temporal worker conectado, activities base, shared contracts/errors, OTel com context propagation. Estrutura de adapters criada (`portals/esaj`, `portals/projudi`, `portals/eproc`) — adapters ainda vazios.
- Frontend: módulo em `app-jboot-next-platform/modules/juridico`. Rotas: `/juridico` (entrada), `/juridico/captacao`, `/juridico/esaj`, `/juridico/projudi`, `/juridico/eproc`. Seed de portais em `009_juridico.sql`.

---

## Sprint 2 — Portal Registry e Contratos de Tenant ✅ Concluída

**Objetivo:** Infraestrutura de portais no BFF e estrutura de navegação por portal no frontend.

**Encerrada com ajuste de escopo:** a ideia original de uma página de cards ativo/bloqueado foi substituída pela estrutura de menus com página dedicada por portal. O registry de portais (`GET /juridico/portais`) existe no BFF como base para sprints seguintes.

**Entregáveis concluídos:**
- `bff`: `JuridicoModule` registrado em `app.module.ts`; guard, repository e service de portais criados.
- `bff`: `GET /juridico/portais` retorna portais com flag `contracted` por tenant via `queryForDatabaseRef` (dedicated_db).
- `app`: páginas individuais por portal — `/juridico/esaj`, `/juridico/projudi`, `/juridico/eproc` — e captação em `/juridico/captacao`.
- `app`: sidebar com entrada por portal; `currentModule()` baseado em URL path.
- Seed de portais: esaj, projudi, eproc já em `009_juridico.sql`.

**Fora de escopo:** credenciais, scraping, controle de acesso por portal na UI.

---

## Sprint 3 — Credenciais e Configuração de Autenticação ✅ Concluída

**Objetivo:** Gestão segura de credenciais de portal por tenant.

**Entregáveis concluídos:**
- `bff`: `CryptoService` com AES-256-GCM, chave derivada de `HMAC-SHA256(JBOOT_SECRET, client_id)`, `encryption_key_ref = 'hmac-v1'`.
- `bff`: `GET /juridico/credenciais/:portalSlug` — status (configured, authType, updatedAt). Nunca retorna valores.
- `bff`: `PUT /juridico/credenciais/:portalSlug` — upsert criptografado, suporta `user_pass` e `token`.
- `bff`: `DELETE /juridico/credenciais/:portalSlug` — remoção com audit log.
- `bff`: audit log em `juridico_audit_events` para criação, atualização e remoção — payload sem valores de credencial.
- `app`: `CredenciaisSection` componente com formulário adaptativo por `authType`, sem exibição de senha após salvar.
- `app`: seção de credenciais em `/juridico/esaj`, `/juridico/projudi`, `/juridico/eproc`.

**Critérios atendidos:**
- Credencial salva nunca retornada em plaintext por API.
- Credencial nunca aparece em log de aplicação.
- Audit log registra criação e atualização sem o valor da credencial.

**Fora de escopo:** uso das credenciais em scraping (sprint 4).

---

## Sprint 4 — Captação de CPFs e Primeiro Robô ✅ Concluída

**Objetivo:** Importação de lista de CPFs, agendamento de consulta por portal e primeiro robô funcional.

**Status (2026-07-17):** primeiro robô implementado foi o do portal eProc, já funcionando em produção/dev. ESAJ e Projudi ficaram para a Sprint 5.

**Banco (novas tabelas no banco dedicado do cliente):**
```sql
juridico_captacao_cpfs
  id, client_id, cpf, created_at
  UNIQUE (client_id, cpf)          -- importação duplicada ignorada via ON CONFLICT DO NOTHING

juridico_captacao_imports
  id, client_id, uf, filename, created_by, created_at

juridico_captacao_import_cpfs
  import_id (FK), cpf_id (FK)

juridico_captacao_consultations
  id, cpf_id (FK), portal_id (FK), import_id (FK), client_id, uf
  keyword_filter_snapshot
  result_window_years_snapshot
  status: pending | done | error
  last_consulted_at (nullable)     -- usado para respeitar periodicidade do agendamento
  error_message (nullable)
  updated_at
  UNIQUE (cpf_id, portal_id, import_id)
```
Ao importar uma planilha, cria-se um lote com UF. A UF define os portais elegíveis e cria uma linha por CPF/portal contratado para aquela UF com `status = pending`.
Retroativo (CPFs já importados + novo portal contratado) é ação manual futura, não automática.

**`bff`:**
- `POST /juridico/captacao/import` — parseia CSV/XLS/XLSX, insere CPFs (`ON CONFLICT DO NOTHING`), cria `captacao_consultations` para portais contratados.
- `GET /juridico/captacao` — lista CPFs com status de consulta por portal.
- `GET /juridico/captacao/config` + `PUT /juridico/captacao/config/:portalSlug` — CRUD de periodicidade de agendamento por portal (usa `juridico_scheduling_configs` existente).
- Despacho de workflow Temporal para o portal do primeiro robô.

**`wrk`:**
- Workflow de captação: busca `captacao_consultations` com `status = pending` (ou `last_consulted_at` expirado pela periodicidade), consulta o portal, grava resultado em `juridico_processes`, atualiza `status` e `last_consulted_at`.
- Primeiro portal a implementar: definir entre ESAJ ou Projudi (menor complexidade de anti-bot).
- Falhas estruturadas: `AuthExpiredError` e `CaptchaDetectedError` não-retryable; demais com backoff 1min/5min/25min.
- Credencial descriptografada em memória durante a sessão, descartada após.

**`app`:**
- `/juridico/captacao` — botão de importação de arquivo (CSV/XLS/XLSX), tabela de CPFs importados com status por portal (pending/done/error), data da última consulta.
- Configuração de periodicidade por portal dentro da página do portal (`/juridico/esaj`, `/juridico/projudi`, etc.).

**Critérios de aceite:**
- CPF duplicado na importação é silenciosamente ignorado.
- Robô não re-consulta um CPF antes de expirar a periodicidade configurada.
- Resultado armazenado em `juridico_processes` com `portal_id` e `cpf_query` corretos.
- Credencial nunca persiste em memória após a execução do workflow.
- Falha de autenticação retorna `WorkflowResult` estruturado, não exceção solta.

**Fora de escopo:** robôs dos demais portais (Sprint 5), retroativo de portais novos, consulta por número de processo.

---

## Sprint 4.5 — UF, Filtros e Persistência do Resultado eProc ✅ Concluída

**Objetivo:** Amarrar captação por UF/lote e persistir resultados brutos filtrados do eProc.

**Decisões:**
- Cada upload de planilha pertence a uma única UF.
- O mesmo CPF pode aparecer em múltiplos lotes/UFs.
- A UF define quais portais são elegíveis para consulta.
- Consulta manual é ferramenta de teste/pontual:
  - recebe CPF específico opcional;
  - recebe termo de busca opcional;
  - se CPF vier vazio, consulta até 5 pendências.
- Em tela/rota de portal especifico, o portal e definido pelo contexto da aba. Nao exibir seletor de portal no robo manual dessas telas.
- Se uma consulta manual multiportal for necessaria, criar tela/fluxo agregador proprio com contrato explicito.
- Quando uma decisao exigir supor regra de negocio, UX, seguranca ou persistencia, solicitar validacao do usuario antes de implementar.
- Se houver termo, o JSON bruto inteiro é pesquisado e só é persistido se houver match.
- Matches devem registrar caminho/chave/valor/posição em `match_data`.
- Se não houver termo, persistir apenas processos com data de autuação nos últimos 5 anos.

**Persistência:**
- Resultado bruto do portal: `juridico_processes.raw_data`.
- Metadados do match: `juridico_processes.match_data`.
- Data de autuação normalizada: `juridico_processes.data_autuacao`.
- Parâmetros usados na consulta devem ficar como snapshot em `juridico_captacao_consultations`.

**Agendamento futuro:**
- Tela de agendamento deve permitir UF/portal, termo opcional e janela de anos.
- Consultas geradas por agendamento devem copiar esses parâmetros para snapshots.

---

## Sprint 5 — Robôs dos Portais Restantes

**Objetivo:** Estender captação para todos os portais contratados.

**Status (2026-07-17):** pendente. Falta implementar os robôs de ESAJ e Projudi (eProc já concluído na Sprint 4).

**Entregáveis:**
- `wrk`: adapter para ESAJ e Projudi (eProc já implementado na Sprint 4).
- `bff`: sem alterações de contrato — o mesmo workflow e endpoints do Sprint 4 já suportam N portais.
- `app`: status de consulta por portal atualizado em tempo real na tela de captação.

**Critérios de aceite:**
- Todos os portais contratados têm robô funcional de consulta por CPF.
- `captacao_consultations` reflete o estado correto por portal após cada execução.

---

## Sprint 6 — Consulta por Número de Processo

**Objetivo:** Consulta de andamento de processos já conhecidos.

**Entregáveis:**
- `wrk`: activity `search_by_process_number` por portal.
- `bff`: endpoint para disparar consulta por número, armazenamento de andamentos em `juridico_process_updates`.
- `app`: histórico de andamento dentro da página do portal correspondente.

**Critérios de aceite:**
- Consulta por número retorna andamentos novos do processo.
- Histórico exibido em ordem cronológica.

---

## Sprint 7 — Notificações e Hardening

**Objetivo:** Observabilidade de falhas e resiliência operacional.

**Entregáveis:**
- `bff`: notificações in-app em `juridico_portal_notifications` para falhas após backoff esgotado; endpoint de leitura/marcação como lida.
- `app`: badge de notificações não lidas no menu; painel de notificações por portal.
- Monitoramento de taxa de erro por portal; alertas para indisponibilidade.
- Avaliação de IP fixo ou proxy se necessário.

**Fora de escopo:** novos produtos ou integrações externas.

---

## Sprint PJE-1 — Comunicações DJEN (Comunica PJe/CNJ)

**Objetivo:** capturar comunicações processuais do Diário de Justiça Eletrônico Nacional pela API
pública do CNJ, sem scraping.

**Status (2026-08-04):** concluída.

**Decisões de arquitetura:**

- A consulta DJEN é pública. O `POST /api/v1/login` da API é exclusivo dos tribunais (conta SCA/CNJ)
  e retorna `403 Credenciais invalidas` para credenciais de portal PJe — verificado contra o
  endpoint real. Logo, o fluxo de consulta não usa credencial.
- A credencial do portal `pje` continua disponível na tela, cifrada por tenant, apenas para escopos
  autenticados futuros. Em dev ela é semeada a partir do `.env` por
  `make juridico-pje-seed-credentials`; nunca versionada.
- Execução no `wrk-jboot-juridico` (decisão humana), reaproveitando o padrão de fila do eProc.

**Entregáveis:**

- `wrk`: `src/portals/pje/` com cliente HTTP (rate limit e backoff), parser, repositório e fila de
  sincronização exposta no router FastAPI da porta 8020.
- `bff`: `src/modules/juridico/pje/` com configuração de monitoramento, listagem paginada e
  orquestração dos jobs.
- `app`: menu **PJE**, rota `/juridico/pje`, configuração de filtro, sincronização com
  acompanhamento e listagem com detalhe do teor.
- `db`: `037_juridico_pje_comunicacoes.sql` com `juridico_pje_monitoring_configs`,
  `juridico_pje_comunicacoes` e `juridico_pje_sync_jobs`, mais seed do portal `pje`.

**Critérios de aceite:**

- Sincronização com filtro válido persiste as comunicações do período. ✔
- Reexecução não duplica: dedupe por `hash` do CNJ, com fallback determinístico. ✔
- Estouro de rate limit vira espera contabilizada no job, não erro ao usuário. ✔
- Consulta sem filtro discriminante é recusada antes de chegar à rede. ✔

**Fora de escopo (próximas sprints):**

- Vínculo automático com `juridico_processes` e geração de `juridico_process_updates`.
- Download de certidão (`/comunicacao/{hash}/certidao`) e cadernos diários.
- Agendamento recorrente via `juridico_scheduling_configs`.
