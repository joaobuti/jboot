# Sprints: Isolamento De Dados Por Cliente (Schema, Banco Dedicado, RLS)

Estado: `pendente` (registrado em 2026-11-11; fora do MVP).

## Contexto

O Identity cadastra quatro estrategias por aplicacao (`application_databases.isolation_strategy`):
sem banco, compartilhado, schema por cliente e database dedicado. Conferido em 2026-11-11:

- `shared_db`: funciona. As 72 tabelas `kanban_*` tem `client_id` e o `bff-jboot-platform`
  filtra por ele a partir do contexto do token. Nao ha RLS: a separacao depende de toda consulta
  filtrar por `client_id`.
- `dedicated_database`: o onboarding grava o `database_ref` em `provisioning`
  (`pending_worker`), mas nenhum processo cria o banco; o login nao oferece o modulo (caso real:
  cliente JOSE EDERVANDES VIDAL CHAGAS no Flow).
- `schema_per_client`: o Identity grava `schema_name`, mas `DatabaseService` do
  `bff-jboot-platform` ignora o campo; os dados iriam para o schema padrao.
- `none`: sem `database_ref`; o login nao oferece o modulo.

Decisao do usuario (2026-11-11): Flow (e Juridico) usam `shared_db` no MVP; as demais
estrategias ficam registradas para implementacao posterior.

## Sprint 0 — Banco Do Cliente Visivel E Corrigivel No Identity

Estado: `concluida` (2026-11-11).

- [x] Cadastro do cliente (Identity > Clientes > Editar): bloco "Banco de dados por modulo"
  com estrategia, banco, situacao e a regra atual do app; "Aplicar regra atual" quando o
  registro diverge da regra.
- [x] Databases dos Apps: aviso com os clientes fora da regra e "Aplicar a todos".
- [x] Aplicar corrige o proprio registro (mesmo id): o id fica guardado fora do Identity
  (sessoes, acompanhamentos processuais, filas do Flow); trocar de registro quebraria tudo isso.
- [x] Bloqueios: regra ausente, isolamento nao implementado (so compartilhado e aplicavel) e
  cliente ativo em outro banco (os dados estao la; trocar exige migracao).
- [x] Edicao manual de banco/estrategia nao exposta.
- [x] Rotas: `GET /admin/clients/:clientId/databases`,
  `POST /admin/clients/:clientId/databases/:applicationId/apply-rule`,
  `GET /admin/applications/:applicationId/client-databases`,
  `POST /admin/applications/:applicationId/client-databases/apply-rule`.

## Sprint 0.1 — Admin Do Cliente Com Todas As Permissoes Do Modulo

Estado: `concluida` (2026-11-11).

Regra do usuario (2026-11-11): ao cadastrar o cliente, todo modulo contratado da ao admin do
cliente todas as permissoes de admin daquele modulo; contratar um modulo depois tambem da.

- [x] Achado: o cadastro gravava `app:read/app:write/app:admin` + `client_admin`, que nenhum modulo
  reconhece ("Insufficient flow scope" no primeiro login do cliente Edervandes); contratar modulo
  na edicao nao criava acesso nem banco.
- [x] Migration `133_identity_client_admin_permissions.sql`: catalogo completo (faltavam
  `users:manage`, `flow:users:manage`, `ai:agents:manage`, `ai:credentials:manage`,
  `client_admin`) e `client_admin_default` marcando o pacote (todos os scopes e os papeis de
  administrador).
- [x] Cadastro do cliente e modulo contratado/reativado depois: admin(s) do cliente (vinculo com
  `client_admin`) recebem o pacote; banco criado pela regra do app quando falta.
- [x] "Reaplicar permissoes de admin" no cadastro do cliente
  (`POST /admin/clients/:clientId/admin-access`); concede por uniao, nunca remove.
- [x] Teste de consistencia: toda permissao exigida pelo `bff-jboot-platform` esta no catalogo
  (fora `flow:connector:*`, OAuth do conector Claude).

## Escopo Previsto (exige PO -> PE -> Architect -> confirmacao humana antes de codigo)

1. Migrations por cliente: separar as migrations de cada modulo (hoje scripts de init com
   `\\connect` para bancos fixos) num conjunto aplicavel a qualquer destino, com registro do que ja
   rodou por destino; tambem usado em cada deploy para atualizar todos os clientes.
2. Schema por cliente: provisionar o schema e aplicar `search_path` por cliente no
   `bff-jboot-platform`, inclusive nos processos em segundo plano (automacoes, monitoramento).
3. Database dedicado: processo que cria o banco, aplica as migrations e marca o `database_ref`
   como `active` (ou `failed`, com nova tentativa). Depende de a hospedagem de producao permitir
   criar bancos com o usuario da aplicacao (confirmar com a Configr).
4. RLS por `client_id` como segunda trava no compartilhado.

## Ajustes Menores Registrados

- No cadastro de regras do Identity, desabilitar as opcoes ainda nao implementadas ("ainda nao
  disponivel") para ninguem escolher uma estrategia que trava ou engana.
- Login com senha certa e nenhum modulo disponivel mostra "falha na autenticacao"; trocar por
  mensagem de "sem acesso a nenhum modulo, fale com o administrador".
- Seeds `014_identity_flow_dev_seed.sql` e `010_identity_juridico_dev_seed.sql` ainda gravam
  `dedicated_database`; alinhar com `shared_db` (ou migration nova) para ambientes novos e
  producao.
