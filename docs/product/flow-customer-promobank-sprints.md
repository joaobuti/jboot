# Flow — Promobank Na Ficha Do Cliente E HISCON Obrigatorio Para Avancar

```yaml
status: concluida (conferencia na tela e teste com a rotina real pendentes)
data: 2026-11-02
target_project: implementations/bff-jboot-platform + implementations/app-jboot-next-platform
target_module: modules/kanban
branch: feature/flow-customer-promobank (a partir de feature/flow-card-office-kit)
relacionados: ADR 017 (documentos da ficha), ADR 019 (decisoes 9, 11, 18), docs/product/flow-office-kit-routine-prompt.md
```

## Pedido

Novo upload "Promobank" na ficha do cliente. Na validacao de documentos, o Promobank basta quando o
cliente ainda nao tem HISCON. O HISCON continua obrigatorio nas etapas seguintes (Analise de Acoes e
Peticoes) e pode ser enviado depois da validacao.

## Decisoes Do Usuario (2026-11-02)

1. Validacao de documentos: exige HISCON **ou** Promobank. Com HISCON, o Promobank e opcional (pode vir
   junto).
2. HISCON enviado depois da validacao confirmada nao reabre a validacao: o cliente continua validado e as
   automacoes passam a ler esse HISCON. Quem confere o HISCON e a Analise de Acoes.
3. O HISCON que faltava pode ser enviado na ficha (Clientes -> Documentos, como hoje) e no card (painel
   Cliente, botao "Enviar HISCON").
4. HISCON obrigatorio para avancar: o card nao entra na coluna cuja automacao le o HISCON enquanto o
   cliente vinculado nao tiver HISCON.
   - **Revisado pelo usuario em 2026-11-02:** o bloqueio deduzido das regras de agente nao era configuravel e
     feria a premissa do Kanban (acoes e automacoes configuraveis por coluna). Passou a ser a regra
     "Exigir para entrar" da coluna (`docs/product/flow-signed-kit-sprints.md`, S1); a migration criou a
     regra nas colunas que o bloqueio deduzido barrava.
5. Selo automatico "SEM HISCON" no card (quadro e modal), no estilo das tags, calculado pelo Flow: some
   sozinho quando o HISCON e enviado. Nao e tag editavel.
6. Uso pela IA: a validacao le o Promobank no lugar do HISCON (contratos do kit); Analise de Acoes e
   Peticoes exigem HISCON (decisao 4 segura o card antes).

## PE Decision

- Mesmo processo e deploy do BFF/web do Flow; sem fronteira nova (Deployment Boundary Gate). Sem Stack
  Fit Gate.
- Catalogo: tipo novo `promobank` (migration `113` amplia os CHECK de `document_type` e da politica de
  leitura). Regra "um dos dois" no catalogo (`EXTRACT_ALTERNATIVES`): `missing` devolve
  `extrato_beneficio` quando nenhum dos dois existe; cada item da resposta ganha `oneOf: 'extrato' | null`.
- Status da validacao: inalterado na forma. HISCON fora do snapshot (enviado depois) nao muda o
  `sameDocuments`; trocar ou remover documento que entrou na validacao continua invalidando, como hoje.
- Automacoes (`AutomationCustomerService.resolve`): alem do snapshot da validacao confirmada, o HISCON
  atual da ficha quando ele nao esta no snapshot (`LATE_DOCUMENT_TYPES = ['extrato_beneficio']`), sempre
  respeitando a lista de documentos da regra.
- Drive: HISCON enviado depois da validacao confirmada entra na fila do Drive como os documentos validados;
  a reconciliacao cobre o Drive ligado depois.
- Bloqueio do movimento (substituido pela regra "Exigir para entrar", S1 de flow-signed-kit-sprints.md;
  o texto abaixo descreve a versao deduzida da P1): a
  coluna de destino tem regra ativa "Executar agente" por rotina que le o HISCON (resultado esperado
  Analise de acoes ou Peticoes iniciais, ou lista de documentos com HISCON) e o card tem cliente vinculado
  sem HISCON atual -> 422 `customer_without_hiscon`. Regra de rotina sem lista de documentos e com
  resultado "Comentario" nao conta (nao declara que le o HISCON). Movimento pelas regras de automacao passa
  pelo mesmo `CardsService.move` e tambem e bloqueado.
- Selo: `CardDto.customerWithoutHiscon` (cliente vinculado com validacao confirmada e sem HISCON atual).
  So cliente com validacao confirmada, para nao marcar cards de lead/CRM que nao usam HISCON.
- Painel Cliente do card: selo e botao "Enviar HISCON" quando o cliente nao tem HISCON e quem ve pode
  enviar documento na ficha (`canUploadDocuments` calculado no backend com a mesma regra da ficha).
- Prompt da validacao: trecho `[FLOW]` dizendo que, sem HISCON, o extrato de emprestimos e o Promobank.
  O usuario cola de novo na rotina.
- UI/UX: reuso dos itens da etapa Documentos da ficha, dos badges `*-subtle` das tags e do botao de envio
  do painel. Sem padrao novo.

## Sprint P1: Promobank E HISCON Para Avancar

> Status: `concluida` (2026-11-02). Conferencia na tela e teste com a rotina de validacao (prompt v4) pendentes.

- BFF: catalogo, migration `113`, regra "um dos dois", leitura pelas automacoes, Drive, gate de movimento,
  selo no card, `canUploadDocuments` no painel Cliente.
- Web: item Promobank na ficha (novo cadastro e cadastro existente) com "HISCON ou Promobank: um dos dois";
  selo "SEM HISCON" no tile e no modal; "Enviar HISCON" no painel Cliente; mensagem do bloqueio ao mover.
- Prompt da validacao e runbook.
- Testes: catalogo, status, gate (com e sem regra, com e sem HISCON), leitura do HISCON tardio,
  repositorio com Postgres real.
