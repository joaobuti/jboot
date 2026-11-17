# ADR 014: Automacao Da Analise Do Lead No Flow (Escritorios, Geracao `.docx`/PDF, Gatilho, Outbox E IA Agnostica De Provedor)

```yaml
date: 2026-10-11
status: accepted (2026-10-12; escolha de provedor de LLM e fronteira de leitura pendentes do eval, ADR complementar)
decision_owner: human
human_confirmation: partial (2026-10-11 - escritorios N:N, PDF na primeira entrega, fluxo da IA e chave do cliente confirmados pelo usuario; ver "Status E Confirmacao")
project: implementations/bff-jboot-platform
module: modules/kanban
consumers: implementations/app-jboot-next-platform/modules/kanban
deployment_boundary: embedded_module (S3.5-S6, S8, S9); S7 condicionada a P5/P4/P8; PDF = independent_unit de infra (Gotenberg), aprovado
sprint_artifact: docs/product/flow-crm-leads-sprints.md
sprint_gate: docs/product/flow-crm-leads-sprint-4-9-gate.md
related_adr: 003-jboot-platform-modular-monolith, 013-customer-core-auxiliary-tables
```

## Contexto

O CRM de leads do Flow substitui o canal WhatsApp/Drive do cliente juridico.
A primeira fase entregue exige: envio completo pelo escritorio, fila do gestor,
leitura dos documentos, classificacao do caso e documento gerado a partir dos
modelos do cliente, com revisao humana (Sprints 4 a 9 do sprint artifact).

Estado do host relevante para a decisao:

- `platform-api` e um monolito modular (ADR 003); o `kanban` usa banco
  dedicado por tenant (`database_ref`), bucket MinIO proprio
  (`kanban-card-attachments`, chave prefixada por `client_id`) e uma fila
  BullMQ/Valkey (`kanban-column-automation`) consumida por worker in-process.
- O enqueue da automacao por coluna e fire-and-forget: se o Valkey falhar
  depois do commit, o job se perde. Isso e aceitavel para e-mail, nao para a
  analise do lead (lead ficaria parado em `enviado`).
- `src/ai` nao existe; o `MODULE_CONTRACT.md` do kanban proibe IA no modulo.
- Provedor de IA, fronteira da leitura e base legal (P5) nao estao decididos.

## Decisao 1: Geracao `.docx` (G1, PE9)

### Biblioteca

`docxtemplater` (core open source, licenca MIT; versao verificada em
2026-10-11: 3.71.0) com `pizzip` (dual `MIT OR GPL-3.0`; usado sob MIT).
Versao exata fixada na implementacao, com `npm audit` (inclui `@xmldom/xmldom`).

Licenca por recurso (verificado no pacote publicado e na FAQ oficial):

| Recurso | Onde | Necessario na fase 1 |
|---|---|---|
| Variavel, laco (`{{#lista}}`), condicional (`{{#flag}}`/`{{^flag}}`) | core MIT | sim (N casos/contratos, P3) |
| Inspecao de tags (`docxtemplater/js/inspect-module`) | core MIT (arquivo no pacote npm) | sim (deteccao no upload) |
| Delimitadores customizados | core MIT | sim |
| Imagem dinamica, HTML, XLSX, graficos | modulos PRO pagos | nao |

Imagens estaticas do modelo (logo, assinatura digitalizada) sao preservadas
pelo core. Inserir imagem por variavel (ex.: foto do documento no corpo) exige
modulo pago ou outra abordagem e fica fora da fase 1; se surgir, reabre G1.

### Alternativas rejeitadas

| Alternativa | Motivo |
|---|---|
| `docx-templates` | Executa JavaScript embutido no modelo; o modelo e entrada do tenant (nao confiavel) |
| `carbone` | Licenca propria e dependencia de LibreOffice em varios recursos |
| `docxtpl` (Python) | Segundo runtime sem ganho com um consumidor e saida `.docx` |
| `easy-template-x` (MIT) | Viavel; menor ecossistema de inspecao e tratamento de erro multiplo. Fica como fallback se o core do docxtemplater mudar de licenca |
| Montar o XML do Word manualmente | Variavel quebrada em varios "runs" do Word torna isso fragil |

### Seguranca com modelo enviado pelo cliente

- Sem parser de expressoes (`angular-expressions` proibido). Parser proprio
  aceita apenas caminho `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$` e resolve
  somente contra o catalogo de variaveis em codigo; nada e executado.
- Tag de XML bruto (`{{@...}}`) proibida: rejeitada no upload. Valores sao
  sempre inseridos como texto escapado (comportamento padrao do core), logo
  dado do cadastro ou da IA nao injeta XML.
- Aceitar so `.docx` (assinatura ZIP ja verificada por T5 +
  `[Content_Types].xml` de documento Word). Rejeitar `.docm`/`.dotm` e
  qualquer pacote com `vbaProject.bin`, `activeX` ou objeto OLE embutido.
- Relacionamentos externos (`TargetMode="External"`): hyperlink permitido;
  `attachedTemplate` gera aviso; imagem ou objeto vinculado externamente
  rejeitado (evita rastreamento/vazamento ao abrir o documento gerado).
- Limites anti zip-bomb antes de inflar: ler o diretorio central, recusar se
  numero de entradas, soma descomprimida declarada ou razao de compressao
  passarem do limite, e abortar a descompressao se o tamanho real exceder o
  declarado. Limites propostos (configuraveis): 10 MB comprimido, 50 MB
  descomprimido, 2.000 entradas, razao 100:1. Os limites de anexo
  (`assertAttachmentFileAllowed`) continuam valendo; estes sao adicionais.
