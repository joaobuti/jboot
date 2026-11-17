import type { BoardColumnDto } from './kanban-api';

export function movementDestinations(columns: BoardColumnDto[], sourceColumnId: string): BoardColumnDto[] {
  return columns.filter(column => column.status === 'active' && column.id !== sourceColumnId);
}

export function movementActionConfig(columns: BoardColumnDto[], sourceColumnId: string, destinationColumnId: string) {
  if (!movementDestinations(columns, sourceColumnId).some(column => column.id === destinationColumnId)) {
    throw new Error('Selecione uma coluna de destino ativa e diferente da origem.');
  }
  return { toBoardColumnId: destinationColumnId };
}
