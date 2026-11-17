import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CardCustomersService, changedFields } from './card-customers.service';
import { keyOffVisibility, noLeadLock } from '../../../test/kanban-visibility';

// CPF sintetico (digitos verificadores validos, sem titular real).
const CPF = '529.982.247-25';
const CPF_DIGITS = '52998224725';

const context = {
  clientId: 'client-1',
  identityId: 'user-1',
  databaseRef: 'db-1',
  applicationId: 'app-1',
  roles: [],
  scopes: ['flow:read', 'flow:write']
};
const mutate = { ...context, ip: '127.0.0.1', userAgent: 'test' };
const CARD = { id: 'card-1', boardId: 'board-1', boardColumnId: 'col-1', status: 'active' };

const CORE = {
  id: 'cust-1',
  name: 'Maria',
  documentNumber: CPF_DIGITS,
  email: 'maria@example.test',
  phone: '1199999',
  addressZip: null,
  addressStreet: null,
  addressNumber: null,
  addressComplement: null,
  addressNeighborhood: null,
  addressCity: null,
  addressState: null,
  addressIbgeCode: null,
  ie: 'IE-PDV',
  indIeDest: 9,
  status: 'active',
  createdAt: 'x',
  updatedAt: 'x'
};
const JURIDICO = {
  customerId: 'cust-1',
  dataNascimento: '1980-01-02',
  nacionalidade: 'brasileira',
  estadoCivil: null,
  profissao: 'aposentada',
  rgNumero: null,
  rgOrgaoEmissor: null,
  rgUf: null,
  nomeMae: null,
  numeroBeneficio: null,
  especieBeneficio: null,
  bancoPagamento: null,
  hipossuficienciaDeclarada: true,
  observacoes: null,
  createdAt: 'x',
  updatedAt: 'x'
};

interface Calls {
  findIdsByCpf: string[];
  findById: string[];
  juridicoGet: string[];
  juridicoSave: Array<{ customerId: string; input: Record<string, unknown> }>;
  createIfCpfAbsent: Array<{ cpf: string; dto: Record<string, unknown> }>;
  customersUpdate: Array<{ id: string; dto: Record<string, unknown> }>;
  visibilityChecks: string[][];
  discarded: string[];
  replace: Array<{ cardId: string; customerId: string }>;
  events: Array<{ kind: string; payload: Record<string, unknown> }>;
  audits: Array<{ type: string; payload: Record<string, unknown> }>;
}

interface Options {
  ids?: string[];
  visible?: string[];
  currentLink?: { customerId: string } | null;
  previousCustomerId?: string | null;
  createResult?: { created: true; id: string } | { created: false; existingIds: string[] };
  role?: 'board_admin' | 'board_member' | 'board_viewer';
  columnEditable?: boolean;
  replaceError?: Error;
  juridicoSaveError?: Error;
  discardError?: Error;
  /** Simula membresia no quadro do card: cliente vinculado ao card passa a ser visivel. */
  linkedIsVisible?: boolean;
}

