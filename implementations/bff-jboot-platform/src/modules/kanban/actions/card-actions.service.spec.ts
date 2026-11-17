import 'reflect-metadata';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CardActionsService } from './card-actions.service';
import { CardActionHandlers } from './card-action-handlers.service';
import { canConfigureCardActions, canExecuteCardActions } from './card-actions.policy';
import { requireCardAction, selectableCardActions } from './action-catalog';
import { ReplaceColumnActionsDto } from './dto/card-actions.dto';
import { MutateContext } from '../kanban.types';

const member: MutateContext = {
  identityId: 'user', clientId: 'tenant', applicationId: 'flow', databaseRef: 'db',
  roles: [], scopes: ['flow:read', 'flow:actions:execute']
};
const master = { ...member, roles: ['client_admin'], scopes: ['flow:read', 'flow:admin'] };

const AGENT = '7d9b6c1e-5f4a-4c2b-9a8d-1e2f3a4b5c6d';

function signedKitsStub(validations: unknown[][] = []) {
  return { validateFromAction: async (...args: unknown[]) => { validations.push(args); return 'Validação de assinatura iniciada.'; } };
}

function fixture(options: {
  deniedCard?: boolean; deniedColumn?: boolean; deniedRole?: boolean; archived?: boolean;
  assignments?: Array<{ columnId: string; actionId: string; agentId: string | null; configuredByIdentityId: string }>;
  config?: Record<string, string>;
} = {}) {
  const writes: unknown[][] = [];
  const validations: unknown[][] = [];
  const repository = {
    list: async (...args: unknown[]) => {
      writes.push(['list', ...args]);
      return options.assignments ?? [{ columnId: 'visible', actionId: 'monitorar', agentId: null, configuredByIdentityId: 'admin' }];
    },
    replace: async (...args: unknown[]) => { writes.push(['replace', ...args]); },
    confirmExecution: async (...args: unknown[]) => {
      writes.push(['execute', ...args]);
      return { config: options.config ?? {}, configuredByIdentityId: 'admin' };
    }
  };
  const access = {
    requireBoard: async (context: MutateContext) => {
      if (context.clientId !== 'tenant') throw new NotFoundException();
      return { id: 'board' };
    },
    requireRole: async () => { if (options.deniedRole) throw new ForbiddenException(); },
    requireColumnEditable: async () => { if (options.deniedColumn) throw new ForbiddenException(); }
  };
  const visibility = { requireVisibleCard: async (context: MutateContext) => {
    if (options.deniedCard || context.clientId !== 'tenant') throw new NotFoundException();
    return { id: 'card', boardColumnId: 'visible', status: options.archived ? 'archived' : 'active' };
  } };
  const service = new CardActionsService(repository as never,
    { list: async () => [{ id: 'visible', name: 'Visible' }, { id: 'hidden', name: 'Hidden' }] } as never,
    { list: async () => ({ data: [{ id: 'visible', name: 'Visible' }] }) } as never,
    access as never, visibility as never, new CardActionHandlers(signedKitsStub(validations) as never),
    { monitorableCardIds: async () => ['card'] } as never,
    { resolve: async () => ({ identityId: 'member', isAdmin: false, officeVisibilityEnabled: false, officeIds: [] }) } as never,
    { validatableCardIds: async () => ['signed-card'] } as never);
  return { service, writes, validations };
}

void test('Only senior/global master and client master with Flow admin configure; board admin alone cannot', () => {
  assert.equal(canConfigureCardActions({ ...member, roles: ['global_master'], scopes: ['flow:read'] }), true);
  assert.equal(canConfigureCardActions(master), true);
  assert.equal(canExecuteCardActions(master), true);
  assert.equal(canConfigureCardActions({ ...member, roles: ['board_admin'], scopes: ['flow:admin'] }), false);
  assert.equal(canConfigureCardActions({ ...member, roles: ['client_admin'] }), false);
  assert.equal(canExecuteCardActions({ ...member, scopes: ['flow:read', 'flow:write'] }), false);
});

