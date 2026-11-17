import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PjeToFlowExporter } from './pje-to-flow.exporter';

void test('PJe exporter reads source from resolved Juridico context and writes an idempotent audit', async () => {
  const caller = {
    identityId: randomUUID(), clientId: randomUUID(), applicationId: randomUUID(),
    databaseRef: randomUUID(), scopes: ['juridico:read'], roles: []
  };
  const juridico = { ...caller, databaseRef: randomUUID() };
  const flow = { ...caller, applicationId: randomUUID(), databaseRef: randomUUID(), scopes: ['flow:read', 'flow:write'] };
  let sourceDatabaseRef = '';
  let audit: Record<string, unknown> | undefined;
  let cardInput: { officeId?: string } | undefined;
  const exporter = new PjeToFlowExporter(
    {
      requireCaller: async () => juridico,
      requireApplication: async () => flow
    } as never,
    { insertExportAudit: async (_ref: string, input: Record<string, unknown>) => { audit = input; } } as never,
    { createInDefaultColumnFromSource: async (_f: unknown, _b: string, input: { officeId?: string }) => { cardInput = input; return { card: { id: 'card-1' }, created: false }; } } as never,
    { getComunicacao: async (_clientId: string, databaseRef: string) => {
      sourceDatabaseRef = databaseRef;
      return {
        id: 'source-1', comunicacaoId: 'c', numeroComunicacao: '1', hash: 'h',
        numeroProcesso: null, numeroProcessoMask: null, siglaTribunal: 'TJSC', nomeOrgao: null,
        tipoComunicacao: null, tipoDocumento: null, nomeClasse: null, meio: null,
        link: null, texto: null, dataDisponibilizacao: null, destinatarios: [], advogados: [],
        createdAt: '2026-10-06T00:00:00.000Z'
      };
    } } as never
  );
  const result = await exporter.execute(caller, 'source-1', 'board-1', 'office-1', {});
  assert.equal(cardInput?.officeId, 'office-1', 'o escritorio escolhido vai para o card');
  assert.equal(sourceDatabaseRef, juridico.databaseRef);
  assert.equal(audit?.operationKey, 'pje:source-1:flow:board-1');
  assert.equal(result.created, false);
});
