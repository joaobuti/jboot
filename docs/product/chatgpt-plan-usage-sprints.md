# ChatGPT Plan Usage No JBoot

Data: 2026-10-15. Estado: `planejamento confirmado — bloqueio externo de elegibilidade`.
Pedido humano: uso da assinatura ChatGPT Plus e obrigatorio como modalidade
primaria; API key/BYOK permanece opcional e nunca e fallback automatico.
Este planejamento nao representa OAuth ou inferencia implementados.

## Decisoes Humanas Confirmadas Em 2026-10-15

- `chatgpt_plan` e a modalidade primaria e obrigatoria do produto;
- `api_key` e modalidade opcional, com selecao e cobranca explicitas;
- agentes sao cadastrados e versionados no JBoot, com nome, provider/modelo,
  prompt e contrato de saida; Custom GPT nao e dependencia do fluxo;
- automacoes partem de gatilhos do Kanban, inclusive entrada e saida de coluna;
- entrada futura inclui dados permitidos do card/cliente e documentos anexados;
- o prompt descreve o resultado desejado e o modelo pode solicitar uma ou mais
  tools. A autoridade vem do `allowed_tools` versionado do agente, nunca do
  texto do prompt ou de documentos enviados como contexto;
- efeitos previstos incluem registrar texto, atualizar campos/movimentacao sob
  policy e gerar/anexar documento. O catalogo e os schemas definitivos ainda
  precisam ser fechados antes de codigo funcional desses efeitos.

## Fontes Oficiais Verificadas

- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://openai.com/form/sign-in-with-chatgpt-interest/

A documentacao publica diferencia identidade de permissao para usar a franquia.
Uso em aplicacao paga/remotamente hospedada exige ingresso no programa de
parceiros selecionados. O fluxo OSS/local nao autoriza enquadrar o SaaS JBoot
como instalacao local. Nao ha aprovacao comercial registrada neste repositorio.

## PO Scope

- Usuario vincula sua conta ChatGPT ao usuario JBoot autenticado e autoriza o
  uso de franquia elegivel, sem fornecer senha ou cookie ao JBoot.
- A conta ChatGPT e a modalidade primaria. API key e alternativa opcional e
  precisa de escolha explicita; ausencia/esgotamento do plano nunca inicia
  cobranca por API key automaticamente.
- Agentes continuam com nome/prompt versionados no JBoot, isolados por modulo.
- Cada versao do agente declara contrato de entrada, `allowed_tools`, schemas
  estritos e limites. O prompt pode orientar a escolha e a sequencia entre as
  tools autorizadas, mas nao criar handler, campo, URL ou autoridade.
- Em desenvolvimento, a conexao ChatGPT Plan designada pertence ao operador do
  projeto. Em producao, cada tenant designa uma identidade responsavel e
  autoriza expressamente seu grant para automacoes daquele tenant. Revogacao ou
  perda de elegibilidade pausa as regras vinculadas.
- Gatilhos do Kanban executam em background, com outbox transacional, e podem
  enviar apenas o snapshot allowlisted de card, cliente e anexos.
- A modalidade usada deve aparecer em configuracao e auditoria de execucao.
- Franquia esgotada, consentimento revogado ou assinatura inelegivel pausa o
  fluxo. Nenhum fallback para API key paga sem escolha explicita do usuario.
- Automacao em servidor/sem usuario presente precisa estar coberta pela
  autorizacao do parceiro; login interativo nao prova essa autorizacao.

## PE Decision / Gate

```yaml
execution_mode: cross_project
delivery_type: delegated_subscription_integration
target_projects:
  - implementations/svc-jboot-ai-gateway
  - implementations/app-jboot-next-platform
target_module: kanban
deployment_boundary_gate:
  classification: embedded_module
  host: svc-jboot-ai-gateway
  evidence: autoridade de credenciais e chamadas externas ja pertence ao gateway
stack_fit_gate: not_applicable_inherited_from_host
stack_decision: TypeScript/NestJS e Next.js dos hosts existentes
sprint_artifact: docs/product/chatgpt-plan-usage-sprints.md
sprint_gate: docs/product/chatgpt-plan-usage-sprints.md#gate-de-liberacao
human_confirmation: usuario autorizou iniciar a modalidade
blocking_status: waiting_for_openai_commercial_plan_usage_approval
open_questions:
  - aprovacao OpenAI para app pago e hospedado
  - client_id e contrato de scopes/callbacks da modalidade aprovada
  - permissao para automacoes server-side sem usuario presente
  - politica de armazenamento e renovacao de tokens para SaaS multi-tenant
  - catalogo inicial de tools, schemas, campos mutaveis e approval policy
  - contrato de documentos, tipos, limites, retencao e remocao no provider
```

