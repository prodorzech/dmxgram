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
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);min-height:100vh;">
  <table width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;">
    <tr><td align="center" valign="middle" style="padding:48px 16px;">

      <!-- Card -->
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:rgba(255,255,255,0.04);backdrop-filter:blur(20px);border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.10);box-shadow:0 32px 64px rgba(0,0,0,0.5);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);padding:36px 32px;text-align:center;">
            <div style="display:inline-block;background:rgba(0,0,0,0.2);border-radius:50%;width:56px;height:56px;line-height:56px;font-size:28px;margin-bottom:14px;">📧</div>
            <h1 style="margin:0;font-size:28px;font-weight:800;color:#fff;letter-spacing:2px;text-transform:uppercase;">DMXGram</h1>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:1px;text-transform:uppercase;">Email Verification</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 36px 32px;">
            <p style="margin:0 0 6px;font-size:15px;color:rgba(255,255,255,0.5);">Hello,</p>
            <p style="margin:0 0 28px;font-size:20px;font-weight:700;color:#fff;">${username}</p>
            <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.6;">Use the code below to verify your email address and complete your registration.</p>

            <!-- Code box -->
            <div style="background:rgba(220,38,38,0.08);border:1.5px solid rgba(220,38,38,0.5);border-radius:14px;padding:28px 16px;text-align:center;margin-bottom:32px;">
              <p style="margin:0 0 8px;font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:2px;text-transform:uppercase;">Your verification code</p>
              <div style="font-size:42px;font-weight:900;letter-spacing:14px;color:#fff;font-family:'Courier New',monospace;padding-left:14px;">${code}</div>
            </div>

            <!-- Divider -->
            <div style="height:1px;background:rgba(255,255,255,0.08);margin-bottom:24px;"></div>

            <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.7;">
              ⏳ This code expires in <strong style="color:rgba(255,255,255,0.55);">15 minutes</strong>.<br>
              If you did not create a DMXGram account, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 36px 28px;text-align:center;">
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);">© ${new Date().getFullYear()} DMXGram — All rights reserved</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  });

  if (error) throw new Error(`Failed to send email: ${error.message}`);
}
