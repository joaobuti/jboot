# PDV Sprint 1 Gate

## Status

Gate criado e validado documentalmente.

Este gate foi usado na implementacao inicial em projetos separados. A direcao arquitetural atual e migrar/evoluir o backend/web em platform modular.

## Escopo

Sprint 1: Core Administrativo.

Projetos afetados:

- destino atual: `implementations/bff-jboot-platform/modules/pdv`;
- destino atual: `implementations/app-jboot-next-platform/modules/pdv`;
- origem de migracao: `implementations/bff-jboot-pdv`;
- origem de migracao: `implementations/app-jboot-pdv-web`.

## Objetivo

Implementar a base administrativa online do PDV:

- produtos;
- categorias;
- clientes do estabelecimento;
- operadores/perfis;
- estoque basico;
- web admin;
- APIs administrativas;
- isolamento por `client_id`.

## Artefatos Do Gate

| Artefato | Caminho | Status |
|---|---|---|
| Roadmap da sprint | `docs/product/pdv-sprints.md` | criado |
| Modelo de dados | `docs/data/pdv-sprint-1-data-model.md` | criado |
| Contrato OpenAPI | `docs/api/pdv-sprint-1-openapi.yaml` | criado |
| Contratos dos projetos destino | `implementations/bff-jboot-platform/PROJECT_CONTRACT.md`, `implementations/app-jboot-next-platform/PROJECT_CONTRACT.md` | criado |
| Contratos dos modulos destino | `implementations/bff-jboot-platform/modules/pdv/MODULE_CONTRACT.md`, `implementations/app-jboot-next-platform/modules/pdv/MODULE_CONTRACT.md` | criado |
| Projetos origem | `implementations/bff-jboot-pdv/*`, `implementations/app-jboot-pdv-web/*` | criado |

## Regras De Autorizacao E Contexto

- O backend PDV valida JWT emitido pelo Identity Hub.
- `client_id`, `application_id`, `database_ref`, roles e scopes vêm do JWT/contexto.
- `client_id` nao deve ser aceito em formularios comuns nem em payloads administrativos da Sprint 1.
- Toda query de negocio filtra por `client_id`.
- Toda mutacao administrativa exige papel/permissao compativel com operador master/gestor.

Scopes iniciais:

- `pdv:admin:read`;
- `pdv:admin:write`;
- `pdv:inventory:read`;
- `pdv:inventory:write`;
- `pdv:operators:manage`.

## Fronteiras Backend/Web

Backend `bff-jboot-platform/modules/pdv`:

- valida contexto;
- aplica regra de negocio;
- acessa PostgreSQL;
- expõe OpenAPI;
- garante isolamento por `client_id`;
- registra auditoria/eventos operacionais.

Frontend `app-jboot-next-platform/modules/pdv`:

- consome OpenAPI via client tipado;
- nao envia `client_id` em formularios comuns;
- nao duplica regra de autorizacao;
- exibe estados de loading, empty, error e success;
- usa identidade visual conforme `docs/design-system.md`.

## Criterios De Aceite Funcionais

- Usuario autorizado lista, cria, edita e inativa categorias.
- Usuario autorizado lista, cria, edita e inativa produtos.
- Produto pode ou nao controlar estoque.
- Usuario autorizado lista, cria, edita e inativa clientes do estabelecimento.
- Usuario autorizado lista, cria, edita e inativa operadores vinculados ao cliente.
- Usuario autorizado consulta saldo de estoque por produto/local.
- Usuario autorizado registra ajuste manual de estoque.
- Usuario autorizado importa estoque em lote.
- Usuario sem permissao adequada recebe erro estruturado.

## Criterios De Aceite Tecnicos

- CRUDs separados por dominio.
- DTOs e responses tipados.
- Listagens paginadas com `limit` e `offset`.
- Filtros por `client_id` sempre aplicados no backend.
- `client_id` nunca vem de input livre do frontend.
- IDs em UUID.
- Mutacoes auditaveis.
- Contrato OpenAPI atualizado antes da implementacao.
- Testes cobrem isolamento multi-tenant.

## Plano De Validacao

Backend:

- teste de contrato OpenAPI;
- teste unitario de services;
- teste de repository garantindo filtro por `client_id`;
- teste de autorizacao por scope/role;
- teste de mutacao gerando auditoria/evento;
- build/typecheck/lint quando houver codigo.

Frontend:

- type-check;
- testes de client API tipado;
- estados loading/empty/error/success;
- validacao de formulario;
- smoke das rotas administrativas;
- build quando houver codigo.

## Agents E Skills

Backend:

- `implementations/bff-jboot-platform/agents/backend-node-typescript.md`;
- `implementations/bff-jboot-platform/agents/platform-auth-context.md`;
- `implementations/bff-jboot-platform/agents/platform-postgres.md`;
- `implementations/bff-jboot-platform/modules/pdv/agents/pdv-domain.md`;
- `implementations/bff-jboot-platform/modules/pdv/skills/pdv-crud.md`.

Web:

- `implementations/app-jboot-next-platform/agents/frontend-next-typescript.md`;
- `implementations/app-jboot-next-platform/agents/platform-layout.md`;
- `implementations/app-jboot-next-platform/agents/backend-contract-client.md`;
- `implementations/app-jboot-next-platform/modules/pdv/agents/pdv-web.md`;
- `implementations/app-jboot-next-platform/modules/pdv/agents/pdv-admin-api.md`;
- `implementations/app-jboot-next-platform/modules/pdv/skills/pdv-web-ui.md`;
- `implementations/app-jboot-next-platform/modules/pdv/skills/pdv-admin-api-client.md`.

## Riscos

- Permitir `client_id` no payload e abrir risco de vazamento entre tenants.
- Tratar estoque como saldo simples, sem movimento auditavel.
- Misturar operadores do PDV com usuarios globais sem vínculo claro ao Identity Hub.
- Criar CRUD generico centralizado.
- Copiar template web antes de definir rotas e client API.

## Fora De Escopo

- frente de caixa;
- venda;
- pagamento;
- caixa;
- sync offline;
- fiscal;
- pagamentos integrados;
- especializacoes por segmento.

## Validacao Do Gate

Resultado: aprovado documentalmente.

Validacoes executadas:

- parsing YAML de `docs/api/pdv-sprint-1-openapi.yaml`;
- checagem estatica para evitar `clientId` em payload OpenAPI;
- conferência de cobertura dos itens obrigatorios definidos em `docs/product/pdv-sprints.md`.

Pendencias antes de codigo funcional:

- resolvido: scopes iniciais confirmados como adequados.
- resolvido: operadores serao sempre vinculados a `identity_id` existente no Identity Hub.
- resolvido: estoque inicial permite ajuste manual e importacao em lote.
