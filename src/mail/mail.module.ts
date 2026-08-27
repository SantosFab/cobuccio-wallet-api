import { join } from 'path';

import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { MailerModule } from '@nestjs-modules/mailer';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MailService } from './mail.service';

interface MailConfig {
  host?: string;
  port: number;
  user?: string;
  password?: string;
  from?: string;
}

@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const mail = config.get<MailConfig>('Mail')!;

        return {
          transport: {
            host: mail.host,
            port: mail.port,
            secure: false,
            // Mailhog needs no authentication — only send credentials
            // when a real provider actually requires them.
            ...(mail.user && mail.password
              ? { auth: { user: mail.user, pass: mail.password } }
              : {}),
          },
          defaults: { from: mail.from },
          template: {
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
            options: { strict: true },
          },
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
