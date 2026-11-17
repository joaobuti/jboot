# Revisao De Seguranca — Peticoes Iniciais Pela Rotina (S1, 2026-10-28)

Skill: `docs/skills/security-checklist/SKILL.md`. Escopo: S1 de
`docs/product/flow-initial-petitions-sprints.md` (ADR 020): `actionConfig.expectedResult` e
`documentGenerator` nas rotas de regra de automacao, conclusao por comentario com `run_id`, recusa da
Analise de Acoes por resultado esperado, prazo das execucoes e migration 101. As sprints seguintes
(ferramentas de peticao, arquivo vindo da IA, motores do `.docx`) recebem revisao propria.

## 1. Injection

- [x] SQL parametrizado; `expectedResult` entra so como literal dentro do `jsonb` gravado e e lido por
  `action_config->>'expectedResult'` sem concatenacao.
- [x] Migration 101 sem dado de entrada externo.

## 2. Access Control

- [x] Regras continuam exigindo `board_admin` no board (sem mudanca de rota).
- [x] `action_analysis` e `initial_petitions` so com `claude_routine`: agente de chave de API nao ganha
  caminho novo de conclusao.
- [x] Comentario com `run_id` so conclui execucao do mesmo dono e card; regra que nao espera comentario
  nunca conclui nem move por esse caminho (fecha o risco residual da A1).

## 3. Dados Sensiveis

- [x] Nenhum dado pessoal novo. Auditoria da regra registra os campos do DTO (enum), sem conteudo.
- [x] `runNote` devolvido a rotina e texto fixo, sem dado do card.

## 4. Mass Assignment

- [x] `expectedResult` e `documentGenerator` declarados no DTO com `@IsIn`; `whitelist` do
  `ValidationPipe` mantem os demais campos fora. Combinacao invalida recusada no service.

## 5. Rate Limiting E Paginacao

- [x] Sem rota nova. Varredura de expiracao continua por tenant, so em `status = 'dispatched'`.

## 6. SSRF

- [x] Nao se aplica (nenhuma URL nova).

## 7. Dependencias

- [x] Nenhuma dependencia nova nesta sprint (`docx` entra na S4, com revisao propria).

## 8. Stack-specific

- [x] Frontend: sem `dangerouslySetInnerHTML`; textos do modal estaticos.

## 9. Agentes De Engenharia E GenAI

- [x] A rotina continua sem mover card e sem aprovar documento; o resultado esperado e decidido pela
  regra (pessoa), copiado para a execucao no disparo, nunca pela IA.
- [x] Teto total de 3 h para Peticoes iniciais limita execucao presa consumindo a assinatura.

Itens abertos: 0.

## S2 (2026-10-28): Acoes Ja Ajuizadas E Advogados Por UF

- [x] Injection: SQL parametrizado; CNJ e OAB normalizados e conferidos por CHECK no banco.
- [x] Access Control: acoes so para cliente visivel (`requireVisibleCustomer`, 404 sem oraculo); leitura
  `flow:customers:read|flow:admin`, escrita `flow:customers:write|flow:admin`; advogados so `flow:admin`,
  escritorio por tenant + id; consultas sempre com `client_id`.
- [x] Dados Sensiveis: auditoria so com ids, evento e UF; banco, numero do processo, nome e OAB nao vao
  para auditoria nem log.
- [x] Mass Assignment: DTOs com campos declarados (`whitelist`); `active` so no PATCH do advogado.
- [x] Concorrencia: incluir e confirmar serializados por cliente; unicidade garantida por indice parcial.
- [x] Rate Limiting/Paginacao: listas limitadas (500 acoes, 200 advogados) por cliente ou escritorio.
- [x] Frontend: sem `dangerouslySetInnerHTML`; passo da ficha sem `<form>` aninhado.

Itens abertos: 0.

## S3 (2026-10-28): Leitura Pelo Conector E Pre-Condicoes

- [x] Access Control: tools so na execucao `dispatched` do dono, card visivel ao dono e aceite de
  documentos do conector (`documentsOnly`), como as demais tools da automacao.
- [x] Minimizacao: endereco, nascimento, genero, acoes ajuizadas e advogado saem so na automacao Peticoes
  iniciais; Analise de acoes e Comentario recebem o mesmo de antes.
