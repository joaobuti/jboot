# Conector Claude Em Dev (Tuneis, Flow E Claude)

Guia para ligar as rotinas Claude (validacao de cadastro e Analise de Acoes) ao Flow rodando na
maquina de desenvolvimento. Use sempre que o Claude disser que o conector JBoot Flow "nao conectou"
(404 / `CLIENT_HTTP_NOT_IMPLEMENTED`) ou "exige autorizacao".

## Por Que Isso Se Repete

- As rotinas rodam na nuvem do Claude e precisam alcancar o Flow e a Identity da maquina local.
  Isso e feito por dois tuneis temporarios:
  - BFF: porta 8010 do host, pelo localhost.run (`*.lhr.life`) desde 2026-11-06. No quick tunnel do
    Cloudflare, o Claude passou a receber `McpAccessRefused` depois do login (ver
    `claude-connector-access-refused.md`);
  - Identity: porta do `JBOOT_API_PORT` no `.env`, hoje 8001, pelo Cloudflare (`*.trycloudflare.com`).
- O tunel temporario (`*.trycloudflare.com`) troca de endereco a cada inicio. O Cloudflare tambem o
  derruba sem aviso depois de algumas horas: o processo continua vivo, mas o endereco some do DNS.
- O Flow e a Identity precisam conhecer os enderecos publicos (OAuth do conector), e o Claude guarda o
  endereco do conector. Por isso, a cada tunel novo e preciso reconfigurar o Flow e trocar o conector no
  Claude.
- Solucao definitiva (pendente): tunel nomeado com endereco fixo (ex.: `flow-dev.jboot.com.br`).
  Exige o DNS do dominio no Cloudflare. Com ele, a secao "No Claude" e feita uma unica vez.
- Seguranca: o comando expoe o BFF e a Identity de dev na internet enquanto os tuneis estiverem de pe.
  Quem roda e uma pessoa, no host. Encerre com `make claude-tunnel ARGS=stop` ao terminar os testes.

## Comando (Flow)

Na raiz do repositorio (main ou worktree em uso), no terminal do host:

```bash
make claude-tunnel
```

O comando:

1. confere que o BFF e a Identity respondem localmente;
2. encerra os tuneis antigos e sobe os dois novos em segundo plano (logs em
   `~/.local/state/jboot-claude-tunnel/`);
3. descobre os enderecos publicos e espera responderem;
4. reinicia a Identity e a Platform API no container com as URLs publicas, via
   `tools/dev/flow-tunnel-apply.sh`, que define `JBOOT_IDENTITY_OAUTH_ISSUER_URL` e
   `JBOOT_FLOW_CONNECTOR_RESOURCE_URL`. Mantem o checkout do BFF que estiver em uso;
5. testa de fora: metadados do conector, MCP exigindo login (401) e issuer OAuth;
6. imprime o endereco do conector para colar no Claude.

Para ver os enderecos atuais e se respondem (reconhece tambem tuneis abertos a mao):

```bash
make claude-tunnel ARGS=status
```

Para encerrar os tuneis:

```bash
make claude-tunnel ARGS=stop
```

Quando o Claude falhar, rode `status` primeiro. Endereco que nao responde = tunel derrubado: rode
`make claude-tunnel` de novo e refaca a secao "No Claude".

Se os tuneis ja foram abertos a mao, basta reconfigurar o Flow com os enderecos deles:

```bash
docker compose exec -T jboot bash /workspace/tools/dev/flow-tunnel-apply.sh https://IDENTITY.trycloudflare.com https://ID.lhr.life
```

Em worktree, o caminho do script fica `/workspace/.claude/worktrees/NOME/tools/dev/flow-tunnel-apply.sh`.

## No Claude (Manual, Em Cada Conta Que Usa O Flow)

Vale para a conta do escritorio (rotina de validacao) e para a conta principal (rotina da Analise de
Acoes). O Claude nao tem API para isso; e feito na tela.

