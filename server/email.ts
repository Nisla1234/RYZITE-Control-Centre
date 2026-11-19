const DEFAULT_ADMIN_EMAILS = ['info@ryzite.lk', 'nislaryzite@gmail.com'];

export interface EmailDeliveryResult {
  sent: boolean;
  configured: boolean;
  recipients: string[];
  messageId?: string;
  error?: string;
}

export function getAdminNotificationEmails(): string[] {
  const envList = (process.env.ADMIN_NOTIFICATION_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const merged = new Set<string>([...DEFAULT_ADMIN_EMAILS, ...envList]);
  return Array.from(merged);
}

export function getEmailConfigStatus(): {
  configured: boolean;
  provider: 'resend';
  fromAddress: string | null;
  notificationRecipients: string[];
  missingVars: string[];
  message: string;
} {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromAddress = (process.env.EMAIL_FROM || '').trim();
  const missingVars: string[] = [];
  if (!apiKey) missingVars.push('RESEND_API_KEY');
  if (!fromAddress) missingVars.push('EMAIL_FROM');

  const configured = missingVars.length === 0;
  return {
    configured,
    provider: 'resend',
    fromAddress: fromAddress || null,
    notificationRecipients: getAdminNotificationEmails(),
    missingVars,
    message: configured
      ? `Resend transactional email active (from ${fromAddress}).`
      : `Email delivery is not configured. Set ${missingVars.join(' and ')} in Vercel Environment Variables to enable password reset and security notification emails.`,
  };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendResendEmail(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<EmailDeliveryResult> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.EMAIL_FROM || '').trim();
  const recipients = Array.from(new Set(params.to.map((e) => e.trim()).filter(Boolean)));

  if (!apiKey || !from) {
    console.warn(
      `[RYZITE Email] Skipped sending "${params.subject}" — RESEND_API_KEY or EMAIL_FROM is not configured.`
    );
    return {
      sent: false,
      configured: false,
      recipients,
      error: 'Email provider is not configured (RESEND_API_KEY / EMAIL_FROM missing).',
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    const data = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) {
      const errMsg = data?.message || `Resend API error (${res.status})`;
      console.error(`[RYZITE Email Error] ${errMsg}`);
      return {
        sent: false,
        configured: true,
        recipients,
        error: errMsg,
      };
    }

    return {
      sent: true,
      configured: true,
      recipients,
      messageId: data?.id,
    };
  } catch (err: any) {
    console.error('[RYZITE Email Network Error]', err?.message || err);
    return {
      sent: false,
      configured: true,
      recipients,
      error: err?.message || 'Failed to reach email delivery provider.',
    };
  }
}

function wrapEmailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#F4F7FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFFFF;border:1px solid #DDE5F0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#0D1F4E;padding:20px 28px;color:#FFFFFF;">
              <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#94AEDB;font-weight:600;">RYZITE Control Centre</div>
              <div style="font-size:18px;font-weight:700;margin-top:4px;color:#FFFFFF;">${escapeHtml(title)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:14px;line-height:1.6;color:#334155;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#F8FAFD;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;">
              This is an automated security message from RYZITE Control Centre. We never send passwords or password hashes by email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  adminName: string;
  resetUrl: string;
  expiresMinutes: number;
  ipAddress: string;
  isAccountSetup?: boolean;
}): Promise<EmailDeliveryResult> {
  const heading = params.isAccountSetup
    ? 'Set Your RYZITE Administrator Password'
    : 'Reset Your RYZITE Administrator Password';
  const intro = params.isAccountSetup
    ? `Hello ${escapeHtml(params.adminName)}, your administrator access request for RYZITE Control Centre has been approved. Use the single-use link below to create your password.`
    : `Hello ${escapeHtml(params.adminName)}, we received a request to reset your RYZITE Control Centre administrator password.`;

  const html = wrapEmailLayout(
    heading,
    `<p style="margin:0 0 16px;">${intro}</p>
     <p style="margin:0 0 24px;">
       <a href="${escapeHtml(params.resetUrl)}" style="display:inline-block;background:#1438B8;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">
         ${params.isAccountSetup ? 'Create Administrator Password' : 'Reset Administrator Password'}
       </a>
     </p>
     <p style="margin:0 0 12px;font-size:13px;color:#475569;">
       This link is single-use and expires in <strong>${params.expiresMinutes} minutes</strong>.
     </p>
     <p style="margin:0 0 12px;font-size:12px;color:#64748B;word-break:break-all;">
       Direct link: ${escapeHtml(params.resetUrl)}
     </p>
     <p style="margin:16px 0 0;font-size:12px;color:#64748B;">
       Request IP: ${escapeHtml(params.ipAddress)} · If you did not request this, you can safely ignore this email.
     </p>`
  );

  const text = `${heading}\n\n${
    params.isAccountSetup
      ? `Hello ${params.adminName}, your RYZITE Control Centre administrator access request has been approved.`
      : `Hello ${params.adminName}, we received a password reset request for your RYZITE Control Centre account.`
  }\n\nUse this single-use link (expires in ${params.expiresMinutes} minutes):\n${params.resetUrl}\n\nRequest IP: ${params.ipAddress}\nIf you did not request this, ignore this email.`;

  return sendResendEmail({
    to: [params.to],
    subject: `[RYZITE Security] ${heading}`,
    html,
    text,
  });
}

export async function sendAdminSecurityNotification(params: {
  eventTitle: string;
  summary: string;
  fields: { label: string; value: string }[];
  actionUrl?: string;
  actionLabel?: string;
}): Promise<EmailDeliveryResult> {
  const recipients = getAdminNotificationEmails();
  const rowsHtml = params.fields
    .map(
      (f) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-weight:600;color:#1E293B;width:160px;">${escapeHtml(f.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#334155;">${escapeHtml(f.value)}</td>
      </tr>`
    )
    .join('');

  const actionBlock =
    params.actionUrl && params.actionLabel
      ? `<p style="margin:20px 0 0;">
           <a href="${escapeHtml(params.actionUrl)}" style="display:inline-block;background:#0D1F4E;color:#FFFFFF;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;">
             ${escapeHtml(params.actionLabel)}
           </a>
         </p>`
      : '';

  const html = wrapEmailLayout(
    params.eventTitle,
    `<p style="margin:0 0 16px;">${escapeHtml(params.summary)}</p>
     <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E2E8F0;border-radius:8px;border-collapse:collapse;font-size:13px;">
       ${rowsHtml}
     </table>
     ${actionBlock}`
  );

  const text = `${params.eventTitle}\n\n${params.summary}\n\n${params.fields
    .map((f) => `${f.label}: ${f.value}`)
    .join('\n')}${params.actionUrl ? `\n\n${params.actionLabel || 'Review'}: ${params.actionUrl}` : ''}`;

  return sendResendEmail({
    to: recipients,
    subject: `[RYZITE Security] ${params.eventTitle}`,
    html,
    text,
  });
}
