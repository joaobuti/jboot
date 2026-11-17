# Flow — Documentos Avulsos No Card

```yaml
status: concluida (conferencia na tela e smoke do Drive pendentes)
data: 2026-10-30
target_project: implementations/bff-jboot-platform + implementations/app-jboot-next-platform
target_module: modules/kanban
branch: feature/flow-card-office-kit
relacionados: ADR 019 (decisoes 17 e 19), docs/product/flow-crm-leads-sprints.md (checklist de documentos)
```

## Pedido

No bloco Documentos do card, alem do kit do escritorio, deve ser possivel adicionar documentos avulsos
(fora do checklist de tipos do quadro), que serao enviados no protocolo, e remove-los com permissao.

## Decisoes Do Usuario (2026-10-30)

- Remove: quem enviou o documento e quem revisa documentos no quadro (`board_admin` ou perfil com
  "revisar documentos"). Os demais veem e baixam.
- Remocao logica: o documento sai do bloco e do protocolo; o historico do card registra quem removeu e
  quando; o arquivo continua guardado no Flow (o Flow e registro permanente, como o card excluido).
- Descricao opcional (ate 200 caracteres); sem descricao, a tela mostra o nome do arquivo.
- Drive: com a sincronizacao da empresa ligada, cada avulso vai para a pasta do cliente do card. Remover
  no Flow tambem remove do Drive (vai para a lixeira do Drive). Se o Drive recusar (sem permissao sobre
  o arquivo), o item fica com falha na fila do Drive e o arquivo continua la.

## PE Decision

- Mesmo processo e deploy do BFF/web do Flow: herda stack e contrato (Deployment Boundary Gate: modulo
  existente, sem fronteira nova). Sem Stack Fit Gate.
- Reuso: o arquivo segue o caminho dos documentos do checklist (evento no historico + anexo do card no
  storage + linha propria). Mesmas regras de envio do checklist: papel `board_admin`/`board_member`,
  coluna editavel, lead nao congelado, tipos e tamanho de arquivo do anexo.
- Tabela nova `kanban_card_extra_documents` (migration `112`), sem tocar no checklist e na completude.
- Drive: `source_type = card_extra_document` na fila existente; `remove_requested_at` pede a remocao.
  Nome no Drive: `<nome do arquivo sem extensao> (<8 primeiros do id>).<ext>`, para dois avulsos com o
  mesmo nome nao se sobreporem (o Drive substitui por nome exato desde 2026-10-30). Card sem cliente com
  CPF usa o caminho tecnico legado das peticoes.
- Remocao no Drive: envio ainda nao feito vira `deleted` sem chamar o Drive; arquivo enviado vai para a
  lixeira (`trashed = true`, reversivel no Drive); arquivo que ja nao existe conta como removido; recusa
  do Drive (403) e falha permanente `drive_delete_forbidden`. Envio em andamento termina e o worker
  remove em seguida.
- UI/UX: reuso do item do `CardDocumentsPanel` (mesma lista, botoes `soft-*`, confirmacao antes de
  remover). Sem padrao novo.

## Sprint D1: Documentos Avulsos

> Status: `concluida` (2026-10-30). Conferencia na tela e smoke com o Drive real pendentes.

- BFF: listar, enviar (com descricao), baixar e remover avulsos; permissoes no backend (`canUpload`,
  `canRemove` por documento); eventos `card.extra_document_added|removed` no historico; auditoria sem
  conteudo; fila do Drive com envio e remocao.
- Web: secao "Outros documentos" no bloco Documentos, abaixo do checklist, com envio (arquivo, descricao
  opcional), link de download, remover com confirmacao, rotulos do historico.
- Testes: servico (permissoes, coluna bloqueada, remocao por terceiro), repositorio (Postgres real:
  remocao idempotente, isolamento por tenant, fila do Drive), worker do Drive (remocao em cada estado).

## Fora Do Escopo

- Envio automatico no protocolo (a coluna de protocolo usa os avulsos depois).
- Avulsos na ficha do cliente.