function build(options: Options = {}) {
  const calls: Calls = {
    findIdsByCpf: [],
    findById: [],
    juridicoGet: [],
    juridicoSave: [],
    createIfCpfAbsent: [],
    customersUpdate: [],
    visibilityChecks: [],
    discarded: [],
    replace: [],
    events: [],
    audits: []
  };
  let link = options.currentLink ?? null;
  const role = options.role ?? 'board_member';
  const repository = {
    findByCard: async () => (link ? { cardId: 'card-1', customerId: link.customerId, createdByIdentityId: 'user-1', createdAt: 't' } : null),
    replace: async (_ref: string, _client: string, cardId: string, customerId: string) => {
      calls.replace.push({ cardId, customerId });
      if (options.replaceError) {
        throw options.replaceError;
      }
      link = { customerId };
      return { link: { cardId, customerId }, previousCustomerId: options.previousCustomerId ?? null };
    },
    filterVisibleCustomerIds: async (_ref: string, _client: string, _identity: string, ids: string[]) => {
      calls.visibilityChecks.push(ids);
      const visible = [...(options.visible ?? []), ...(options.linkedIsVisible && link ? [link.customerId] : [])];
      return ids.filter((id) => visible.includes(id));
    }
  };
  const cards = { findById: async () => CARD };
  const activities = {
    createSystemEvent: async (_r: string, _c: string, _card: string, _a: string, kind: string, payload: Record<string, unknown>) => {
      calls.events.push({ kind, payload });
      return { id: 'act-1' };
    }
  };
  const access = {
    requireBoard: async () => ({ id: 'board-1' }),
    resolveMembership: async () => ({ role, profileId: null }),
    requireRole: async (_ctx: unknown, _board: string, allowed: string[]) => {
      if (!allowed.includes(role)) {
        throw new ForbiddenException('Insufficient board role');
      }
      return role;
    },
    requireColumnEditable: async () => {
      if (options.columnEditable === false) {
        throw new ForbiddenException({ code: 'column_not_editable' });
      }
    }
  };
  const audit = {
    record: async (type: string, _m: unknown, _b: string, payload: Record<string, unknown>) => {
      calls.audits.push({ type, payload });
    }
  };
  const customers = {
    findIdsByCpf: async (_client: string, cpf: string) => {
      calls.findIdsByCpf.push(cpf);
      return options.ids ?? [];
    },
    findById: async (_client: string, id: string) => {
      calls.findById.push(id);
      return { ...CORE, id };
    },
    createIfCpfAbsent: async (_client: string, cpf: string, dto: Record<string, unknown>) => {
      calls.createIfCpfAbsent.push({ cpf, dto });
      return options.createResult ?? { created: true, id: 'cust-new' };
    },
    update: async (_client: string, id: string, dto: Record<string, unknown>) => {
      calls.customersUpdate.push({ id, dto });
      return { ...CORE, id };
    },
    discardJustCreated: async (_client: string, id: string) => {
      calls.discarded.push(id);
      if (options.discardError) {
        throw options.discardError;
      }
      return true;
    }
  };
  const juridico = {
    get: async (_client: string, id: string) => {
      calls.juridicoGet.push(id);
      return { ...JURIDICO, customerId: id };
    },
    save: async (_client: string, customerId: string, input: Record<string, unknown>) => {
      calls.juridicoSave.push({ customerId, input });
      if (options.juridicoSaveError) {
        throw options.juridicoSaveError;
      }
      return { ...JURIDICO, customerId };
    }
  };
  const service = new CardCustomersService(
    repository as never,
    keyOffVisibility(() => cards.findById()),
    activities as never,
    access as never,
    audit as never,
    customers as never,
    juridico as never,
    noLeadLock
  );
  return { service, calls };
}

function assertNoPersonalData(value: unknown) {
  const text = JSON.stringify(value);
  for (const forbidden of [CPF, CPF_DIGITS, 'Maria', 'maria@example.test']) {
    assert.equal(text.includes(forbidden), false, `payload must not contain ${forbidden}`);
  }
}

void test('lookup not_found: so status, sem dado e sem checar visibilidade', async () => {
  const { service, calls } = build({ ids: [] });
  const result = await service.lookup(context, 'board-1', 'card-1', CPF);
  assert.deepEqual(result, { status: 'not_found' });
  assert.deepEqual(calls.findById, []);
  assert.deepEqual(calls.visibilityChecks, []);
});

void test('lookup outside_boards: so o status, e o servico de dados do cliente NAO e chamado', async () => {
  const { service, calls } = build({ ids: ['cust-hidden'], visible: [] });
  const result = await service.lookup(context, 'board-1', 'card-1', CPF);
  assert.deepEqual(result, { status: 'outside_boards' });
  assert.deepEqual(Object.keys(result), ['status']);
  assert.deepEqual(calls.visibilityChecks, [['cust-hidden']]);
  assert.deepEqual(calls.findById, [], 'nucleo do cliente nao pode ser lido');
  assert.deepEqual(calls.juridicoGet, [], 'dado juridico nao pode ser lido');
});