- O parser XML (`@xmldom/xmldom`) nao resolve entidade externa nem faz rede;
  o core declara nao usar `fs`/`http`/`eval`. Mesmo assim, compilar e
  renderizar com timeout e fora do caminho de leitura de outros tenants.
- Chave de objeto sem nome de arquivo (nome de arquivo pode conter dado
  pessoal); nome original so no banco.

### Sintaxe unica de variavel

Delimitador duplo `{{` `}}`, chaves em portugues `snake_case` com namespace:

```text
{{cliente.nome}}  {{cliente.cpf}}  {{cliente.data_nascimento}}
{{caso.tipo}}     {{escritorio.nome}}  {{data.hoje_extenso}}
{{#contratos}}{{numero}} - {{banco}}{{/contratos}}     (laco, so colecoes do catalogo)
{{#cliente.hipossuficiente}}...{{/cliente.hipossuficiente}}  (condicional, so booleanos do catalogo)
```

- Motivo do delimitador duplo (diverge da proposta do PE `{campo}`): chave
  simples aparece em texto juridico e em colagens; duplo reduz falso
  positivo na deteccao e e reconhecivel por quem edita no Word.
- Sem filtros/formatacao no modelo (exigiriam parser de expressao). A
  formatacao vem pronta do catalogo (CPF com mascara, data `dd/mm/aaaa`,
  variantes `_extenso` quando o cliente pedir).
- Namespaces: `cliente.*` (nucleo + `customer_juridico`), `caso.*`,
  `escritorio.*` (cadastro do escritorio do card, Decisao 6; fase 1 so `escritorio.nome`, P29), `data.*`, `extraido.<tipo_documental>.*` (S9).
- Catalogo versionado em codigo; cada versao de modelo grava a versao do
  catalogo contra a qual foi validada.

### Validacao e deteccao no upload do modelo

Pipeline sincrono no upload (S5), em ordem, falha fechada:

1. assinatura/tipo (T5) e limites anti zip-bomb;
2. checagem de pacote (macro, OLE, relacionamentos externos);
3. compilacao com delimitadores `{{ }}`; erros multiplos do core (tag nao
   fechada, laco sem fim, tag duplicada) devolvidos como lista (422
   `template_invalid` com posicao/trecho do modelo, nunca dado de cliente);
4. inspecao (`inspect-module`): lista estruturada de tags com tipo
   (placeholder, laco, condicional, raw);
5. cada tag checada contra a gramatica e o catalogo: `raw` = rejeitado;
   fora da gramatica = rejeitado; desconhecida = versao salva com status
   `invalid_variables` e inutilizavel na geracao (criterio da S5); laco sobre
   nao-colecao ou condicional sobre nao-booleano = rejeitado;
6. varredura de texto por padroes proximos (`{cliente.nome}`, `{{ cliente.nome}`)
   como aviso de digitacao;
7. renderizacao de prova com dados sinteticos do catalogo (garante que o modelo
   renderiza antes de chegar a um lead real);
8. gravacao: `sha256`, versao do catalogo, variaveis detectadas; o gestor marca
   cada variavel como obrigatoria ou opcional (default: obrigatoria).

Na geracao (S6): obrigatoria sem valor bloqueia antes de renderizar e lista os
campos; opcional sem valor sai como `[PREENCHER: <campo>]` via `nullGetter`.
A geracao e servico de dominio sincrono no request (milissegundos) na S6 e o
mesmo servico e chamado pelo worker na S9.

## Decisao 2: PDF (G2) — Revista Em 2026-10-11

O usuario decidiu PDF ja na primeira entrega (S6). Rascunho continua so em
`.docx`; o PDF e gerado a partir do `.docx` aprovado (e de cada substituicao
aprovada).

### Deployment Boundary

`independent_unit` de infra: conversao fiel de `.docx` exige LibreOffice
(binario nativo, picos de CPU/memoria, parsing de arquivo nao confiavel), que
nao pode entrar no processo `platform-api` (segundo runtime no host; deploy
compartilhado com PDV, juridico e comanda, ADR 003). Sem codigo proprio: so
configuracao de container.

### Stack Fit Gate

| Candidato | Avaliacao | Decisao |
|---|---|---|
| Gotenberg, imagem so LibreOffice (`-libreoffice`) | API HTTP pronta, Apache-2.0, sem Chromium (menor superficie), restart do LibreOffice a cada N conversoes, fila limitavel, healthcheck | Escolhido |
| Container proprio LibreOffice + `unoserver` + API minima | Mesmo motor, mas imagem e codigo proprios para manter e corrigir CVE | Rejeitado: custo de manutencao sem ganho |
| Collabora/OnlyOffice (servidor de documentos) | Pesado, licenca (OnlyOffice AGPL) e escopo de editor que nao usamos | Rejeitado |
| `docx -> html -> pdf` (mammoth + Chromium) | Perde layout de peca juridica (cabecalho, numeracao, tabelas) | Rejeitado |
| API comercial de conversao | Documento pessoal para mais um terceiro | Rejeitado |
| `soffice` como processo filho no container `jboot` | Segundo runtime no processo compartilhado | Rejeitado pelo Deployment Boundary |

`baseline_considered`: nao ha conversor no repositorio. `counterfactual_choice`:
Gotenberg LibreOffice-only, igual a recomendacao.

### Container

