# Comanda Sprints (Autoatendimento Digital)

## Objetivo

Detalhar as sprints funcionais do modulo `comanda` (autoatendimento via QR de mesa para restaurante/lanchonete), com escopo, criterios de aceite, fora de escopo e estado de entrega por sprint.

Escopo definido via `PO -> PE -> Architect -> confirmacao humana` (2026-08-20). Fontes de verdade tecnicas:

- `implementations/bff-jboot-platform/modules/comanda/MODULE_CONTRACT.md`
- `implementations/app-jboot-next-platform/modules/comanda/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/catalog/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/establishment-customers/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/pdv/MODULE_CONTRACT.md` (feature staff)

## Objetivo De Negocio

Eliminar o garcom da etapa de "tirar pedido". O cliente pede pelo proprio celular via QR na mesa, sem app e sem login. O Operador de Balcao controla explicitamente a entrada de cada item em producao e a liberacao para entrega. Cozinha e bar processam em filas FIFO proprias. O garcom so entrega fisicamente o que ja foi liberado, e cobra quando a conta e impressa.

## Projetos

| Projeto | Responsabilidade |
|---|---|
| `implementations/bff-jboot-platform/modules/comanda` | Backend publico/anonimo: sessao por QR + telefone/CPF, pedido, cancelamento pelo cliente, solicitacao de fechamento. |
| `implementations/app-jboot-next-platform/modules/comanda` | Front publico do cliente (mobile-first, sem shell admin, sem login). |
| `implementations/bff-jboot-platform/modules/catalog` | Cardapio publico e atributos de visibilidade/fila do produto. |
| `implementations/bff-jboot-platform/modules/establishment-customers` | Cadastro de cliente final (nivel 2), resolvido por telefone/CPF na abertura da comanda. |
| `implementations/bff-jboot-platform/modules/pdv` + `implementations/app-jboot-next-platform/modules/pdv` | Feature staff: triagem, filas de cozinha/bar, fechamento com confirmacao de pagamento. |

## Papeis

| Papel | Autenticacao | Escopo funcional |
|---|---|---|
| Cliente anonimo por comanda | Sem Identity Hub; token de sessao proprio por telefone/CPF | Abrir/retomar comanda, ver cardapio, enviar pedidos, cancelar item `pendente`, solicitar fechamento |
| Staff Cozinha | Identity Hub, `pdv:comanda:cozinha` | Fila FIFO de `em_producao` com `queue_type=cozinha`; marcar `pronto` |
| Staff Bar | Identity Hub, `pdv:comanda:bar` | Fila FIFO de `em_producao` com `queue_type=bar`; marcar `pronto` |
| Operador de Balcao | Identity Hub, `pdv:comanda:balcao` | Triagem `pendente -> em_producao`; liberacao `pronto -> liberado_para_entrega`; cancelamento de excecao; fechamento normal e de comanda esquecida; confirmacao de pagamento |
| Garcom | Sem sistema, sem login | Acao puramente fisica: entrega do item liberado e cobranca na mesa |
| Admin do tenant | Identity Hub, escopo administrativo existente | Liga/desliga a capability `comanda` do `client_id` via tela de clientes do identity-admin (sub-modulo do PDV) |

## Maquina De Estados Do Item

```
pendente
   |  [Operador de Balcao encaminha manualmente]
   v
em_producao   -- fila FIFO de cozinha OU bar, conforme queue_type do produto
   |  [Staff Cozinha/Bar marca finalizado]
   v
pronto        -- fila de "prontos aguardando liberacao" do Operador de Balcao
   |  [Operador de Balcao libera]
   v
liberado_para_entrega  -- garcom entrega fisicamente, sem registrar nada no sistema
```

Cancelamento: item `pendente` cancelavel pelo cliente ou pelo balcao, sem motivo. A partir de `em_producao`, somente pelo balcao, como excecao auditada (`cancel_reason` obrigatorio, `cancel_is_exception=true`).

Cozinha/bar nao notificam o balcao automaticamente ao terminar — sao duas intervencoes manuais do balcao no ciclo de vida de cada item, por decisao de produto.

## Decisoes De Escopo Fechadas (Nao Reabrir Sem Nova Decisao Humana)

