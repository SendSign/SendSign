import twilio from 'twilio';

let twilioClient: ReturnType<typeof twilio> | null = null;
let twilioConfigured = false;

function initTwilio() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (accountSid && authToken) {
    twilioClient = twilio(accountSid, authToken);
    twilioConfigured = true;
  } else {
    console.warn('⚠ Twilio not configured. SMS features will be unavailable.');
  }
}

/**
 * Send an SMS OTP for identity verification.
 */
export async function sendSmsOtp(phone: string, code: string): Promise<void> {
  if (!twilioConfigured) initTwilio();
  if (!twilioClient) {
    console.log(`[SMS Log] Would send OTP ${code} to ${phone}`);
    return;
  }

  const from = process.env.TWILIO_PHONE_FROM;
  if (!from) {
    console.warn('⚠ TWILIO_PHONE_FROM not configured. Cannot send SMS.');
    return;
  }

  await twilioClient.messages.create({
    body: `Your CoSeal verification code is: ${code}. This code expires in 10 minutes.`,
    from,
    to: phone,
  });
}

/**
 * Send a general SMS notification.
 */
export async function sendSmsNotification(phone: string, message: string): Promise<void> {
  if (!twilioConfigured) initTwilio();
  if (!twilioClient) {
    console.log(`[SMS Log] Would send to ${phone}: ${message}`);
    return;
  }

  const from = process.env.TWILIO_PHONE_FROM;
  if (!from) {
    console.warn('⚠ TWILIO_PHONE_FROM not configured. Cannot send SMS.');
    return;
  }

  await twilioClient.messages.create({
    body: message,
    from,
    to: phone,
  });
}
