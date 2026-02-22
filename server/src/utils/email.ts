import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set in environment variables');
    _resend = new Resend(key);
  }
  return _resend;
}

/** Generate a random 6-digit numeric code */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVerificationEmail(to: string, username: string, code: string): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL || 'DMXGram <noreply@svnhost.pl>';
  const resend = getResend();

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Your DMXGram verification code: ${code}`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background: #0f0f0f; color: #fff; margin: 0; padding: 0;">
  <div style="max-width: 480px; margin: 40px auto; background: #1a1a1a; border-radius: 12px; overflow: hidden; border: 1px solid #333;">
    <div style="background: #dc2626; padding: 28px; text-align: center;">
      <h1 style="margin: 0; font-size: 26px; color: #fff; letter-spacing: 1px;">DMXGram</h1>
    </div>
    <div style="padding: 36px 32px;">
      <p style="font-size: 16px; color: #ccc; margin: 0 0 8px;">Hi <strong style="color:#fff">${username}</strong>,</p>
      <p style="font-size: 16px; color: #ccc; margin: 0 0 28px;">Enter the code below to verify your email address:</p>
      <div style="background: #111; border: 2px solid #dc2626; border-radius: 10px; padding: 20px; text-align: center; font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #fff; margin-bottom: 28px;">
        ${code}
      </div>
      <p style="font-size: 13px; color: #666; margin: 0;">This code expires in <strong style="color:#999">15 minutes</strong>. If you did not create an account, ignore this email.</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  });

  if (error) throw new Error(`Failed to send email: ${error.message}`);
}