- **Sem totem fisico.** Apenas QR lido no celular do proprio cliente.
- **Sem captura de pagamento (PSP/Pix/cartao) em v1.** Cobranca sempre mediada por humano: cliente paga no caixa ou o total e impresso e o garcom cobra na mesa.
- **Sem emissao fiscal automatica no fechamento.** Emissao de NFC-e continua manual, pelo fluxo de vendas ja existente do PDV.
- **Sem validacao de geolocalizacao/NFC de presenca fisica.** O freio contra pedido remoto e a triagem manual do balcao, que confirma visualmente a ocupacao da mesa antes de encaminhar o item para producao. Ver justificativa completa no `MODULE_CONTRACT.md` do `comanda`.
- **Comanda e sempre individual**, nunca compartilhada por mesa. N pessoas na mesma mesa geram N comandas independentes.
- **Sem comanda multi-celular** (decisao do usuario, 2026-08-22). "Cada pessoa da mesa pedindo do proprio celular na mesma comanda" **nao e um cenario a cobrir** — e escopo excluido de proposito, nao pendencia. A comanda continua amarrada ao telefone/CPF de quem a abriu (`UNIQUE (client_id, customer_id) WHERE status='aberta'`).
  - Isso **nao** impede a conta unica de grupo: uma mesa de 10 pessoas com uma comanda so e atendida hoje por uma pessoa lancando os pedidos da mesa no proprio celular. Combinada com o pagamento parcial da Sprint 9, essa e a cobertura completa do cenario real: cada um que vai embora paga sua parte no balcao, o saldo cai, pedidos novos sobem o saldo, e a comanda fecha quando zera.
  - Consequencia aceita: os que pagam parte e vao embora **nao recebem nota fiscal da parte deles** — a venda filha carrega o pagamento e nao tem itens; a nota sai da venda-pai, com o consumo completo, no fechamento.
- **Fechamento sempre exige confirmacao explicita de pagamento** pelo Operador de Balcao, tanto no fluxo normal quanto no de comanda esquecida.

## Sprints

### Sprint 1 — Fundacao: flag de tenant + cardapio publico

Estado: **concluida** (`b58953c`).

Objetivo: habilitar/desabilitar a feature por tenant com seguranca e expor o cardapio filtrado.

Entregue:

- `catalog_categories.visible_in_comanda` (novo) e `catalog_products.queue_type` (`cozinha`|`bar`, obrigatorio via validacao de aplicacao quando `visible_in_comanda=true`, no create e no update). Migracao `docker/postgres/init/038_catalog_comanda_visibility.sql`.
- `GET /catalog/public/menu/:clientId` — primeira rota publica genuina do repositorio, sem guard de Identity Hub.
- Cascata de visibilidade: categoria com `visible_in_comanda=false` esconde todos os produtos dela, mesmo os individualmente visiveis. Cascata rasa (nao considera `parent_id`).
- Produto visivel sem `category_id` cai em secao sintetica "Outros". Produto visivel com categoria oculta nao aparece em lugar nenhum.
- Gate por capability de tenant `comanda` em `jboot_identity.client_capabilities` (sub-modulo da application `pdv` no `capability_registry`), lida via `DatabaseService.queryIdentity`. Originalmente flag jsonb `autoatendimento_comanda` em `client_applications.config`; migrado para `client_capabilities` em 2026-08-23 (ADR 008, migracao `044`) para unificar com o mecanismo de sub-modulos e ganhar UI de gestao no identity-admin.
- Tenant sem a flag, `client_id` invalido ou inexistente convergem para o mesmo cardapio vazio com `200` — nunca vaza existencia de tenant.

Fora de escopo: sessao de comanda, carrinho, filas.

### Sprint 2 — Abertura de comanda, sessao e envio de pedidos

Estado: **concluida** (backend `2bef503`, front publico `3cf6643`, ajuste `182a8e8`).

Objetivo: cliente consegue pedir sozinho via QR, sem garcom anotando.

Entregue:

- Migracao `docker/postgres/init/039_comanda_core.sql`: `comanda_tables`, `comandas`, `comanda_pedidos`, `comanda_itens`, mais tabela auxiliar de idempotencia. Indice unico garantindo no maximo uma comanda `aberta` por `(client_id, customer_id)`.
- Dois segredos JWT independentes entre si e do Identity Hub: `JBOOT_COMANDA_QR_SECRET` (QR de mesa, sem expiracao por tempo, revogacao granular por `comanda_tables.token_version`) e `JBOOT_COMANDA_SESSION_SECRET` (sessao do cliente, TTL ~8h, renovavel).
- `ComandaSessionGuard` independente — nunca importa nem estende `PdvAuthGuard`. Modelo hibrido: valida assinatura do JWT e rele `comandas.status` no banco a cada mutacao, invalidando a sessao no fechamento sem blocklist/Redis.
- Sem sessao valida: cliente informa telefone OU CPF, o sistema resolve/cria o registro em `establishment-customers` e retoma a comanda `aberta` existente ou cria uma nova.
- `POST /comanda/public/sessions`, `POST /comanda/public/sessions/refresh`, `GET /comanda/public/me`, `POST /comanda/public/pedidos`, `DELETE /comanda/public/itens/:itemId`, `POST /comanda/public/fechamento`.
- Preco, nome e `queue_type` de cada item sempre resolvidos no servidor a partir do catalogo — nunca aceitos do payload do cliente.
- Idempotencia opcional por header `Idempotency-Key` no envio de pedido.
- Front publico mobile-first, fora do shell administrativo, sem tela de login.

