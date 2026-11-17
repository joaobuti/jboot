import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/** Card que mudou; `kind` e o tipo da atividade gravada (`comment` ou o `kind` do evento de sistema). */
export interface CardChangedEvent {
  scope: 'card';
  databaseRef: string;
  clientId: string;
  cardId: string;
  kind: string;
}

/** Ficha do cliente que mudou sem atividade no card (ex.: validacao da IA preenchendo campos). */
export interface CustomerChangedEvent {
  scope: 'customer';
  databaseRef: string;
  clientId: string;
  customerId: string;
  kind: string;
}

export type FlowLiveEvent = CardChangedEvent | CustomerChangedEvent;

/**
 * Barramento em memoria dos avisos em tempo real (docs/product/flow-realtime-card-updates-sprints.md,
 * R1). Quem grava publica depois do INSERT; o `KanbanGateway` assina e repassa ao Socket.IO. Sem
 * dependencia do gateway, para repositorios poderem publicar sem dependencia circular. Falha de quem
 * assina nunca volta para quem publicou.
 */
@Injectable()
export class FlowLiveEvents {
  private readonly subject = new Subject<FlowLiveEvent>();
  readonly events$ = this.subject.asObservable();

  cardChanged(databaseRef: string, clientId: string, cardId: string, kind: string): void {
    this.subject.next({ scope: 'card', databaseRef, clientId, cardId, kind });
  }

  customerChanged(databaseRef: string, clientId: string, customerId: string, kind: string): void {
    this.subject.next({ scope: 'customer', databaseRef, clientId, customerId, kind });
  }
}