- Imagem: `gotenberg/gotenberg:8.37.0-libreoffice` (publicada em 2026-09-11),
  fixada tambem por digest no compose de producao. Atualizacao mensal ou por
  CVE do LibreOffice, com o teste de fidelidade da S6 como regressao.
- Flags: `--api-disable-download-from`, `--webhook-disable`,
  `--api-enable-basic-auth` (usuario/senha por env, segredo fora do git),
  `--api-timeout=60s`, `--libreoffice-max-queue-size=10`,
  `--libreoffice-restart-after=10`, log sem corpo de requisicao.
- Rede: rede Docker dedicada `jboot-pdf-internal` com `internal: true` (sem
  rota para fora); o `gotenberg` so participa dela; o servico `jboot`
  participa dela e da rede padrao. Nenhuma porta publicada no host (dev e
  VPS). O LibreOffice nao consegue buscar conteudo vinculado externo; a
  validacao do modelo (Decisao 1) ja rejeita vinculo externo.
- Recursos: `cpus: 1.0`, `mem_limit: 1g`, `pids_limit: 256`, `read_only: true`
  com `tmpfs` em `/tmp`, `cap_drop: [ALL]`, `security_opt:
  [no-new-privileges:true]`, usuario nao-root da imagem. Healthcheck
  `GET /health`.
- Fontes: os modelos do cliente podem usar fontes que a imagem nao tem (ex.:
  fontes do Office). Levantar as fontes dos modelos reais na S6; se faltar
  fonte, imagem derivada versionada (`FROM` fixado + fontes com licenca que
  permita o uso) em vez de aceitar substituicao silenciosa.

### Chamada pelo bff

- Assincrona, com o mesmo padrao de outbox da Decisao 3: aprovar grava
  `pdf_status = 'pending'` no documento gerado na mesma transacao (a linha e o
  registro de outbox); fila dedicada `kanban-document-pdf`, worker in-process
  com concorrencia 1 (o LibreOffice do Gotenberg converte em serie);
  varredura periodica reenfileira `pending` antigo. A S6 entrega o padrao
  outbox/relay, reutilizado pela S7.
- Requisicao: `POST http://gotenberg:3000/forms/libreoffice/convert`,
  multipart com o `.docx` aprovado lido do MinIO, nome de arquivo generico
  (`document.docx`, nunca o nome original), basic auth, timeout 60 s, `fetch`
  nativo do Node (sem SDK). Env: `JBOOT_PDF_CONVERTER_URL`,
  `JBOOT_PDF_CONVERTER_USER`, `JBOOT_PDF_CONVERTER_PASSWORD`.
- Resposta: PDF conferido pela assinatura `%PDF-`, gravado em
  `{client_id}/{card_id}/generated/{generated_document_id}.pdf` com `sha256`
  e vinculo ao `.docx` de origem. Idempotente por documento: nova tentativa
  nao cria segundo arquivo quando ja existe PDF `done`.
- Falha: ate 3 tentativas com backoff; depois `pdf_status = 'failed'`
  ("PDF pendente" para o gestor, com "Gerar PDF novamente"); a aprovacao e o
  `.docx` nunca sao desfeitos (criterio da S6).

### Dev Runtime Profile E VPS

- `docker-compose.yml`: servico `gotenberg` (acima), rede `jboot-pdf-internal`
  (`internal: true`), `jboot` anexado a ela, envs `JBOOT_PDF_CONVERTER_*` no
  servico `jboot` derivadas do compose (nunca URL literal no codigo).
- `tools/code-up.sh`: target novo `kanban-leads` = `postgres valkey jboot
  jboot-fiscal minio gotenberg` (CRM de leads completo); `kanban` e
  `kanban-attachments` inalterados; `gotenberg` entra como proibido por padrao
  nos demais targets. Documentado com a skill `dev-runtime-profile` no
  contrato do modulo na S6.
- VPS (Hostinger KVM 8, Sao Paulo, na contratacao): mais um container sem
  estado, sem volume e sem porta publica, dentro de 1 vCPU / 1 GB; segredo do
  basic auth no mecanismo de segredos do deploy; atualizacao de imagem no
  runbook mensal.

## Decisao 3: Estado Do Lead, Gatilho, Outbox E Fila (G5, PE4, PE5)

### Estado

Estado da analise em campo proprio (`kanban_card_leads.status`), nunca
derivado da coluna: a regra de envio completo nao pode depender de o cliente
configurar colunas (R1). Coluna e estado sao independentes; automacao por
coluna nao altera o estado do lead.

### Gatilho

Ato funcional "Enviar para analise" (S4). A partir da S7, a mesma transacao do
envio cria a execucao da analise. Reprocessamento manual do gestor usa o mesmo
mecanismo. `action_type` de coluna rejeitado como gatilho principal
(contraria R1 e dividiria concorrencia/retry com e-mail).

### Outbox transacional (escolhido) e nao reconciliacao

A linha de execucao `kanban_lead_analysis_runs` (banco do tenant), criada com
`status = queued` na mesma transacao do envio/reprocessamento, e o registro de
outbox. Nao ha tabela de outbox separada.

Relay em duas vias:

1. apos o commit, enqueue imediato em `kanban-lead-analysis` com
   `jobId = run_id` (dedup nativo do BullMQ);
2. varredura periodica (BullMQ repeatable job, mesmo padrao do Sprint 9, 1-2
   min) por tenant ativo do Flow (`listActiveFlowTenants`), reenfileirando
   runs `queued` mais antigos que o limiar e runs `running` com lease vencido.