Fora de escopo: triagem, filas de producao, fechamento efetivo.

### Sprint 3 — Triagem do balcao + filas de cozinha/bar

Estado: **concluida** (`89892f2`).

Objetivo: cozinha e bar so processam o que foi triado; o balcao controla explicitamente entrada e saida da producao.

Entregue:

- Feature nova em `src/modules/pdv/admin/comanda/`, com repository proprio sobre as mesmas tabelas do modulo publico (acesso paralelo e independente, sem import cruzado entre `pdv/admin` e `modules/comanda`).
- `GET /pdv/comanda/itens/pendentes`, `POST /pdv/comanda/itens/:id/encaminhar`, `GET /pdv/comanda/fila?queueType=`, `POST /pdv/comanda/itens/:id/finalizar`, `GET /pdv/comanda/itens/prontos`, `POST /pdv/comanda/itens/:id/liberar`, `POST /pdv/comanda/itens/:id/cancelar`.
- Checagem de escopo contra o `queue_type` real, alem do `@RequireScopes` (que e OR-any-of e nao amarra escopo a parametro): staff de bar nao le nem finaliza item de cozinha, e vice-versa.
- Escopos `pdv:comanda:cozinha`, `pdv:comanda:bar` e `pdv:comanda:balcao` adicionados ao seed de entitlement existente (`docker/postgres/init/007_identity_pdv_dev_seed.sql`) para Operador Senior e Usuario Teste. Nenhum `application_slug` novo.
- Telas de staff `/pdv/comanda/triagem`, `/pdv/comanda/cozinha` e `/pdv/comanda/bar`, com item de menu condicionado ao escopo presente no JWT.
- Toda mutacao registra evento de auditoria via `PdvAuditService`.

Fora de escopo: fechamento, painel de acompanhamento.

### Sprint 4 — Solicitacao e fechamento de comanda

Estado: **concluida** (`bf8365d`). Completa o objetivo essencial da feature.

Objetivo: fechar o ciclo — cliente pede fechamento sem chamar garcom, balcao cobra com dado consolidado.

Entregue:

- `GET /pdv/comanda` (comandas abertas, com flag "esquecida" calculada em memoria: sem solicitacao de fechamento e sem atividade ha mais de **45 minutos**, valor de negocio definido pelo usuario), `GET /pdv/comanda/:id` (detalhe com itens e total), `POST /pdv/comanda/:id/fechar`.
- Fechamento normal e de comanda esquecida seguem o mesmo caminho e ambos exigem confirmacao explicita de pagamento, gravada em `paid_confirmed_by`/`paid_confirmed_at`.
- Comanda sem atividade **nao expira automaticamente** — vira alerta na visao do balcao e permanece aberta ate acao humana.
- Fechamento orquestra `SalesService` in-process (chamada de metodo, nao HTTP): `create`, `addItem` por item ativo, `addPayment` com o total calculado no servidor, `complete` sem emissao fiscal automatica. O Operador de Balcao nao precisa do escopo `pdv:sales:write`.
- Tela `/pdv/comanda/fechamento` para o balcao revisar itens/total, escolher a forma de pagamento recebida e fechar.

Fora de escopo: captura de pagamento digital (decisao de v1, nao e debito).

### Sprint 5 — Painel de acompanhamento (aditiva)

Estado: **concluida** (`66aad40`). Rota `/pdv/comanda/painel`.

Objetivo: dar visibilidade de status sem depender de alguem perguntar ao staff.

Escopo: uma unica fonte de status de pedido — fila de cozinha/bar, posicao e o que ja foi liberado — renderizada numa pagina pensada para ficar aberta numa TV (cozinha, bar ou salao). E a MESMA tela para qualquer publico, nao ha variante por tela fisica. Somente leitura: encaminhar/finalizar/liberar/cancelar continuam exclusivos das telas da Sprint 3.

