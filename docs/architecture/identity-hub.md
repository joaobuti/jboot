# Identity Hub

## Decisao

Centralizar login, selecao de cliente/aplicacao, emissao de JWT e auditoria de acesso em um hub unico.

O hub autentica o usuario por CPF/CNPJ, resolve quais clientes e aplicacoes ele pode acessar, identifica o alvo de dados da aplicacao e emite um JWT proprio para a aplicacao autorizada.

## Fluxo

```text
login cpf/cnpj + credencial
  -> autentica no jboot_identity
  -> resolve clientes do usuario
  -> resolve aplicacoes contratadas por cliente
  -> se houver 1 destino: redirect direto
  -> se houver N destinos: usuario seleciona cliente + aplicacao
  -> hub emite JWT com contexto
  -> aplicacao valida JWT e usa database_ref/schema_ref autorizado
```

## Conceitos

- `identity`: pessoa fisica ou juridica que autentica por CPF/CNPJ.
- `client`: cliente/tenant contratante. Pode ser PJ, orgao publico ou PF.
- `application`: produto/servico disponivel no hub. Em produtos standalone, representa a aplicacao independente. Em produtos hospedados no Platform, representa o modulo/produto contratado, nao o shell tecnico `platform`.
- `client_application`: relacao cliente -> aplicacao contratada.
- `membership`: relacao identity -> client, com papeis e status.
- `entitlement`: permissao identity/client/application.
- `database_ref`: alvo de dados da aplicacao.
- `session_context`: cliente + aplicacao escolhido apos login.

## Padrao De Permissoes E Destinos

- A tela de selecao pos-login lista destinos operacionais do usuario: produtos standalone e modulos contratados dentro do Platform.
- `platform` e um shell/hub tecnico de UI e navegacao, nao uma permissao de negocio e nao deve aparecer como card selecionavel.
- Cada modulo do Platform deve ser cadastrado como `application` propria no Identity, com `client_application`, `entitlement`, `database_ref`, roles e scopes proprios.
- O `launchUrl` de modulos hospedados no Platform deve apontar para a rota do modulo dentro de `app-jboot-next-platform`.
- Ao selecionar um modulo do Platform, o JWT deve ter `aud`/`application_slug` do modulo selecionado, por exemplo `pdv` ou `juridico`, nunca `platform`.
- O shell Platform deve renderizar menus e funcionalidades apenas do modulo presente no contexto de sessao/JWT.
- BFFs de modulo validam o JWT do seu proprio `application_slug` e aplicam suas roles/scopes; nao devem aceitar permissao generica `platform`.
- Novos modulos do Platform devem seguir o mesmo contrato: criar application modular, contrato cliente/modulo, entitlement usuario/cliente/modulo e rota de entrada no Platform.

## JWT

O JWT emitido pelo hub deve conter o minimo necessario:

```json
{
  "sub": "identity_id",
  "sid": "session_id",
  "client_id": "client_id",
  "application_id": "application_id",
  "database_ref": "database_ref_id",
  "scopes": ["scope"],
  "roles": ["role"],
  "aud": "application_slug",
  "iss": "jboot-identity",
  "iat": 0,
  "exp": 0
}
```

Nao incluir CPF/CNPJ no JWT salvo necessidade explicita. Use `sub` e busque dados sensiveis no backend autorizado.

## Bancos

PostgreSQL tera um DB global:

- `jboot_identity`: login, clientes, aplicacoes, contratos, permissoes, database registry, sessoes e auditoria.

Aplicacoes podem usar:

- DB compartilhado multi-tenant;
- schema por cliente dentro de DB compartilhado;
- DB dedicado por cliente.

## Regras

- Todo acesso deve ser auditado.
- Todo cliente criado pelo fluxo principal deve nascer com ao menos uma aplicacao contratada e um usuario admin do cliente.
- CPF/CNPJ deve ser normalizado para digitos e protegido contra exposicao desnecessaria.
- A aplicacao nao decide se o usuario pode entrar; ela valida JWT e respeita o contexto emitido pelo hub.
- `database_ref` e parte do contrato de acesso. A aplicacao nao deve inferir banco/schema por input do usuario.
- Hospitais/saude podem usar schema dedicado ou DB dedicado conforme auditoria, LGPD e requisitos publicos.
- Apps com database compartilhado devem isolar registros por `client_id`.
- Apps sem database principal compartilhado devem provisionar database dedicado por fluxo assincrono, iniciado por `database_ref` em status `provisioning`.
- Estado real (2026-11-11): so `shared_db` funciona de ponta a ponta. O provisionamento de
  `dedicated_database` nunca foi implementado (o `database_ref` fica em `provisioning` e o login
  nao oferece o modulo) e o `schema_name` de `schema_per_client` e ignorado pelo
  `bff-jboot-platform`. Flow e Juridico usam `shared_db` por decisao do usuario; plano em
  `docs/product/tenant-isolation-sprints.md`.

## Redirect

- Um unico destino disponivel: redirect direto.
- Multiplos destinos: tela de selecao `client + application`.
- Troca de contexto deve gerar novo `session_context` e novo JWT.
- Para modulos do Platform, o redirect usa `client_application.config.launchUrl` do modulo e nao uma permissao `platform`.

## Auditoria obrigatoria

Registrar:

- tentativa de login;
- login bem-sucedido;
- falha de login;
- MFA;
- selecao de cliente/aplicacao;
- emissao de token;
- refresh/revogacao;
- troca de contexto;
- logout;
- negacao de acesso;
- IP, user-agent, device id quando disponivel.
