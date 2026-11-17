# Runbook — Flow Google Drive Sync

## Escopo E Invariantes

Este runbook opera a replica opcional de documentos aprovados do Flow no
Google Drive. MinIO/S3 e PostgreSQL continuam canonicos; o Drive nunca autoriza
acesso, altera workflow nem serve como origem de restauracao.

- RPO contratado: zero para metadados commitados e objetos canonicos
  confirmados.
- RTO alvo: ate 4 horas para PostgreSQL, objetos canonicos e relay de outbox.
- Esses objetivos ainda exigem exercicio de restore cronometrado antes de serem
  classificados como medidos.
- Payloads de fila e logs contem somente identificadores e codigos
  sanitizados. Nunca copie token, refresh token, private key, CPF ou documento
  para ticket, terminal ou log.

## Origens E Pastas (ADR 017)

| Origem (`source_type`) | Quando entra na fila | Pasta e nome |
|---|---|---|
| `generated_document` | peticao aprovada (trigger 068) | cliente com CPF: `<raiz>/<escritorio do card>/<CPF - nome>/peticao-<id>-vN.docx`; sem cliente: caminho legado por IDs |
| `customer_document` | confirmacao humana da validacao (S3) ou reconciliacao se o Drive foi ligado depois | `<raiz>/<escritorio>/<CPF - nome>/<tipo>-vN.<ext>` (ex.: `Manaus/52998224725 - MARIA/comprovante-residencia-v2.pdf`); escritorio = o da validacao confirmada, senao o vinculo do cliente, senao `Sem escritorio` (ADR 019, decisao 17) |

- Itens ja replicados nao sao movidos; uma nova versao confirmada vira um novo
  arquivo com `-vN` maior.
- A varredura (2 min) envia os pendentes; `GET /kanban/document-syncs` mostra
  ambas as origens. Origem apagada do canonico falha com `source_missing`.

## Diagnostico

1. Confirme que o CRM e o download canonico continuam operacionais antes de
   intervir na replica.
2. Como operador com `flow:admin`, consulte `GET /kanban/document-syncs`
   (a tela `/flow/configuracoes/google-drive` mostra apenas conexao, pasta e
   o switch de envio).
3. Observe `pending`, `syncing`, `retrying`, `failed` e idade do item pendente
   mais antigo. A lista terminal retorna no maximo 50 itens e somente IDs,
   versao e codigo sanitizado.
4. Correlacione somente por `client_id` e `sync_id`. Nao use nome, CPF ou
   conteudo do documento.

## Drive Indisponivel

1. Desligue o switch de envio do tenant pela tela, sem apagar objetos
   canonicos.
2. Valide disponibilidade do provider fora de dados reais.
3. Religue o switch; o backend revalida a pasta no Google ao salvar.
4. Reprocesse falhas terminais individualmente. Falhas transitorias usam
   backoff exponencial e sao recuperadas pelo sweep periodico.
5. Confirme reducao do backlog e novos itens em `synced`. Nao altere estado
   diretamente no banco.

## Valkey Ou Worker Indisponivel

O outbox PostgreSQL e a fonte duravel do trabalho. Falha de enqueue nao remove
o item: ele permanece `pending`/`failed` elegivel e o sweep o reenfileira.

1. Preserve o PostgreSQL; nao recrie jobs manualmente no Valkey.
2. Restaure o Valkey/worker conforme o perfil de runtime do projeto.
3. Aguarde um sweep e confira backlog/idade em `GET /kanban/document-syncs`.
4. Se um item terminal precisar de nova tentativa, use
   `POST /kanban/document-syncs/{syncId}/reprocess`. O endpoint e restrito a
   `flow:admin`, limitado por taxa e aceita apenas UUID.

## Conexao Revogada Ou Expirada

O cliente pode revogar o acesso na conta Google, ou o refresh token expirar
(app OAuth em modo `Testing`: 7 dias). O worker marca a configuracao como
`invalid`, sem consumir tentativas dos documentos, e a tela pede reconexao.