void test('lookup found: checa visibilidade antes e devolve nucleo + juridico sem campos fiscais de PDV', async () => {
  const order: string[] = [];
  const { service, calls } = build({ ids: ['cust-x', 'cust-1'], visible: ['cust-1'] });
  const originalFind = (service as unknown as { customers: { findById: (...a: unknown[]) => unknown } }).customers;
  const wrappedFind = originalFind.findById;
  originalFind.findById = async (...args: unknown[]) => {
    order.push(`findById:${calls.visibilityChecks.length}`);
    return wrappedFind(...args);
  };
  const result = await service.lookup(context, 'board-1', 'card-1', CPF);
  assert.equal(result.status, 'found');
  assert.ok(result.status === 'found');
  assert.equal(result.customer.id, 'cust-1');
  assert.equal(result.customer.name, 'Maria');
  assert.equal(result.customer.juridico?.profissao, 'aposentada');
  assert.equal('ie' in result.customer, false);
  assert.equal('indIeDest' in result.customer, false);
  assert.deepEqual(order, ['findById:1'], 'dado so e lido depois da checagem de visibilidade');
});

void test('lookup exige permissao de edicao do card (viewer recebe 403 antes de qualquer busca)', async () => {
  const { service, calls } = build({ role: 'board_viewer' });
  await assert.rejects(() => service.lookup(context, 'board-1', 'card-1', CPF), ForbiddenException);
  assert.deepEqual(calls.findIdsByCpf, []);
});

void test('link bloqueia cliente existente fora dos quadros: 409, sem vinculo, sem criacao e sem dados', async () => {
  const { service, calls } = build({ ids: ['cust-hidden'], visible: [] });
  const error = await service
    .link(context, 'board-1', 'card-1', { cpf: CPF, customer: { name: 'Outra' } }, mutate)
    .catch((err: unknown) => err);
  assert.ok(error instanceof ConflictException);
  assert.deepEqual(error.getResponse(), { code: 'customer_outside_boards', message: 'Cliente cadastrado fora dos seus quadros' });
  assert.deepEqual(calls.replace, []);
  assert.deepEqual(calls.createIfCpfAbsent, []);
  assert.deepEqual(calls.findById, []);
  assert.deepEqual(calls.events, []);
});

void test('link cria cliente novo (nucleo + juridico), vincula e grava card.customer_linked sem dado pessoal', async () => {
  const { service, calls } = build({ ids: [] });
  const result = await service.link(
    context,
    'board-1',
    'card-1',
    { cpf: CPF, customer: { name: 'Maria', email: 'maria@example.test' }, juridico: { profissao: 'aposentada' } },
    mutate
  );
  assert.equal(result.outcome, 'created');
  assert.equal(result.customer?.id, 'cust-new');
  assert.equal(result.canEdit, true);
  assert.deepEqual(calls.createIfCpfAbsent, [{ cpf: CPF, dto: { name: 'Maria', email: 'maria@example.test' } }]);
  assert.deepEqual(calls.replace, [{ cardId: 'card-1', customerId: 'cust-new' }]);
  assert.deepEqual(calls.juridicoSave, [{ customerId: 'cust-new', input: { profissao: 'aposentada' } }]);
  assert.deepEqual(calls.events, [{ kind: 'card.customer_linked', payload: { customerId: 'cust-new', created: true } }]);
  assert.equal(calls.audits[0].type, 'kanban_card_customer_linked');
  assertNoPersonalData(calls.events);
  assertNoPersonalData(calls.audits);
});

