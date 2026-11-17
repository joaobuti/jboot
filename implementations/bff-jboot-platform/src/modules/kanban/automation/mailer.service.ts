import { Injectable } from '@nestjs/common';
import { MailService } from '../../shared/mail/mail.service';

export interface ColumnMovedEmailInput {
  to: string;
  recipientName: string | null;
  cardTitle: string;
  fromColumnName: string;
  toColumnName: string;
  movedByName: string;
  movedAt: string;
  // 'entered': card chegou na coluna da regra (toColumnName). 'left': card saiu da coluna da
  // regra (fromColumnName). Mesmos dados de entrada, so muda a redacao do assunto/corpo — ver
  // docs/product/kanban-sprint-9-gate.md, secao "MailerService / payload de e-mail".
  direction: 'entered' | 'left';
}

export interface DueDateApproachingEmailInput {
  to: string;
  recipientName: string | null;
  cardTitle: string;
  columnName: string;
  dueDate: string;
  daysBefore: number;
}

export interface CardStaleEmailInput {
  to: string;
  recipientName: string | null;
  cardTitle: string;
  columnName: string;
  daysStale: number;
}

export interface DjenPublicationEmailInput {
  to: string;
  recipientName: string | null;
  cardTitle: string;
  columnName: string;
  numeroProcesso: string;
  tipoComunicacao: string | null;
  tipoDocumento: string | null;
  orgao: string | null;
  dataDisponibilizacao: string | null;
  trecho: string;
}

export interface JuridicoProcessMovedEmailInput {
  to: string;
  recipientName: string | null;
  cardTitle: string;
  columnName: string;
  numeroProcesso: string;
  tribunal: string;
  novasMovimentacoes: Array<{ occurredAt: string | null; description: string }>;
}

/**
 * Textos dos e-mails do Flow (automacoes, kit do escritorio). O envio e do MailService comum da
 * plataforma (docs/product/account-access-email-sprints.md, Sprint 1).
 * Nao reaproveita src/modules/notifications (escopo diferente: in-app/WebSocket).
 */
@Injectable()
export class MailerService {
  constructor(private readonly mail: MailService) {}

  async sendColumnMovedNotification(input: ColumnMovedEmailInput): Promise<void> {
    const greeting = input.recipientName ? `Ola, ${input.recipientName}.` : 'Ola.';
    const subject =
      input.direction === 'entered'
        ? `[Flow] Card "${input.cardTitle}" movido para ${input.toColumnName}`
        : `[Flow] Card "${input.cardTitle}" saiu de ${input.fromColumnName}`;
    const summary =
      input.direction === 'entered'
        ? `O card "${input.cardTitle}" foi movido de "${input.fromColumnName}" para "${input.toColumnName}".`
        : `O card "${input.cardTitle}" saiu de "${input.fromColumnName}" e foi movido para "${input.toColumnName}".`;
    const text = [greeting, '', summary, `Movido por: ${input.movedByName}`, `Data/hora: ${input.movedAt}`].join('\n');
    const html = `
      <p>${greeting}</p>
      <p>${escapeHtml(summary)}</p>
      <p>Movido por: ${escapeHtml(input.movedByName)}<br/>
      Data/hora: ${escapeHtml(input.movedAt)}</p>
    `;

    await this.send(input.to, subject, text, html, 'column-moved');
  }

  async sendDueDateApproachingNotification(input: DueDateApproachingEmailInput): Promise<void> {
    const greeting = input.recipientName ? `Ola, ${input.recipientName}.` : 'Ola.';
    const subject = `[Flow] Prazo se aproximando: "${input.cardTitle}"`;
    const summary = `Faltam ${input.daysBefore} dia(s) para o prazo do card "${input.cardTitle}" (coluna "${input.columnName}", vencimento em ${input.dueDate}).`;
    const text = [greeting, '', summary].join('\n');
    const html = `<p>${greeting}</p><p>${escapeHtml(summary)}</p>`;

    await this.send(input.to, subject, text, html, 'due-date-approaching');
  }