Motivo da escolha: a outbox grava a intencao atomicamente com o fato que a
gerou. A reconciliacao pura ("lead `enviado` sem run") infere intencao a partir
do estado de dominio: nao cobre reprocessamento manual (o lead nao esta em
`enviado`), precisa reimplementar cada regra de disparo na varredura e nao
distingue "nunca enfileirado" de "nao deveria processar" (IA desligada no
tenant, limite do cliente atingido, sem chave). A varredura continua existindo, mas so como relay
de linhas explicitas, nao como fonte de verdade.

### Idempotencia

- Run: `UNIQUE (client_id, submission_id, input_hash) WHERE trigger = 'auto'`;
  reprocessamento manual cria run novo (`trigger = 'manual'`) e nunca apaga o
  anterior (S9: reprocessar gera nova versao).
- `input_hash` = sha256 de (sha256 dos documentos usados, snapshot do cadastro,
  versao do pipeline, versoes de prompt/schema, modelo). Resultado com hash
  diferente do estado atual = "desatualizado" (R2).
- Claim no banco: `UPDATE ... SET status='running', lease_until=now()+X WHERE
  id=$1 AND (status='queued' OR (status='running' AND lease_until < now()))`.
  Reentrega do BullMQ, job stalled ou relay duplicado nao executam em paralelo.
- Etapa: cada etapa persiste resultado com `(run_id, etapa, document_id)` unico.
  Retentativa retoma da etapa que falhou; etapa ja concluida com o mesmo
  `input_hash` nao chama o provedor de novo (nao paga duas vezes).
- Payload do job: somente `{ databaseRef, clientId, runId }`. Nenhum
  conteudo, nome de arquivo ou dado pessoal no Valkey.

### Retentativas

| Classe | Exemplos | Politica |
|---|---|---|
| Transitoria | timeout, rede, 429, 5xx | ate 3 tentativas por etapa, backoff exponencial com jitter, respeita `Retry-After` |
| Saida invalida | JSON fora do schema | 1 nova tentativa; depois falha `invalid_output` |
| Circuito aberto | provedor degradado | run volta a `queued` com atraso, sem consumir tentativa, ate o prazo do run |
| Permanente | credencial invalida, sem saldo/cota, conteudo recusado, limite do cliente atingido, documento acima do limite | sem retry; falha imediata com codigo |

Prazo total por run (proposta: 15 min, configuravel); vencido, a varredura
marca `falha_processamento` (`deadline_exceeded`).

### Concorrencia

- Fila dedicada `kanban-lead-analysis`, worker in-process proprio (nao divide
  a fila de e-mail).
- Concorrencia por processo: 2 (env). Limitador global do BullMQ (OSS) para
  o RPM do provedor.
- No maximo 1 run `running` por `client_id` (checado no claim; se ocupado,
  job adiado): impede que um tenant monopolize o worker. Grupos por tenant
  do BullMQ sao recurso pago (BullMQ Pro) e nao serao usados.
- Memoria limitada por concorrencia x 25 MB por documento; documentos
  processados um a um dentro do run.

### Estado de falha visivel ao gestor

`falha_processamento` no lead + `error_code` no run (`provider_unavailable`,
`credencial_invalida`, `saldo_insuficiente`, `limite_atingido`, `invalid_output`, `deadline_exceeded`, `document_too_large`,
`internal_error`), etapas concluidas e horario. A fila do gestor filtra por
falha; o painel mostra mensagem pt-BR por codigo e botao "Reprocessar"
(limitado por lead/dia e pelo limite opcional do cliente). Notificacao in-app ao gestor na
falha. Documento ilegivel ou de tipo errado nao e falha: e resultado da leitura
(pendencia, R5). Falha nunca altera cadastro, documentos ou classificacao ja
confirmada.

### IA orquestradora = pipeline deterministico

`ler -> extrair -> classificar -> gerar rascunho`, ordem fixa em codigo. O
modelo de linguagem nao recebe tools, nao escolhe a proxima etapa e nao
escreve no banco; o codigo valida a saida e decide. Temporal e LangGraph
rejeitados na fase 1 (3-4 etapas, espera humana modelada como estado no banco,
sem timer longo); reavaliar se houver mais de 5 etapas ou espera temporizada.

## Decisao 4: Armazenamento De Modelos E Documentos Gerados (PE8)

Mesmo bucket do modulo (`kanban-card-attachments`), prefixos proprios e
tabelas proprias, fora do feed do card:

```text
{client_id}/templates/{template_id}/{version_id}.docx
{client_id}/{card_id}/generated/{generated_document_id}.docx
```

- Objeto imutavel: versao nova = chave nova; nunca sobrescrever. Exclusao
  logica no banco; expurgo fisico segue a politica de P18/B5.
- `kanban_document_template_versions` imutavel (`sha256`, versao do catalogo,
  status de validacao). Versao referenciada por documento gerado nunca e
  removida.
- `kanban_card_generated_documents.template_version_id` (FK) + `sha256` do
  modelo no momento da geracao + `filled_variables` (valor e origem de cada
  variavel) + `ai_run_id` quando houver: rastreabilidade de R7. O `sha256` do
  modelo e conferido ao ler o objeto antes de gerar.
- Bucket novo rejeitado: mesmas credenciais e mesmo processo nao trazem
  isolamento adicional; o isolamento real e a chave gerada no servidor com
  prefixo do tenant. Custo: provisionamento, env e target de runtime extras.
  Reabrir se P18 exigir politica de retencao/WORM ou chave de criptografia
  diferente por tipo de objeto que nao possa ser feita por prefixo.