void test('link de CPF novo sem dados do cliente retorna 422 customer_data_required', async () => {
  const { service, calls } = build({ ids: [] });
  await assert.rejects(() => service.link(context, 'board-1', 'card-1', { cpf: CPF }, mutate), UnprocessableEntityException);
  assert.deepEqual(calls.replace, []);
});

void test('link de cliente existente visivel vincula o existente e ignora dados enviados (nao duplica)', async () => {
  const { service, calls } = build({ ids: ['cust-1'], visible: ['cust-1'] });
  const result = await service.link(
    context,
    'board-1',
    'card-1',
    { cpf: CPF, customer: { name: 'Ignorado' }, juridico: { profissao: 'ignorada' } },
    mutate
  );
  assert.equal(result.outcome, 'linked');
  assert.deepEqual(calls.createIfCpfAbsent, []);
  assert.deepEqual(calls.juridicoSave, []);
  assert.deepEqual(calls.events, [{ kind: 'card.customer_linked', payload: { customerId: 'cust-1', created: false } }]);
});

void test('link em corrida: criacao concorrente devolve existente fora dos quadros e bloqueia', async () => {
  const { service, calls } = build({ ids: [], visible: [], createResult: { created: false, existingIds: ['cust-race'] } });
  await assert.rejects(
    () => service.link(context, 'board-1', 'card-1', { cpf: CPF, customer: { name: 'X' } }, mutate),
    ConflictException
  );
  assert.deepEqual(calls.visibilityChecks, [['cust-race']]);
  assert.deepEqual(calls.replace, []);
});

void test('troca de cliente grava card.customer_changed com o titular anterior', async () => {
  const { service, calls } = build({
    ids: ['cust-2'],
    visible: ['cust-2'],
    currentLink: { customerId: 'cust-1' },
    previousCustomerId: 'cust-1'
  });
  const result = await service.link(context, 'board-1', 'card-1', { cpf: CPF }, mutate);
  assert.equal(result.outcome, 'linked');
  assert.deepEqual(calls.events, [
    { kind: 'card.customer_changed', payload: { customerId: 'cust-2', previousCustomerId: 'cust-1', created: false } }
  ]);
  assert.equal(calls.audits[0].type, 'kanban_card_customer_changed');
});

void test('vincular o mesmo cliente de novo e unchanged, sem evento', async () => {
  const { service, calls } = build({ ids: ['cust-1'], visible: ['cust-1'], currentLink: { customerId: 'cust-1' } });
  const result = await service.link(context, 'board-1', 'card-1', { cpf: CPF }, mutate);
  assert.equal(result.outcome, 'unchanged');
  assert.deepEqual(calls.replace, []);
  assert.deepEqual(calls.events, []);
});

void test('link exige coluna editavel (mesma regra das mutacoes de card)', async () => {
  const { service, calls } = build({ columnEditable: false });
  await assert.rejects(() => service.link(context, 'board-1', 'card-1', { cpf: CPF }, mutate), ForbiddenException);
  assert.deepEqual(calls.findIdsByCpf, []);
});

void test('edicao grava so os campos alterados e card.customer_updated com a lista de campos, sem valores', async () => {
  const { service, calls } = build({ currentLink: { customerId: 'cust-1' } });
  await service.update(
    context,
    'board-1',
    'card-1',
    {
      customer: { name: 'Maria', phone: '1188888', email: undefined },
      juridico: { profissao: 'aposentada', estadoCivil: 'viuva', nacionalidade: null }
    },
    mutate
  );
  assert.deepEqual(calls.customersUpdate, [{ id: 'cust-1', dto: { phone: '1188888' } }]);
  assert.deepEqual(calls.juridicoSave, [{ customerId: 'cust-1', input: { nacionalidade: null, estadoCivil: 'viuva' } }]);
  assert.deepEqual(calls.events, [
    {
      kind: 'card.customer_updated',
      payload: { customerId: 'cust-1', fields: ['phone', 'juridico.nacionalidade', 'juridico.estadoCivil'] }
    }
  ]);
  assertNoPersonalData(calls.events);
  assertNoPersonalData(calls.audits);
});