void test('Catalog declares descriptions, selectable status, known category and a handler for every selectable action', async () => {
  const handlers = new CardActionHandlers(signedKitsStub() as never);
  const assignment = { config: { agentId: AGENT }, configuredByIdentityId: 'admin' };
  assert.deepEqual(selectableCardActions().map(action => action.id), ['gerar-protocolo', 'monitorar', 'validar-assinatura']);
  for (const action of selectableCardActions()) {
    assert.ok(['juridico', 'documentos'].includes(action.category));
    assert.ok(action.description.length > 20);
    assert.equal(action.boardSelectable, true);
    if (action.interaction === 'execute') assert.ok((await handlers.execute(member, 'board', 'card', action.id, assignment)).message.length > 0);
    else await assert.rejects(() => handlers.execute(member, 'board', 'card', action.id, assignment), BadRequestException);
  }
  assert.equal(requireCardAction('validar-assinatura').config, 'routine_agent');
  assert.throws(() => requireCardAction('arbitrary-code'), NotFoundException);
});

void test('Assignment authorizes master, accepts multiple actions and empty set, and passes authenticated tenant to repository', async () => {
  const { service, writes } = fixture();
  await service.replace(master, 'board', 'visible', { actionIds: ['gerar-protocolo', 'monitorar'] });
  await service.replace(master, 'board', 'visible', { actionIds: [] });
  assert.deepEqual(writes, [
    ['replace', master, 'board', 'visible', ['gerar-protocolo', 'monitorar'], {}],
    ['replace', master, 'board', 'visible', [], {}]
  ]);
});

void test('Validar assinatura is saved only with an agent; config for actions that do not use it is refused', async () => {
  const { service, writes } = fixture();
  await assert.rejects(() => service.replace(master, 'board', 'visible', { actionIds: ['validar-assinatura'] }), BadRequestException);
  await assert.rejects(() => service.replace(master, 'board', 'visible', {
    actionIds: ['validar-assinatura', 'monitorar'], configs: [{ actionId: 'validar-assinatura', agentId: AGENT }, { actionId: 'monitorar', agentId: AGENT }]
  }), BadRequestException);
  await assert.rejects(() => service.replace(master, 'board', 'visible', {
    actionIds: ['monitorar'], configs: [{ actionId: 'validar-assinatura', agentId: AGENT }]
  }), BadRequestException, 'config of an unassigned action');
  assert.deepEqual(writes, []);
  await service.replace(master, 'board', 'visible', { actionIds: ['validar-assinatura'], configs: [{ actionId: 'validar-assinatura', agentId: AGENT }] });
  assert.deepEqual(writes, [['replace', master, 'board', 'visible', ['validar-assinatura'], { 'validar-assinatura': { agentId: AGENT } }]]);
});

void test('Assignment denies ordinary members, board admins, another tenant, unknown/nonselectable actions before writing', async () => {
  const { service, writes } = fixture();
  await assert.rejects(() => service.replace(member, 'board', 'visible', { actionIds: ['monitorar'] }), ForbiddenException);
  await assert.rejects(() => service.replace({ ...member, roles: ['board_admin'], scopes: ['flow:admin'] }, 'board', 'visible', { actionIds: [] }), ForbiddenException);
  await assert.rejects(() => service.replace({ ...master, clientId: 'other' }, 'board', 'visible', { actionIds: [] }), NotFoundException);
  await assert.rejects(() => service.replace(master, 'board', 'visible', { actionIds: ['unknown'] }), NotFoundException);
  assert.deepEqual(writes, []);
});

void test('Listing filters assignments by visible columns, master gets all columns and permissions reflect context', async () => {
  const { service, writes } = fixture();
  const result = await service.list(member, 'board');
  assert.deepEqual(result.columns.map(c => c.id), ['visible']);
  assert.equal(result.canConfigure, false);
  assert.equal(result.canExecute, true);
  assert.deepEqual(writes[0], ['list', 'db', 'tenant', 'board', ['visible']]);
  assert.equal((await service.list(master, 'board')).columns.length, 2);
});

