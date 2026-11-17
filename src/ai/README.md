# AI Layer

## Status

```yaml
runtime_status: planned
implemented_capabilities: []
```

Este diretorio reserva a fronteira arquitetural para todo uso de modelos,
prompts, agentes, ferramentas, avaliacoes e telemetria em runtime. Ele ainda nao
contem uma implementacao de provider ou agent runtime.

A governanca de engenharia existente em `docs/ai-governance` e `tools/ai` nao
deve ser confundida com esta camada de produto.

## Gate De Ativacao

Antes de adicionar o primeiro provider ou chamada de modelo:

- registrar ADR e caso de uso operacional;
- definir schemas de entrada e saida;
- definir politica de dados sensiveis e retencao;
- registrar provider, modelo, prompt version, custo, latencia e status;
- implementar timeout, retry controlado e fallback quando critico;
- adicionar testes e evals automatizados;
- preencher o security checklist.

Evite chamadas diretas a provedores fora desta pasta.