## Decisao 5: Arquitetura De IA Agnostica De Provedor (G3, G4, PE6, PE11-PE13)

O provedor **nao** e escolhido nesta ADR. Depende de P5 (base legal e
exigencias do escritorio), P4 (amostra e campos), P7, P8 e P19, e sera
decidido pela avaliacao comparativa abaixo, registrada em ADR complementar.

### Fronteiras

```text
src/ai/                         (projeto bff, compartilhado; criado na S7)
  providers/   porta LlmProvider + um adaptador por provedor (unico lugar com SDK)
  gateway/     politica: limite do cliente, credencial do tenant, rate limit, circuit breaker, timeout,
               telemetria, redacao de log; allowlist de chamadores
  evals/       harness de avaliacao (execucao so com autorizacao: gera custo)
src/modules/kanban/ai/          (dominio)
  prompts/     prompts versionados (system separado de user)
  schemas/     schemas de saida (extracao, classificacao)
  pipeline/    etapas do pipeline deterministico
```

Porta minima `LlmProvider`: `generateStructured({ system, parts[texto|pdf|imagem],
schema, modelProfile, timeoutMs }) -> { output, usage, model, latencyMs,
providerRequestId }` + `capabilities` (entradas aceitas, limite de bytes,
regiao, retencao declarada). Nenhum modulo importa SDK de provedor.

### Contrato de saida por schema

- Fonte unica de schema gera o JSON Schema enviado ao provedor e o validador
  local (biblioteca decidida na S7; requisito, nao preferencia). A saida e
  sempre revalidada localmente, mesmo com "modo estrito" do provedor.
- Extracao: por campo `{ value | null, page, evidence, confidence }`, mais
  `document_type_detected` e `legible`. Campo ausente = `null`. Validacoes
  pos-modelo: digito verificador de CPF, datas validas, `evidence` precisa
  existir na camada de texto quando o PDF tiver texto (anti-alucinacao).
- Classificacao: `case_type_id` em enum gerado por requisicao com os tipos
  ativos do tenant + `none`; `confidence`; evidencias como referencias a
  campos extraidos (ids), nao texto livre.
- Saida nunca e executada nem escrita direto no cadastro; vira sugestao em
  tabela propria, lida so pelo gestor.

### Pseudonimizacao na classificacao

A extracao precisa ver o documento (nao ha como pseudonimizar a imagem) e e
governada por P5. A classificacao recebe apenas atributos necessarios
(especie de beneficio, banco, contratos com valores/datas, flags) com
identificadores substituidos por tokens (`PESSOA_1`, `BENEFICIO_1`); o mapa
fica so em memoria do job. Se P1 mostrar criterios deterministicos, regra em
codigo primeiro e LLM so no residual.

### Credencial, limite e rate limit por `client_id` (revisto em 2026-10-11)

Decisao do usuario (R10): cada cliente usa a propria API key e paga direto ao
provedor; a JBoot nao tem teto proprio nem chave de reserva. Consequencias:

- Nao existe chave de provedor da JBoot no ambiente; o adaptador e construido
  por chamada com a credencial do tenant, entregue pela porta `CredentialPort`
  (implementada pelo kanban). Nenhum cliente HTTP global com chave.
- Endpoint do provedor fixo em codigo por adaptador; o cliente escolhe o
  provedor entre os suportados (P32), nunca informa URL (evita SSRF e desvio
  de dado).
- Ledger em `kanban_ai_calls` (tokens, custo estimado so informativo,
  latencia) e configuracao em `kanban_ai_settings`. A antiga `BudgetPort` vira
  `UsagePolicyPort`: limite opcional do cliente em numero de analises por mes
  (P31), contado no banco antes de enfileirar/chamar; atingido = sem chamada,
  codigo `limite_atingido`; alertas in-app em 80% e 100%.
- Rate limit por `client_id` (token bucket em Valkey) + limite global do
  provedor, mantidos como controle tecnico (PE12 revista): protegem o worker
  compartilhado e evitam martelar o provedor.
- Chave invalida/revogada (401/403) ou sem saldo/cota: falha imediata sem
  retry (`credencial_invalida`, `saldo_insuficiente`), status gravado no
  tenant e circuito do tenant aberto ate a troca da chave; leads seguem pelo
  fluxo manual (R11); reprocessamento em lote depois da correcao.
- Circuit breaker por provedor/modelo (global) e por `client_id`; estado em
  memoria enquanto `platform-api` for instancia unica, em Valkey se escalar.
- Kill switch: `kanban_ai_settings.enabled = false` por tenant e flag global de
  ambiente. Desligar devolve o fluxo ao modo manual da S6 (rollback funcional
  sem migracao).

### Armazenamento da API key do cliente

- Reuso do padrao de segredo por tenant que ja existe, na variante de
  `DataJudMonitorCryptoService` (`modules/juridico/shared/`): AES-256-GCM,
  chave por tenant = HMAC-SHA256(chave mestra dedicada, `client_id`), layout
  `iv(12)|tag(16)|ciphertext`, coluna `encryption_key_version`. Chave mestra
  propria: `JBOOT_KANBAN_AI_SECRET_KEY` + `JBOOT_KANBAN_AI_SECRET_KEY_VERSION`.
- Nao usar `modules/shared/crypto/CryptoService`: deriva a chave do
  `jwtSecret`; rotacionar o segredo do JWT inutilizaria todas as chaves
  guardadas e mistura propositos no mesmo material.
