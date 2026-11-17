import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AutomationRulesService } from './automation-rules.service';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { CreateColumnAutomationRuleDto, UpdateColumnAutomationRuleDto } from './dto/automation-rule.dto';

const context = {
  clientId: 'client-1',
  identityId: 'actor-1',
  databaseRef: 'db-1',
  applicationId: 'application-1',
  roles: [],
  scopes: []
};
const mutate = { ...context, userAgent: 'test', ip: '127.0.0.1' };

function buildAccess(role: 'board_admin' | 'board_member' | null) {
  return {
    requireBoard: async () => ({ id: 'board-1' }),
    requireRole: async (_ctx: unknown, _boardId: string, allowed: string[]) => {
      if (!role || !allowed.includes(role)) {
        throw new ForbiddenException('Insufficient board role');
      }
      return role;
    }
  };
}

const columns = {
  findById: async () => ({ id: 'column-1', boardId: 'board-1', name: 'Doing', status: 'active' })
};

const baseDto: CreateColumnAutomationRuleDto = {
  triggerType: 'column_entered',
  actionType: 'send_email_notification',
  recipientRole: 'creator'
};

void test('AutomationRulesService.create rejects a caller without board_admin (structured 403)', async () => {
  const repository = { create: async () => assert.fail('should not reach repository.create') };
  const audit = { record: async () => undefined };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    { findActiveMembership: async () => null } as never,
    buildAccess('board_member') as never,
    audit as never
  );

  await assert.rejects(() => service.create(context as never, 'board-1', 'column-1', baseDto, mutate as never), ForbiddenException);
});

void test('AutomationRulesService.create requires an active board member when recipientRole is board_member', async () => {
  const repository = { create: async () => assert.fail('should not reach repository.create') };
  const audit = { record: async () => undefined };
  const members = { findActiveMembership: async () => null };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    members as never,
    buildAccess('board_admin') as never,
    audit as never
  );

  await assert.rejects(
    () =>
      service.create(
        context as never,
        'board-1',
        'column-1',
        { ...baseDto, recipientRole: 'board_member', actionConfig: {} },
        mutate as never
      ),
    BadRequestException,
    'missing boardMemberIdentityId must be rejected'
  );

  await assert.rejects(
    () =>
      service.create(
        context as never,
        'board-1',
        'column-1',
        { ...baseDto, recipientRole: 'board_member', actionConfig: { boardMemberIdentityId: 'identity-not-a-member' } },
        mutate as never
      ),
    BadRequestException,
    'boardMemberIdentityId not an active member must be rejected'
  );
});

void test('AutomationRulesService.create persists the rule for a board_admin with valid recipientRole config', async () => {
  const created: unknown[] = [];
  const repository = {
    create: async (
      _databaseRef: string,
      _clientId: string,
      _boardId: string,
      _columnId: string,
      dto: CreateColumnAutomationRuleDto,
      createdByIdentityId: string
    ) => {
      const rule = { id: 'rule-1', ...dto, createdByIdentityId };
      created.push(rule);
      return rule;
    }
  };
  const audited: unknown[] = [];
  const audit = { record: async (eventType: string, _mutate: unknown, boardId: string, payload: unknown) => {
    audited.push({ eventType, boardId, payload });
  } };
  const members = { findActiveMembership: async () => ({ role: 'board_member', profileId: null }) };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    members as never,
    buildAccess('board_admin') as never,
    audit as never
  );

  const rule = await service.create(
    context as never,
    'board-1',
    'column-1',
    { ...baseDto, recipientRole: 'board_member', actionConfig: { boardMemberIdentityId: 'identity-42' } },
    mutate as never
  );

  assert.equal(rule.id, 'rule-1');
  assert.equal(created.length, 1);
  assert.equal(audited.length, 1);
  assert.equal((audited[0] as { eventType: string }).eventType, 'kanban_column_automation_rule_created');
});

