# Revisao De Seguranca — Documentos Da Ficha Do Cliente (S1, 2026-10-16)

Skill: `docs/skills/security-checklist/SKILL.md`. Escopo: S1 de
`docs/product/flow-customer-documents-sprints.md` (ADR 017): rotas
`/kanban/customers/{id}/documents*`, migration 085, etapa "Documentos" da tela
de clientes e CPF obrigatorio. Nao promove nada a `production_ready`.

## 1. Injection

- [x] SQL parametrizado; nomes de tipo validados contra catalogo fechado antes
  de qualquer consulta (`customer_document_type_invalid`).
- [x] Nome do arquivo nunca entra na chave do storage nem em log.

## 2. Access Control

- [x] Toda rota passa por `requireVisibleCustomer` (mesma regra da ficha:
  escritorio vinculado ou `flow:admin`); cliente invisivel ou de outro tenant
  responde 404, sem oraculo.
- [x] Escrita exige `flow:customers:write` ou `flow:admin`; leitura
  `flow:customers:read` ou `flow:admin`.
- [x] Download busca a versao por tenant + cliente + id; versao de outro
  cliente responde 404 (teste de repositorio).

## 3. Dados Sensiveis

- [x] Documentos pessoais ficam no MinIO canonico com chave
  `{client}/customers/{customer}/documents/{id}`, sem nome de arquivo.
- [x] Auditoria so com ID do cliente, tipo e versao (verificado no banco no E2E).
- [x] URL de download assinada por 5 minutos.
- [x] Retencao de versoes antigas e removidas segue ADR 015 (legal hold); a
  rotina de expurgo ainda nao existe e esta em Pendencias De Release.

## 4. Upload

- [x] Limite de 25 MB no multer e no servico; allowlist restrita a PDF, PNG,
  JPEG e WebP; assinatura do conteudo conferida (`file-signature.ts`); DOCX
  recusado com 415 no E2E.
- [x] Falha ao gravar no banco remove o objeto ja enviado (teste).
- [x] Envios concorrentes do mesmo tipo serializados por lock consultivo;
  indice parcial garante uma unica versao corrente.

## 5. Mass Assignment

- [x] `UpdateCustomerDocumentProfileDto` aceita so `residenceProofThirdParty`;
  CPF nao pode ser apagado (`null` recusado) e e obrigatorio na criacao.

## 6. Frontend

- [x] Validacao local de formato/tamanho espelha o BFF; o BFF continua sendo a
  barreira.
- [x] Download abre em nova aba com `noopener,noreferrer`.

## 7. Validacao Por Agente Claude (S2)

- [x] Parecer da IA nao altera o cliente; so confirmacao humana com os mesmos
  documentos valida (teste e E2E).
- [x] Tools so atendem a identidade central do run `dispatched`; run alheio
  responde `not_found`; parecer so uma vez (`validation_not_pending`).
- [x] Leitura de documentos exige aceite proprio do gestor
  (`claude_connector_documents_policy_required` sem aceite; CHECK no banco).
- [x] Disparo leva so `run_id` e `document_count`; documentos so saem pela tool,
  com ACL da identidade central.
- [x] PDF tratado como nao confiavel: pdfjs sem `eval` e sem fontes do sistema,
  ate 10 paginas, saida JPEG reduzida; prompt da rotina trata conteudo como dado.
- [x] Auditoria sem CPF nem conteudo (E2E).

## 8. Replica No Drive (S3)

- [x] So documentos de validacao confirmada por humano entram na fila, no mesmo
  comando da confirmacao e somente com o Drive da empresa ativo.
- [x] Checksum do canonico conferido antes do envio (`source_integrity_mismatch`);
  origem removida falha sem chamar o Drive (`source_missing`).
- [x] CPF so no nome da pasta, no Drive do proprio contratante (decisao humana);
  fila, logs e auditoria seguem so com IDs.
- [x] Item ja replicado nao e movido nem sobrescrito por outra versao.

## 9. Validacao Por Escritorio E Automacoes (ADR 018, S4/S5)

- [x] Parecer de run de escritorio so de responsavel daquele escritorio; dono do
  agente e membro sem marcacao recusados (repositorio com PostgreSQL real).
- [x] Responsavel so onde o usuario e vinculado (`responsible_office_not_linked`);
  marcacao feita so pelo `flow:admin`.
- [x] Confirmar parecer exige `flow:validation:approve`; concedida por padrao so a
  quem tem `flow:admin`.
- [x] Escolha de escritorio limitada aos escritorios do cliente visiveis ao
  usuario (`customer_validation_office_not_allowed`).
- [x] Tools da automacao so na execucao `dispatched` do dono da regra, card visivel,
  cliente com validacao aprovada por pessoa e aceite de documentos; so documentos
  da validacao aprovada; auditoria so com ids.
- [x] Aceite de documentos cita "contas Claude dos escritorios e da empresa".

## 10. Valores Do Kit E Documentos Por Etapa (ADR 019, Sprint 2 Do Contrato)

- [x] Minimizacao (LGPD): documento fora da lista da etapa nao e listado e a tool recusa a leitura
      (`document_not_allowed`), na validacao (politica da empresa gravada no run) e na automacao
      (`actionConfig.customerDocumentTypes` copiado para o outbox). Testado nos dois caminhos.
- [x] Dado nao confiavel: `tagValues` so com `verdict = aprovado`; so tags do modelo da versao gravada
      no run (mais `_n` de emprestimo com `_1` no modelo); valor nao textual, maior que 500 ou vazio
      e descartado, nunca truncado; tags de bloco e calculadas nao sao aceitas. CHECK de tamanho no banco.
- [x] Integridade: a revisao humana nao apaga a sugestao da IA (colunas separadas); so parecer aprovado
      aceita revisao, com `flow:validation:approve`; run de outro cliente responde 404.
- [x] Auditoria: `kanban_customer_validation_answered` e `kanban_customer_validation_kit_reviewed` com
      nomes de tags e tags descartadas, nunca valores (testado).
- [x] Mass assignment: politica de documentos validada por allowlist (DTO e CHECK do banco); lista da
      regra so para `execute_ai_agent` com `claude_routine`.
- [x] Sem texto juridico gerado pela IA: o kit sera montado pelo Flow (Sprint 4); esta sprint so grava
      valores revisaveis.

## Pendencias De Release

- Expurgo de versoes antigas/removidas conforme politica de retencao.
- Limite de taxa especifico para upload (hoje herda o comportamento geral do BFF).
- Smoke com rotina real e documento real do contratante (exige URL publica).
- Smoke de envio ao Drive com conta Google de teste (exige app OAuth do JBoot).
- Renderizacao de PDF no processo do BFF: medir CPU/memoria com documentos
  reais antes de producao; mover para worker se necessario.
