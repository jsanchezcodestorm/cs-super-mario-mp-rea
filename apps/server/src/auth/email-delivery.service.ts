import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { ServerConfiguration } from '../config/server-configuration.ts';

@Injectable()
export class EmailDeliveryService implements OnModuleDestroy {
  private transport?: Transporter;

  constructor(private readonly configuration: ServerConfiguration) {}

  async sendAuthenticationLink(email: string, link: string, purpose: 'VERIFY_EMAIL' | 'PASSWORD_RESET') {
    const { smtpUrl, emailFrom } = this.configuration;
    if (!smtpUrl || !emailFrom)
      throw new ServiceUnavailableException('Il servizio email non è configurato.');
    this.transport ??= nodemailer.createTransport(smtpUrl);
    const message = purpose === 'VERIFY_EMAIL'
      ? {
          subject: 'Verifica il tuo account Super Mario World',
          action: 'Apri questo link e conferma il tuo indirizzo email:',
        }
      : {
          subject: 'Reimposta la password di Super Mario World',
          action: 'Apri questo link per scegliere una nuova password:',
        };
    await this.transport.sendMail({
      from: emailFrom,
      to: email,
      subject: message.subject,
      text: `${message.action} ${link}\nIl link scade tra 15 minuti ed è utilizzabile una sola volta.`,
      html: `<p>${message.action}</p><p><a href="${escapeHtml(link)}">Continua</a></p><p>Il link scade tra 15 minuti ed è utilizzabile una sola volta.</p>`,
    });
  }

  onModuleDestroy() {
    this.resetTransport();
  }

  private resetTransport() {
    const current = this.transport;
    this.transport = undefined;
    if (current) void current.close();
  }
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
