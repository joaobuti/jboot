import { BadRequestException, Injectable } from '@nestjs/common';

export type AiToolApprovalPolicy = 'automatic' | 'human_review';

export type AiToolDefinition = {
  id: string;
  functionName: string;
  label: string;
  description: string;
  approvalPolicy: AiToolApprovalPolicy;
  inputSchema: Record<string, unknown>;
};

export const AI_TOOL_POLICY_VERSION = '2026-10-21.v1';

const definitions: readonly AiToolDefinition[] = Object.freeze([
  Object.freeze({
    id: 'kanban.automation.complete', functionName: 'kanban_automation_complete',
    label: 'Confirmar conclusao integral da automacao',
    description: 'Ultima chamada, somente depois de concluir TODAS as atividades do prompt com sucesso, sem pendencias ou revisao humana. O Flow pode disparar a regra de movimentacao do administrador.',
    approvalPolicy: 'automatic' as const,
    inputSchema: Object.freeze({ type: 'object', additionalProperties: false,
      properties: { version: { type: 'integer', enum: [1] }, status: { type: 'string', enum: ['succeeded'] }, allTasksCompleted: { type: 'boolean', enum: [true] } },
      required: ['version', 'status', 'allTasksCompleted'] })
  }),
  Object.freeze({
    id: 'kanban.card.append_activity',
    functionName: 'kanban_card_append_activity',
    label: 'Adicionar atividade ao card',
    description: 'Adiciona ao historico do card uma atividade textual produzida pelo agente.',
    approvalPolicy: 'automatic' as const,
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 8000 },
      },
      required: ['text'],
    }),
  }),
  Object.freeze({
    id: 'kanban.card.update_description',
    functionName: 'kanban_card_update_description',
    label: 'Atualizar descricao do card',
    description: 'Substitui a descricao do card pelo texto produzido pelo agente.',
    approvalPolicy: 'human_review' as const,
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: {
        description: { type: 'string', maxLength: 50000 },
      },
      required: ['description'],
    }),
  }),
]);

@Injectable()
export class ToolCatalog {
  list(): { policyVersion: string; tools: readonly AiToolDefinition[] } {
    return { policyVersion: AI_TOOL_POLICY_VERSION, tools: definitions };
  }

  requireAllowed(ids: readonly string[] | undefined): AiToolDefinition[] {
    const unique = [...new Set(ids ?? [])];
    if (unique.length !== (ids ?? []).length) {
      throw new BadRequestException('ai_tool_duplicate');
    }
    const resolved = unique.map(id => definitions.find(tool => tool.id === id));
    if (resolved.some(tool => tool === undefined)) {
      throw new BadRequestException('ai_tool_not_supported');
    }
    return resolved as AiToolDefinition[];
  }
}
