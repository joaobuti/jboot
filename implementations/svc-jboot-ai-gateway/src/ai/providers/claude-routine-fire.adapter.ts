import { Injectable } from '@nestjs/common';

/** URL de disparo emitida pelo Claude Code ao criar o gatilho de API da rotina. */
export const ROUTINE_FIRE_URL_PATTERN = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/;
/** Token por rotina (so dispara aquela rotina; sem leitura de conta). */
export const ROUTINE_TOKEN_PATTERN = /^sk-ant-oat01-[A-Za-z0-9_-]{16,480}$/;
const MAX_TEXT_LENGTH = 65_536;
const TIMEOUT_MS = 15_000;

export type RoutineFireOutcome =
  | { kind: 'dispatched'; sessionId: string; sessionUrl: string }
  /** Rotina nao iniciada; pode repetir depois de `retryAfterSeconds`. */
  | { kind: 'retryable'; code: 'routine_rate_limited' | 'routine_overloaded'; retryAfterSeconds: number }
  /** Recusa definitiva: corrigir configuracao antes de disparar de novo. */
  | { kind: 'rejected'; code: 'routine_invalid_request' | 'routine_token_invalid' | 'routine_forbidden' | 'routine_not_found' }
  /** Nao se sabe se a sessao foi criada; o endpoint nao tem idempotencia. */
  | { kind: 'ambiguous'; code: 'routine_dispatch_ambiguous' };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Disparo de rotina do Claude Code
 * (https://platform.claude.com/docs/en/api/claude-code/routines-fire).
 * Executa na assinatura do dono da rotina; o JBoot nunca usa login/sessao do
 * Claude.ai. O `text` chega a rotina marcado como dado nao confiavel.
 */
@Injectable()
export class ClaudeRoutineFireAdapter {
  private fetcher: Fetcher = (url, init) => fetch(url, init);

  /** Somente testes. */
  useFetcher(fetcher: Fetcher): void {
    this.fetcher = fetcher;
  }

  async fire(input: { fireUrl: string; token: string; text: string }): Promise<RoutineFireOutcome> {
    if (!ROUTINE_FIRE_URL_PATTERN.test(input.fireUrl) || !ROUTINE_TOKEN_PATTERN.test(input.token) || input.text.length > MAX_TEXT_LENGTH) {
      return { kind: 'rejected', code: 'routine_invalid_request' };
    }
    let response: Response;
    try {
      response = await this.fetcher(input.fireUrl, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${input.token}`,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: input.text })
      });
    } catch {
      return { kind: 'ambiguous', code: 'routine_dispatch_ambiguous' };
    }
    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { claude_code_session_id?: unknown; claude_code_session_url?: unknown } | null;
      const sessionUrl = typeof body?.claude_code_session_url === 'string' ? body.claude_code_session_url : '';
      const sessionId = typeof body?.claude_code_session_id === 'string' ? body.claude_code_session_id : '';
      // Sessao criada mas resposta ilegivel: nao repetir.
      if (!sessionUrl.startsWith('https://claude.ai/') || !sessionId) return { kind: 'ambiguous', code: 'routine_dispatch_ambiguous' };
      return { kind: 'dispatched', sessionId, sessionUrl };
    }
    switch (response.status) {
      case 400: return { kind: 'rejected', code: 'routine_invalid_request' };
      case 401: return { kind: 'rejected', code: 'routine_token_invalid' };
      case 403: return { kind: 'rejected', code: 'routine_forbidden' };
      case 404: return { kind: 'rejected', code: 'routine_not_found' };
      case 429: return { kind: 'retryable', code: 'routine_rate_limited', retryAfterSeconds: retryAfter(response, 60) };
      case 503: return { kind: 'retryable', code: 'routine_overloaded', retryAfterSeconds: retryAfter(response, 30) };
      default: return { kind: 'ambiguous', code: 'routine_dispatch_ambiguous' };
    }
  }
}

function retryAfter(response: Response, fallback: number): number {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? Math.min(Math.ceil(value), 3600) : fallback;
}