void test('edicao sem mudanca nao grava nem gera evento', async () => {
  const { service, calls } = build({ currentLink: { customerId: 'cust-1' } });
  await service.update(context, 'board-1', 'card-1', { customer: { name: 'Maria' }, juridico: { profissao: 'aposentada' } }, mutate);
  assert.deepEqual(calls.customersUpdate, []);
  assert.deepEqual(calls.juridicoSave, []);
  assert.deepEqual(calls.events, []);
});

void test('edicao de card sem cliente vinculado retorna 404 card_customer_not_linked', async () => {
  const { service } = build({ currentLink: null });
  const error = await service.update(context, 'board-1', 'card-1', { customer: { name: 'X' } }, mutate).catch((err: unknown) => err);
  assert.ok(error instanceof NotFoundException);
  assert.equal((error.getResponse() as { code: string }).code, 'card_customer_not_linked');
});

void test('edicao exige papel de edicao: viewer recebe 403 e nada e gravado', async () => {
  const { service, calls } = build({ role: 'board_viewer', currentLink: { customerId: 'cust-1' } });
  await assert.rejects(
    () => service.update(context, 'board-1', 'card-1', { customer: { phone: '1' } }, mutate),
    ForbiddenException
  );
  assert.deepEqual(calls.customersUpdate, []);
});

void test('painel: viewer ativo ve o cliente do card com canEdit=false; sem vinculo devolve customer null', async () => {
  const viewer = build({ role: 'board_viewer', currentLink: { customerId: 'cust-1' } });
  const panel = await viewer.service.getPanel(context, 'board-1', 'card-1');
  assert.equal(panel.customer?.id, 'cust-1');
  assert.equal(panel.canEdit, false);

  const empty = build({ currentLink: null });
  const emptyPanel = await empty.service.getPanel(context, 'board-1', 'card-1');
  assert.deepEqual(emptyPanel, { customer: null, link: null, canEdit: true });
  assert.deepEqual(empty.calls.findById, []);
});

void test('painel: sem scope flow:write canEdit=false', async () => {
  const { service } = build({ currentLink: { customerId: 'cust-1' } });
  const panel = await service.getPanel({ ...context, scopes: ['flow:read'] }, 'board-1', 'card-1');
  assert.equal(panel.canEdit, false);
});

void test('painel: quem nao e membro ativo do quadro recebe 403', async () => {
  const { service } = build();
  (service as unknown as { access: { resolveMembership: () => Promise<never> } }).access.resolveMembership = async () => {
    throw new ForbiddenException('Insufficient board role');
  };
  await assert.rejects(() => service.getPanel(context, 'board-1', 'card-1'), ForbiddenException);
});

void test('changedFields ignora ausente, compara com o atual e respeita ignoreNull', () => {
  const current = { a: 'x', b: null, c: 'y' };
  type Input = { a?: string | null; b?: string | null; c?: string | null };
  assert.deepEqual(
    changedFields<Input, 'a' | 'b' | 'c'>({ a: 'x', b: 'new', c: null }, current, ['a', 'b', 'c'], { ignoreNull: true }),
    { b: 'new' }
  );
  assert.deepEqual(
    changedFields<Input, 'a' | 'b' | 'c'>({ c: null, b: null }, current, ['a', 'b', 'c'], { ignoreNull: false }),
    { c: null }
  );
});

void test('compensacao: replace falha depois de criar -> remove o cliente criado e propaga o erro original', async () => {
  const replaceError = new Error('card deleted concurrently');
  const { service, calls } = build({ ids: [], replaceError });
  await assert.rejects(
    () => service.link(context, 'board-1', 'card-1', { cpf: CPF, customer: { name: 'Maria' } }, mutate),
    (error: unknown) => error === replaceError
  );
  assert.deepEqual(calls.discarded, ['cust-new']);
  assert.deepEqual(calls.events, []);
  assert.deepEqual(calls.juridicoSave, []);
});