void test('AutomationRulesService accepts only the explicit temporary API-key contract for AI actions', async () => {
  const created: CreateColumnAutomationRuleDto[] = [];
  const repository = {
    create: async (_d: string, _c: string, _b: string, _column: string, dto: CreateColumnAutomationRuleDto) => {
      created.push(dto);
      return { id: 'rule-ai', ...dto, recipientRole: null };
    },
  };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    { findActiveMembership: async () => null } as never,
    buildAccess('board_admin') as never,
    { record: async () => undefined } as never,
  );
  const valid: CreateColumnAutomationRuleDto = {
    triggerType: 'column_entered',
    actionType: 'execute_ai_agent',
    actionConfig: {
      agentId: '11111111-1111-4111-8111-111111111111',
      connectionMode: 'api_key',
      inputPolicyVersion: 1,
      toolPolicyVersion: '2026-10-15.v1',
      expectedResult: 'comment',
    },
  };
  await service.create(context as never, 'board-1', 'column-1', valid, mutate as never);
  assert.equal(created.length, 1);
  await assert.rejects(
    () => service.create(context as never, 'board-1', 'column-1', { ...valid, recipientRole: 'creator' }, mutate as never),
    /recipientRole is not allowed/,
  );
  await assert.rejects(
    () => service.create(context as never, 'board-1', 'column-1', { ...valid, triggerType: 'card_stale' }, mutate as never),
    /supports only column_entered and column_left/,
  );
  // claude_routine: politica propria (sem tools do JBoot); misturar politicas falha.
  const routine = { ...valid, actionConfig: { ...valid.actionConfig, connectionMode: 'claude_routine' as const, toolPolicyVersion: 'claude_routine.v1' } };
  await service.create(context as never, 'board-1', 'column-1', routine, mutate as never);
  assert.equal(created.length, 2);
  await assert.rejects(
    () => service.create(context as never, 'board-1', 'column-1', { ...routine, actionConfig: { ...routine.actionConfig, toolPolicyVersion: '2026-10-15.v1' } }, mutate as never),
    /Invalid execute_ai_agent actionConfig/,
  );
  await assert.rejects(
    () => service.create(context as never, 'board-1', 'column-1', { ...valid, actionConfig: { ...valid.actionConfig, toolPolicyVersion: 'claude_routine.v1' } }, mutate as never),
    /Invalid execute_ai_agent actionConfig/,
  );  // ADR 019: lista de documentos do cliente so para rotina Claude.
  await service.create(
    context as never, 'board-1', 'column-1',
    { ...routine, actionConfig: { ...routine.actionConfig, customerDocumentTypes: ['hiscred'] } }, mutate as never,
  );
  assert.equal(created.length, 3);
  await assert.rejects(
    () => service.create(context as never, 'board-1', 'column-1', { ...valid, actionConfig: { ...valid.actionConfig, customerDocumentTypes: ['hiscred'] } }, mutate as never),
    /only for claude_routine/,
  );
  // O destino saiu da regra do agente: o card anda por uma regra ai_completed -> move_card.
  await assert.rejects(
    () => service.create(context as never, 'board-1', 'column-1', { ...routine, actionConfig: { ...routine.actionConfig, toBoardColumnId: '22222222-2222-4222-8222-222222222222' } }, mutate as never),
    /toBoardColumnId is allowed only for move_card/,
  );
});

void test('AutomationRulesService exige o resultado esperado e so aceita o gerador em peticoes iniciais (ADR 020)', async () => {
  const created: CreateColumnAutomationRuleDto[] = [];
  const repository = {
    create: async (_d: string, _c: string, _b: string, _column: string, dto: CreateColumnAutomationRuleDto) => {
      created.push(dto);
      return { id: 'rule-ai', ...dto, recipientRole: null };
    },
  };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    { findActiveMembership: async () => null } as never,
    buildAccess('board_admin') as never,
    { record: async () => undefined } as never,
  );
  const routineConfig = {
    agentId: '11111111-1111-4111-8111-111111111111',
    connectionMode: 'claude_routine' as const,
    inputPolicyVersion: 1,
    toolPolicyVersion: 'claude_routine.v1',
  };
  const rule = (actionConfig: CreateColumnAutomationRuleDto['actionConfig']): CreateColumnAutomationRuleDto => ({
    triggerType: 'column_entered',
    actionType: 'execute_ai_agent',
    actionConfig,
  });
  const create = (actionConfig: CreateColumnAutomationRuleDto['actionConfig']) =>
    service.create(context as never, 'board-1', 'column-1', rule(actionConfig), mutate as never);

  await assert.rejects(() => create(routineConfig), /expectedResult is required/);
  await create({ ...routineConfig, expectedResult: 'action_analysis' });
  await create({ ...routineConfig, expectedResult: 'initial_petitions' });
  assert.equal(created.at(-1)?.actionConfig?.documentGenerator, 'flow', 'sem gerador informado, o Flow monta o documento');
  await create({ ...routineConfig, expectedResult: 'initial_petitions', documentGenerator: 'ai' });
  assert.equal(created.at(-1)?.actionConfig?.documentGenerator, 'ai');
  await assert.rejects(
    () => create({ ...routineConfig, expectedResult: 'action_analysis', documentGenerator: 'flow' }),
    /documentGenerator is allowed only/,
  );
  // Analise de acoes e peticoes chegam so pelas ferramentas do conector.
  const apiKeyConfig = { ...routineConfig, connectionMode: 'api_key' as const, toolPolicyVersion: '2026-10-15.v1' };
  await create({ ...apiKeyConfig, expectedResult: 'comment' });
  await assert.rejects(() => create({ ...apiKeyConfig, expectedResult: 'initial_petitions' }), /require claude_routine/);
  await assert.rejects(
    () =>
      service.create(
        context as never,
        'board-1',
        'column-1',
        { triggerType: 'column_entered', actionType: 'send_email_notification', recipientRole: 'creator', actionConfig: { expectedResult: 'comment' } },
        mutate as never,
      ),
    /allowed only for execute_ai_agent/,
  );
  assert.equal(created.length, 4);
});

