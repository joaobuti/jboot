# Marketing Brand Brief — Instagram JBoot

## Objetivo

Registrar o brief de marca que governa todo conteudo publicado pelo modulo `marketing` no
Instagram da JBoot. Este documento e pre-requisito da geracao por IA (Sprint 3): sem pilares,
publico e tom definidos aqui, o modelo produz conteudo generico.

Escopo definido via `PO -> PE -> Architect -> marketing-brand -> confirmacao humana` (2026-08-25).

Formato herdado de `docs/agents/orchestration/marketing-brand.md`.

## Decisoes Humanas Fechadas (Nao Reabrir Sem Nova Decisao)

| Item | Decisao | Data |
|---|---|---|
| Conta | Instagram da propria JBoot, single-tenant | 2026-08-25 |
| Entregavel | Agent de IA + servico executavel | 2026-08-25 |
| Publicacao | Fila de aprovacao humana obrigatoria | 2026-08-25 |
| Funil | WhatsApp deep link + demo publica + pagina hub "link na bio" | 2026-08-25 |
| Captura de lead | Nao havera formulario | 2026-08-25 |
| Arte | Template renderizado em codigo | 2026-08-25 |
| Publico primario | Pequena empresa em geral | 2026-08-25 |
| Oferta | Precos sob consulta + encomenda de produto customizado | 2026-08-25 |
| Citacao de clientes | Autorizada, nomes reais da lista da landing | 2026-08-25 |
| Frequencia | 2 publicacoes por dia | 2026-08-25 |
| Reels | Fora da v1. Entra na V2 como video curto narrativo, sem presenca humana, com voz de IA | 2026-08-25 |
| WhatsApp comercial | `+55 41 99695-0068` | 2026-08-25 |

## Brief