1. **Configuracoes -> Conectores -> JBoot Flow -> Desvincular.** Isso revoga no Flow o acesso antigo,
   o que e esperado aqui. Fora deste roteiro, nunca desvincule: a rotina perde o acesso na hora.
2. **Adicionar conector personalizado**: nome `JBoot Flow`, URL impressa pelo comando
   (`https://ID.lhr.life/kanban/mcp`). Client ID e secret em branco.
3. **Conectar** e fazer login no JBoot (usuario de teste: CPF `446.510.664-53`, senha `password`).
   Autorizar na tela de consentimento do Flow.
4. **Permissoes de ferramentas**: "Ferramentas somente leitura" e "Ferramentas de gravacao" em
   **Sempre permitir**. A rotina roda sem ninguem para aprovar.
5. **Claude Code -> Rotinas** (claude.ai/code/routines) -> abrir a rotina -> **Editar** -> secao de
   conectores: remover o JBoot Flow antigo, se aparecer, e adicionar o atual; salvar. A rotina guarda o
   proprio vinculo com o conector.
6. Conferir as instrucoes da rotina. Para a validacao: `docs/product/flow-office-kit-routine-prompt.md` (versao 4,
   2026-11-02: o Promobank vale como extrato quando nao ha HISCON; cole de novo se a rotina estiver com a v3).

## No Flow (Uma Vez Por Ambiente)

- Gateway de IA com execucao ligada (`AI_GATEWAY_EXECUTION_ENABLED=true`). O `make code-up` sobe com
  `false`; o sintoma e "Nao foi possivel enviar ... (ai_execution_not_enabled)". Para religar,
  encerre o processo atual do gateway (porta 8050) e suba de novo:

  ```bash
  docker compose exec -T jboot bash -lc 'cd /workspace/implementations/svc-jboot-ai-gateway && AI_GATEWAY_EXECUTION_ENABLED=true PORT=8050 setsid nohup npm run start:dev > /tmp/jboot-code-ai-gateway-api.log 2>&1 < /dev/null &'
  ```

- Configuracoes -> IA -> Conector Claude: ligado, com leitura de documentos permitida.
- Configuracoes -> IA -> Validacao de cadastro:
  - rotina por escritorio (ou conta principal);
  - "Documentos que a rotina de validacao pode ler", sem o HISCRED.
- Regra "Executar agente" da coluna Analise de Acoes com "Resultado esperado" = Analise de acoes, liberando
  so o HISCON; na mesma coluna, a regra "Quando a IA concluir a automacao sem erro" -> "Ir para a coluna"
  com a coluna seguinte (ex.: "Iniciais Geradas"); prompt da rotina
  (versao 2, que registra pela ferramenta `flow_submit_action_analysis`):
  `docs/product/flow-action-analysis-routine-prompt.md`. Depois de atualizar o Flow, reconecte o
  conector na rotina para ela enxergar a ferramenta nova.

- Regra "Executar agente" da coluna seguinte a Analise de Acoes (peticoes iniciais): "Resultado
  esperado" = Peticoes iniciais, "Quem gera o documento" = Flow, documentos HISCON e HISCRED; na mesma
  coluna, a regra "Quando a IA concluir a automacao sem erro" -> "Ir para a coluna" com a coluna seguinte. Prompt:
  `docs/product/flow-initial-petitions-routine-prompt.md`. Antes, na ficha do cliente: UF no endereco e
  "Acoes ajuizadas" (lista ou confirmacao de que nao ha nenhuma); em Escritorios -> Advogados, o advogado
  da UF. Quem aprova as pecas precisa de "Aprovar peticao inicial" (`flow:petition:approve`) ou
  `flow:admin`. Reconecte o conector na rotina para ela ver as ferramentas novas.

- Validador de assinatura (`docs/product/flow-signed-kit-sprints.md`, S2 e S5): no quadro, Acoes -> Editar a
  coluna -> "Validar assinatura", escolha o agente de rotina da sua conta (quem salva executa). Prompt:
  `docs/product/flow-signature-validator-routine-prompt.md` (rascunho para revisao do escritorio). O botao
  "Validar assinatura" do card dispara a rotina; quem tem `flow:validation:approve` confirma.