void test('compensacao: replace falha com cliente EXISTENTE nao apaga nada', async () => {
  const replaceError = new Error('db down');
  const { service, calls } = build({ ids: ['cust-1'], visible: ['cust-1'], replaceError });
  await assert.rejects(
    () => service.link(context, 'board-1', 'card-1', { cpf: CPF }, mutate),
    (error: unknown) => error === replaceError
  );
  assert.deepEqual(calls.discarded, []);
});

void test('compensacao: corrida que devolve cliente existente (created=false) tambem nao apaga', async () => {
  const replaceError = new Error('db down');
  const { service, calls } = build({
    ids: [],
    visible: ['cust-race'],
    createResult: { created: false, existingIds: ['cust-race'] },
    replaceError
  });
  await assert.rejects(() => service.link(context, 'board-1', 'card-1', { cpf: CPF, customer: { name: 'X' } }, mutate));
  assert.deepEqual(calls.discarded, []);
});

void test('compensacao que falha: loga so ids (sem CPF/dado pessoal) e propaga o erro ORIGINAL', async () => {
  const replaceError = new Error('original');
  const { service, calls } = build({ ids: [], replaceError, discardError: new Error('compensation boom') });
  const logged: string[] = [];
  (service as unknown as { logger: { error: (message: string) => void } }).logger = {
    error: (message: string) => logged.push(message)
  };
  await assert.rejects(
    () => service.link(context, 'board-1', 'card-1', { cpf: CPF, customer: { name: 'Maria' } }, mutate),
    (error: unknown) => error === replaceError
  );
  assert.deepEqual(calls.discarded, ['cust-new']);
  assert.equal(logged.length, 1);
  assert.deepEqual(JSON.parse(logged[0]), {
    event: 'card_customer_compensation_failed',
    clientId: 'client-1',
    customerId: 'cust-new'
  });
  assertNoPersonalData(logged);
});

void test('nova tentativa depois da compensacao responde not_found e cria de novo (nao outside_boards)', async () => {
  // Servico de clientes com estado: criar adiciona, descartar remove.
  const store = new Set<string>();
  let seq = 0;
  let failReplace = true;
  const repository = {
    findByCard: async () => null,
    replace: async (_r: string, _c: string, cardId: string, customerId: string) => {
      if (failReplace) {
        throw new Error('transient');
      }
      return { link: { cardId, customerId }, previousCustomerId: null };
    },
    filterVisibleCustomerIds: async () => []
  };
  const customers = {
    findIdsByCpf: async () => [...store],
    createIfCpfAbsent: async () => {
      const id = `cust-${++seq}`;
      store.add(id);
      return { created: true, id };
    },
    discardJustCreated: async (_c: string, id: string) => store.delete(id),
    findById: async (_c: string, id: string) => ({ ...CORE, id })
  };
  const access = {
    requireBoard: async () => ({}),
    requireRole: async () => 'board_member',
    requireColumnEditable: async () => undefined
  };
  const service = new CardCustomersService(
    repository as never,
    keyOffVisibility(async () => CARD),
    { createSystemEvent: async () => ({ id: 'a' }) } as never,
    access as never,
    { record: async () => undefined } as never,
    customers as never,
    { get: async () => null, save: async () => undefined } as never,
    noLeadLock
  );

  await assert.rejects(() => service.link(context, 'board-1', 'card-1', { cpf: CPF, customer: { name: 'Maria' } }, mutate));
  assert.equal(store.size, 0, 'cliente orfao foi removido');

  assert.deepEqual(await service.lookup(context, 'board-1', 'card-1', CPF), { status: 'not_found' });
  failReplace = false;
  const retry = await service.link(context, 'board-1', 'card-1', { cpf: CPF, customer: { name: 'Maria' } }, mutate);
  assert.equal(retry.outcome, 'created');
  assert.equal(store.size, 1);
});