void test('Execution gerar-protocolo confirms current column and returns the actual handler result', async () => {
  const { service, writes } = fixture();
  assert.deepEqual(await service.execute(member, 'board', 'card', 'gerar-protocolo'), { actionId: 'gerar-protocolo', cardId: 'card', message: 'backend acao Gerar Protocolo' });
  assert.deepEqual(writes, [['execute', member, 'board', 'card', 'visible', 'gerar-protocolo']]);
});

void test('Dialog action monitorar is refused by the generic endpoint before any write', async () => {
  const { service, writes } = fixture();
  await assert.rejects(() => service.execute(member, 'board', 'card', 'monitorar'), BadRequestException);
  assert.deepEqual(writes, []);
});

void test('Listing exposes the cards where monitorar has something to do', async () => {
  const { service } = fixture();
  assert.deepEqual((await service.list(member, 'board')).availableCardIds, { monitorar: ['card'] });
});

void test('Listing exposes Validar assinatura availability, its agent and whether the viewer configured it', async () => {
  const { service } = fixture({ assignments: [{ columnId: 'visible', actionId: 'validar-assinatura', agentId: AGENT, configuredByIdentityId: 'user' }] });
  const result = await service.list(member, 'board');
  assert.deepEqual(result.availableCardIds, { 'validar-assinatura': ['signed-card'] });
  assert.deepEqual(result.assignments, [{ columnId: 'visible', actionId: 'validar-assinatura', agentId: AGENT, configuredByCurrentUser: true }]);
});

void test('Execution of Validar assinatura dispatches with the action agent and the configurer as executor', async () => {
  const { service, validations } = fixture({ config: { agentId: AGENT } });
  const result = await service.execute(member, 'board', 'card', 'validar-assinatura');
  assert.match(result.message, /iniciada/);
  assert.deepEqual(validations, [[member, 'board', 'card', { agentId: AGENT, executorIdentityId: 'admin' }, member]]);
  const missing = fixture();
  await assert.rejects(() => missing.service.execute(member, 'board', 'card', 'validar-assinatura'), BadRequestException);
  assert.deepEqual(missing.validations, []);
});

void test('Master executes without dedicated scope; ordinary read/write user does not', async () => {
  const { service } = fixture();
  assert.equal((await service.execute(master, 'board', 'card', 'gerar-protocolo')).message, 'backend acao Gerar Protocolo');
  await assert.rejects(() => service.execute({ ...member, scopes: ['flow:read', 'flow:write'] }, 'board', 'card', 'gerar-protocolo'), ForbiddenException);
});

for (const options of [{ deniedCard: true }, { deniedColumn: true }, { deniedRole: true }, { archived: true }]) {
  void test(`Execution rejects unauthorized/archived card before handler: ${JSON.stringify(options)}`, async () => {
    const { service, writes } = fixture(options);
    await assert.rejects(() => service.execute(member, 'board', 'card', 'gerar-protocolo'));
    assert.deepEqual(writes, []);
  });
}

void test('DTO rejects duplicates, unknown types, oversized arrays and overlong IDs; permits clearing associations', async () => {
  for (const actionIds of [['monitorar', 'monitorar'], [null], 'monitorar', ['x'.repeat(81)], Array(51).fill('x')]) {
    assert.ok((await validate(plainToInstance(ReplaceColumnActionsDto, { actionIds }))).length > 0);
  }
  assert.deepEqual(await validate(plainToInstance(ReplaceColumnActionsDto, { actionIds: [] })), []);
  assert.ok((await validate(plainToInstance(ReplaceColumnActionsDto, { actionIds: ['validar-assinatura'], configs: [{ actionId: 'validar-assinatura', agentId: 'not-uuid' }] }))).length > 0);
  assert.deepEqual(await validate(plainToInstance(ReplaceColumnActionsDto, { actionIds: ['validar-assinatura'], configs: [{ actionId: 'validar-assinatura', agentId: AGENT }] })), []);
});
