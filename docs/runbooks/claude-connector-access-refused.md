# Conector Claude: "Voce fez login, mas a solicitacao do Claude foi recusada" (McpAccessRefused)

Incidente de 2026-11-06, resolvido no mesmo dia. Este manual registra so o que teve efeito comprovado e
o roteiro de diagnostico que separa as causas sem chute. Guia geral do conector: `claudeconf.md`.

## Sintoma

- O conector personalizado e criado e a verificacao passa ("Conectando ao servidor 401",
  "Procurando configuracoes de login", "Verificando o provedor de login").
- O login no JBoot e o consentimento funcionam.
- Logo depois, o Claude mostra "Problema de conexao" e o aviso: "Voce fez login em Flow, mas a
  solicitacao do Claude foi recusada em seguida... Referencia do suporte do Claude: ofid_...".
- No DevTools do claude.ai, a navegacao final e
  `/code?...&step=end_error&oauth_error=McpAccessRefused`.

## Causa

O Claude recebe o token, mas a primeira chamada dele ao MCP **com o token** nunca chega ao BFF quando o
BFF esta exposto por um quick tunnel do Cloudflare (`*.trycloudflare.com`). A recusa nasce no caminho,
antes do cloudflared. O Claude a interpreta como "o servico recusou".

Evidencias do incidente:

| Etapa | Chegou ao nosso lado? | Resultado |
|---|---|---|
| Teste sem login do Claude (`probe`, UA `python-httpx`) | sim (tunel do BFF) | 401, esperado |
| Metadados PRM e AS | sim | 200 |
| Autorizacao, consentimento e token | sim (tunel da Identity) | token emitido |
| Chamada ao MCP com o token | **nao** (contadores do cloudflared e log do BFF sem nada) | Claude recebe recusa |

- Nas conexoes que funcionaram ate 2026-10-30, o Claude usava o token cerca de 2 s depois de recebe-lo
  (`oauth_grants.last_used_at`). Nas tentativas de 2026-11-06, `last_used_at` ficou vazio em todas.
- Nada mudou do nosso lado entre 30/10 e 06/11, conferido item a item:
  - codigo da Identity sem commits;
  - `@modelcontextprotocol/sdk`, `express` e `express-rate-limit` instalados em 16/10;
  - cloudflared com o mesmo binario (2026.9.3);
  - relogio do WSL e dos containers certo;
  - pedidos de autorizacao iguais aos antigos (cliente, redirect, escopos, `state`, `resource`);
  - `issuer` igual ao `iss` do retorno.
- O fluxo completo, feito daqui pelos tuneis publicos (authorize -> decision -> token -> `initialize` ->
  `tools/list`), funcionava: o defeito so aparecia na chamada vinda da nuvem do Claude.
- Com o BFF no localhost.run e o restante igual (inclusive a Identity no Cloudflare), o Claude conectou e
  usou o token 1,4 s depois do login.

O mecanismo exato do lado Cloudflare/Claude (bloqueio na borda, origem diferente da chamada autenticada)
nao foi isolado. A correcao abaixo nao depende dele.

O que **nao** era a causa, verificado:
- Identity fora do ar ou configuracao perdida ao recriar os containers;
- issuer ou resource desatualizados;
- formato da resposta do token;
- introspeccao BFF -> Identity;
- segredo do service token;
- o aviso `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` no log da Identity (so log; ja existia quando funcionava);
- o processo do gateway de IA com issuer `localhost` (outro processo, sem relacao com o conector).

A compactacao do disco do WSL, que reiniciou o WSL antes do incidente, fica como evidencia. Nao ha
ligacao comprovada com ela.

## Correcao (O Que Resolveu)

O tunel do BFF passa a ser o localhost.run (SSH, sem instalar nada). A Identity continua no quick tunnel
do Cloudflare.

`make claude-tunnel` ja faz isso por padrao desde esta correcao:

```bash
make claude-tunnel
```

Depois, a secao "No Claude" de `claudeconf.md`, com a URL `https://<id>.lhr.life/kanban/mcp`.

