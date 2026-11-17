# Skill: strangler-fig

## Objetivo

Extrair um modulo do Modular Monolith para servico independente sem downtime e sem reescrita de dominio, preservando a fronteira ja estabelecida.

## Pre-requisito obrigatorio

Modulo candidato com fronteira limpa (ver `### Modular Monolith` no stack agent correspondente): sem acesso direto a tabelas de outros modulos, comunicacao via interface exportada. Extracao sem fronteira limpa produz **distributed monolith** — acoplamento de rede sem os beneficios de isolamento.

## Quando usar

- Modulo com volume ou carga que justifica deploy independente.
- Time separado responsavel pelo modulo.
- Necessidade de stack ou ciclo de deploy distinto do monolito.
- SLA de latencia ou disponibilidade diferente do restante do sistema.

## Procedimento

1. Auditar fronteira do modulo: nenhum outro modulo importa implementacao interna; comunicacao somente via interface publica.
2. Abrir branch e novo projeto em `implementations/<svc-nome>/` seguindo fluxo `PO → PE → Architect → confirmacao humana` conforme `AGENTS.md`.
3. Implementar o novo servico com a mesma interface publica do modulo atual. Contrato identico ao modulo original.
4. Introduzir **Facade** no monolito: a interface do modulo original delega para o novo servico via HTTP/evento. Demais modulos nao percebem a mudanca.
5. Executar em paralelo — modulo original + novo servico — com feature flag ou roteamento configuravel por percentual.
6. Validar comportamento com **Consumer-Driven Contracts** (Pact — Pact Foundation, 2014+): testes de contrato cobrindo a interface publica antes e depois da extracao.
7. Migrar trafego gradualmente: 5% → 25% → 100%. Monitorar erros e latencia em cada incremento.
8. Com 100% no novo servico: remover codigo do modulo do monolito.
9. Remover a Facade. Atualizar `AGENTS.md`, contratos e seeds afetados.

## Saida esperada

- Zero mudanca de interface para modulos consumidores durante toda a extracao.
- Novo servico com contrato identico ao modulo original.
- Testes de contrato (Pact) cobrindo a interface publica.
- Monolito sem referencias ao codigo extraido apos conclusao.
- `implementations/<svc-nome>/PROJECT_CONTRACT.md` criado antes de qualquer codigo.

## Quando NAO usar

- Modulo sem fronteira limpa estabelecida — corrigir a fronteira primeiro.
- Premissa de performance sem medicao real — medir antes de extrair.
- Extracao motivada por preferencia de linguagem, nao por necessidade arquitetural.

## Referencias

- Strangler Fig Pattern (Fowler, 2004)
- Monolith to Microservices (Newman, 2019) — cap. Decomposicao Gradual
- Consumer-Driven Contracts / Pact (Pact Foundation, 2014+)
- Modular Monolith (Grzybek, 2019)
