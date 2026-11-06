import nodemailer from 'nodemailer';

export type SmtpMailConfig = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
};

export type SmtpMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function parseFrom(value: string): { name?: string; email: string } {
  const angled = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!angled) return { email: value.trim() };
  const name = angled[1].replace(/^["']|["']$/g, '').trim();
  const email = angled[2].trim();
  return name ? { name, email } : { email };
}

function useImplicitTls(port: number, secure: boolean) {
  if (port === 465) return true;
  if (port === 587) return false;
  return secure;
}

function socketsUnavailable(error: unknown) {
  const detail = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /cloudflare:sockets|No such module|dynamic require of "cloudflare:sockets"/i.test(detail);
}

export async function sendSmtpMail(config: SmtpMailConfig, message: SmtpMessage) {
  const secure = useImplicitTls(config.smtpPort, config.smtpSecure);
  const from = parseFrom(config.smtpFrom);

  try {
    const { WorkerMailer } = await import('worker-mailer');
    await WorkerMailer.send(
      {
        host: config.smtpHost,
        port: config.smtpPort,
        secure,
        startTls: !secure,
        credentials: {
          username: config.smtpUser,
          password: config.smtpPassword,
        },
        authType: ['plain', 'login'],
        socketTimeoutMs: 20000,
        responseTimeoutMs: 20000,
      },
      {
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
    );
    return;
  } catch (error) {
    if (!socketsUnavailable(error)) throw error;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure,
    requireTLS: !secure,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
    tls: { minVersion: 'TLSv1.2', servername: config.smtpHost },
  });
  await transporter.sendMail({
    from: from.name ? `${from.name} <${from.email}>` : from.email,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
