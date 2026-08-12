import nodemailer from "nodemailer";
import { getConfig } from "../config.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  idempotencyKey?: string;
}

let transporter: nodemailer.Transporter | undefined;

function getTransporter(): nodemailer.Transporter {
  const config = getConfig();
  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    ...(config.SMTP_USER
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
      : {}),
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const config = getConfig();
  if (config.EMAIL_PROVIDER === "resend") {
    const response = await fetch(new URL("/emails", config.RESEND_API_ORIGIN), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY!}`,
        "Content-Type": "application/json",
        "User-Agent": "bitwise-secure-portal/0.1.0",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Resend delivery failed with HTTP ${response.status}`);
    }
    return;
  }
  await getTransporter().sendMail({
    from: config.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.idempotencyKey ? { headers: { "Resend-Idempotency-Key": message.idempotencyKey } } : {}),
  });
}