Decisoes tomadas (confirmadas pelo usuario em 2026-08-20, detalhadas em `implementations/app-jboot-next-platform/modules/pdv/MODULE_CONTRACT.md`):

- **Staff-autenticado**, reaproveitando a sessao Identity/`pdv` existente — nao e endpoint publico. Motivo: evita abrir nova superficie publica de leitura de dado operacional; o staff loga uma vez e deixa a aba aberta na TV.
- **Sem endpoint novo**: compoe os tres endpoints ja existentes do `ComandaAdminController` (`itens/pendentes`, `fila?queueType=`, `itens/prontos`), chamados em paralelo. Nenhum repository/service novo no backend.
- Renderiza dentro do mesmo shell admin das demais telas — nao foi criado layout "kiosk" sem chrome, por nao haver precedente no repositorio.
- Reaproveita `ComandaQueueList` (com `actionLabel`/`actionIcon`/`onAction` opcionais e `showPosition`) em vez de componente de lista novo.
- Cada secao carrega e falha de forma independente: operador sem escopo para uma secao ve erro so naquela, as demais continuam funcionando.

Nao bloqueia o objetivo essencial da feature.

### Sprint 6 — CPF na nota (aditiva)

Estado: **concluida** (`eb921d8`).

Objetivo: reaproveitar o CPF ja capturado na abertura da comanda para a emissao fiscal, evitando redigitacao.

Entregue:

- `GET /pdv/sales/:id/comanda-customer` — dado um `saleId`, resolve a comanda de origem pelo caminho inverso (`comandas.closed_sale_id`), ja que `pdv_sales` nao guarda referencia de volta. Decisao documentada em `implementations/bff-jboot-platform/modules/pdv/MODULE_CONTRACT.md`.
- Quando a venda vem do fechamento de uma comanda, a tela de emissao de NF do PDV pre-preenche destinatario/CPF a partir do cliente final ja capturado na abertura.
- Emissao continua **100% manual**, sem nenhuma automacao no fechamento — a sprint e apenas conveniencia de preenchimento, o operador edita e confirma antes de emitir.

### Sprint 7 — Cadastro de mesas + QR imprimivel (bloqueante de producao)

Estado: **concluida** (`c2c9928`). Rotas `pdv/comanda-mesas` (backend) e `/pdv/comanda/mesas` (front).

Objetivo: tornar a feature operavel em cliente real. Hoje `comanda_tables` so e populada por seed SQL de dev e nao existe nada no repositorio que gere o QR impresso — sem esta sprint, um tenant novo nao consegue nem cadastrar as mesas dele nem colocar o QR na mesa. Era um debito registrado na secao final deste documento; foi promovido a sprint por bloquear producao.

Escopo confirmado pelo usuario em 2026-08-22:

- CRUD administrativo de mesas seguindo `implementations/app-jboot-next-platform/skills/platform-crud-ui.md`: listagem, modal de criacao/edicao, inativacao (nunca delete fisico — o QR impresso referencia a mesa).
- Campos da mesa: `table_number` (unico por tenant) e `label` opcional. **Sem capacidade/lugares** (decisao do usuario: nao ha controle de lotacao em v1).
- Geracao do QR assinado por mesa, com o payload ja definido no contrato (`{ typ: 'comanda_table_qr', client_id, table_number, iat }`, sem expiracao por tempo).
- **Impressao em PDF, por mesa e em lote** (decisao do usuario). Implementada como folha de impressao do proprio navegador (`window.print()` sobre layout dedicado), nao como geracao de PDF no servidor.
- Revogacao de QR de uma mesa via `token_version++`, invalidando o impresso antigo sem trocar o segredo JWT global.
- FK composta `comandas(client_id, table_number) -> comanda_tables(client_id, table_number)`, hoje inexistente. A migracao materializa as mesas orfas antes de criar a constraint.
- Escopo de leitura: `pdv:comanda:balcao` OU `pdv:admin:read`. Escopo de escrita: `pdv:admin:write`.

Fora de escopo: posicionamento espacial da mesa (ver Sprint 8), estado manual de mesa, geracao de PDF server-side.

### Sprint 8 — Mapa do salao

Estado: **concluida** (`c2c9928`). Rotas `pdv/comanda-salao` (backend) e `/pdv/comanda/salao` (front).

