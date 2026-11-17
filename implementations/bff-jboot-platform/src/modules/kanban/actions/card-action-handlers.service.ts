import { BadRequestException, Injectable } from '@nestjs/common';
import { MutateContext } from '../kanban.types';
import { SignedKitService } from '../signed-kit/signed-kit.service';
import { ExecutableAssignment } from './card-actions.repository';

export interface CardActionExecutionResult {
  actionId: string;
  cardId: string;
  message: string;
}

/**
 * Handlers do endpoint generico de execucao. `gerar-protocolo` ainda so confirma a chamada; `monitorar`
 * e acao de tela (`interaction: 'dialog'`) e usa a API de monitoramento de peticao; `validar-assinatura`
 * dispara o Validador de assinatura com o agente da acao (docs/product/flow-signed-kit-sprints.md, S5).
 */
@Injectable()
export class CardActionHandlers {
  constructor(private readonly signedKits: SignedKitService) {}

  async execute(
    context: MutateContext,
    boardId: string,
    cardId: string,
    actionId: string,
    assignment: ExecutableAssignment
  ): Promise<CardActionExecutionResult> {
    switch (actionId) {
      case 'gerar-protocolo': return { actionId, cardId, message: 'backend acao Gerar Protocolo' };
      case 'monitorar':
        throw new BadRequestException({ code: 'card_action_requires_dialog', message: 'Monitorar abre a tela de envio da petição.' });
      case 'validar-assinatura': {
        const agentId = assignment.config.agentId;
        if (!agentId) {
          throw new BadRequestException({ code: 'card_action_config_missing', message: 'Ação sem agente configurado. Peça ao administrador para editar as ações da coluna.' });
        }
        const message = await this.signedKits.validateFromAction(context, boardId, cardId, {
          agentId, executorIdentityId: assignment.configuredByIdentityId
        }, context);
        return { actionId, cardId, message };
      }
      default: throw new Error('Card action has no registered handler');
    }
  }
}