Na primeira vez, o ssh grava a chave do `localhost.run` em `~/.ssh/known_hosts`
(`StrictHostKeyChecking=accept-new`). Para voltar ao Cloudflare no BFF (por exemplo, para testar se o
problema sumiu): `BFF_TUNNEL=cloudflare make claude-tunnel`.

### Manualmente (Equivalente)

1. Num terminal do host, deixe aberto:

   ```bash
   ssh -o ServerAliveInterval=30 -R 80:localhost:8010 nokey@localhost.run
   ```

   Anote o endereco `https://<id>.lhr.life` impresso.
2. Reconfigure o Flow com a Identity atual e o BFF novo. O caminho e o do checkout que esta servindo o
   BFF; em worktree, `/workspace/.claude/worktrees/NOME/tools/dev/...`:

   ```bash
   docker compose exec -T jboot bash /workspace/tools/dev/flow-tunnel-apply.sh https://IDENTITY.trycloudflare.com https://ID.lhr.life
   ```

3. No Claude: remover o conector antigo, adicionar com `https://<id>.lhr.life/kanban/mcp`, conectar.

O endereco do localhost.run gratuito muda quando a conexao SSH cai. Nesse caso, refazer os passos 1 a 3.
Um endereco fixo exige conta no localhost.run com chave SSH ou tunel nomeado.

## Diagnostico Quando Voltar A Falhar

Siga nesta ordem. Cada passo separa uma causa.

1. **Os tuneis respondem?** `make claude-tunnel ARGS=status`. Endereco sem resposta = tunel caiu: rode
   `make claude-tunnel` e refaca "No Claude".
2. **Qual o erro do Claude?** No claude.ai, abra o DevTools (F12) -> Network -> "Preserve log", filtre
   `mcp` e conecte de novo. A requisicao `/code?...step=end_error` traz `oauth_error`:
   - `McpAccessRefused`: va ao passo 3;
   - outro valor: o problema e anterior ao token (metadados, login, consentimento). Veja
     `claudeconf.md`.
3. **O token foi emitido e usado?** No Postgres (`jboot_identity`):

   ```sql
   select created_at, last_used_at, resource, revoked_at
   from oauth_grants order by created_at desc limit 5;
   ```

   - Grant novo com `last_used_at` vazio = token emitido, mas o Claude nunca chamou o BFF com ele. Va
     ao passo 4.
   - Sem grant novo = o login ou o consentimento nao terminou. Veja o log da Identity
     (`/tmp/jboot-code-identity-api.log` no container).
   - `last_used_at` preenchido e ainda assim recusado = o BFF recusou o token. Veja a introspeccao no
     log do BFF (`/tmp/jboot-code-platform-api.log`) e o `resource` contra
     `JBOOT_FLOW_CONNECTOR_RESOURCE_URL`.
4. **A chamada chega ao tunel?** Com o BFF no cloudflared, compare
   `curl -s 127.0.0.1:20310/metrics | grep response_by_code` antes e depois de uma tentativa. Se so
   aumentar um 401 (o `probe`) e os 200 dos metadados, a chamada com token nao chegou: troque o tunel
   do BFF (secao "Correcao").
5. **O nosso lado funciona de ponta a ponta?** Faca o fluxo OAuth completo pelos tuneis publicos com o
   usuario de teste: authorize com o `client_id` do Claude
   (`https://claude.ai/oauth/mcp-oauth-client-metadata`) e PKCE, `POST /oauth/requests/:id/decision`,
   `POST /oauth/token`, `initialize` e `tools/list` no MCP. Se passar, o defeito esta entre o Claude e o
   tunel. Revogue o grant de teste depois (`DELETE /oauth/grants/:id`).
6. **Ainda sem explicacao:** leve a referencia `ofid_...` do aviso ao suporte da Anthropic. So o lado do
   Claude ve a resposta exata que ele recebeu.

## Cuidados

- Nao inserir tokens ou credenciais no banco para testar; use o fluxo OAuth real do passo 5.
- Os testes de `make claude-tunnel` saem desta maquina e passam mesmo com o defeito. So a conexao feita
  pelo Claude prova que funciona.
