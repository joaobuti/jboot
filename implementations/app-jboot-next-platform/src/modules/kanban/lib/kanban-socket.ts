"use client";

import { io, Socket } from "socket.io-client";
import { getKanbanAuthToken } from "./kanban-api";

const SOCKET_BASE =
  process.env.NEXT_PUBLIC_JBOOT_PLATFORM_API_URL ?? "http://127.0.0.1:8010";

export interface CardMovedEvent {
  boardId: string;
  cardId: string;
  fromBoardColumnId: string;
  toBoardColumnId: string;
  toPosition: number;
  movedByIdentityId: string;
  occurredAt: string;
}

/** Algo foi gravado no card (docs/product/flow-realtime-card-updates-sprints.md, R1); so ids e o tipo. */
export interface CardUpdatedEvent {
  boardId: string;
  cardId: string;
  kind: string;
}

/** A ficha do cliente mudou (ex.: validacao da IA); a tela busca de novo pelo HTTP. */
export interface CustomerUpdatedEvent {
  customerId: string;
  kind: string;
}

export interface KanbanSocketErrorEvent {
  code: string;
  message: string;
}

export function connectKanbanSocket(): Socket {
  return io(`${SOCKET_BASE}/flow/ws`, {
    auth: { token: getKanbanAuthToken() },
    transports: ["websocket"],
  });
}
