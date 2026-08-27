import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

interface EmailRecipient {
  email: string;
  name: string;
}

interface MoneyMovementParams {
  amount: string;
  counterpartName: string | null;
}

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendWelcomeEmail(user: EmailRecipient): Promise<void> {
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Bem-vindo à Cobuccio Wallet',
      template: 'welcome',
      context: { name: user.name },
    });
  }

  async sendMoneyReceivedEmail(
    user: EmailRecipient,
    params: MoneyMovementParams,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Você recebeu um depósito/transferência',
      template: 'money-received',
      context: {
        name: user.name,
        amount: params.amount,
        counterpartName: params.counterpartName,
      },
    });
  }

  async sendMoneySentEmail(
    user: EmailRecipient,
    params: MoneyMovementParams,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Você enviou uma transferência',
      template: 'money-sent',
      context: {
        name: user.name,
        amount: params.amount,
        counterpartName: params.counterpartName,
      },
    });
  }

  async sendPasswordChangedEmail(user: EmailRecipient): Promise<void> {
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Sua senha foi alterada',
      template: 'password-changed',
      context: { name: user.name },
    });
  }
}
