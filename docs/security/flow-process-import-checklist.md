# Checklist De Seguranca — Importacao De Processos Por Planilha

Escopo: `docs/product/flow-process-import-sprints.md` (Sprint 1, 2026-11-06).

- [x] Autenticacao e contexto: sessao Flow (`flow:read`, `flow:write`) via
  `requireCaller`; `client_id` e bancos resolvidos no servidor; Juridico
  (`juridico:read`) exigido antes de conferir ou gravar.
- [x] Autorizacao: papel `board_admin`/`board_member` no board destino; escritorio
  ativo e do usuario (admin: qualquer ativo); criacao do card repete
  `requireRole`, `CardOfficePolicy` e coluna editavel. Andamento do lote so para
  quem importou ou `flow:admin` (404 para os demais).
- [x] Reautorizacao no job: a fila reconstroi o contexto pelo usuario que
  importou; entitlement revogado encerra o lote como `failed` sem criar nada.
- [x] Isolamento: toda consulta por `client_id`; numero ja usado e cliente
  existente so do tenant (teste PostgreSQL com outro tenant).
- [x] CPF nao e oraculo: a conferencia so diz "cliente cadastrado" quando o
  usuario enxerga a ficha; fora disso, "cliente pelo CPF".
- [x] Entrada: ate 2000 linhas (DTO e servico), campos texto com limite; CPF,
  CNJ (mod 97), tribunal e duplicidade validados no servidor; o lote so recebe
  linhas que o servidor classificou como prontas.
- [x] Arquivo: `.xlsx` lido no navegador; nada de arquivo no servidor (sem
  parser de planilha no BFF, sem upload).
- [x] Minimizacao: nome, CPF e STATUS das linhas existem so enquanto o lote
  processa; viram NULL ao concluir. Fila carrega so ids. Logs e auditoria sem
  CPF/nome (numero do processo so por HMAC na auditoria juridica).
- [x] Integridade/idempotencia: card por origem `flow_process_import/<cnj>`;
  cliente por CPF sem sobrescrever (`createIfCpfAbsent`); responsaveis com
  `ON CONFLICT DO NOTHING`; cliente criado e sem card e desfeito; retomar nao
  duplica.
- [x] Unicidade do CNJ no tenant: peticao, card DataJud, card importado e vinculo
  no Juridico; registro em peticao e export DataJud tambem respeitam o card
  importado.
- [x] Disponibilidade: fila com concorrencia 1; Valkey fora deixa o lote
  `pending` com "Retomar"; falha de uma linha nao para as outras.
- [x] Dependencias: nenhuma nova (`xlsx` ja usada pela captacao do Juridico).
- [x] Testes so com dados ficticios.

Limites conhecidos:

- Lote que falha (entitlement revogado) mantem nome/CPF ate ser retomado com
  sucesso; nao ha expurgo por prazo nesta sprint.
- Corrida entre importacao e registro de CNJ em peticao no mesmo instante, em
  instancias diferentes da API, pode criar dois cards para o mesmo numero
  (janela pequena; a fila e serial por processo).
- O aviso "ja existe" revela o link de card que o usuario pode nao enxergar
  (decisao do usuario na Sprint 2 de flow-card-actions; o card responde 404).