1. Oriente o cliente a abrir `Configuracoes -> Google Drive` e clicar em
   `Reconectar`; depois escolher a pasta de novo e religar o switch.
2. Itens `pending`/`failed` retomam sozinhos no proximo sweep.
3. Rotacao da chave `JBOOT_FLOW_DRIVE_ENCRYPTION_KEY` invalida todos os tokens
   gravados: os clientes precisam reconectar. Nunca grave refresh token em log,
   ticket ou terminal; a API nunca o devolve — se devolver, trate como incidente.

## Divergencia Da Replica

A reconciliacao compara existencia e checksum remoto. Arquivo ausente ou
alterado volta a `pending` e e recriado a partir do objeto canonico. Erro de
consulta ao provider nao marca o canonico como perdido e e tentado novamente
em ciclo posterior.

## Exercicio De Restore (2026-10-16, ambiente local)

Executado so sobre copias: dump do banco Kanban restaurado em
`jboot_kanban_restore_drill`, bucket copiado para `kanban-restore-drill`,
conferencia de amostra contra o banco restaurado e remocao dos recursos do
exercicio ao final.

| Medida | Valor |
|---|---|
| Dump do banco Kanban (195 KB) | 0,24 s |
| Restore do banco | 0,49 s |
| Restore dos objetos (27) + conferencia | 1,29 s |
| RTO observado (total) | ~2 s |
| RPO observado | zero: nenhum commit apos o dump durante o exercicio |
| Amostra conferida | 29 objetos: 27 ok, 0 divergencia de tamanho/SHA-256, 2 ausentes |

Achado: os 2 ausentes sao anexos de card do banco de dev criados em
2026-10-10 sem objeto no bucket (dado de teste anterior, nao gerado por este
fluxo). Nao existe conferencia periodica de integridade para anexos de card; a
reconciliacao atual cobre so a replica Drive. Os tempos valem para o volume de
dev; o RTO de 4 h precisa ser medido de novo com volume de producao.

## Restore De PostgreSQL E Objetos

1. Declare incidente e registre inicio do cronometro, ultimo backup consistente
   e janela potencial de perda.
2. Mantenha o Drive pausado. Restaure primeiro o banco dedicado do tenant e
   depois o bucket canonico, preservando chaves e versoes.
3. Aplique as migrations do projeto no ambiente restaurado.
4. Faça amostragem cruzada de `storage_key`, tamanho e SHA-256 entre banco e
   objeto, sem baixar conteudo para logs ou artefatos de CI.
5. Suba API, worker e Valkey. O reconciliador recria outbox ausente para
   documentos aprovados e o relay reenfileira itens elegiveis.
6. Reative o Drive somente depois de validar isolamento do tenant, downloads
   canonicos e backlog.
7. Registre RPO e RTO observados, quantidade de itens reconciliados e desvios.
   Sem essa evidencia, o checklist permanece pendente.

## Smoke Sintetico

Use exclusivamente tenant, escritorio, cliente e documento sinteticos.

1. Conecte uma conta Google de teste pela tela e escolha uma pasta de teste.
2. Persista e aprove uma nova versao DOCX sintetica.
3. Confirme criacao de um unico sync e transicao
   `pending -> syncing -> synced`.
4. Repita o job e confirme o mesmo arquivo remoto (achado pelo nome exato na pasta, sem duplicar).
   Aprove dois documentos do mesmo cliente ao mesmo tempo e confirme uma unica pasta do escritorio e
   uma unica pasta do cliente.
5. Altere/remova a replica na conta controlada, execute a reconciliacao e
   confirme recriacao a partir do canonico.
6. Revogue o acesso do app na conta Google, confirme `status = invalid` sem perda dos itens e reconecte.
7. Desligue o switch/desconecte e confirme que o download canonico continua funcional.

Este smoke externo permanece bloqueado ate existir conta Google controlada sem
dados reais. Testes automatizados usam adapter fake e nao substituem essa
evidencia.