void test('AutomationRulesService: require_to_enter so ao entrar, sem destinatario e so com a lista de requisitos (S1)', async () => {
  const created: CreateColumnAutomationRuleDto[] = [];
  const repository = {
    create: async (_d: string, _c: string, _b: string, _column: string, dto: CreateColumnAutomationRuleDto) => {
      created.push(dto);
      return { id: 'rule-req', ...dto, recipientRole: null };
    },
  };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    { findActiveMembership: async () => null } as never,
    buildAccess('board_admin') as never,
    { record: async () => undefined } as never,
  );
  const create = (dto: Partial<CreateColumnAutomationRuleDto>) =>
    service.create(
      context as never,
      'board-1',
      'column-1',
      { triggerType: 'column_entered', actionType: 'require_to_enter', ...dto } as CreateColumnAutomationRuleDto,
      mutate as never,
    );

  await create({ actionConfig: { requirements: ['customer_hiscon'] } });
  assert.deepEqual(created.at(-1)?.actionConfig, { requirements: ['customer_hiscon'] });
  await assert.rejects(() => create({ actionConfig: { requirements: [] } }), /at least one requirement/);
  await assert.rejects(() => create({ actionConfig: undefined }), /at least one requirement/);
  await assert.rejects(() => create({ triggerType: 'column_left', actionConfig: { requirements: ['customer_hiscon'] } }), /only column_entered/);
  await assert.rejects(() => create({ recipientRole: 'creator', actionConfig: { requirements: ['customer_hiscon'] } }), /recipientRole is not allowed/);
  await assert.rejects(
    () => create({ actionConfig: { requirements: ['customer_hiscon'], customerDocumentTypes: ['extrato_beneficio'] } }),
    /accepts only requirements/,
  );
  await assert.rejects(
    () => create({ actionType: 'move_card', actionConfig: { toBoardColumnId: '22222222-2222-4222-8222-222222222222', requirements: ['customer_hiscon'] } }),
    /move_card accepts only toBoardColumnId|requirements is allowed only/,
  );
  assert.equal(created.length, 1);
  // S3: "Quando o kit assinado for aprovado" so move o card.
  await create({ triggerType: 'signed_kit_approved', actionType: 'move_card', actionConfig: { toBoardColumnId: '33333333-3333-4333-8333-333333333333' } });
  await assert.rejects(
    () => create({ triggerType: 'signed_kit_approved', actionType: 'send_email_notification', recipientRole: 'creator', actionConfig: undefined }),
    /signed_kit_approved requires move_card/,
  );
});

void test('AutomationRulesService.create rejects due_date_approaching without a valid triggerConfig.daysBefore', async () => {
  const repository = { create: async () => assert.fail('should not reach repository.create') };
  const audit = { record: async () => undefined };
  const members = { findActiveMembership: async () => null };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    members as never,
    buildAccess('board_admin') as never,
    audit as never
  );

  await assert.rejects(
    () =>
      service.create(
        context as never,
        'board-1',
        'column-1',
        { ...baseDto, triggerType: 'due_date_approaching' },
        mutate as never
      ),
    BadRequestException,
    'missing triggerConfig.daysBefore must be rejected'
  );

  await assert.rejects(
    () =>
      service.create(
        context as never,
        'board-1',
        'column-1',
        { ...baseDto, triggerType: 'due_date_approaching', triggerConfig: { daysBefore: -1 } },
        mutate as never
      ),
    BadRequestException,
    'negative daysBefore must be rejected'
  );
});

