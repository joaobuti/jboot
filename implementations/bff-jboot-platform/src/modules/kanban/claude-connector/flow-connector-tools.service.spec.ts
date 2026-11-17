import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { samplePetition } from '../initial-petitions/document/petition-fixture';
import { FlowConnectorToolsService } from './flow-connector-tools.service';
import { ConnectorPrincipal } from './connector-token.introspector';

const BOARD = '11111111-1111-4111-8111-111111111111';
const CARD = '22222222-2222-4222-8222-222222222222';

const principal: ConnectorPrincipal = {
  grantId: 'grant-1',
  connectorScopes: ['flow:connector:read', 'flow:connector:comment'],
  context: { identityId: 'u1', clientId: 'c1', applicationId: 'a1', databaseRef: 'db', scopes: ['flow:read'], roles: [] }
};

interface Harness {
  settings: { enabled: boolean; maskPersonalData: boolean; allowCustomerDocuments?: boolean };
  validationCalls?: string[];
  audits: Array<{ event: string; payload: Record<string, unknown> }>;
  comments: Array<{ text: string; origin: unknown }>;
  duplicate: { id: string; createdAt: string } | null;
  cardMissing: boolean;
  completedRuns: string[];
  runActionConfig: Record<string, unknown>;
}

function build(harness: Harness) {
  const card = {
    id: CARD, boardId: BOARD, boardColumnId: 'col-1', title: 'Lead 000.000.001-91', description: 'Contato joao@exemplo.com.br',
    status: 'active', dueDate: null, createdAt: 't0', updatedAt: 't1', commentCount: 1
  };
  const activities = [
    { type: 'comment', authorIdentityId: 'u2', textContent: 'Ligar (41) 99876-5432', eventPayload: null, createdAt: 't2' },
    { type: 'system_event', authorIdentityId: 'u2', textContent: null, eventPayload: { kind: 'card.moved', secret: 'x' }, createdAt: 't3' }
  ];
  return new FlowConnectorToolsService(
    { list: async () => ({ data: [{ id: BOARD, name: 'Leads', description: 'CPF 00000000191' }], meta: { total: 1 } }) } as never,
    { list: async () => ({ data: [card], meta: { total: 1, limit: 20, offset: 0 } }) } as never,
    {
      list: async () => ({ data: activities, meta: { total: activities.length } }),
      createComment: async (_ctx: unknown, _board: string, _card: string, dto: { textContent: string }, origin: unknown) => {
        harness.comments.push({ text: dto.textContent, origin });
        return { id: 'comment-1', createdAt: 't9' };
      }
    } as never,
    { findRecentConnectorComment: async () => harness.duplicate } as never,
    { list: async () => [{ id: 'col-1', name: 'Triagem' }] } as never,
    {
      requireVisibleCard: async () => {
        if (harness.cardMissing) throw new NotFoundException('Card not found');
        return card;
      }
    } as never,
    { resolve: async () => ({ ...harness.settings, policyAcceptedAt: 't' }) } as never,
    { record: async (event: string, _ctx: unknown, _board: unknown, payload: Record<string, unknown>) => { harness.audits.push({ event, payload }); } } as never,
    {
      findDispatchedForOwner: async (_ref: string, _client: string, id: string) => ({ id, boardId: BOARD, boardColumnId: 'col-1', cardId: CARD, actionConfig: harness.runActionConfig }),
      touchDispatched: async () => undefined,
      completeDispatched: async (_ref: string, _client: string, input: { id: string; ownerIdentityId: string }) => { harness.completedRuns.push(`${input.id}:${input.ownerIdentityId}`); return true; }
    } as never,
    {
      connectorRequest: async (_ctx: unknown, runId: string) => { harness.validationCalls?.push(`request:${runId}`); return { runId, documents: [] }; },
      connectorDocumentPage: async (_ctx: unknown, runId: string, type: string, page: number) => {
        harness.validationCalls?.push(`page:${runId}:${type}:${page}`);
        return { jpeg: Buffer.from([0xff, 0xd8, 0xff]), page, pageCount: 2, width: 10, height: 10, documentType: type, version: 3 };
      },
      connectorSubmit: async (_ctx: unknown, runId: string, input: { verdict: string }) => {
        harness.validationCalls?.push(`submit:${runId}:${input.verdict}`);
        return { runId, recorded: true, verdict: input.verdict };
      }
    } as never,
    {
      cardCustomer: async (_ctx: unknown, runId: string) => {
        harness.validationCalls?.push(`card-customer:${runId}`);
        return { runId, customer: { name: 'Cliente', cpf: '00000000191' }, documents: [{ documentType: 'extrato_beneficio' }] };
      },
      cardCustomerDocumentPage: async (_ctx: unknown, runId: string, type: string, page: number) => {
        harness.validationCalls?.push(`card-page:${runId}:${type}:${page}`);
        return { jpeg: Buffer.from([0xff, 0xd8, 0xff]), page, pageCount: 3, width: 10, height: 10, documentType: type, version: 1 };
      }
    } as never,
    {
      connectorSubmit: async (_ctx: unknown, runId: string, input: { status: string; actions: unknown[] }) => {
        harness.validationCalls?.push(`analysis:${runId}:${input.status}:${input.actions.length}`);
        return { analysisId: 'a1', actionCount: input.actions.length, automationCompleted: true };
      }
    } as never,
    {
      connectorSubmit: async (_ctx: unknown, runId: string, input: { petitionKey: string }) => ({ petitionKey: input.petitionKey, runId }),
      connectorFinish: async (_ctx: unknown, runId: string, input: { status: string }) => ({ runId, status: input.status })
    } as never,
    {
      connectorRequest: async (_ctx: unknown, runId: string) => { harness.validationCalls?.push(`signature-request:${runId}`); return { runId }; },
      connectorOriginalText: async (_ctx: unknown, runId: string, part: number) => {
        harness.validationCalls?.push(`signature-original:${runId}:${part}`);
        return { runId, part, partCount: 2, text: 'CONTRATO' };
      },
      connectorSignedPage: async (_ctx: unknown, runId: string, page: number) => {
        harness.validationCalls?.push(`signature-page:${runId}:${page}`);
        return { jpeg: Buffer.from([0xff, 0xd8, 0xff]), page, pageCount: 4, width: 10, height: 10, version: 2 };
      },
      connectorSubmit: async (_ctx: unknown, runId: string, input: { verdict: string; findings: unknown[] }) => {
        harness.validationCalls?.push(`signature-submit:${runId}:${input.verdict}:${input.findings.length}`);
        return { runId, recorded: true, verdict: input.verdict };
      }
    } as never
  );
}