Agents de planejamento: product-owner, product-engineer, architect.
Implementacao futura: ai-gateway-backend, ui-ux, frontend-next-typescript.
Skills: openai-docs, ai-first-governance, security-checklist,
byok-credential-vault e platform-crud-ui; dev-runtime-profile se alterar runtime.

## Arquitetura Prevista E Limites

- Provider continua `openai`; modalidade de autenticacao/cobranca e explicita.
  Nao reaproveitar access token como API key na tabela atual.
- Identity continua dono da sessao/permissoes JBoot. OAuth externo vincula
  uma conexao ao tenant/owner existentes, sem criar sessao Identity implicitamente.
- Gateway sera dono dos access/refresh tokens cifrados, expiracao, grants e
  renovacao. Frontend nunca recebe refresh token nem segredo de cliente.
- Conexao guarda modalidade, owner, tenant, conta/workspace autorizados,
  expiracao, estado, versao de chave e referencias de auditoria. Definicao final
  do schema depende do contrato do parceiro; nao ha migration neste incremento.
- PKCE, state e nonce vinculados ao usuario/sessao, TTL e uso unico;
  callbacks pre-registrados e redirect allowlist, sem URL arbitraria no payload.
- Verificacao de issuer/audience/assinatura/nonce do ID token, refresh
  transacional com protecao contra corrida, rotacao e revogacao.
- Adapter de franquia separado do executor BYOK. As limitacoes publicas de
  preview incluem streaming SSE, store false e campos diferentes do BYOK;
  o protocolo do parceiro aprovado prevalece. Nao assumir que max_output_tokens,
  catalogo de modelos ou billing sao iguais nas duas modalidades.
- O Kanban nunca envia segredo, prompt ou conteudo integral no job. A outbox
  guarda IDs, versoes e policy; o worker revalida e materializa um snapshot
  minimo imediatamente antes da chamada.
- Documentos saem do storage privado somente pelo backend autorizado. Para a
  Responses API, o gateway usa bytes/stream ou upload `purpose=user_data`, com
  exclusao e retencao conforme contrato; URL assinada interna nao deve ser
  exposta ao provider por default.
- Resultado de modelo e dado nao confiavel. O gateway valida cada tool call em
  modo estrito; o Kanban reautoriza e executa somente tools presentes no
  capability manifest da versao do agente.
- Geracao de documento deve separar conteudo de apresentacao: o modelo produz
  dados/texto estruturado e um renderer controlado pelo JBoot cria DOCX/PDF,
  salvo quando uma capability oficial de arquivo for aprovada e testada para
  aquele agente.
- Tokens, codigos OAuth, URLs com parametros sensiveis, prompts e respostas
  integrais ficam fora de logs/filas/telemetria.
- Sem novos endpoints, DTOs, fixtures externas ou claims de compatibilidade
  ate existir contrato aplicavel ao SaaS e resposta real capturada.

## Sprint A — Admissao E Contrato (Pendente)

Objetivo: tornar a integracao hospedada autorizada e tecnicamente verificavel.

Itens: submeter candidatura comercial; obter aprovacao especifica de plan usage;
confirmar automacoes server-side, scopes, client registration, callbacks,
tokens, quotas, dados e suporte; capturar respostas reais anonimizadas.

Aceite: evidencia de aprovacao e client_id registrado; contrato do fluxo
aprovado disponivel; questoes do gate decididas operacionalmente.

Fora de escopo: cadastro de senha, copiar tokens do browser/CLI, declarar SaaS
como OSS, automacao de navegador para consumir o chat, inferencia sem grant.

## Sprint B — Vinculo OAuth E Gestao Da Conexao (Pendente)

Objetivo: conectar/desconectar conta elegivel no CRUD padrao existente.

Itens: contratos HTTP e dados, consentimento, callback, token vault, refresh,
revogacao, scopes e auditoria; UI no platform-crud-ui, sem layout novo.

Aceite: testes de callback forjado/expirado/reutilizado, tenant/owner cruzados,
refresh concorrente, revogacao, falha parcial e ausencia de segredos em
resposta/log; type-check/build frontend e backend em container, security review,
API Graph e ai-conformance aprovados; E2E com conta real autorizada.

