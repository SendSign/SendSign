import twilio from 'twilio';

let twilioClient: ReturnType<typeof twilio> | null = null;
let whatsappConfigured = false;

function initWhatsApp() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

  if (accountSid && authToken && whatsappFrom) {
    twilioClient = twilio(accountSid, authToken);
    whatsappConfigured = true;
  } else {
    console.warn('⚠ Twilio WhatsApp not configured. WhatsApp features will fall back to SMS/email.');
  }
}

/**
 * Send a WhatsApp signing request.
 */
export async function sendWhatsAppSigningRequest(
  phone: string,
  signerName: string,
  documentTitle: string,
  signingUrl: string,
): Promise<void> {
  if (!whatsappConfigured) initWhatsApp();
  if (!twilioClient) {
    console.log(`[WhatsApp Log] Would send signing request to ${phone}`);
    return;
  }

  const from = process.env.TWILIO_WHATSAPP_FROM!;
  const message = `Hi ${signerName}, you have a document to sign: "${documentTitle}". Review and sign here: ${signingUrl}`;

  await twilioClient.messages.create({
    body: message,
    from,
    to: `whatsapp:${phone}`,
  });
}

/**
 * Send a WhatsApp reminder.
 */
export async function sendWhatsAppReminder(
  phone: string,
  signerName: string,
  documentTitle: string,
  signingUrl: string,
): Promise<void> {
  if (!whatsappConfigured) initWhatsApp();
  if (!twilioClient) {
    console.log(`[WhatsApp Log] Would send reminder to ${phone}`);
    return;
  }

  const from = process.env.TWILIO_WHATSAPP_FROM!;
  const message = `Reminder: ${signerName}, you have a document waiting for your signature: "${documentTitle}". Sign now: ${signingUrl}`;

  await twilioClient.messages.create({
    body: message,
    from,
    to: `whatsapp:${phone}`,
  });
}

/**
 * Send a WhatsApp completion notification.
 */
export async function sendWhatsAppCompleted(
  phone: string,
  signerName: string,
  documentTitle: string,
): Promise<void> {
  if (!whatsappConfigured) initWhatsApp();
  if (!twilioClient) {
    console.log(`[WhatsApp Log] Would send completion to ${phone}`);
    return;
  }

  const from = process.env.TWILIO_WHATSAPP_FROM!;
  const message = `Great news, ${signerName}! The document "${documentTitle}" has been fully executed by all parties.`;

  await twilioClient.messages.create({
    body: message,
    from,
    to: `whatsapp:${phone}`,
  });
}