void test('AutomationRulesService.create rejects card_stale without a valid triggerConfig.daysStale', async () => {
  const repository = { create: async () => assert.fail('should not reach repository.create') };
  const audit = { record: async () => undefined };
  const members = { findActiveMembership: async () => null };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    members as never,
    buildAccess('board_admin') as never,
    audit as never
  );

  await assert.rejects(
    () =>
      service.create(context as never, 'board-1', 'column-1', { ...baseDto, triggerType: 'card_stale' }, mutate as never),
    BadRequestException,
    'missing triggerConfig.daysStale must be rejected'
  );

  await assert.rejects(
    () =>
      service.create(
        context as never,
        'board-1',
        'column-1',
        { ...baseDto, triggerType: 'card_stale', triggerConfig: { daysStale: 0 } },
        mutate as never
      ),
    BadRequestException,
    'daysStale = 0 must be rejected (must be > 0)'
  );
});

void test('AutomationRulesService.create persists due_date_approaching/card_stale with a valid triggerConfig', async () => {
  const created: unknown[] = [];
  const repository = {
    create: async (
      _databaseRef: string,
      _clientId: string,
      _boardId: string,
      _columnId: string,
      dto: CreateColumnAutomationRuleDto,
      createdByIdentityId: string
    ) => {
      const rule = { id: 'rule-1', ...dto, createdByIdentityId };
      created.push(rule);
      return rule;
    }
  };
  const audit = { record: async () => undefined };
  const members = { findActiveMembership: async () => null };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    members as never,
    buildAccess('board_admin') as never,
    audit as never
  );

  await service.create(
    context as never,
    'board-1',
    'column-1',
    { ...baseDto, triggerType: 'due_date_approaching', triggerConfig: { daysBefore: 0 } },
    mutate as never
  );
  await service.create(
    context as never,
    'board-1',
    'column-1',
    { ...baseDto, triggerType: 'card_stale', triggerConfig: { daysStale: 7 } },
    mutate as never
  );

  assert.equal(created.length, 2);
});

void test('AutomationRulesService.update validates the merged triggerConfig when only triggerConfig changes (triggerType stays from the existing rule)', async () => {
  const existing = { id: 'rule-1', triggerType: 'due_date_approaching', triggerConfig: { daysBefore: 3 }, recipientRole: 'creator' };
  const repository = {
    findById: async () => existing,
    update: async () => assert.fail('should not reach repository.update')
  };
  const audit = { record: async () => undefined };
  const members = { findActiveMembership: async () => null };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    members as never,
    buildAccess('board_admin') as never,
    audit as never
  );

  await assert.rejects(
    () =>
      service.update(
        context as never,
        'board-1',
        'column-1',
        'rule-1',
        { triggerConfig: { daysBefore: -5 } },
        mutate as never
      ),
    BadRequestException
  );
});

void test('AutomationRulesService.remove rejects a caller without board_admin (structured 403)', async () => {
  const repository = { findById: async () => ({ id: 'rule-1' }), softDelete: async () => assert.fail('should not soft delete') };
  const audit = { record: async () => undefined };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    { findActiveMembership: async () => null } as never,
    buildAccess(null) as never,
    audit as never
  );

  await assert.rejects(
    () => service.remove(context as never, 'board-1', 'column-1', 'rule-1', mutate as never),
    ForbiddenException
  );
});

// Regressao (teste manual 2026-11-07): editar "Exigir para entrar" pela tela dava 400 "require_to_enter accepts only
// requirements" porque o DTO transformado traz os campos declarados de actionConfig como chaves `undefined`.
void test('AutomationRulesService: editar require_to_enter com o DTO transformado (como na requisicao) salva', async () => {
  const updated: unknown[] = [];
  const existing = { id: 'rule-req', triggerType: 'column_entered', actionType: 'require_to_enter', recipientRole: null,
    actionConfig: { requirements: ['customer_hiscon'] }, triggerConfig: {} };
  const repository = {
    findById: async () => existing,
    update: async (...args: unknown[]) => { updated.push(args[5]); return existing; },
  };
  const service = new AutomationRulesService(
    repository as never,
    columns as never,
    { findActiveMembership: async () => null } as never,
    buildAccess('board_admin') as never,
    { record: async () => undefined } as never,
  );
  const dto = plainToInstance(UpdateColumnAutomationRuleDto, {
    triggerType: 'column_entered', triggerConfig: {}, actionConfig: { requirements: ['customer_hiscon', 'signed_kit'] },
  });
  await service.update(context as never, 'board-1', 'column-1', 'rule-req', dto, mutate as never);
  assert.equal(updated.length, 1);
  const extra = plainToInstance(UpdateColumnAutomationRuleDto, {
    triggerType: 'column_entered', actionConfig: { requirements: ['customer_hiscon'], agentId: '11111111-1111-4111-8111-111111111111' },
  });
  await assert.rejects(() => service.update(context as never, 'board-1', 'column-1', 'rule-req', extra, mutate as never), /accepts only requirements/);
});