```text
Marketing Brand Brief:
  objective: >
    Usar o Instagram como topo de funil da JBoot para gerar conversas qualificadas
    em duas pernas: (1) experimentacao do que ja existe via demo publica e
    (2) encomenda de software sob medida via WhatsApp. Nao ha venda dentro do
    Instagram: a plataforma leva ate a porta, a conversao acontece no destino.

  target_audience:
    primary: >
      Pequena empresa em geral, sem recorte vertical. Dono ou responsavel pela
      operacao que ja sentiu que planilha/WhatsApp/caderno pararam de escalar,
      e que nao se enxerga no software de prateleira do proprio setor.
    secondary: >
      Escritorios de advocacia (modulo Juridico maduro) e operacao de
      bar/restaurante/lanchonete (PDV + comanda), como nichos onde o produto
      pronto ja tem profundidade para demonstracao imediata.

  positioning: >
    A JBoot nao vende um software para um setor. Ela ja construiu e opera
    modulos para setores que nao tem nada em comum entre si -- juridico,
    esportes, lazer, comercio, pet shop. Essa diversidade nao e dispersao:
    e a prova de que a base e a mesma e o que muda e o modulo. Se o que existe
    serve, o cliente testa hoje; se nao serve, a JBoot constroi o dele sobre
    a mesma base.

  value_proposition: >
    Voce testa o que ja esta pronto antes de falar de preco. E o que nao existe
    ainda pode ser encomendado, sem comecar do zero -- entra na mesma base de
    acesso, modulos e operacao que ja roda para outros clientes.

  key_messages:
    - "Testa antes de conversar sobre preco." A demo publica e o CTA de menor atrito.
    - "Setores que nao tem nada a ver um com o outro rodam na mesma base."
    - "O que nao existe, a gente constroi." Encomenda como oferta de primeira classe.
    - "Modulo contratado, acesso por contexto." Cada cliente ve so o que contratou.
    - "Deploy independente por modulo." Atualizacao de um nao derruba o outro.

  tone_of_voice: >
    Direto, senior, claro, sem exagero promocional. Sem linguagem generica de
    startup. Sem "revoluciona", "100% seguro", "sem erros", "garantido".
    Explicar o problema operacional antes da solucao. Evitar jargao tecnico na
    primeira linha do post -- o leitor e dono de operacao, nao engenheiro.

  ctas:
    principal: "Testar agora" -> demo publica (Usuario Teste), via /login?demo=1
    secundario: "Me conta seu caso" -> WhatsApp deep link com codigo do post
    terciario: "link na bio" -> pagina hub estatica na landing
    proibido: qualquer CTA que prometa preco, prazo de entrega ou resultado numerico

  visual_direction:
    primary_asset: docs/mkt/jb-cyan.jpg
    clean_asset: docs/mkt/jb-cyan-white.png
    color_reference: jb-cyan
    usage_rules: >
      jb-cyan como assinatura primaria; jb-cyan-white em pecas de fundo claro.
      Arte gerada por template em codigo, nunca imagem avulsa.
    asset_integration:
      asset_role: >
        Assinatura de marca e fonte da paleta dos templates de post. Nao e
        decoracao de hero -- e o que define os tokens do gerador de arte.
      derived_tokens: >
        Paleta cyan/escuro, tipografia da landing, ritmo de espacamento e as
        linhas/planos tecnologicos do asset viram os separadores e molduras
        dos templates de carrossel.
      layout_integration: >
        Um template por pilar de conteudo, todos derivando dos mesmos tokens,
        garantindo que o feed leia como um sistema unico e nao como pecas soltas.
      content_relation: >
        O template do pilar 1 (prova) reserva area fixa para nome/segmento do
        cliente; o do pilar 3 reserva area para screenshot real de tela.
      rejection_condition: >
        Template que precise de texto longo para funcionar, que nao caiba em
        1080x1350, ou que dependa de imagem generica de banco de imagens.

  seo: nao aplicavel ao Instagram; a pagina hub da landing herda o SEO baseline existente.

  avoid:
    - preco publico (decisao: tudo sob consulta)
    - promessa de prazo de entrega para software sob encomenda
    - numeros de performance, economia ou ROI nao medidos
    - apresentar `platform` como produto comercial (regra de AGENTS.md)
    - citar cliente fora da lista autorizada abaixo
    - qualquer mencao a certificacao, premio ou parceria inexistente

  privacy_lead_capture:
    coleta_de_lead: nao
    formulario: nao -- evita reabrir o contrato da landing e a discussao LGPD
    redirect_de_atribuicao: registra apenas post_id + timestamp; sem IP, sem cookie
    consequencia: >
      Atribuicao e por volume de clique por post, nao por identidade de pessoa.
      Suficiente para responder "que post trouxe gente"; insuficiente para
      remarketing -- e essa limitacao e deliberada.

  implementation_clearance: >
    Liberado para Sprint 0 e Sprint 1 (fundacao, canal e templates de arte).
    Sprint 3 (geracao por IA) so libera apos os pilares abaixo virarem prompts
    versionados com eval, conforme docs/agents/stacks/ai-llm.md.

  decision_status: approved_by_human (2026-08-25)
```

## Pilares De Conteudo

Toda peca publicada pertence a exatamente um pilar. O gerador de IA (Sprint 3) recebe o pilar
como variavel de prompt e o template de arte correspondente.

| Pilar | Conteudo | Frequencia alvo |
|---|---|---|
| 1. Prova de diversidade | Recorta um cliente real e o problema que ele tinha. Pilar mais forte porque e verificavel. | Alta |
| 2. Dor operacional | Situacao concreta que pequena empresa reconhece: pedido errado na mesa, prazo processual perdido, caixa que nao fecha, acesso compartilhado por senha unica. | Alta |
| 3. Produto em uso | Tela real do modulo resolvendo a dor do pilar 2. Puxa para a demo. | Media |
| 4. Encomenda | "Seu caso nao esta aqui?" Convite explicito para software sob medida. | Media |
| 5. Bastidor tecnico | Como o ecossistema e construido. Publico secundario, constroi autoridade. | Baixa |

