import { KanbanRequestContext } from '../kanban.types';

export const EXECUTE_CARD_ACTIONS_SCOPE = 'flow:actions:execute';

export function canConfigureCardActions(context: KanbanRequestContext): boolean {
  return context.roles.includes('global_master') ||
    (context.roles.includes('client_admin') && context.scopes.includes('flow:admin'));
}

export function canExecuteCardActions(context: KanbanRequestContext): boolean {
  return canConfigureCardActions(context) || context.scopes.includes(EXECUTE_CARD_ACTIONS_SCOPE);
}
