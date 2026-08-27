import { MailerService } from '@nestjs-modules/mailer';
import { Test } from '@nestjs/testing';

import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let mailerService: { sendMail: jest.Mock };

  beforeEach(async () => {
    mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MailerService, useValue: mailerService },
      ],
    }).compile();

    service = module.get(MailService);
  });

  describe('sendWelcomeEmail', () => {
    it('sends the welcome template to the new user', async () => {
      await service.sendWelcomeEmail({
        email: 'ana@example.com',
        name: 'Ana Silva',
      });

      expect(mailerService.sendMail).toHaveBeenCalledWith({
        to: 'ana@example.com',
        subject: 'Bem-vindo à Cobuccio Wallet',
        template: 'welcome',
        context: { name: 'Ana Silva' },
      });
    });
  });

  describe('sendMoneyReceivedEmail', () => {
    it('sends the money-received template with the counterpart name', async () => {
      await service.sendMoneyReceivedEmail(
        { email: 'ana@example.com', name: 'Ana Silva' },
        { amount: '50.00', counterpartName: 'João' },
      );

      expect(mailerService.sendMail).toHaveBeenCalledWith({
        to: 'ana@example.com',
        subject: 'Você recebeu um depósito/transferência',
        template: 'money-received',
        context: {
          name: 'Ana Silva',
          amount: '50.00',
          counterpartName: 'João',
        },
      });
    });

    it('allows a null counterpart name (e.g. a plain deposit)', async () => {
      await service.sendMoneyReceivedEmail(
        { email: 'ana@example.com', name: 'Ana Silva' },
        { amount: '50.00', counterpartName: null },
      );

      expect(mailerService.sendMail).toHaveBeenCalledWith({
        to: 'ana@example.com',
        subject: 'Você recebeu um depósito/transferência',
        template: 'money-received',
        context: { name: 'Ana Silva', amount: '50.00', counterpartName: null },
      });
    });
  });

  describe('sendMoneySentEmail', () => {
    it('sends the money-sent template with the counterpart name', async () => {
      await service.sendMoneySentEmail(
        { email: 'ana@example.com', name: 'Ana Silva' },
        { amount: '50.00', counterpartName: 'João' },
      );

      expect(mailerService.sendMail).toHaveBeenCalledWith({
        to: 'ana@example.com',
        subject: 'Você enviou uma transferência',
        template: 'money-sent',
        context: {
          name: 'Ana Silva',
          amount: '50.00',
          counterpartName: 'João',
        },
      });
    });
  });
});