- Unica extensao ao padrao: chave mestra anterior opcional
  (`JBOOT_KANBAN_AI_SECRET_KEY_PREVIOUS` + versao) para rotacao sem
  indisponibilidade. Implementacao em `src/modules/shared/crypto` como
  variante parametrizada por chave/versao; o juridico nao muda neste arco.
- `kanban_ai_settings` (uma linha por tenant): `enabled`, `provider`,
  `api_key_ciphertext bytea`, `encryption_key_version`, `api_key_last4`,
  `api_key_status (valid|invalid|insufficient_quota)`, `api_key_validated_at`,
  `monthly_analysis_limit`, `terms_accepted_by/at` (P34), `updated_by/at`.
- Rotacao da chave do cliente: o administrador substitui; a nova e validada
  antes de gravar; a antiga e descartada; auditoria `kanban.ai_key_replaced`
  sem a chave. O job le a credencial no momento da chamada (nunca no payload
  da fila), entao a chamada seguinte ja usa a nova. Rotacao da chave mestra:
  subir a versao, job de recifragem por tenant, remover a anterior depois.
- Nunca exibir nem logar: campo so de escrita no DTO; respostas devolvem so
  `last4` e status; erro de validacao nao ecoa o valor; nenhum log de header
  HTTP do provedor; instrumentacao OTel sem captura de headers; corpo de erro
  do provedor mapeado para codigo; chave decifrada so em memoria durante a
  chamada. Teste canario com chave falsa conhecida varrendo resposta HTTP,
  log, evento, auditoria, notificacao e span.
- Validacao no salvamento: formato basico por provedor e uma chamada
  autenticada barata e sem dado pessoal (ex.: listagem de modelos), timeout
  10 s. 401/403 = nao grava (`credencial_invalida`); falha transitoria = nao
  grava, "tente novamente". So `flow:admin` salva, com o termo P34 aceito.

### Conta da avaliacao (P33)

Recomendado rodar a avaliacao com a chave do cliente, com consentimento
escrito (P5): o dado fica sob o mesmo contrato provedor-cliente da producao, o
custo segue R10 e a JBoot nao vira contratante de tratamento de dado pessoal
do cliente junto ao provedor. Consequencia: so entram no comparativo
provedores em que o cliente tem ou abre conta. Execucao por comando manual
autorizado, credencial obtida pela mesma `CredentialPort`, uso marcado
`purpose = eval` no ledger.

### Nenhum dado pessoal em log

Logs, eventos, auditoria, metricas e spans carregam so ids, hashes, contagens,
tokens, custo, latencia e codigos de erro. Captura de conteudo GenAI no OTel
desligada. Corpo de erro do provedor nunca e logado (pode ecoar a entrada):
mapeado para `error_code`. Teste com marcador canario em fixture sintetica
garante que nenhum log/evento contem o marcador.

### Amostra de avaliacao fora do git

Documentos reais e gabarito ficam em armazenamento restrito fora do
repositorio (bucket dedicado de avaliacao, nao o bucket do modulo, com acesso
nominal e expurgo ao fim da avaliacao ou conforme P18). No git: manifesto
(id opaco, tipo documental, hash, origem anotada, data), metricas agregadas e
por item com id opaco. Atencao: enviar a amostra real a um provedor externo
**ja e tratamento de dado pessoal por terceiro**; a avaliacao com provedor
externo tambem depende de P5.

### Protocolo da avaliacao comparativa (decide o provedor)

- Candidatos: no minimo 2 provedores elegiveis por P5 (catalogo de
  `ai-llm.md`; OpenRouter excluido para dado pessoal), mesmo prompt, mesmo
  schema, mesma amostra (comparacao pareada), 2 repeticoes por item para medir
  variancia.
- Metricas de extracao, por tipo documental e por campo: `field_accuracy`
  (comparacao normalizada), `exact_match` por documento, `hallucination_rate`
  (valor devolvido quando o gabarito e nulo ou nao sustentado pelo documento),
  recall de nulos, acuracia do tipo documental, precisao/recall de "ilegivel".
- Metricas de classificacao: accuracy, F1 macro, precisao/recall por tipo,
  curva cobertura x precisao por limiar de confianca (quantos leads seguem
  automaticos com a precisao exigida).
- Operacionais: latencia p50/p95 por lead, custo por lead, taxa de falha
  (schema invalido, recusa, timeout).
- Tamanho minimo (regra estatistica, nao preco): >= 30 documentos por tipo
  documental para comparar; >= 75 nos tipos criticos (documento pessoal,
  HISCON, HISCRE) para intervalo de +-5 p.p. com 95% de confianca em acuracia
  perto de 95%; >= 100 para afirmar alucinacao <= 3% com zero erros observados
  (regra de tres). Classificacao: >= 20 leads por tipo de caso.
- Regra de decisao: (1) eliminar quem nao atende P5 ou fica acima do limite de
  alucinacao (limite superior do intervalo); (2) maior `field_accuracy` nos
  campos criticos, com teste pareado (McNemar); (3) diferenca nao
  significativa ou < 2 p.p.: menor custo por lead, depois latencia. Limiares
  minimos sao de P17; proposta para o usuario: campos criticos >= 98%,
  alucinacao <= 1%, precisao >= 95% na classificacao automatica.
- Custo da avaliacao em ordem de grandeza: `docs x paginas x tokens_por_pagina
  x candidatos x repeticoes`. Com ~400 documentos, ~3 paginas e ~10^3 tokens
  por pagina de imagem, sao ~10^6 tokens de entrada por candidato e repeticao,
  ~10^7 no total. O valor em dinheiro sai da tabela publica do dia; antes de
  executar, contagem de tokens real (dry-run) e autorizacao do cliente, na conta dele (P33).
