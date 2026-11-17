import { HttpException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { InternalProcessResponseDto, MovementDto } from '../shared/juridico-data/juridico-data.types';
import { ProcessMonitorCadence, ProcessMonitorRunStatus } from './process-monitoring.types';
import { courtChanges } from './process-publications';

/**
 * Regras puras do acompanhamento, usadas pelo modulo e pelo Juridico enquanto ele nao migra
 * (ADR 021, Sprint 2): uma versao so de HMAC, retrato e movimentacao.
 */

export const CADENCE_DAYS: Readonly<Record<ProcessMonitorCadence, number>> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };

export function processDigits(processNumber: string): string {
  return processNumber.replace(/\D/g, '');
}

export function processNumberHmac(key: string, processNumber: string): string {
  return createHmac('sha256', key).update(processDigits(processNumber)).digest('hex');
}

export function maskCnj(processNumber: string): string {
  const digits = processDigits(processNumber);
  if (digits.length !== 20) return digits;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

export function nextCheckAt(cadence: ProcessMonitorCadence, now = Date.now()): Date {
  return new Date(now + CADENCE_DAYS[cadence] * 86_400_000);
}

export function cadenceSeconds(cadence: ProcessMonitorCadence): number {
  return CADENCE_DAYS[cadence] * 86_400;
}

export interface ProcessDetails {
  filedAt: string | null;
  className: string | null;
  courtName: string | null;
  systemName: string | null;
}

export interface ProcessSnapshotInput {
  tribunal: string;
  providerUpdatedAt: string | null;
  processFingerprint: string;
  /** Dados do processo para o painel do destino (Sprint 9); opcionais para retratos antigos e testes. */
  details?: ProcessDetails;
  /** `sourceFingerprint`: item derivado (mudanca de vara), novo so se a movimentacao de origem for nova. */
  movements: Array<{ fingerprint: string; occurredAt: string | null; description: string; sourceFingerprint?: string }>;
}

/**
 * Nome da movimentacao com os complementos tabelados do DataJud ("Conclusao — para julgamento"),
 * Sprint 6 de process-monitoring-sprints.md. O texto nao entra no fingerprint, entao mudar o formato
 * nao faz movimentacao antiga voltar como nova.
 */
export function movementDescription(movement: Pick<MovementDto, 'nome' | 'complementos'>): string {
  const name = movement.nome.trim();
  const seen = new Set([name.toLocaleLowerCase('pt-BR')]);
  const details: string[] = [];
  for (const complement of movement.complementos ?? []) {
    const text = (complement.nome ?? '').trim();
    const normalized = text.toLocaleLowerCase('pt-BR');
    if (!text || seen.has(normalized)) continue;
    seen.add(normalized);
    details.push(text);
  }
  return details.length > 0 ? `${name} — ${details.join(', ')}` : name;
}

export function snapshotFromResponse(key: string, result: InternalProcessResponseDto): ProcessSnapshotInput {
  const process = result.process;
  const hmac = (value: unknown) => createHmac('sha256', key).update(JSON.stringify(value)).digest('hex');
  const movements = process.movimentacoes.map((movement) => ({
    ...movement,
    fingerprint: hmac([movement.codigo, movement.nome, movement.dataHora, movement.complementos]),
  }));
  return {
    tribunal: process.tribunal,
    providerUpdatedAt: process.dataUltimaAtualizacao,
    processFingerprint: hmac({ tribunal: process.tribunal, updatedAt: process.dataUltimaAtualizacao, movements: process.movimentacoes }),
    details: {
      filedAt: process.dataAjuizamento ?? null,
      className: process.classe?.nome?.trim() || null,
      courtName: process.orgaoJulgador?.nome?.trim() || null,
      systemName: process.sistema?.nome?.trim() || null,
    },
    movements: [
      ...movements.map((movement) => ({
        fingerprint: movement.fingerprint,
        occurredAt: movement.dataHora,
        description: movementDescription(movement),
      })),
      // Mudanca de vara como item proprio (ADR 022); vira evento so se a movimentacao de origem for nova.
      ...courtChanges(key, movements),
    ],
  };
}

export type { ProcessMonitorRunStatus } from './process-monitoring.types';

/** Status da execucao a partir do erro do `svc-jboot-juridico-data`. */
export function runStatusFromError(error: unknown): ProcessMonitorRunStatus {
  if (!(error instanceof HttpException)) return 'failed';
  const body = error.getResponse();
  const code = typeof body === 'object' && body !== null && 'code' in body ? String(body.code) : '';
  const byCode: Record<string, ProcessMonitorRunStatus> = {
    process_not_found: 'not_found',
    process_restricted: 'restricted',
    rate_limited: 'rate_limited',
    juridico_data_timeout: 'timeout',
    juridico_data_unavailable: 'provider_unavailable',
  };
  if (byCode[code]) return byCode[code];
  // O cliente do servico devolve 504/503 sem `code` quando o proprio servico nao responde a tempo.
  if (error.getStatus() === 504) return 'timeout';
  if (error.getStatus() === 503) return 'provider_unavailable';
  return 'failed';
}
