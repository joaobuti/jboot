# ADR 010: Monitoramento Duravel De Dados Juridicos Oficiais

```yaml
date: 2026-08-27
status: accepted
decision_owner: human
related_adr: 009-juridico-official-data-service
```

## Contexto

A Sprint 1 disponibilizou consulta DataJud manual e stateless. A Sprint 2
precisa monitorar processos selecionados pelo usuario, manter historico
normalizado e detectar movimentacoes sem transferir ao worker a autoridade de
tenant ou de persistencia.

## Alternativas Avaliadas

| Alternativa | Beneficio | Risco | Decisao |
|---|---|---|---|
| Cron no BFF NestJS | Menos componentes | Sem durabilidade, visibilidade ou idempotencia equivalentes ao Temporal | Rejeitada |
| Novo servico de monitoramento | Isolamento maximo | Novo runtime e custo operacional sem necessidade | Rejeitada |
| Worker acessa DataJud e banco | Menos hops | Quebra ownership do BFF, auth e isolamento | Rejeitada |
| Temporal Worker aciona BFF interno S2S | Reuso de durabilidade; BFF preserva ownership | Exige contrato S2S e observabilidade | Escolhida |

## Decisao

O `wrk-jboot-juridico` executa um workflow Temporal por acompanhamento ativo,
idempotente por `client_id + process_number_hmac`. A activity chama endpoint
interno autenticado no BFF. O BFF valida a identidade S2S do worker, resolve o
banco pelo contexto persistido do monitor, chama `svc-jboot-juridico-data`,
persiste o snapshot normalizado e calcula o diff.

```text
app juridico -> BFF (gestao/historico)
Temporal worker -> BFF interno S2S (disparo)
BFF -> svc-jboot-juridico-data -> DataJud
BFF -> banco juridico dedicado
```

O worker nao acessa DataJud, banco juridico ou payloads de usuario diretamente.
`svc-jboot-juridico-data` continua stateless e aceita o BFF como caller da
integracao DataJud.

## Retencao E Protecao De Dados

- acompanhamento exige opt-in explicito;
- dados operacionais existem enquanto o acompanhamento estiver ativo;
- pausa ou exclusao interrompe o polling;
- snapshots, movimentacoes e identificador cifrado sao eliminados 180 dias apos
  pausa ou exclusao, por rotina auditavel;
- HMAC e pseudonimo, nao anonimizado; segue a mesma politica quando vinculavel;
- escritorio/cliente atua como controlador e JBoot como operadora, sujeito a
  validacao juridica e contratual antes de producao.

## Consequencias

- BFF ganha registro de monitor, snapshots, diff e endpoint interno S2S;
- worker ganha workflow/activity de polling sem acesso direto a dados;
- o target local Juridico precisara incluir Temporal e worker somente para esta
  feature;
- nenhuma notificacao externa e autorizada nesta decisao.