  async sendCardStaleNotification(input: CardStaleEmailInput): Promise<void> {
    const greeting = input.recipientName ? `Ola, ${input.recipientName}.` : 'Ola.';
    const subject = `[Flow] Card parado: "${input.cardTitle}"`;
    const summary = `O card "${input.cardTitle}" esta ha pelo menos ${input.daysStale} dia(s) sem sair da coluna "${input.columnName}".`;
    const text = [greeting, '', summary].join('\n');
    const html = `<p>${greeting}</p><p>${escapeHtml(summary)}</p>`;

    await this.send(input.to, subject, text, html, 'card-stale');
  }

  /**
   * Publicacao nova do DJEN (ADR 022, Sprint 8): tipo, documento, orgao e o inicio do texto; o texto
   * inteiro fica no card.
   */
  async sendDjenPublicationNotification(input: DjenPublicationEmailInput): Promise<void> {
    const greeting = input.recipientName ? `Ola, ${input.recipientName}.` : 'Ola.';
    const subject = `[Flow] Publicacao no DJEN do processo ${input.numeroProcesso}`;
    const kind = [input.tipoComunicacao, input.tipoDocumento].filter(Boolean).join(' - ') || 'Comunicacao';
    const details = [
      `Tipo: ${kind}`,
      `Disponibilizada em: ${input.dataDisponibilizacao ?? '-'}`,
      ...(input.orgao ? [`Orgao: ${input.orgao}`] : [])
    ];
    const text = [
      greeting,
      '',
      `O processo ${input.numeroProcesso}, vinculado ao card "${input.cardTitle}" (coluna "${input.columnName}"), tem publicacao nova no DJEN:`,
      ...details,
      '',
      input.trecho,
      '',
      'O texto completo esta no card, em Publicacoes e intimacoes.'
    ].join('\n');
    const html = `
      <p>${greeting}</p>
      <p>O processo <strong>${escapeHtml(input.numeroProcesso)}</strong>, vinculado ao card
      <strong>${escapeHtml(input.cardTitle)}</strong> (coluna <strong>${escapeHtml(input.columnName)}</strong>), tem publicacao nova no DJEN:</p>
      <ul>${details.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      <p>${escapeHtml(input.trecho)}</p>
      <p>O texto completo esta no card, em Publicacoes e intimacoes.</p>
    `;

    await this.send(input.to, subject, text, html, 'djen-publication');
  }

  async sendJuridicoProcessMovedNotification(input: JuridicoProcessMovedEmailInput): Promise<void> {
    const greeting = input.recipientName ? `Ola, ${input.recipientName}.` : 'Ola.';
    const subject = `[Flow] Movimentacao no processo ${input.numeroProcesso}`;
    const movements = input.novasMovimentacoes.map((movement) => `- ${movement.occurredAt ?? '-'}: ${movement.description}`);
    const text = [
      greeting,
      '',
      `O processo ${input.numeroProcesso} (${input.tribunal}), vinculado ao card "${input.cardTitle}" (coluna "${input.columnName}"), teve movimentacao:`,
      ...movements
    ].join('\n');
    const html = `
      <p>${greeting}</p>
      <p>O processo <strong>${escapeHtml(input.numeroProcesso)}</strong> (${escapeHtml(input.tribunal)}), vinculado ao card
      <strong>${escapeHtml(input.cardTitle)}</strong> (coluna <strong>${escapeHtml(input.columnName)}</strong>), teve movimentacao:</p>
      <ul>${movements.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
    `;

    await this.send(input.to, subject, text, html, 'juridico-process-moved');
  }

  /**
   * Kit do escritorio ao cliente (flow-signed-kit-sprints.md, S4): assunto e texto configurados pelo escritorio,
   * kit anexo. O texto e do escritorio; vai escapado no HTML.
   */
  async sendOfficeKitEmail(input: { to: string; subject: string; text: string; attachment: { filename: string; content: Buffer } }): Promise<void> {
    const html = input.text
      .split('\n')
      .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : ''))
      .join('');
    await this.mail.send(
      {
        to: input.to,
        subject: input.subject,
        text: input.text,
        html,
        attachments: [{ filename: input.attachment.filename, content: input.attachment.content }]
      },
      'office-kit'
    );
  }

  private async send(to: string, subject: string, text: string, html: string, kind: string): Promise<void> {
    await this.mail.send({ to, subject, text, html }, `${kind} automation`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