Objetivo: dar ao Operador de Balcao a visao por mesa que hoje nao existe. As telas atuais sao todas orientadas a item (fila FIFO) ou a comanda; nenhuma responde "como esta o salao agora". Lacuna identificada pelo usuario em 2026-08-22, nao mapeada na definicao original das sprints.

Escopo confirmado pelo usuario:

- **Grid de cards**, ordenado por numero de mesa. **Sem planta baixa posicional** (decisao do usuario: coordenada por mesa + editor de layout nao paga o custo para 10-30 mesas; reabrir com dado de uso real, nao por especulacao).
- Estados da mesa, todos **derivados**, sem coluna nova e **sem estado manual** (decisao do usuario: mesa marcada errada a mao e pior que mesa sem marcacao):

  | Estado | Derivacao |
  |---|---|
  | `livre` | nenhuma comanda `aberta` com aquele `table_number` |
  | `ocupada` | >= 1 comanda `aberta` |
  | `item_pronto` | >= 1 item `pronto` em alguma comanda da mesa (acao do balcao) |
  | `conta_solicitada` | >= 1 comanda com `closing_requested_at IS NOT NULL` (acao do balcao) |
  | `esquecida` | >= 1 comanda com `isForgotten` (regra de 45min ja existente) |
  | `inativa` | `comanda_tables.status = 'inactive'` |

- **Contagem de comandas abertas por mesa visivel no card** (pedido explicito do usuario): comanda e sempre individual, entao uma mesa de 10 lugares pode ter 5 comandas simultaneas. O card mostra quantas pessoas estao com comanda aberta ali, identificadas por nome/CPF mascarado, alem do total agregado da mesa. Card que sugira "uma conta por mesa" esta errado neste produto.
- Clique na mesa abre painel lateral com as N comandas, cada uma com as acoes ja existentes (detalhe e fechamento com confirmacao de pagamento).
- Endpoint agregado unico `GET /pdv/comanda/salao` — evita tres pollings concorrentes na tela mais aberta da operacao. Polling de 15s, alinhado as demais telas de comanda.
- Botao de cadastro de mesa acessivel a partir do proprio Salao (pedido do usuario), visivel apenas para quem tem `pdv:admin:write`.
- Menu agrupado: `Comanda` vira item unico com `subItems` (`Salao`, `Triagem`, `Fechamento`, `Cozinha`, `Bar`, `Painel`, `Mesas`), colapsando para item plano quando o escopo do usuario libera um unico filho. Decisao de UI/UX aprovada pelo usuario em 2026-08-22; a organizacao final de cada item sera revisada pelo usuario apos ver a tela.

Fora de escopo: substituir a Triagem (Salao e visao por mesa, Triagem e fila por item — eixos diferentes do mesmo dado).

### Sprint 9 — Pagamento dividido no fechamento (venda-pai e vendas derivadas)

Estado: **concluida**. Endpoint `POST /pdv/comanda/:id/pagamentos`; `GET /pdv/comanda/:id` passa a devolver `saldo` (total, pago, saldo e recebimentos).

Objetivo: permitir que uma comanda seja quitada por mais de um pagamento, mantendo-a aberta enquanto houver saldo. Cenario do usuario: conta de R$ 100 dividida entre duas pessoas; uma paga metade e vai embora.

Decisoes do usuario (2026-08-22):

1. **Divisao por valor livre e por partes iguais** (`/2`, `/3`). Divisao por item fica fora: comanda ja e individual por pessoa, entao "cada um paga o que consumiu" e o comportamento padrao sem feature nenhuma; o caso real e alguem pagar (parte da) conta de outro, que e valor, nao item.
2. **Cada pagamento vira uma venda no PDV, derivada de uma venda-pai.** Conceito novo: a venda-pai representa a comanda (e o documento de consumo); cada recebimento gera uma venda filha. Motivo decisivo: a conferencia de caixa soma `pdv_sale_payments` de vendas concluidas — pagamento que nao vira venda deixa dinheiro na gaveta invisivel para o caixa, e a conferencia fecharia com diferenca todo dia em que alguem pagasse meia conta.
3. **Nao existe encerrar comanda com saldo devedor.** Comanda so fecha com pagamento integral. Sem caminho de perda/fiado.
4. **`pagamento_parcial` vira estado proprio da mesa** no mapa do salao (Sprint 8), derivado da venda-pai com saldo em aberto.

A tabela `comanda_pagamentos` cogitada na versao anterior deste documento **nao sera criada**: os pagamentos sao as vendas filhas, e o saldo e `total da comanda - soma dos pagamentos das filhas`.

Modelo e efeitos colaterais a resolver na sprint (nenhum e opcional):