- Resultados exportados e versionados (`evidence` no grafo). Troca de modelo
  ou prompt exige nova rodada antes de produzir efeito.

### Quando a leitura vira unidade independente

Qualquer uma: (a) P5 proibir provedor externo ou exigir processamento em
infraestrutura propria (OCR/modelo local, CPU/GPU-bound); (b) OCR ou extracao
local medidos elevarem o atraso do event loop do `platform-api` acima do
limite operacional (proposta: p95 > 100 ms) em horario de uso; (c) volume de P8
exigir escalar a analise separado da API; (d) a stack escolhida exigir outro
runtime (ex.: Python para OCR). Nesses casos: Stack Fit Gate greenfield, nova
ADR e confirmacao humana; o pipeline continua orquestrado pelo kanban, que
chama a unidade s2s pela mesma porta `LlmProvider`/`DocumentReader`.

## Decisao 6: Escritorios E Visibilidade Por Escritorio (S3.5)

Decisao do usuario: o admin define o acesso aos quadros e os escritorios de
cada usuario; um usuario pode ter N escritorios e escolhe o escritorio ao
criar o card; quem nao e admin ve so os cards dos seus escritorios;
`flow:admin` ve todos os quadros sem ser membro; o card muda de escritorio so
pelo admin, com motivo.

### Modelo de dados (banco do tenant, aditivo)

```text
kanban_offices (id, client_id, name, active, created_by, created_at, updated_at)
  UNIQUE parcial (client_id, lower(btrim(name))) WHERE active
kanban_user_offices (client_id, identity_id, office_id FK, created_by, created_at)
  PK (client_id, identity_id, office_id); indice (client_id, office_id)
kanban_cards.office_id uuid NULL FK kanban_offices
  indice (client_id, board_id, office_id)
kanban_settings (client_id PK, office_visibility_enabled bool NOT NULL DEFAULT false,
  enabled_by, enabled_at, updated_by, updated_at)
```

Remover usuario de escritorio apaga a linha N:N e grava auditoria. A
transferencia de card grava `system_event` `card.office_changed`
(`fromOfficeId`, `toOfficeId`, `reason`) e auditoria.

### Ponto unico de visibilidade

`CardVisibilityService` (`src/modules/kanban/shared/`, ao lado do
`BoardAccessService`) e a unica fonte da regra:

- `resolveViewer(context)`: `{ isAdmin, officeIds, officeVisibilityEnabled }`,
  memoizado por requisicao; `isAdmin` vem do scope `flow:admin` do JWT
  (Decisao 7 para contextos sem JWT).
- `requireVisibleCard(context, boardId, cardId)`: substitui `requireMember`
  em toda rota com `:cardId`; card nao visivel = 404 (nao revela existencia).
- `visibleCardScope(viewer, alias)`: fragmento SQL parametrizado unico
  (`alias.office_id = ANY($n)`, ou sem filtro para admin e tenant desligado)
  usado por todas as consultas de conjunto: lista de cards, completude,
  metricas, fila do gestor, busca de cliente por CPF, candidatos a
  responsavel.
- `canSeeCard(viewer, card)`: funcao pura usada pelo realtime (por evento,
  junto da revalidacao de membresia que ja existe), notificacoes in-app e
  e-mails do motor de automacao (por destinatario, no envio).
- `BoardAccessService.resolveEffectiveRole`: `flow:admin` = `board_admin`
  efetivo em qualquer quadro do tenant (P24); demais = papel de membro.
  `requireRole`, a leitura de conteudo de quadro e `board.join` passam a
  usa-lo.

Garantia de que ninguem contorna o ponto unico:

- teste de matriz em banco real (padrao de `board-read-access.spec.ts`) para
  cada leitura e mutacao de card: escritorio A, escritorio B no mesmo quadro,
  usuario com A e B, admin nao membro, usuario sem escritorio, membro inativo,
  outro tenant, tenant desligado;
- teste estatico que lista o SQL dos repositorios do kanban que le
  `kanban_cards` ou tabelas filhas (documentos, anexos, activities, cliente do
  card, lead) e exige o escopo unico ou presenca em allowlist comentada
  (worker, integracoes de dominio, escrita interna).

Row Level Security do Postgres foi considerado e rejeitado nesta fase: exige
`SET LOCAL` por transacao em todo acesso (o codigo atual nao abre transacao
por leitura), papel de bypass para o worker e politicas em todas as tabelas
filhas. Raio de mudanca grande para o arco; fica como endurecimento futuro.

### Escolha do escritorio na criacao

Com a visibilidade ligada: usuario com 1 escritorio = automatico; com N =
`officeId` obrigatorio entre os seus (422 `office_required`); admin = qualquer
escritorio ativo; usuario sem escritorio = 403 `user_without_office`. Vale
para criar na tela, criar na coluna e importacao de dominio (DTO com
`officeId` opcional, mesmas regras). Responsavel precisa pertencer ao
escritorio do card ou ser admin.

### Migracao dos cards existentes

1. Migration aditiva (tabelas, `office_id` nulo, `kanban_settings`
   desligado); nenhum backfill automatico; as suites atuais passam sem mudanca.
2. Com a chave desligada, tanto o filtro por escritorio quanto o "admin ve
   tudo" ficam inativos: tenant que usa o Flow como quadro de tarefas nao muda
   (P26).
