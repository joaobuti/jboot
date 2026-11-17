# Security Checklist — Sprint 4

- Injection: consultas PostgreSQL usam parametros; nenhum SQL recebe filtros do
  DJEN como concatenacao.
- Access control: BFF usa exclusivamente `JuridicoRequestContext`; jobs e
  comunicacoes sao consultados por `client_id` e `database_ref`.
- Dados sensiveis: token S2S permanece em ambiente/memoria; payload DJEN bruto
  nao e retornado nem persistido pelo novo fluxo.
- Mass assignment: filtros DJEN sao argumentos tipados e com limites.
- Rate/paginacao: pagina limitada a 100; maximo de 50 paginas por job; retry
  limitado no adaptador.
- SSRF: base DJEN e `Literal` fixa; o usuario nao fornece URL.
- Dependencias: sem nova dependencia de producao.
- Backend: HTTPS para DJEN; timeout e token S2S no BFF.
- Agentes: nenhuma instrucao de provider foi executada como codigo.

Status: sem itens abertos de seguranca no diff da Sprint 4.
