import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import type { Signer, Envelope } from '../db/schema.js';

let sendgridConfigured = false;
let smtpTransporter: nodemailer.Transporter | null = null;

/**
 * Initialize email sender configuration on first use.
 */
function initEmailSender() {
  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (sendgridKey) {
    sgMail.setApiKey(sendgridKey);
    sendgridConfigured = true;
  } else {
    // Try SMTP fallback
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;

    if (smtpHost && smtpPort && smtpUser && smtpPassword) {
      smtpTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: parseInt(smtpPort, 10) === 465,
        auth: { user: smtpUser, pass: smtpPassword },
      });
    } else {
      console.warn('⚠ Neither SendGrid nor SMTP is configured. Emails will be logged only.');
    }
  }
}

/**
 * Load and render an HTML email template.
 */
function renderTemplate(templateName: string, variables: Record<string, string>): string {
  const templatePath = path.resolve(
    process.cwd(),
    'src/notifications/templates',
    `${templateName}.html`,
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Email template not found: ${templateName}`);
  }

  let html = fs.readFileSync(templatePath, 'utf-8');

  // Replace template variables
  for (const [key, value] of Object.entries(variables)) {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  return html;
}

/**
 * Send email via SendGrid or SMTP fallback.
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  if (!sendgridConfigured && !smtpTransporter) {
    initEmailSender();
  }

  const from = process.env.SENDGRID_FROM_EMAIL ?? process.env.SMTP_FROM ?? 'noreply@coseal.local';
  const fromName = process.env.SENDGRID_FROM_NAME ?? 'CoSeal';

  if (sendgridConfigured) {
    try {
      await sgMail.send({
        to,
        from: { email: from, name: fromName },
        subject,
        html,
      });
    } catch (error) {
      console.error('SendGrid send failed:', error);
      throw error;
    }
  } else if (smtpTransporter) {
    try {
      await smtpTransporter.sendMail({
        from: `${fromName} <${from}>`,
        to,
        subject,
        html,
      });
    } catch (error) {
      console.error('SMTP send failed:', error);
      throw error;
    }
  } else {
    // No email configured — log only
    console.log(`[Email Log] To: ${to}, Subject: ${subject}`);
    console.log(html);
  }
}

export interface EmailSigner {
  name: string;
  email: string;
}

export interface EmailEnvelope {
  id: string;
  subject: string;
  message?: string | null;
  createdBy: string;
}

/**
 * Send a signing request email to a signer.
 */
export async function sendSigningRequest(
  signer: EmailSigner,
  envelope: EmailEnvelope,
  signingUrl: string,
): Promise<void> {
  const html = renderTemplate('signingRequest', {
    signerName: signer.name,
    senderName: envelope.createdBy,
    documentTitle: envelope.subject,
    message: envelope.message ?? 'Please review and sign this document.',
    signingUrl,
  });

  await sendEmail(
    signer.email,
    `You have a document to sign: ${envelope.subject}`,
    html,
  );
}

/**
 * Send a reminder email to a signer.
 */
export async function sendReminder(
  signer: EmailSigner,
  envelope: EmailEnvelope,
  signingUrl: string,
): Promise<void> {
  const html = renderTemplate('reminder', {
    signerName: signer.name,
    senderName: envelope.createdBy,
    documentTitle: envelope.subject,
    signingUrl,
  });

  await sendEmail(
    signer.email,
    `Reminder: Document waiting for your signature - ${envelope.subject}`,
    html,
  );
}

/**
 * Send a completion notification to a signer.
 */
export async function sendCompleted(
  signer: EmailSigner,
  envelope: EmailEnvelope,
  downloadUrl: string,
): Promise<void> {
  const html = renderTemplate('completed', {
    signerName: signer.name,
    documentTitle: envelope.subject,
    downloadUrl,
  });

  await sendEmail(
    signer.email,
    `Document fully executed: ${envelope.subject}`,
    html,
  );
}

/**
 * Send a voided notification to a signer.
 */
export async function sendVoided(
  signer: EmailSigner,
  envelope: EmailEnvelope,
  reason?: string,
): Promise<void> {
  const html = renderTemplate('voided', {
    signerName: signer.name,
    documentTitle: envelope.subject,
    reason: reason ?? 'The sender cancelled this signing request.',
  });

  await sendEmail(
    signer.email,
    `Signing request cancelled: ${envelope.subject}`,
    html,
  );
}

/**
 * Send a notification when a signer declines.
 */
export async function sendDeclined(
  senderEmail: string,
  signer: EmailSigner,
  envelope: EmailEnvelope,
  reason?: string,
): Promise<void> {
  const html = renderTemplate('declined', {
    senderName: envelope.createdBy,
    signerName: signer.name,
    documentTitle: envelope.subject,
    reason: reason ?? 'No reason provided.',
  });

  await sendEmail(
    senderEmail,
    `Signer declined: ${envelope.subject}`,
    html,
  );
}