- E-mail do kit ao cliente (S4): em Escritorios -> Contrato Servicos, card "Envio do kit ao cliente". Usa o SMTP do
  Flow (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; Mailpit no dev, que so captura e nao entrega). Sem e-mail na ficha, o kit fica so para baixar no card.
- Requisitos de entrada (S1): nas automacoes da coluna, regra "Exigir para entrar" com "HISCON do cliente" e/ou
  "Kit assinado aprovado". Sem a regra, a coluna nao barra nada.

## Verificacoes (Quando Algo Falhar)

| Sintoma no Claude ou no Flow | Causa provavel | O que fazer |
|---|---|---|
| "servidor JBoot-Flow nao conectou (404 / CLIENT_HTTP_NOT_IMPLEMENTED)" | Tunel derrubado ou rotina presa a conector antigo | `make claude-tunnel ARGS=status`. Se nao responder: `make claude-tunnel` e secao "No Claude". Se responder: refazer o passo 5 |
| "Voce fez login em Flow, mas a solicitacao do Claude foi recusada em seguida" (`McpAccessRefused`) | Chamada com token barrada antes do tunel do BFF (quick tunnel do Cloudflare) | `claude-connector-access-refused.md`: BFF no localhost.run (`make claude-tunnel` ja faz) |
| "JBoot-Flow exige autorizacao e este ambiente nao consegue inicia-la" | Acesso do Claude revogado (ex.: Desvincular) | Secao "No Claude", passos 1 a 3 |
| Flow: "ai_execution_not_enabled" | Gateway com execucao desligada | Religar o gateway (secao "No Flow") |
| Botao Validar bloqueado logo apos uma falha | Validacao anterior "enviada" ainda no prazo | Libera sozinho em ate 5 min quando o Claude nao alcancou o Flow (`routine_not_reached`) ou 15 min sem chamada depois da leitura; a lista e a ficha encerram sozinhas. Corrija a conexao antes de validar de novo |
| Peticoes iniciais: "encerrada sem concluir" no historico logo apos o card entrar na coluna | Pre-condicao da ficha (UF, acoes ajuizadas, validacao) | Completar a ficha e mover o card de novo para a coluna |
| Peticoes iniciais: execucao expira com o card parado | Rotina passou 30 min sem chamar o Flow ou 3 h no total | Ver a sessao da rotina; o prompt manda enviar cada peca assim que pronta |
| Validacao: a rotina diz que nao conseguiu chamar `flow_complete_automation` ou que falta boardId/cardId | BFF anterior a 2026-10-28 (instrucao fixa do conector citava a conclusao de automacao) | Reiniciar o BFF; a validacao encerra so em `flow_submit_customer_validation`. Se o parecer foi registrado, a mensagem nao afeta o resultado |
| Validacao: orgao emissor do RG nao chega a ficha | Coluna antiga com 30 caracteres (RG modelo novo traz o nome do instituto) | Aplicar `docker/postgres/init/106_customer_juridico_rg_orgao_emissor_120.sql` e reiniciar o BFF; validar de novo (a ficha so recebe campo vazio) |
| Cliente fica "Aguardando confirmacao" | Parecer da IA ainda nao confirmado por uma pessoa | Clicar no selo na lista -> etapa Validacao -> Confirmar validacao |

Para ver se o Claude tem acesso valido (sem `revoked_at`) e para qual endereco:

```bash
docker compose exec -T postgres psql -U jboot -d jboot_identity -c "select created_at, revoked_at, revoked_reason, resource from oauth_grants order by created_at desc limit 5"
```

Para ver se a rotina chegou a chamar o Flow:

```bash
docker compose exec -T postgres psql -U jboot -d jboot_kanban_demo_dev -c "select created_at, event_type from kanban_audit_events where event_type like 'claude_connector%' order by created_at desc limit 10"
```
