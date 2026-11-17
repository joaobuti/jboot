import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FlowCustomersService } from './flow-customers.service';

const context = { identityId: 'i', clientId: 'tenant', applicationId: 'app', databaseRef: 'db',
  scopes: ['flow:customers:read', 'flow:customers:write'], roles: [] };
const mutate = { ...context };
const customer = { id: 'customer', name: 'Cliente', documentNumber: '12345678901', email: null, phone: null,
  status: 'active', createdAt: 'now', updatedAt: 'now' };
const officeId = '00000000-0000-4000-8000-000000000020';

function fixture() {
  const state = { commandCalls: 0, auditEvents: [] as string[], allowedIds: undefined as string[] | null | undefined };
  const deps = {
    repository: {
      listVisibleCustomerIds: async () => [customer.id],
      listActiveOffices: async () => [{ officeId }],
      replaceOffices: async () => undefined,
      listVisibleCards: async () => [],
      createCardFromCustomer: async () => { state.commandCalls += 1; return { cardId: 'card', replay: false }; },
      linkExistingCard: async () => undefined
    },
    customers: {
      listForFlow: async (_tenant: string, allowedIds: string[] | null) => {
        state.allowedIds = allowedIds;
        return { data: [customer], meta: { total: 1, limit: 20, offset: 0 } };
      },
      findForFlowById: async () => customer,
      createForFlow: async () => customer,
      updateForFlow: async () => customer,
      discardJustCreated: async () => true
    },
    juridico: { get: async () => null, save: async () => ({}) },
    viewers: { resolve: async () => ({ identityId: 'i', clientId: 'tenant', isAdmin: false, officeIds: [officeId], officeVisibilityEnabled: true }) },
    offices: { listByIds: async () => [{ id: officeId, active: true }] },
    officePolicy: { resolveForNewCard: async () => officeId },
    access: { requireBoard: async () => undefined, requireRole: async () => undefined, requireColumnEditable: async () => undefined },
    columns: { findById: async () => ({ id: 'column', status: 'active', requiresCompleteChecklist: false }) },
    checklistGate: { assertCanEnterColumn: async () => undefined },
    audit: { record: async (event: string) => { state.auditEvents.push(event); } },
    cardVisibility: { requireVisibleCard: async () => ({ id: 'card', boardColumnId: 'column', officeId }) },
    cardCustomers: { findByCard: async () => null }
  };
  const service = new FlowCustomersService(
    deps.repository as never, deps.customers as never, deps.juridico as never, deps.viewers as never,
    deps.offices as never, deps.officePolicy as never, deps.access as never, deps.columns as never,
    deps.checklistGate as never, deps.audit as never, deps.cardVisibility as never, deps.cardCustomers as never,
    { listCurrentForCustomers: async () => [], profilesForCustomers: async () => new Map() } as never,
    { listRecentForCustomers: async () => [], expireStaleForCustomers: async () => undefined, getSettings: async () => null, listOfficeSettings: async () => [] } as never,
    { require: async () => officeId } as never
  );
  return { service, deps, state };
}

void test('regular operator list uses the union of linked office customer ids', async () => {
  const { service, state } = fixture();
  const result = await service.list(context, { page: 1, pageSize: 20 }, mutate);
  assert.deepEqual(state.allowedIds, [customer.id]);
  assert.deepEqual(Object.keys(result.data[0]).sort(), ['documentation', 'id', 'maskedDocumentNumber', 'name', 'officeIds', 'status']);
  assert.deepEqual(result.data[0].documentation, { status: 'documentos_incompletos', missingCount: 5, latestVerdict: null });
  assert.equal(result.validationConfigured, false);
});

void test('other office and another tenant are indistinguishable 404 responses', async () => {
  const otherOffice = fixture();
  otherOffice.deps.repository.listActiveOffices = async () => [{ officeId: 'other' }];
  await assert.rejects(() => otherOffice.service.get(context, customer.id, mutate), NotFoundException);
  const otherTenant = fixture();
  otherTenant.deps.customers.findForFlowById = async () => null as never;
  await assert.rejects(() => otherTenant.service.get(context, customer.id, mutate), NotFoundException);
});

void test('flow admin sees a legacy customer and the global access is audited without PII', async () => {
  const { service, deps, state } = fixture();
  deps.viewers.resolve = async () => ({ identityId: 'i', clientId: 'tenant', isAdmin: true, officeIds: [], officeVisibilityEnabled: true });
  deps.repository.listActiveOffices = async () => [];
  assert.equal((await service.get({ ...context, scopes: ['flow:admin'] }, customer.id, mutate)).id, customer.id);
  assert.equal(state.auditEvents.includes('kanban_flow_customers_global_read'), true);
});

void test('conector Claude: leitura de admin nao duplica a auditoria global (a tool ja e auditada com o run)', async () => {
  const { service, deps, state } = fixture();
  deps.viewers.resolve = async () => ({ identityId: 'i', clientId: 'tenant', isAdmin: true, officeIds: [], officeVisibilityEnabled: true });
  await service.requireVisibleCustomer({ ...context, scopes: ['flow:admin'] }, customer.id, mutate, { auditGlobalRead: false });
  assert.equal(state.auditEvents.includes('kanban_flow_customers_global_read'), false);
});

void test('non-admin cannot expand customer visibility to another office', async () => {
  const { service } = fixture();
  await assert.rejects(() => service.update(context, customer.id, {
    officeIds: ['00000000-0000-4000-8000-000000000021'], officeLinkReason: 'transferencia autorizada'
  }, mutate), ForbiddenException);
});

void test('combined owner and office patch is rejected before either database is mutated', async () => {
  const { service, deps } = fixture();
  let officeWrites = 0;
  let ownerWrites = 0;
  deps.repository.replaceOffices = async () => { officeWrites += 1; };
  deps.customers.updateForFlow = async () => { ownerWrites += 1; return customer; };
  await assert.rejects(() => service.update(context, customer.id, {
    name: 'Novo', officeIds: [officeId], officeLinkReason: 'mudanca autorizada'
  }, mutate));
  assert.equal(officeWrites, 0);
  assert.equal(ownerWrites, 0);
});

void test('idempotent replay returns one card and does not duplicate creation audit', async () => {
  const { service, deps, state } = fixture();
  deps.repository.createCardFromCustomer = async () => { state.commandCalls += 1; return { cardId: 'card', replay: true }; };
  const result = await service.createCard(context, customer.id, 'request-123', cardInput(), mutate);
  assert.deepEqual(result, { cardId: 'card', replay: true });
  assert.equal(state.commandCalls, 1);
  // Auditoria do comando novo e atomica no repository; replay nao chama audit externo.
  assert.equal(state.auditEvents.includes('kanban_card_created_from_customer'), false);
});

void test('ACL denial and WIP conflict do not produce a successful command', async () => {
  const denied = fixture();
  denied.deps.access.requireColumnEditable = async () => { throw new ForbiddenException('column_not_editable'); };
  await assert.rejects(() => denied.service.createCard(context, customer.id, 'request-123', cardInput(), mutate), ForbiddenException);
  assert.equal(denied.state.commandCalls, 0);
  const full = fixture();
  full.deps.repository.createCardFromCustomer = async () => { throw new ConflictException({ code: 'wip_limit_exceeded' }); };
  await assert.rejects(() => full.service.createCard(context, customer.id, 'request-123', cardInput(), mutate), ConflictException);
});

function cardInput() {
  return { boardId: '00000000-0000-4000-8000-000000000050', columnId: '00000000-0000-4000-8000-000000000040', officeId, title: 'Caso' };
}