- [x] Auditoria sem conteudo: `kanban_automation_action_analysis_read` com ids; a leitura do cliente ja
  audita `kanban_automation_customer_read`.
- [x] Pre-condicao no disparo evita chamar a rotina (e gastar a assinatura) com ficha incompleta.
- [x] Conteudo de documento e ficha continua dado, nunca instrucao (texto fixo em `notes`/`instructions`).

Itens abertos: 0.

## S4 (2026-10-28): Motores Do Documento E Do Print

- [x] Dependencia nova `docx` 9.8.1 (MIT), versao fixa publicada ha um mes; versoes mais novas saiam a
  cada poucos dias e foram evitadas. Dependencias transitivas: `jszip`, `xml`, `xml-js`, `hash.js`,
  `nanoid`. `npm audit --omit=dev` sem achado nessa arvore; os 16 achados anteriores do BFF ficaram em
  tarefa separada.
- [x] Injection: o texto da rotina entra como texto de run (`TextRun`), escapado pela biblioteca; nada
  vira XML cru, campo de Word ou hiperlink executavel; a URL da nota e texto.
- [x] Nome do arquivo sem caminho: so letras, numeros e "_".
- [x] PDF do HISCON continua aberto sem eval e sem fontes do sistema (mesmo `openPdf`); render limitado a
  3200 px no lado maior; regiao validada antes de desenhar.
- [x] Limites do esquema (blocos, trechos, linhas de tabela) protegem o BFF de envio gigante.

Itens abertos: 0.

## S5 (2026-10-28): Modo Flow Ponta A Ponta

- [x] Access Control: tools so na execucao `initial_petitions` do dono, card visivel e aceite de documentos;
  leitura e download com `requireVisibleCard`; aprovacao com `flow:petition:approve` ou `flow:admin` e
  so rascunho de peticao do card; allowlist estatica de SQL de card atualizada com o motivo.
- [x] Injection: SQL parametrizado; nomes de tabela fixos no descarte; conteudo da rotina passa pelo
  esquema zod e pelas recusas antes de virar texto do Word.
- [x] Dados Sensiveis: auditoria e historico so com ids, contagens, status e resultado do movimento; texto
  da peca, relatorio e print ficam no banco do tenant; download por URL assinada de curta duracao.
- [x] Integridade: fechamento numa transacao com o encerramento da execucao; arquivos subidos antes sao
  removidos se a transacao nao fechar; CHECK impede documento de peticao com dado de lead.
- [x] Limites: esquema limita blocos, peticoes por execucao (50 rascunhos lidos) e itens do relatorio; print
  ate 8 MB por CHECK.
- [x] GenAI: a IA nao move card nem aprova; a aprovacao e humana e libera o Drive.

Itens abertos: 0.


## S7 E S8 (2026-10-29): Fecho Pelo Flow E Versao Corrigida

- [x] Access Control: cadastro de advogado (`/kanban/settings/users/*/lawyer`) so `flow:admin`; a tela de
  usuarios esconde coluna e botao sem a permissao. Versao corrigida com `requireVisibleCard` e
  `flow:petition:approve` ou `flow:admin`, so sobre a versao atual da peticao do card; allowlist estatica
  de SQL de card atualizada com o motivo (`insertCorrected`, `signerForCard`).
- [x] Upload: mesmo caminho da versao editada do lead (`assertEditedDocumentFileAllowed` + `inspectEditedDocx`
  no runner isolado): `.docx` ate 10 MB, assinatura do arquivo, macro, OLE, vinculo externo e zip-bomb;
  arquivo recusado nao grava e o objeto subido e removido se a transacao falhar.
- [x] Integridade: correcao e substituicao numa transacao com trava da peticao e do documento; protocolo
  (`protocoled_at`) recusa a correcao; o Drive atualiza o mesmo arquivo (`remote_file_id` herdado), sem
  arquivo duplicado.
- [x] Dados Sensiveis: auditoria do cadastro so com as UFs; nome e numero da OAB ficam no banco do tenant.
  O conector entrega so nome, numero e UF de quem assina (sem o id interno).
- [x] GenAI: o fecho e montado pelo Flow com dado do cadastro; a rotina nao escolhe quem assina e o envio
  com fecho e recusado.

Itens abertos: 0.
