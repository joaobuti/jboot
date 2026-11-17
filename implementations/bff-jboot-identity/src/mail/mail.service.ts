import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfigService } from '../config/app-config.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Envio de e-mail do Identity (convite e recuperacao de senha), com o mesmo contrato e as mesmas
 * envs SMTP da classe da plataforma (docs/product/account-access-email-sprints.md, Sprint 1). O
 * Identity nao depende da plataforma para isso: "esqueci minha senha" tem que funcionar com ela fora.
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
      this.transporter = createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
    }
    return this.transporter;
  }
}
