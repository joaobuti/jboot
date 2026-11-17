import { Injectable } from '@nestjs/common';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_GRANT = 120;

/**
 * Limite por conexao (grant) do conector, por processo. O limite por IP nao
 * serve aqui: todo trafego do Claude sai das mesmas faixas da Anthropic.
 */
@Injectable()
export class ConnectorRateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Segundos ate liberar, ou 0 quando a requisicao pode seguir. */
  take(grantId: string, now = Date.now()): number {
    const cutoff = now - WINDOW_MS;
    const recent = (this.hits.get(grantId) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= MAX_REQUESTS_PER_GRANT) {
      this.hits.set(grantId, recent);
      return Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000));
    }
    recent.push(now);
    if (this.hits.size > 10_000) this.hits.clear();
    this.hits.set(grantId, recent);
    return 0;
  }
}