async function connect(service: FlowConnectorToolsService, who: ConnectorPrincipal = principal) {
  const server = service.createServer(who, { ip: '127.0.0.1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'spec', version: '1.0.0' });
  await client.connect(clientTransport);
  return client;
}

function payload(result: Awaited<ReturnType<Client['callTool']>>) {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text) as Record<string, unknown>;
}

void describe('FlowConnectorToolsService', () => {
  let harness: Harness;
  beforeEach(() => {
    harness = { settings: { enabled: true, maskPersonalData: true }, audits: [], comments: [], duplicate: null, cardMissing: false, completedRuns: [], runActionConfig: {} };
  });

  void it('Validador de assinatura: le pedido, texto do original e paginas do assinado e registra o parecer (S2)', async () => {
    harness.validationCalls = [];
    const blocked = await (await connect(build(harness))).callTool({ name: 'flow_get_signature_validation_request', arguments: { runId: CARD } });
    assert.equal(payload(blocked).error, 'customer_documents_not_allowed', 'mesma permissao de documentos da validacao de cadastro');
    harness.settings = { ...harness.settings, allowCustomerDocuments: true };
    const client = await connect(build(harness));
    await client.callTool({ name: 'flow_get_signature_validation_request', arguments: { runId: CARD } });
    const original = payload(await client.callTool({ name: 'flow_get_signed_kit_original', arguments: { runId: CARD, part: 2 } }));
    assert.deepEqual([original.part, original.partCount], [2, 2]);
    const page = await client.callTool({ name: 'flow_get_signed_kit_page', arguments: { runId: CARD, page: 3 } });
    const content = page.content as Array<{ type: string; text?: string; mimeType?: string }>;
    assert.deepEqual([content[0].type, content[1].type, content[1].mimeType], ['text', 'image', 'image/jpeg']);
    assert.deepEqual(JSON.parse(content[0].text ?? '{}'), { version: 2, page: 3, pageCount: 4 });
    await client.callTool({
      name: 'flow_submit_signature_validation',
      arguments: { runId: CARD, verdict: 'aprovado', summary: 'Kit completo e assinado.', findings: [{ item: 'Procuracao', status: 'ok', note: '' }] }
    });
    const refused = await client.callTool({ name: 'flow_submit_signature_validation', arguments: { runId: CARD, verdict: 'talvez', summary: 'x', findings: [] } });
    assert.equal(refused.isError, true);
    assert.deepEqual(harness.validationCalls, [
      `signature-request:${CARD}`, `signature-original:${CARD}:2`, `signature-page:${CARD}:3`, `signature-submit:${CARD}:aprovado:1`
    ]);
  });

  void it('exposes the tools and marks only comment and validation answer as writable', async () => {
    const client = await connect(build(harness));
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'flow_add_card_comment', 'flow_complete_automation', 'flow_create_hiscon_print', 'flow_finish_initial_petitions',
      'flow_get_card', 'flow_get_card_action_analysis', 'flow_get_card_customer', 'flow_get_card_customer_document',
      'flow_get_customer_document', 'flow_get_customer_validation_request',
      'flow_get_signature_validation_request', 'flow_get_signed_kit_original', 'flow_get_signed_kit_page',
      'flow_list_boards', 'flow_search_cards', 'flow_submit_action_analysis', 'flow_submit_customer_validation',
      'flow_submit_initial_petition', 'flow_submit_signature_validation'
    ]);
    const writable = new Set([
      'flow_add_card_comment', 'flow_complete_automation', 'flow_submit_customer_validation', 'flow_submit_action_analysis',
      'flow_create_hiscon_print', 'flow_submit_initial_petition', 'flow_finish_initial_petitions', 'flow_submit_signature_validation'
    ]);
    for (const tool of tools) {
      assert.equal(tool.annotations?.readOnlyHint, !writable.has(tool.name), tool.name);
    }
    assert.equal(tools.find((tool) => tool.name === 'flow_add_card_comment')?.annotations?.destructiveHint, false);
  });

  void it('server instructions never order an automation completion call; validation ends by its own tool', async () => {
    const client = await connect(build(harness));
    const instructions = client.getInstructions() ?? '';
    assert.doesNotMatch(instructions, /flow_complete_automation|kanban\.automation\.complete/);
    assert.match(instructions, /completion_instructions/);
    const { tools } = await client.listTools();
    const description = (name: string) => tools.find((tool) => tool.name === name)?.description ?? '';
    assert.match(description('flow_submit_customer_validation'), /encerra a validacao/);
    assert.match(description('flow_complete_automation'), /validacao de cadastro encerra por flow_submit_customer_validation/);
  });

  void it('masks personal data and never returns system event payloads', async () => {
    const client = await connect(build(harness));
    const card = payload(await client.callTool({ name: 'flow_get_card', arguments: { boardId: BOARD, cardId: CARD } }));
    const text = JSON.stringify(card);
    assert.doesNotMatch(text, /051\.030|joao@|99876|"secret"/);
    assert.equal(card.column, 'Triagem');
    const events = card.recentActivities as Array<Record<string, unknown>>;
    assert.equal(events[1].event, 'card.moved');

    const boards = payload(await client.callTool({ name: 'flow_list_boards', arguments: {} }));
    assert.doesNotMatch(JSON.stringify(boards), /00000000191/);
  });

  void it('returns raw content when the tenant turned masking off', async () => {
    harness.settings.maskPersonalData = false;
    const client = await connect(build(harness));
    const card = payload(await client.callTool({ name: 'flow_get_card', arguments: { boardId: BOARD, cardId: CARD } }));
    assert.equal(card.title, 'Lead 000.000.001-91');
  });

  void it('fails closed when the tenant has the connector disabled', async () => {
    harness.settings.enabled = false;
    const client = await connect(build(harness));
    const result = await client.callTool({ name: 'flow_list_boards', arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(payload(result).error, 'claude_connector_disabled');
    assert.equal(harness.audits[0].payload.outcome, 'claude_connector_disabled');
  });

  void it('requires the comment scope to write and keeps reads working', async () => {
    const readOnly = { ...principal, connectorScopes: ['flow:connector:read'] };
    const client = await connect(build(harness), readOnly);
    const denied = await client.callTool({ name: 'flow_add_card_comment', arguments: { boardId: BOARD, cardId: CARD, text: 'oi' } });
    assert.equal(payload(denied).error, 'connector_scope_missing');
    assert.equal(harness.comments.length, 0);
    const read = await client.callTool({ name: 'flow_search_cards', arguments: { boardId: BOARD } });
    assert.notEqual(read.isError, true);
  });

  void it('writes comments with the connector origin and dedupes identical retries', async () => {
    const client = await connect(build(harness));
    const first = payload(await client.callTool({ name: 'flow_add_card_comment', arguments: { boardId: BOARD, cardId: CARD, text: 'Parecer: ok' } }));
    assert.deepEqual(harness.comments, [{ text: 'Parecer: ok', origin: 'claude_connector' }]);
    assert.equal(first.duplicate, false);

    harness.duplicate = { id: 'comment-1', createdAt: 't9' };
    const retry = payload(await client.callTool({ name: 'flow_add_card_comment', arguments: { boardId: BOARD, cardId: CARD, text: 'Parecer: ok' } }));
    assert.equal(retry.duplicate, true);
    assert.equal(harness.comments.length, 1);
  });

  void it('comment does not complete a run; only explicit integral confirmation completes it', async () => {
    const client = await connect(build(harness));
    const runId = '33333333-3333-4333-8333-333333333333';
    const result = payload(await client.callTool({ name: 'flow_add_card_comment', arguments: { boardId: BOARD, cardId: CARD, text: 'Parecer', runId } }));
    assert.equal(result.runCompleted, false);
    assert.deepEqual(harness.completedRuns, []);
    const confirmed = payload(await client.callTool({ name: 'flow_complete_automation', arguments: {
      boardId: BOARD, cardId: CARD, runId, confirmation: { version: 1, status: 'succeeded', allTasksCompleted: true }
    } }));
    assert.equal(confirmed.runCompleted, true);
    assert.deepEqual(harness.completedRuns, [`${runId}:u1`]);
  });

  void it('confirmation does not complete runs that end through their own tool (ADR 020)', async () => {
    harness.runActionConfig = { expectedResult: 'action_analysis' };
    const client = await connect(build(harness));
    const runId = '33333333-3333-4333-8333-333333333333';
    const confirmation = { version: 1, status: 'succeeded', allTasksCompleted: true };
    const refused = await client.callTool({ name: 'flow_complete_automation', arguments: { boardId: BOARD, cardId: CARD, runId, confirmation } });
    assert.equal(payload(refused).error, 'wrong_completion_tool');
    assert.deepEqual(harness.completedRuns, []);

    harness.runActionConfig = { expectedResult: 'comment' };
    const accepted = payload(await client.callTool({ name: 'flow_complete_automation', arguments: { boardId: BOARD, cardId: CARD, runId, confirmation } }));
    assert.equal(accepted.runCompleted, true);
  });

  void it('rejects incomplete or extra-field confirmations before completing a run', async () => {
    const client = await connect(build(harness));
    for (const confirmation of [{version:1,status:'succeeded',allTasksCompleted:false},
      {version:1,status:'succeeded',allTasksCompleted:true,destination:'injected'}]) {
      const result = await client.callTool({ name:'flow_complete_automation',arguments:{
        boardId:BOARD,cardId:CARD,runId:'33333333-3333-4333-8333-333333333333',confirmation
      }});
      assert.equal(result.isError,true);
    }
    assert.deepEqual(harness.completedRuns,[]);
  });

  void it('maps access errors to stable codes and audits without content', async () => {
    harness.cardMissing = true;
    const client = await connect(build(harness));
    const result = await client.callTool({ name: 'flow_get_card', arguments: { boardId: BOARD, cardId: CARD } });
    assert.equal(payload(result).error, 'not_found');
    const audit = harness.audits.at(-1);
    assert.equal(audit?.event, 'claude_connector.tool_called');
    assert.deepEqual(Object.keys(audit?.payload ?? {}).sort(), ['grantId', 'outcome', 'tool']);
  });

  void it('rejects malformed ids before touching the domain', async () => {
    const client = await connect(build(harness));
    const result = await client.callTool({ name: 'flow_get_card', arguments: { boardId: 'x', cardId: CARD } });
    assert.equal(result.isError, true);
    assert.equal(harness.audits.length, 0);
  });

  void it('customer validation tools require the specific documents permission', async () => {
    harness.validationCalls = [];
    const client = await connect(build(harness));
    const result = await client.callTool({ name: 'flow_get_customer_validation_request', arguments: { runId: CARD } });
    assert.equal(result.isError, true);
    assert.equal(payload(result).error, 'customer_documents_not_allowed');
    assert.deepEqual(harness.validationCalls, []);
  });

  void it('returns a document page as an image block and forwards the answer', async () => {
    harness.validationCalls = [];
    harness.settings = { ...harness.settings, allowCustomerDocuments: true };
    const client = await connect(build(harness));
    const page = await client.callTool({ name: 'flow_get_customer_document', arguments: { runId: CARD, documentType: 'cpf', page: 2 } });
    const content = page.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    assert.deepEqual(JSON.parse(content[0].text ?? '{}'), { documentType: 'cpf', version: 3, page: 2, pageCount: 2 });
    assert.equal(content[1].type, 'image');
    assert.equal(content[1].mimeType, 'image/jpeg');
    assert.equal(Buffer.from(content[1].data ?? '', 'base64')[0], 0xff);
    const answer = await client.callTool({
      name: 'flow_submit_customer_validation',
      arguments: { runId: CARD, verdict: 'pendencias', findings: [{ documentType: 'cpf', status: 'ilegivel', note: 'foto borrada' }], summary: 'CPF ilegivel' }
    });
    assert.equal(payload(answer).recorded, true);
    assert.deepEqual(harness.validationCalls, [`page:${CARD}:cpf:2`, `submit:${CARD}:pendencias`]);
    assert.ok(harness.audits.some((audit) => audit.payload.tool === 'flow_get_customer_document' && audit.payload.documentType === 'cpf'));
  });

  // S5: rotina da automacao de coluna le o cliente do card (ADR 018).
  void it('card customer tools need the documents permission and return the extrato page as image', async () => {
    harness.validationCalls = [];
    const denied = await (await connect(build(harness))).callTool({ name: 'flow_get_card_customer', arguments: { runId: CARD } });
    assert.equal(payload(denied).error, 'customer_documents_not_allowed');
    assert.deepEqual(harness.validationCalls, []);

    harness.settings = { ...harness.settings, allowCustomerDocuments: true };
    const client = await connect(build(harness));
    const customer = payload(await client.callTool({ name: 'flow_get_card_customer', arguments: { runId: CARD } }));
    assert.equal((customer.customer as { cpf: string }).cpf, '00000000191', 'dados do cliente sem mascara, sob o aceite de documentos');
    const page = await client.callTool({
      name: 'flow_get_card_customer_document',
      arguments: { runId: CARD, documentType: 'extrato_beneficio', page: 2 }
    });
    const content = page.content as Array<{ type: string; text?: string; mimeType?: string }>;
    assert.deepEqual(JSON.parse(content[0].text ?? '{}'), { documentType: 'extrato_beneficio', version: 1, page: 2, pageCount: 3 });
    assert.equal(content[1].mimeType, 'image/jpeg');
    assert.deepEqual(harness.validationCalls, [`card-customer:${CARD}`, `card-page:${CARD}:extrato_beneficio:2`]);
  });

  // Analise de Acoes (flow-action-analysis-sprints.md, A1).
  void it('action analysis submit needs the documents permission and forwards the structured actions', async () => {
    harness.validationCalls = [];
    const args = {
      runId: CARD,
      status: 'concluida',
      header: { holderName: 'MARIA', benefitNumber: '123', statementDate: '01/10/2026' },
      actions: [{ block: 'b', bank: 'BANCO X', year: '2021', contracts: [{ number: '111', inclusionDate: '02/03/2021' }] }]
    };
    const denied = await (await connect(build(harness))).callTool({ name: 'flow_submit_action_analysis', arguments: args });
    assert.equal(payload(denied).error, 'customer_documents_not_allowed');

    harness.settings = { ...harness.settings, allowCustomerDocuments: true };
    const client = await connect(build(harness));
    const invalid = await client.callTool({ name: 'flow_submit_action_analysis', arguments: { ...args, actions: [{ ...args.actions[0], block: 'x' }] } });
    assert.equal(invalid.isError, true, 'bloco fora da lista e recusado pelo schema');
    const result = payload(await client.callTool({ name: 'flow_submit_action_analysis', arguments: args }));
    assert.equal(result.automationCompleted, true);
    assert.deepEqual(harness.validationCalls, [`analysis:${CARD}:concluida:1`]);
    assert.ok(harness.audits.some((audit) => audit.payload.tool === 'flow_submit_action_analysis' && audit.payload.actionCount === 1));
  });

  void it('initial petitions: submit and finish go through the MCP schema with the documents permission (ADR 020)', async () => {
    const args = { runId: CARD, petitionKey: 'santander-jec', actionIds: [], content: samplePetition() };
    const denied = await (await connect(build(harness))).callTool({ name: 'flow_submit_initial_petition', arguments: args });
    assert.equal(payload(denied).error, 'customer_documents_not_allowed');

    harness.settings = { ...harness.settings, allowCustomerDocuments: true };
    const client = await connect(build(harness));
    const accepted = payload(await client.callTool({ name: 'flow_submit_initial_petition', arguments: args }));
    assert.equal(accepted.petitionKey, 'santander-jec');
    const malformed = await client.callTool({
      name: 'flow_submit_initial_petition',
      arguments: { ...args, content: { ...args.content, court: 'stf' } }
    });
    assert.equal(malformed.isError, true, 'juizo fora de jec/jef e recusado pelo schema');
    const finished = payload(await client.callTool({ name: 'flow_finish_initial_petitions', arguments: { runId: CARD, status: 'nao_concluida', failureReason: 'HISCON ilegivel' } }));
    assert.equal(finished.status, 'nao_concluida');
  });
});
