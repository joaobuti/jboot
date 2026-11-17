# Skill: deploy-contract

## Uso

Use ao alterar build, artifact, cache, healthcheck, proxy ou exposicao publica da landing JBoot.

## Regras

- A landing e owner exclusivo de `/`.
- O projeto nao deve responder por:

```text
/login
/apps
/pdv
/juridico
/admin/identity
/api/*
```

- Reverse proxy deve rotear paths especificos antes da landing.
- A landing nao deve ser fallback global para rotas desconhecidas do ecossistema.
- Staging e production devem usar o mesmo artefato promovido.
- HTML de `/` deve usar cache curto ou revalidavel.
- Assets versionados podem usar cache longo.
- `/api/*`, `/login` e apps autenticados nao herdam cache da landing.

## Healthcheck

```text
GET /
expected: 200
```

## Atualizacoes Obrigatorias

Atualizar `PROJECT_CONTRACT.md` e `docs/deploy.md` quando mudar:

- rota publica;
- owner de path;
- build command;
- start/serve command;
- artifact;
- healthcheck;
- cache;
- proxy;
- runtime dependency.