- `pdv_sales` ganha `parent_sale_id` (auto-referencia, indexada). Venda filha nao tem itens proprios: o consumo esta na venda-pai, a filha e um recebimento.
- `SalesService.complete` hoje recusa venda sem itens e venda com pagamento insuficiente. Ambas as regras precisam de excecao explicita e restrita: filha completa sem itens; pai completa sem pagamentos proprios. **Se o pai receber copia dos pagamentos, o caixa conta o dinheiro duas vezes** — o dinheiro vive somente nas filhas.
- A conferencia de caixa (`cashier.repository.ts`) precisa excluir a venda-pai de `salesCount` e `totalCollected`, senao o numero de vendas do turno infla.
- Baixa de estoque acontece **uma unica vez, na venda-pai** — filhas nao movimentam estoque por nao terem itens.
- Emissao fiscal continua manual e sai **da venda-pai**: nota e do consumo, nao do pagamento. Filha sem item nao e documento fiscal emissivel.
- `comandas.closed_sale_id` passa a apontar para a venda-pai.
- A regra do contrato "fechamento sempre exige confirmacao explicita de pagamento" continua valida — passa a valer por recebimento.

5. **Comanda com pagamento parcial continua aceitando pedidos novos.** Nao ha congelamento de consumo. A proposta inicial de congelar foi retirada: como a divisao e sempre por **valor fixo** (partes iguais materializam um valor no momento do pagamento, nunca um percentual), quem pagou R$ 80 quitou R$ 80 — o total subir depois nao altera o que essa pessoa pagou, apenas aumenta o saldo de quem continua consumindo. Implicacao tecnica: a venda-pai permanece `open` recebendo itens novos enquanto houver saldo, e so completa quando a soma dos pagamentos das filhas cobre o total; nao ha momento de "congelar itens".

## Estado Consolidado

Sprints 1-6 concluidas na branch `feature/comanda-autoatendimento`. O objetivo de negocio (garcom fora da etapa de tirar pedido) esta coberto pelas Sprints 1-4; as Sprints 5-6 sao melhorias aditivas ja entregues.

Sprints 7 e 8 concluidas (`c2c9928`): cadastro de mesas com QR imprimivel (desbloqueia producao) e mapa do salao.

Sprint 9 concluida: pagamento dividido com venda-pai e vendas derivadas, estado `pagamento_parcial` no salao e conferencia de caixa ajustada para nao contar a venda-pai.

Com as Sprints 1-9 a feature esta funcionalmente completa para o cenario real definido pelo usuario, incluindo mesa de grupo com conta unica e saida parcial de participantes. Nao ha sprint pendente. Comanda multi-celular e escopo excluido, nao backlog (ver Decisoes De Escopo Fechadas).

## Debitos E Pendencias Registradas

- **Menu "Configuracoes" compartilhado entre aplicacoes** — item IMPORTANTE, adiado por sequenciamento, nao descartado. O que e contrato (liga/desliga de sub-modulo como `comanda`/`fiscal`) ja vive em `client_capabilities` com UI no identity-admin (ADR 008). Este debito passa a cobrir apenas configuracao operacional por tenant que NAO seja contrato comercial (ex: flag de emissao automatica de NF, parametros de comportamento). Quando houver um segundo/terceiro caso real, avaliar infraestrutura generica de configuracao cross-app.
- **Escopo administrativo de `catalog` e `establishment-customers`** — ambos usam `pdv:admin:read`/`pdv:admin:write` em vez de escopo proprio, limitando reuso por outros modulos/SaaS. Documentado nos respectivos `MODULE_CONTRACT.md`, correcao fora do escopo desta entrega.
- ~~**Sem UI administrativa de mesas/QR**~~ — promovido a **Sprint 7** em 2026-08-22 por bloquear producao. Nao e mais debito aberto.
- **Alerta de comanda ativa sem consumo** — ideia de produto registrada, fora do escopo atual: usar o mesmo `last_activity_at` para sinalizar mesa ocupada sem pedido novo ha muito tempo, permitindo abordagem comercial discreta do garcom. Nota tecnica para quem implementar: `last_activity_at` hoje e atualizado tambem por cancelamento; se a regra precisar distinguir "tempo desde o ultimo pedido novo", um campo dedicado pode ser necessario.
- **Nome placeholder de cliente final** — o fluxo anonimo nao coleta nome, entao `establishment-customers` grava `Cliente <documento/telefone>` ao criar o registro. Aparece nas telas de staff.