void test('falha em juridico.save depois do vinculo NAO desfaz o vinculo e o erro chega ao chamador', async () => {
  const juridicoSaveError = new Error('juridico failed');
  const { service, calls } = build({ ids: [], juridicoSaveError });
  await assert.rejects(
    () =>
      service.link(
        context,
        'board-1',
        'card-1',
        { cpf: CPF, customer: { name: 'Maria' }, juridico: { profissao: 'aposentada' } },
        mutate
      ),
    (error: unknown) => error === juridicoSaveError
  );
  assert.deepEqual(calls.replace, [{ cardId: 'card-1', customerId: 'cust-new' }]);
  assert.deepEqual(calls.discarded, [], 'vinculo e cliente permanecem');
  assert.deepEqual(calls.events, [{ kind: 'card.customer_linked', payload: { customerId: 'cust-new', created: true } }]);
});

// ------------------------------------------------------- Sprint 3: override do flow:admin

const adminContext = { ...context, scopes: ['flow:read', 'flow:write', 'flow:admin'] };
const adminMutate = { ...adminContext, ip: '127.0.0.1', userAgent: 'test' };
const REASON = 'Cliente transferido da base de Campinas para esta base';

void test('override: lookup outside_boards para flow:admin traz so canOverride, sem dado do cliente', async () => {
  const { service, calls } = build({ ids: ['cust-9'], visible: [] });
  const result = await service.lookup(adminContext, 'board-1', 'card-1', CPF);
  assert.deepEqual(result, { status: 'outside_boards', canOverride: true });
  assert.deepEqual(calls.findById, []);
  assert.deepEqual(calls.juridicoGet, []);
});

void test('override: flow:admin com motivo vincula o cliente existente fora dos quadros (primeiro id por criacao)', async () => {
  const { service, calls } = build({ ids: ['cust-old', 'cust-newer'], visible: [], linkedIsVisible: true });
  const result = await service.link(
    adminContext,
    'board-1',
    'card-1',
    { cpf: CPF, override: { reason: REASON }, customer: { name: 'Ignorado' } } as never,
    adminMutate
  );
  assert.equal(result.outcome, 'linked');
  assert.deepEqual(calls.replace, [{ cardId: 'card-1', customerId: 'cust-old' }]);
  assert.equal(calls.createIfCpfAbsent.length, 0, 'override nunca cria cliente');
  assert.equal(result.customer?.id, 'cust-old');
});

void test('override: evento e auditoria com override=true e motivo, sem CPF nem dado do cliente', async () => {
  const { service, calls } = build({ ids: ['cust-9'], visible: [], linkedIsVisible: true });
  await service.link(adminContext, 'board-1', 'card-1', { cpf: CPF, override: { reason: REASON } } as never, adminMutate);
  assert.deepEqual(calls.events, [
    { kind: 'card.customer_linked', payload: { customerId: 'cust-9', created: false, override: true, reason: REASON } }
  ]);
  assert.deepEqual(calls.audits, [
    {
      type: 'kanban_card_customer_linked',
      payload: { cardId: 'card-1', customerId: 'cust-9', created: false, override: true, reason: REASON }
    }
  ]);
  assertNoPersonalData(calls.events);
  assertNoPersonalData(calls.audits);
});

void test('override: troca de titular grava card.customer_changed com override e motivo', async () => {
  const { service, calls } = build({
    ids: ['cust-9'],
    visible: [],
    currentLink: { customerId: 'cust-prev' },
    previousCustomerId: 'cust-prev',
    linkedIsVisible: true
  });
  await service.link(adminContext, 'board-1', 'card-1', { cpf: CPF, override: { reason: REASON } } as never, adminMutate);
  assert.deepEqual(calls.events, [
    {
      kind: 'card.customer_changed',
      payload: { customerId: 'cust-9', previousCustomerId: 'cust-prev', created: false, override: true, reason: REASON }
    }
  ]);
});