Fora de escopo: alterar o login Identity ou coletar login/senha do provedor.

## Sprint C — Execucao Pela Franquia (Pendente)

Objetivo: usar concessao autorizada para agente versionado do JBoot.

Itens: adapter dedicado, modelos da conta, SSE/cancelamento, validacao de
schema, consentimento e modalidade explicitos, quota/replay e erros de
assinatura/franquia; integrar ao fluxo de automacao somente se coberto pelo grant.

Aceite: fluxo real consentimento -> agente -> execucao -> ledger; quota
esgotada e revogacao falham sem fallback pago; nenhuma cobranca por BYOK e
iniciada implicitamente; tokens/contas/workspaces isolados; regressao dos
providers por API key continua aprovada.

Fora de escopo: garantir franquia ilimitada ou equivalencia de modelos/limites.

## Sprint D — Automacao Kanban E Efeitos Tipados (Pendente)

Objetivo: executar agente JBoot a partir de evento canonico do Kanban e aplicar
zero ou mais tool calls permitidas, auditaveis e idempotentes.

Fluxo: movimento/evento do card -> outbox na mesma transacao -> relay/worker ->
snapshot allowlisted -> AI Gateway -> Responses API -> tool calls estritas ->
reautorizacao/handlers Kanban -> resultados -> continuacao limitada do modelo.

Entregaveis: `execute_ai_agent` no motor existente; outbox duravel e DLQ;
idempotencia por evento+regra+versao; token s2s Identity; contratos versionados
de input/tool/output; registry fechado para atividade/texto, patch de campos,
movimentacao e documento; revisao humana configuravel por tool; painel
operacional e reprocessamento.

Aceite: indisponibilidade de fila/provider nao perde nem reverte a movimentacao;
retry nao duplica inferencia nem efeito; dados de outro tenant/board/escritorio
nao entram no snapshot; output nao executa tool fora do manifest autorizado;
documento gerado passa por renderer, storage, assinatura/tipo e auditoria antes
de ser anexado.

Bloqueio: nao implementar handlers funcionais antes de fechar o catalogo inicial
de tools, schemas, approval policies, campos permitidos e contrato de
documentos/dados do cliente.

## Gate De Liberacao

- [x] ChatGPT Plus confirmado como modalidade primaria obrigatoria.
- [x] API key/BYOK confirmado como modalidade opcional sem fallback automatico.
- [x] Agentes confirmados como recursos versionados do JBoot.
- [x] Automacao confirmada como gatilho Kanban server-side com efeitos variaveis.
- [ ] OpenAI aprovou o JBoot como app comercial/hospedado com plan usage.
- [ ] Client ID, callbacks, scopes e contrato de tokens estao registrados.
- [ ] Uso por automacoes em segundo plano foi confirmado expressamente.
- [ ] Politica de dados/tokens/retencao e limites de consumo aprovada.
- [x] Prompt confirmado como orquestrador de uma ou mais tools autorizadas.
- [x] Ownership confirmado: operador do projeto em desenvolvimento e identidade
      designada por tenant em producao.
- [ ] Catalogo inicial de tools, campos mutaveis e approval policy esta fechado.
- [ ] Contrato de card/cliente/anexos, tipos e limites esta fechado.
- [ ] Respostas reais anonimizadas e E2E disponiveis, sem fixtures inventadas.
- [ ] Contratos de projeto/modulo referenciam esta sprint antes de codigo.
- [ ] API Graph e controles de seguranca/gov validados no diff implementado.

Bloqueio atual: os tres primeiros itens dependem de informacao/admissao externa;
nao habilitar botao de conexao ou novo provider simulando funcionalidade pronta.

## Architecture Graph

Planejado: capabilities `chatgpt-plan-usage`, `kanban-ai-dispatch` e
`kanban-ai-effect-application`, lifecycle planned; arestas Platform Web ->
Gateway (links_subscription), Kanban -> Gateway (dispatches_agent_execution),
Gateway -> OpenAI OAuth (delegated_authorization), Gateway -> OpenAI Responses
(uses_plan_grant) e Gateway -> Kanban (submits_validated_result).
Provenance: este plano e futura aprovacao/contratos/E2E. Migrar nodes/edges ao
registry quando o Architecture Graph gate estiver operacional; nenhum claim
de sincronizacao integral e feito neste planejamento.
