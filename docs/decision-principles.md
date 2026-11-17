# Principios de Decisao

## Regra de ouro

Toda decisao deve considerar um operador de nivel SENIOR em linguagens de programacao, analise, arquitetura, seguranca, operacao e qualquer outro aspecto envolvido na area de atuacao do que for requisitado.

Qualidade e senioridade prevalecem sobre velocidade. Entrega rapida nao e meta quando cria debito tecnico obvio, centralizacao indevida, baixa coesao, acoplamento desnecessario ou retrabalho previsivel.

Todo agente deve reduzir ao MAXIMO o numero de tokens consumidos, sem prejuizo da execucao correta da tarefa. Concisao e obrigatoria; perda de qualidade, rastreabilidade, manutencao ou validacao nao e aceitavel.

## Consequencias praticas

- Priorizar profundidade tecnica, rastreabilidade e explicabilidade.
- Tratar IA como capacidade operacional auditavel, nao como caixa-preta.
- Expor parametros, evidencias, limites e incertezas quando eles afetarem decisoes.
- Nao permitir que inferencias substituam fluxo de governanca quando a tarefa criar projeto, modulo, contrato, agent, skill, marca publica ou mudanca arquitetural.
- Nao permitir que baseline, stack ja existente ou preferencia do runtime substitua decisao tecnica por fit do escopo. Cada novo projeto deve ter comparacao explicita de alternativas antes da recomendacao.
- Perguntas abertas que afetem escopo, produto, marca, arquitetura, seguranca, dados, custo, deploy ou operacao exigem decisao operacional: responder agora, registrar pendencia nao bloqueante ou aprovar premissa temporaria com risco.
- Preferir workflows eficientes para usuarios experientes, com atalhos, filtros, diagnosticos e historico.
- Evitar interfaces excessivamente simplificadas quando elas removerem controle importante.
- Manter defaults seguros sem impedir configuracao avancada.
- Registrar decisoes relevantes, especialmente quando envolverem custo, risco, seguranca, dados ou automacao.
- Cortar repeticao, rodeios e contexto nao acionavel.
- Em respostas a questionamentos, priorizar precisao tecnica sobre concordancia social, empatia performatica, elogios ou validacao generica.
- Validar apenas premissas tecnicamente sustentadas; quando houver erro, lacuna, ambiguidade ou risco, sugerir correcao direta e explicar brevemente o fundamento tecnico, risco evitado ou tradeoff envolvido.
- Preferir desenho modular por dominio/recurso quando houver multiplos fluxos de negocio.
- Rejeitar implementacoes centralizadas em arquivos genericos quando a separacao melhora auditabilidade, ownership, testes e evolucao.
- Tratar retrabalho evitavel como desperdicio de tempo, tokens e capacidade operacional.
- Tratar sprint como unidade de entrega, nao como sequencia de commits. Commit,
  build parcial ou um fluxo principal validado nunca autorizam declarar sprint
  concluida enquanto houver criterio de aceite, tela, contrato, teste, risco ou
  gate pendente.
- Antes de qualquer resposta final de sprint, executar um fechamento terminal:
  conferir o gate item a item contra o diff real, validar todos os projetos
  afetados, concluir security/runtime/governanca aplicaveis, atualizar o estado
  da sprint e confirmar a arvore Git limpa. Atualizacoes intermediarias devem
  dizer explicitamente que a sprint continua em andamento.

## Criterios para escolhas tecnicas

Ao escolher arquitetura, linguagem, biblioteca, modelo, banco, fila, provedor ou padrao de interface, avaliar:

- fit com o tipo real da entrega: site estatico, conteudo, app interativo, dashboard, BFF, worker, servico, integracao, IA, dados ou mobile;
- eficiencia operacional para o escopo: menor runtime correto, menor superficie de manutencao, menor bundle/latencia quando aplicavel, sem sacrificar evolucao;
- capacidade de manutencao por equipe tecnica senior;
- observabilidade e facilidade de debug;
- testabilidade e suporte a avaliacao automatizada;
- extensibilidade para novos agentes, modelos e ferramentas;
- seguranca e controle de dados sensiveis;
- custo operacional previsivel;
- performance e latencia sob carga real;
- suporte a auditoria de decisoes tomadas com IA.
- alternativas rejeitadas e motivo tecnico, especialmente quando a recomendacao seguir uma baseline do repositorio.

## Criterios para IA

Toda funcionalidade baseada em IA deve responder:

- Qual e o objetivo operacional?
- Quem revisa ou aprova a saida?
- Qual e o impacto de uma resposta errada?
- Quais dados entram no modelo?
- Quais dados nao podem entrar no modelo?
- Como medir qualidade?
- Como detectar regressao?
- Como explicar a decisao ao operador?
