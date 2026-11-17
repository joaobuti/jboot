# Security Checklist — Flow Card Actions — 2026-10-21

Escopo: `src/modules/kanban/actions`, UI de associacao/execucao, migrations 090/091.
Skill: `docs/skills/security-checklist/SKILL.md`.

- [x] Injection: SQL parametrizado; action IDs passam pelo catalogo allowlist;
  nenhum eval, shell, webhook ou URL fornecido pelo cliente.
- [x] Access control: JWT Flow, tenant e database_ref autenticados; configuracao
  apenas global_master/client_admin+flow:admin. Papel board_admin isolado nao basta.
- [x] Execucao: scope dedicado ou master; requireVisibleCard preserva policy
  tenant/quadro/escritorio e ACL. Membro precisa papel operacional e coluna editavel.
- [x] Concorrencia: card e coluna bloqueados; coluna atual, estado ativo e
  associacao revalidados antes de auditoria, na mesma transacao.
- [x] Saida: catalogo e retorno explicitos, sem entidade completa nem source_payload.
- [x] Dados sensiveis: auditoria somente IDs, nenhuma copia de titulo/documento;
  sem novos logs de conteudo, credenciais ou PII.
- [x] Senhas/criptografia: N/A, nenhuma credencial ou segredo novo.
- [x] Mass assignment: DTO whitelist/forbidNonWhitelisted; IDs de path UUID;
  actionIds unicos, tamanho e quantidade limitados; tenant nunca vem do body.
- [x] Recursos: rate limit 120 requisicoes/minuto por tenant/identidade/processo;
  expurgo de buckets expirados. Listas sao por board/colunas autorizadas e
  catalogo finito de produto; sem endpoint de varredura global nem N+1 por card.
- [x] SSRF/TLS externo: N/A, handlers nao fazem rede nem executam tarefas juridicas.
- [x] Dependencias: N/A para nova auditoria de dependencias; manifestos e locks
  nao alterados, nenhuma dependencia introduzida nesta entrega.
- [x] Frontend: cliente tipado, sessao Flow existente, sem token em localStorage
  novo, sem HTML arbitrario; botoes nao propagam clique/teclado ao modal do card.
- [x] Agentes: arquivos e outputs tratados como dados; ferramentas restritas ao
  escopo autorizado, sem mensagem externa, commit, push ou deploy.
- [x] Proveniencia: attestation registra validacoes reais e falhas fora do escopo;
  nao classificar production_ready nem afirmar suite global verde.

Evidencia: testes de policy, DTO, repositories, PostgreSQL e HTTP real via Nest
com JWT de teste e dados sinteticos em transacao revertida. Incluem 401, 403,
404 cross-tenant, 400 payload adulterado/duplicado e 409 apos movimento/remocao.

Limites: handlers atuais sao confirmacoes sem efeitos externos. Ao implementar
protocolo/monitoramento reais, revisar idempotencia, timeout, retries e limites
por acao; a auditoria de confirmacao nao comprova execucao juridica real.

## Sprint 2 — Acao Monitorar E Numero Do Processo (2026-11-06)

- [x] Autorizacao do registro do CNJ: card visivel (`requireVisibleCard`), card
  ativo, `board_admin` efetivo ou responsavel com papel `board_member`; leitor
  e membro sem responsabilidade recebem 403 antes de qualquer escrita (teste).
- [x] Autorizacao do Monitorar: mesmas pre-condicoes de executar acao
  (`requireExecutable`: escopo, card visivel, coluna editavel, acao atribuida a
  coluna atual) na leitura das opcoes e no envio; board destino exige papel de
  criacao de card (`createInDefaultColumnFromSource`); criar board continua
  restrito a `flow:admin` pelo endpoint existente.
- [x] Isolamento: tudo filtrado por `client_id`; unicidade do CNJ por tenant
  (outro tenant registra o mesmo numero, teste PostgreSQL); `availableCardIds`
  usa `visibleCardScope` (nao-membro nao recebe ids, teste PostgreSQL).
- [x] Entrada: CNJ so digitos ou mascara oficial, max 25, digito verificador
  mod 97 e tribunal pelo segmento J.TR; CHECK `^[0-9]{20}$` no banco;
  `petitionIds` UUID v4, 1-20, unicos; `additionalProperties` recusado.
- [x] Integridade entre bancos: unicidade conferida antes de criar o card; card
  e cliente gravados antes de marcar a peticao; marcacao condicional
  (primeiro envio vence, perdedor exclui logicamente o proprio card); vinculo
  `flow_petition` idempotente por card; retry retoma sem duplicar.
- [x] Divulgacao: aviso de duplicidade devolve so id/link do card que ja usa o
  numero (decisao do usuario); auditoria juridica usa HMAC do numero, nunca o
  numero em claro; o numero aparece no card e no historico do Flow, que ja
  exibem o CNJ nos cards exportados do DataJud.
- [x] Disponibilidade: falha de execucao do monitor (processo nao indexado,
  provedor fora) nao derruba mais o workflow; cadencia diaria; monitor
  existente e reaproveitado (sem segundo agendador).
- [x] SSRF/TLS externo: sem chamada externa nova; DataJud continua so pelo
  `svc-jboot-juridico-data`.
- [x] Dependencias: nenhuma adicionada; manifestos e locks inalterados.

Limites: corrigir/desvincular CNJ registrado nao existe nesta versao (erro de
digitacao exige intervencao de suporte). Monitores cujo workflow ja havia
morrido antes da correcao do worker so voltam quando o acompanhamento e
reativado (ou pelo Monitorar do mesmo processo).
