# Juridico Data Sprint 2 Data Model

## Decisao De Persistencia

O banco juridico dedicado, resolvido pelo `database_ref` autenticado, e o unico
owner dos dados de monitoramento. Todas as tabelas incluem `client_id` e toda
query o filtra.

## Entidades Planejadas

| Entidade | Finalidade | Dado sensivel e protecao |
|---|---|---|
| `juridico_data_monitors` | configuracao e ciclo de vida do acompanhamento | numero CNJ cifrado, HMAC versionado para unicidade, cadencia e timestamps |
| `juridico_data_monitor_runs` | execucao idempotente e diagnostico | sem body DataJud; status, latencia e correlation id |
| `juridico_data_process_snapshots` | estado normalizado capturado | campos de processo e partes minimizados; sem payload bruto |
| `juridico_data_snapshot_movements` | movimentacoes e fingerprint para diff | texto normalizado apenas quando necessario ao historico |
| `juridico_data_monitor_events` | evento de nova movimentacao/diff | referencia ao monitor e snapshot, sem duplicar dados |

## Regras Obrigatorias

- `process_number_ciphertext`, `encryption_key_version` e HMAC sao distintos;
  cifra recupera o CNJ para polling, HMAC indexa sem expor o valor;
- unicidade: um monitor ativo por `client_id + process_number_hmac`;
- snapshots sao imutaveis; diff e determinado por fingerprint de movimentacao;
- dados vencem 180 dias apos `paused_at` ou `deleted_at`; a rotina de purga
  remove snapshots, movimentacoes, eventos e cifra recuperavel;
- auditoria tecnica nao recebe numero CNJ, partes, token nem resposta upstream;
- exclusao deve ser idempotente, tenant-aware e comprovada por evento tecnico
  sem dados pessoais.

## Fora De Escopo

- dados de DJe/DJEN autenticado;
- credenciais de portais;
- dossie processual permanente;
- notificacao a terceiros.
