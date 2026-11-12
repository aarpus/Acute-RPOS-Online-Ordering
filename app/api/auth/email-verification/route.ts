import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { env as workerEnv } from 'cloudflare:workers';
import { envText, getCustomerAuthConfig } from '../../../../lib/auth';
import { createPrismaClient } from '../../../../lib/prisma';
import { sendSmtpMail } from '../../../../lib/smtp-mail';
import {
  getVerificationCookie,
  serializeVerificationCookie,
  type VerificationCookie,
} from '../../../../lib/verification-cookie';

export const runtime = 'nodejs';

const codeLifetimeMs = 10 * 60 * 1000;
const resendDelayMs = 60 * 1000;
const maxAttempts = 5;
const attemptsById = new Map<string, { attempts: number; expiresAt: number }>();
const lastSentByRecipient = new Map<string, number>();

function jsonError(message: string, status: number, cookie?: string) {
  const headers = cookie ? { 'Set-Cookie': cookie } : undefined;
  return Response.json({ error: message }, { status, headers });
}

function jsonMessage(message: string, cookie?: string) {
  const headers = cookie ? { 'Set-Cookie': cookie } : undefined;
  return Response.json({ message }, { headers });
}

function safeErrorDetail(error: unknown, sensitiveValues: string[] = []) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
  const workerSecrets = [
    workerEnv.DATABASE_URL,
    workerEnv.EMAIL_VERIFICATION_SECRET,
    workerEnv.SMTP_USER,
    workerEnv.SMTP_PASSWORD,
  ].filter((value): value is string => Boolean(value));
  return [...workerSecrets, ...sensitiveValues]
    .filter(Boolean)
    .reduce((message, value) => message.replaceAll(value, '[REDACTED]'), detail)
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]');
}

function smtpErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';
  const responseCode = typeof error === 'object' && error !== null && 'responseCode' in error && typeof error.responseCode === 'number'
    ? error.responseCode
    : 0;
  const detail = error instanceof Error ? error.message : '';
  if (code === 'EAUTH' || responseCode === 535 || responseCode === 554 || /invalid login|authentication failed|\bAUTH\b|\b(535|554)\b/i.test(detail)) {
    if (/access restricted|smtppro|server details/i.test(detail)) {
      return 'Zoho rejected this SMTP host. Use smtp.zoho.com unless your Zoho account lists smtppro.zoho.com.';
    }
    return 'SMTP authentication failed. Use the Zoho mailbox address and a Zoho app password in SMTP_USER and SMTP_PASSWORD.';
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || /timeout|connect|socket|tls|network/i.test(detail)) {
    return 'Unable to connect to the SMTP server. Check SMTP_HOST and SMTP_PORT.';
  }
  return 'Unable to send the verification email. Check the SMTP settings and try again.';
}

async function getConfig(request: Request) {
  const { storeCode, storeName, secret: verificationSecret } = await getCustomerAuthConfig(request);
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_FROM,
    SMTP_USER,
    SMTP_PASSWORD,
  } = workerEnv;
  const smtpHost = envText(SMTP_HOST) || envText(process.env.SMTP_HOST);
  const smtpPort = Number(envText(SMTP_PORT) || envText(process.env.SMTP_PORT) || 587);
  const smtpUser = envText(SMTP_USER) || envText(process.env.SMTP_USER);
  const smtpPassword = envText(SMTP_PASSWORD) || envText(process.env.SMTP_PASSWORD);
  const configuredFrom = envText(SMTP_FROM) || envText(process.env.SMTP_FROM);
  const userEmail = smtpUser?.match(/<([^>]+)>/)?.[1] ?? smtpUser;
  const fromEmail = configuredFrom?.match(/<([^>]+)>/)?.[1] ?? configuredFrom;
  const fromAddress = configuredFrom && fromEmail && !fromEmail.includes('yourdomain.com')
    ? configuredFrom
    : userEmail;
  const invalid: string[] = [];
  if (!verificationSecret || verificationSecret.length < 32) invalid.push('EMAIL_VERIFICATION_SECRET (minimum 32 characters)');
  if (!smtpHost) invalid.push('SMTP_HOST');
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) invalid.push('SMTP_PORT');
  if (!smtpUser || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail ?? '')) invalid.push('SMTP_USER');
  if (!smtpPassword) invalid.push('SMTP_PASSWORD');
  if (!fromAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail ?? userEmail ?? '')) invalid.push('SMTP_FROM');
  if (invalid.length) throw new Error(invalid.join(', '));
  if (!storeCode || !verificationSecret || !smtpHost || !smtpUser || !smtpPassword || !fromAddress) {
    throw new Error('Required email verification settings are missing.');
  }
  return {
    storeCode,
    storeName,
    secret: verificationSecret,
    smtpHost,
    smtpPort,
    smtpSecure: (envText(SMTP_SECURE) || envText(process.env.SMTP_SECURE)).toLowerCase() === 'true',
    smtpUser,
    smtpPassword,
    smtpFrom: fromAddress,
  };
}

