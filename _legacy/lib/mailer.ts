import { Resend } from "resend";
import nodemailer from "nodemailer";

type MailProvider = "resend" | "smtp";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

type SmtpTransporter = {
  sendMail: (options: {
    from: string;
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  }) => Promise<{ rejected?: string[] }>;
};

let smtpTransporter: SmtpTransporter | null = null;

const getEnv = (name: string) => {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseBoolean = (value: string, envName: string) => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${envName} must be "true" or "false" when set.`);
};

const getFromEmail = () => {
  const from = getEnv("EMAIL_FROM") || getEnv("RESEND_FROM_EMAIL");
  if (!from) {
    throw new Error("Missing sender email. Set EMAIL_FROM (or RESEND_FROM_EMAIL for compatibility).");
  }
  return from;
};

const getEmailProvider = (): MailProvider => {
  const configured = getEnv("EMAIL_PROVIDER")?.toLowerCase();
  if (configured) {
    if (configured === "resend" || configured === "smtp") return configured;
    throw new Error(`Unsupported EMAIL_PROVIDER "${configured}". Use "resend" or "smtp".`);
  }

  if (getEnv("RESEND_API_KEY")) return "resend";
  if (getEnv("SMTP_HOST")) return "smtp";

  throw new Error(
    "No email provider configured. Set EMAIL_PROVIDER=resend|smtp, or define RESEND_API_KEY / SMTP_HOST.",
  );
};

const getSmtpTransporter = () => {
  if (smtpTransporter) return smtpTransporter;

  const host = getEnv("SMTP_HOST");
  if (!host) throw new Error("Missing SMTP_HOST for SMTP email provider.");

  const portRaw = getEnv("SMTP_PORT") || "587";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) throw new Error("SMTP_PORT must be a positive integer.");

  const secureRaw = getEnv("SMTP_SECURE");
  const secure = secureRaw ? parseBoolean(secureRaw, "SMTP_SECURE") : port === 465;

  const user = getEnv("SMTP_USER");
  const pass = getEnv("SMTP_PASSWORD");
  if ((user && !pass) || (!user && pass)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be set together.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });
  smtpTransporter = transporter;

  return transporter;
};

export const sendEmail = async ({ to, subject, html, text }: SendEmailInput) => {
  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) throw new Error("At least one recipient is required.");

  const from = getFromEmail();
  const provider = getEmailProvider();

  if (provider === "resend") {
    const apiKey = getEnv("RESEND_API_KEY");
    if (!apiKey) throw new Error("Missing RESEND_API_KEY for Resend provider.");

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: recipients,
      subject,
      html,
      text,
    });

    if (error) throw new Error(error.message);
    return;
  }

  const transporter = getSmtpTransporter();
  const info = await transporter.sendMail({
    from,
    to: recipients,
    subject,
    html,
    text,
  });

  if (Array.isArray(info.rejected) && info.rejected.length > 0) {
    throw new Error(`SMTP rejected recipients: ${info.rejected.join(", ")}`);
  }
};
