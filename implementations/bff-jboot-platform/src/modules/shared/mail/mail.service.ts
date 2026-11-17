import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfigService } from '../../../config/app-config.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}

/**
 * Envio de e-mail do sistema para todos os modulos da plataforma (Flow, PDV, Juridico):
 * nodemailer + SMTP por env (docs/product/account-access-email-sprints.md, Sprint 1). Volume
 * baixo; sem fila propria aqui. Quem precisa de reenvio (automacoes do Flow) usa a propria fila.
 * Em dev, Mailpit; em producao, a conta SMTP definida nas envs.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: AppConfigService) {}

  async send(message: MailMessage, kind: string): Promise<void> {
    try {
      await this.getTransporter().sendMail({ from: this.config.smtp.from, ...message });
    } catch (error) {
      this.logger.error(`Failed to send ${kind} email: ${(error as Error).message}`);
      throw error;
    }
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const { host, port, secure, user, pass } = this.config.smtp;
      this.transporter = createTransport({
        host,
        port,
        // 465 = TLS direto; 587/1025 = STARTTLS ou texto (Mailpit).
        secure,
        auth: user ? { user, pass } : undefined
      });
    }
    return this.transporter;
  }
}