async function sendVerificationEmail(config: Awaited<ReturnType<typeof getConfig>>, email: string, code: string) {
  const safeName = config.storeName.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  await sendSmtpMail(config, {
    to: email,
    subject: `Your ${config.storeName.replace(/[\r\n]/g, ' ')} verification code`,
    text: `Your ${config.storeName} email verification code is: ${code}\n\nThis code expires in 10 minutes.`,
    html: `<p>Your ${safeName} email verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
  });
}

function hashCode(secret: string, storeCode: string, email: string, code: string) {
  return createHmac('sha256', secret).update(`code\0${storeCode}\0${email}\0${code}`).digest();
}

function serializeCookie(payload: VerificationCookie | null, secret?: string) {
  return serializeVerificationCookie(payload, secret);
}

function recipientKey(secret: string, storeCode: string, email: string) {
  return createHmac('sha256', secret).update(`recipient\0${storeCode}\0${email}`).digest('hex');
}

export async function POST(request: Request) {
  let config: Awaited<ReturnType<typeof getConfig>>;
  try {
    config = await getConfig(request);
  } catch (error) {
    console.error('Email verification configuration error:', safeErrorDetail(error));
    return jsonError('Email verification is temporarily unavailable.', 503);
  }

  const now = Date.now();
  for (const [id, entry] of attemptsById) {
    if (entry.expiresAt <= now) attemptsById.delete(id);
  }
  for (const [recipient, lastSentAt] of lastSentByRecipient) {
    if (now - lastSentAt >= resendDelayMs) lastSentByRecipient.delete(recipient);
  }

  const origin = request.headers.get('origin');
  if (origin && new URL(request.url).origin !== origin) {
    return jsonError('Cross-origin verification requests are not allowed.', 403);
  }

  let body: { action?: unknown; email?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON.', 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Enter a valid email address.', 400);
  }

  let prisma: ReturnType<typeof createPrismaClient> | undefined;
  try {
    if (body.action === 'send') {
      prisma = createPrismaClient();
      const existingUser = await prisma.user.findUnique({
        where: { storeCode_email: { storeCode: config.storeCode, email } },
        select: { id: true },
      });
      if (existingUser) return jsonError('An account already exists for this email.', 409);

      const currentCookie = getVerificationCookie(request, config.secret);
      const recipient = recipientKey(config.secret, config.storeCode, email);
      const lastSentAt = Math.max(
        currentCookie?.email === email && currentCookie.storeCode === config.storeCode ? currentCookie.sentAt : 0,
        lastSentByRecipient.get(recipient) ?? 0,
      );
      if (Date.now() - lastSentAt < resendDelayMs) {
        return jsonError('Please wait one minute before requesting another code.', 429);
      }

      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const now = Date.now();
      const verification: VerificationCookie = {
        id: randomUUID(),
        email,
        storeCode: config.storeCode,
        codeHash: hashCode(config.secret, config.storeCode, email, code).toString('hex'),
        expiresAt: now + codeLifetimeMs,
        sentAt: now,
        attempts: 0,
        verified: false,
      };

      try {
        await sendVerificationEmail(config, email, code);
      } catch (error) {
        console.error(
          'Unable to send verification email:',
          safeErrorDetail(error, [
            config.smtpUser,
            config.smtpPassword,
            config.secret,
            code,
          ]),
        );
        return jsonError(smtpErrorMessage(error), 502);
      }

      lastSentByRecipient.set(recipient, now);
      attemptsById.set(verification.id, { attempts: 0, expiresAt: verification.expiresAt });
      return jsonMessage('Verification code sent. Check your email.', serializeCookie(verification, config.secret));
    }

    if (body.action === 'verify') {
      if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
        return jsonError('Enter the six-digit verification code.', 400);
      }

      const verification = getVerificationCookie(request, config.secret);
      if (!verification || verification.email !== email || verification.storeCode !== config.storeCode) {
        return jsonError('Request a verification code first.', 400);
      }
      if (verification.expiresAt <= Date.now()) {
        attemptsById.delete(verification.id);
        return jsonError('This code has expired. Request a new code.', 400, serializeCookie(null));
      }
      if (verification.verified) return jsonMessage('Email address verified.');

      const memoryAttempts = attemptsById.get(verification.id)?.attempts ?? 0;
      verification.attempts = Math.max(verification.attempts, memoryAttempts);
      if (verification.attempts >= maxAttempts) {
        attemptsById.delete(verification.id);
        return jsonError('Too many incorrect attempts. Request a new code.', 429, serializeCookie(null));
      }

      const expectedHash = Buffer.from(verification.codeHash, 'hex');
      const providedHash = hashCode(config.secret, config.storeCode, email, body.code);
      if (expectedHash.length !== providedHash.length || !timingSafeEqual(expectedHash, providedHash)) {
        verification.attempts += 1;
        attemptsById.set(verification.id, { attempts: verification.attempts, expiresAt: verification.expiresAt });
        if (verification.attempts >= maxAttempts) {
          attemptsById.delete(verification.id);
          return jsonError('Too many incorrect attempts. Request a new code.', 429, serializeCookie(null));
        }
        return jsonError('That code is incorrect. Please check it and try again.', 400, serializeCookie(verification, config.secret));
      }

      verification.verified = true;
      return jsonMessage('Email address verified.', serializeCookie(verification, config.secret));
    }

    return jsonError('Choose a valid verification action.', 400);
  } catch (error) {
    console.error(
      'Email verification request failed:',
      safeErrorDetail(error, [
        config.smtpUser,
        config.smtpPassword,
        config.secret,
        typeof body.code === 'string' ? body.code : '',
      ]),
    );
    return jsonError('Unable to process email verification right now.', 500);
  } finally {
    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch (error) {
        console.error(
          'Unable to disconnect Prisma Client:',
          safeErrorDetail(error, [
            config.smtpUser,
            config.smtpPassword,
            config.secret,
          ]),
        );
      }
    }
  }
}
