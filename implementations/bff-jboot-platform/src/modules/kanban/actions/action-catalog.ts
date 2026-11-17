import { NotFoundException } from '@nestjs/common';

export interface CardActionDefinition {
  id: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  boardSelectable: boolean;
  /**
   * `execute`: o botao chama o endpoint de execucao. `dialog`: o botao abre a tela propria da acao,
   * que usa API especifica (Monitorar: docs/product/flow-card-actions-sprints.md, Sprint 2).
   */
  interaction: 'execute' | 'dialog';
  /** Botao so aparece nos cards listados em `availableCardIds` da listagem do board. */
  perCardAvailability: boolean;
  /**
   * Configuracao exigida ao atribuir a acao a coluna. `routine_agent`: agente de rotina do Claude de quem
   * configura, que vira a conta executora (docs/product/flow-signed-kit-sprints.md, S5).
   */
  config?: 'routine_agent';
}

export const ACTION_CATEGORIES = [{ id: 'juridico', label: 'Jurídico' }, { id: 'documentos', label: 'Documentos' }] as const;

/** Product-owned registry. Hidden/internal actions are never assignable by a client. */
const ACTIONS: readonly CardActionDefinition[] = [
  {
    id: 'gerar-protocolo', category: 'juridico', label: 'Gerar Protocolo',
    description: 'Aciona a geração de protocolo para o card. Nesta versão, apenas confirma a chamada ao backend.',
    icon: 'ri-file-add-line', boardSelectable: true, interaction: 'execute', perCardAvailability: false
  },
  {
    id: 'monitorar', category: 'juridico', label: 'Monitorar',
    description: 'Envia a petição aprovada com número do processo (CNJ) para um board de monitoramento, como card novo acompanhado diariamente no DataJud.',
    icon: 'ri-radar-line', boardSelectable: true, interaction: 'dialog', perCardAvailability: true
  },
  {
    id: 'validar-assinatura', category: 'documentos', label: 'Validar assinatura',
    description: 'Envia o kit assinado do cliente ao agente de IA escolhido, que confere assinaturas, nomes e datas contra o kit original. O parecer é confirmado por quem tem a permissão de confirmar validações.',
    icon: 'ri-quill-pen-line', boardSelectable: true, interaction: 'execute', perCardAvailability: true, config: 'routine_agent'
  }
];

export function selectableCardActions(): CardActionDefinition[] {
  return ACTIONS.filter(action => action.boardSelectable).map(action => ({ ...action }));
}

export function requireCardAction(actionId: string): CardActionDefinition {
  const action = ACTIONS.find(item => item.id === actionId && item.boardSelectable);
  if (!action) {
    throw new NotFoundException({ code: 'card_action_not_found', message: 'Ação indisponível para boards' });
  }
  return action;
}
