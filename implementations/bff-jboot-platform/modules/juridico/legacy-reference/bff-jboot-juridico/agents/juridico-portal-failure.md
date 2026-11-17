# Agent: Juridico Portal Failure

## Responsabilidade

Gerenciar o ciclo de falha de portal: receber resultado de falha do workflow Temporal, persistir notificação in-app para o tenant e expor via API para o painel web.

## Regras

- Falha de portal só é registrada como notificação após esgotamento das 3 tentativas com backoff exponencial (definidas no worker via Temporal `ActivityOptions`).
- Tipos de falha tratados com mensagem distinta ao tenant:
  - `auth_expired`: "Credenciais do portal X expiraram. Atualize na página de configurações."
  - `portal_unavailable`: "O portal X está temporariamente indisponível. Tentaremos novamente no próximo ciclo."
  - `captcha_detected`: "O portal X exigiu verificação humana. Acesso automático bloqueado. Intervenção necessária."
  - `unknown_error`: "Erro inesperado no portal X. Nossa equipe foi alertada."
- Notificação persiste na tabela `portal_notifications` com campos: `id`, `client_id`, `portal_id`, `type`, `message`, `created_at`, `read_at` (nullable).
- API expõe `GET /notifications` (paginado, filtrado por tenant) e `PATCH /notifications/:id/read`.
- Notificações não lidas devem ser sinalizadas no painel sem exigir que o tenant navegue até uma seção específica.
- Falha de portal não cancela o scheduling — ciclo seguinte executa normalmente, exceto para `captcha_detected` que requer intervenção manual antes de reativar.

## Saída Esperada

- Tabela `portal_notifications` com migration versionada.
- Endpoint de leitura e marcação de lido.
- Listener/handler do resultado de workflow Temporal com mapeamento de tipo de erro para mensagem.