Regra de rotacao: **nunca publicar peca puramente institucional**. Todo post ancora em caso
concreto, dor concreta ou tela concreta. Com publico amplo ("pequena empresa em geral"), o
concreto e o unico antidoto contra mensagem diluida.

## Clientes Autorizados Para Citacao

Autorizacao humana explicita em 2026-08-25. O gerador deve bloquear qualquer nome fora desta lista.

| Cliente | Segmento |
|---|---|
| Mendedes Assessoria Juridica | Juridico |
| Ruiz e Buti Advogados | Juridico |
| Federacao Paranaense de Futebol Americano | Esportes |
| Recanto Binho | Lazer |
| Super Diesel Mecanica | Comercio |
| Sinai Medic | Comercio |
| Anubis Games | Comercio |
| Aviario Iguacu | Pet Shop |

Fonte: `implementations/site-jboot-landing/src/content/landing-content.ts`.

## Cadencia

- **2 publicacoes por dia** (~60/mes).
- Muito abaixo do limite de 50 posts/24h da API — o limite tecnico nao e a restricao.
- A restricao real e **throughput de aprovacao humana**: 60 aprovacoes/mes. A tela de aprovacao
  deve suportar revisao em lote e aprovacao com agendamento em uma acao, ou a fila vira gargalo
  e o canal para.
- Risco registrado: 2x/dia e cadencia alta para conteudo ancorado em caso concreto. Se a fila de
  pauta secar, a saida e reduzir frequencia, **nao** afrouxar a regra de rotacao para conteudo
  institucional generico.

## Reels (V2)

Fora da v1 por decisao humana. Quando entrar:

- Video curto, narrativo, **sem presenca humana em cena**.
- Narracao por voz sintetizada (TTS), nao locucao gravada.
- Implica pipeline adicional: roteiro -> TTS -> composicao de video (slides/telas + audio) ->
  MP4 H.264/AAC -> container `REELS` na API.
- O contrato de Reels deve ser escrito antes da implementacao; nao herda automaticamente as
  decisoes de feed/carrossel.

## Destinos De Funil

| Destino | Uso | Observacao |
|---|---|---|
| Demo publica | CTA principal | Entra por `/login?demo=1`, ja existente na landing |
| WhatsApp | CTA secundario | `+55 41 99695-0068` -> `https://wa.me/5541996950068` com mensagem pre-preenchida contendo o codigo do post |
| Pagina hub | "link na bio" | Rota estatica na `site-jboot-landing` |

## Perguntas Abertas

`blocking_now`: nenhuma.

`decide_later`:

- handle do perfil e se sera criado do zero ou convertido de conta existente (conta sera criada);
- se a mensagem pre-preenchida do WhatsApp muda por pilar de conteudo ou e unica.

`temporary_assumptions_requiring_approval`:

- assume-se numero unico de WhatsApp para todos os CTAs ate decisao contraria;
- assume-se feed + carrossel na v1, Reels apenas na V2.

## Riscos De Marca

- Publico amplo dilui mensagem se o conteudo nao ancorar sempre em caso concreto.
  Mitigacao: regra de rotacao acima.
- Citar cliente real cria exposicao reputacional de terceiro.
  Mitigacao: lista fechada; nome fora dela e bloqueado no gerador.
- Oferta "sob consulta" aumenta atrito.
  Mitigacao: a demo publica e o CTA principal, justamente para adiar a conversa de preco.
- Encomenda sob medida sem prazo/preco publico pode gerar expectativa errada na DM.
  Mitigacao: a mensagem pre-preenchida enquadra como conversa de escopo, nao orcamento fechado.
- Cadencia 2x/dia com aprovacao humana pode travar por falta de revisor.
  Mitigacao: aprovacao em lote na tela; alerta quando a fila aprovada cobrir menos de 3 dias.
