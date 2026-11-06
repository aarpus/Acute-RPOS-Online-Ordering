import { env as workerEnv } from 'cloudflare:workers';
import { sendSmtpMail } from './smtp-mail';
import { envText } from './auth';
import type { Mailer } from './order-service';

// Resolve at send time: a missing SMTP setting must never prevent order persistence.
export const sendOrderMail: Mailer = async message => {
  const read = (key: string) => envText((workerEnv as unknown as Record<string, unknown>)[key]) || envText(process.env[key]);
  const config = {
    smtpHost: read('SMTP_HOST'), smtpPort: Number(read('SMTP_PORT') || 587),
    smtpSecure: read('SMTP_SECURE') === 'true', smtpUser: read('SMTP_USER'),
    smtpPassword: read('SMTP_PASSWORD'), smtpFrom: read('SMTP_FROM') || read('SMTP_USER'),
  };
  if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.smtpFrom) throw new Error('Order email is unavailable.');
  await sendSmtpMail(config, message);
};