3. O admin cadastra escritorios, vincula usuarios e atribui cards em lote por
   quadro (UPDATE em transacao, `system_event` por card e uma auditoria por
   lote).
4. Ligar a chave mostra antes os cards sem escritorio (passam a ser so do
   admin) e os usuarios com acesso ao Flow sem escritorio (deixam de ver
   cards); exige confirmacao e gera auditoria. Desligar e permitido (rollback
   sem perda de dado).

### Impacto no cliente (Sprint 1) e no override (Sprint 3)

- `CardCustomersRepository.filterVisibleCustomerIds` passa a usar
  `visibleCardScope`: cliente visivel se ha card visivel vinculado a ele.
- O admin ve todos os cards, entao `outside_boards` para ele so ocorre com
  cliente sem card (PDV ou orfao); o override da S3 continua para esse caso.
- P30: cliente com cards so no escritorio A, vinculado pelo admin a um card
  do escritorio B, exige motivo e auditoria (`crossOffice: true` no evento),
  mesmo o cliente sendo visivel ao admin. Depois disso os dois escritorios
  veem o cadastro; cards e documentos continuam separados por card.
- Risco registrado: o cadastro do cliente e compartilhado; o escritorio B pode
  editar dado do cliente enquanto o lead do A esta `enviado` (o congelamento e
  por card). Mitigado pelo snapshot em `filled_variables` e pela marca
  "desatualizado".

## Decisao 7: Lista De Administradores (Notificacao E "Admin Ve Tudo")

| Opcao | Avaliacao | Decisao |
|---|---|---|
| Papel local do Flow sincronizado do Identity | Copia que deriva: remocao de `flow:admin` no Identity so chega com job de sync; admin removido continuaria recebendo notificacao com dado de lead | Rejeitada |
| Consulta ao Identity, somente leitura | `entitlements.scopes` ja e a fonte; o kanban ja le `jboot_identity` (`findCandidates`, `listActiveFlowTenants`, contatos do worker) | Escolhida |

- Na requisicao: `isAdmin` = scope `flow:admin` do JWT (autoridade da sessao,
  validade limitada pelo TTL do token, como todos os scopes).
- Fora da requisicao (notificacao de envio aos administradores, filtro de
  destinatario no worker): `FlowAdminDirectory` no kanban, ponto unico,
  consulta `entitlements` (aplicacao `flow`, `client_id`, `status = 'active'`,
  `'flow:admin' = ANY(scopes)`) com `identities.status = 'active'`; cache em
  memoria de ate 60 s por tenant.
- Se o Identity expuser API de diretorio, so o `FlowAdminDirectory` muda.

## Trust Boundaries E Matriz De Aprovacao

| Elemento | Confianca | Controle |
|---|---|---|
| Conteudo do documento | nao confiavel | dado, nunca instrucao; LLM sem tools; schema |
| Modelo `.docx` do tenant | nao confiavel | validacao no upload, sem execucao, sem raw XML |
| Saida do LLM | nao confiavel | validacao por schema e regras; so sugestao |
| Provedor | terceiro | P5, payload minimo, chave so em `src/ai/providers` |

A IA so cria linhas de sugestao/extracao/rascunho e transiciona
`enviado -> em_processamento -> aguardando_revisao | falha_processamento`.
Aprovar, devolver, alterar cadastro, rejeitar documento e entregar sao atos
humanos (R6). Rollback: kill switch por tenant/global. Credencial do tenant: segredo cifrado, nunca exposto (Decisao 5).

## Consequencias Nos Contratos (aplicadas so apos confirmacao)

- `bff kanban MODULE_CONTRACT.md`: na S4, secao do envio/fila e referencia a
  esta ADR; na S5/S6, secoes de modelos e documento gerado e esclarecimento da
  restricao de `CardAttachment` (modelos e gerados usam prefixos e tabelas
  proprias); **no inicio da S7**, no mesmo change que cria `src/ai`, trocar a
  restricao "Nao usar `src/ai`" pelas regras da Decisao 5 e registrar a fila
  `kanban-lead-analysis` dentro da excecao de Valkey.
- `bff PROJECT_CONTRACT.md`: entrypoint `src/ai/*`, agent global de IA e
  env de cifragem da chave do cliente na S7 (nao ha env de chave de provedor).
- S3.5: secao "Escritorios E Visibilidade" nos contratos do kanban (bff e
  app), substituindo a regra "isolamento so por quadro".
- S6: Dev Runtime Profile com o target `kanban-leads` e o container
  `gotenberg`; fila `kanban-document-pdf` dentro da excecao de Valkey.

## Status E Confirmacao

`proposed`, com confirmacao parcial do usuario em 2026-10-11:

| Decisao | Estado |
|---|---|
| 2 PDF (Gotenberg) | confirmada pelo usuario (PDF na primeira entrega) |
| 3 Gatilho, outbox, fila, pipeline fixo | confirmada pelo usuario (fluxo da IA aprovado) |
| 5 Credencial do cliente, sem teto da JBoot | confirmada pelo usuario (chave do cliente) |
| 6 Escritorios N:N e "admin ve tudo" | confirmada pelo usuario; regras finas P25-P28 pendentes |
| 1 `.docx` com `{{...}}`, 4 armazenamento, 7 diretorio de admins | recomendacao tecnica; 1 depende de P2a |
| Provedores suportados e fronteira da leitura | ADR complementar apos P5, P33 e a avaliacao |

Passa a `accepted` quando P2a e P25-P28 forem confirmadas.