void test('override: sem flow:admin responde 403 override_not_allowed antes de resolver o CPF', async () => {
  const { service, calls } = build({ ids: ['cust-9'], visible: [] });
  const error = await service
    .link(context, 'board-1', 'card-1', { cpf: CPF, override: { reason: REASON } } as never, mutate)
    .catch((err: unknown) => err);
  assert.ok(error instanceof ForbiddenException);
  assert.deepEqual(error.getResponse(), {
    code: 'override_not_allowed',
    message: 'Only a Flow tenant admin (flow:admin) can link a customer registered outside your boards'
  });
  assert.deepEqual(calls.findIdsByCpf, []);
  assert.deepEqual(calls.replace, []);
  assert.deepEqual(calls.events, []);
});

void test('override: flow:admin sem papel de edicao no quadro continua bloqueado (checagens normais do card)', async () => {
  const { service, calls } = build({ ids: ['cust-9'], visible: [], role: 'board_viewer' });
  await assert.rejects(
    service.link(adminContext, 'board-1', 'card-1', { cpf: CPF, override: { reason: REASON } } as never, adminMutate),
    ForbiddenException
  );
  const columnLocked = build({ ids: ['cust-9'], visible: [], columnEditable: false });
  await assert.rejects(
    columnLocked.service.link(adminContext, 'board-1', 'card-1', { cpf: CPF, override: { reason: REASON } } as never, adminMutate),
    ForbiddenException
  );
  assert.deepEqual(calls.replace, []);
  assert.deepEqual(columnLocked.calls.replace, []);
});

void test('override: CPF sem cliente responde 422 override_requires_existing_customer e nao cria', async () => {
  const { service, calls } = build({ ids: [] });
  const error = await service
    .link(adminContext, 'board-1', 'card-1', { cpf: CPF, override: { reason: REASON }, customer: { name: 'Maria' } } as never, adminMutate)
    .catch((err: unknown) => err);
  assert.ok(error instanceof UnprocessableEntityException);
  assert.equal((error.getResponse() as { code: string }).code, 'override_requires_existing_customer');
  assert.equal(calls.createIfCpfAbsent.length, 0);
  assert.deepEqual(calls.replace, []);
});

void test('override: cliente visivel ignora o override (vinculo normal, sem marca nem motivo no evento)', async () => {
  const { service, calls } = build({ ids: ['cust-1'], visible: ['cust-1'] });
  const result = await service.link(adminContext, 'board-1', 'card-1', { cpf: CPF, override: { reason: REASON } } as never, adminMutate);
  assert.equal(result.outcome, 'linked');
  assert.deepEqual(calls.events, [{ kind: 'card.customer_linked', payload: { customerId: 'cust-1', created: false } }]);
});

void test('override: flow:admin sem override recebe o 409 de sempre', async () => {
  const { service } = build({ ids: ['cust-9'], visible: [] });
  await assert.rejects(service.link(adminContext, 'board-1', 'card-1', { cpf: CPF } as never, adminMutate), ConflictException);
});

void test('override: depois do vinculo o admin ve os dados pela regra normal (lookup found e painel)', async () => {
  const { service } = build({ ids: ['cust-9'], visible: [], linkedIsVisible: true });
  assert.deepEqual(await service.lookup(adminContext, 'board-1', 'card-1', CPF), { status: 'outside_boards', canOverride: true });
  await service.link(adminContext, 'board-1', 'card-1', { cpf: CPF, override: { reason: REASON } } as never, adminMutate);
  const lookup = await service.lookup(adminContext, 'board-1', 'card-1', CPF);
  assert.equal(lookup.status, 'found');
  const panel = await service.getPanel(adminContext, 'board-1', 'card-1');
  assert.equal(panel.customer?.id, 'cust-9');
});
