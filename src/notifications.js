/**
 * notifications.js — LeadGenPro SaaS Platform
 * Transactional email notification service.
 * All emails use simple, professional HTML templates.
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

// ─── Transporter ──────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_PORT == 465,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const FROM_NAME    = process.env.FROM_NAME  || 'LeadGenPro';
const FROM_ADDRESS = process.env.EMAIL_USER || 'noreply@leadgenpro.io';
const APP_URL      = process.env.APP_URL    || 'http://localhost:3000';

// ─── Shared email wrapper ─────────────────────────────────────────────────────
function emailWrapper(title, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:rgba(255,255,255,0.04);border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:32px 40px;background:linear-gradient(135deg,#0891b2,#6366f1);text-align:center;">
          <span style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px;">⚡ LeadGenPro</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;color:#e2e8f0;line-height:1.7;font-size:15px;">
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;font-size:12px;color:#64748b;">
          &copy; ${new Date().getFullYear()} LeadGenPro &bull;
          <a href="${APP_URL}/privacy.html" style="color:#06b6d4;text-decoration:none;">Privacy</a> &bull;
          <a href="${APP_URL}/terms.html" style="color:#06b6d4;text-decoration:none;">Terms</a> &bull;
          <a href="${APP_URL}/contact.html" style="color:#06b6d4;text-decoration:none;">Contact</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(href, label) {
    return `<div style="text-align:center;margin:28px 0;">
        <a href="${href}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#06b6d4,#6366f1);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.3px;">${label}</a>
    </div>`;
}

// ─── Send helper ──────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[NOTIFY MOCK] To: ${to} | Subject: ${subject}`);
        return { mocked: true };
    }
    return transporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
        to,
        subject,
        html,
    });
}

// ─── 1. Welcome Email ─────────────────────────────────────────────────────────
async function sendWelcomeEmail(user) {
    const html = emailWrapper('Welcome to LeadGenPro!', `
        <h2 style="color:#fff;margin-top:0;font-size:22px;">Welcome to LeadGenPro, ${user.name}! 🎉</h2>
        <p>You're all set to start discovering high-quality leads and launching personalized outreach campaigns.</p>
        <p>Here's how to get started in 3 simple steps:</p>
        <ol style="padding-left:20px;color:#94a3b8;">
          <li style="margin-bottom:8px;"><strong style="color:#e2e8f0;">Choose your niche</strong> — Roofing, Plumbing, Real Estate, and more.</li>
          <li style="margin-bottom:8px;"><strong style="color:#e2e8f0;">Enter your target city</strong> — and let our AI find businesses that need you.</li>
          <li style="margin-bottom:8px;"><strong style="color:#e2e8f0;">Send personalized outreach</strong> — in one click, powered by GPT-4.</li>
        </ol>
        ${btn(`${APP_URL}/dashboard.html`, 'Go to Your Dashboard')}
        <p style="color:#64748b;font-size:13px;">Questions? Just reply to this email or visit our <a href="${APP_URL}/contact.html" style="color:#06b6d4;">contact page</a>.</p>
    `);
    return sendEmail({ to: user.email, subject: 'Welcome to LeadGenPro — Get Your First Leads Today! 🚀', html });
}

// ─── 2. Subscription Confirmation ────────────────────────────────────────────
async function sendSubscriptionConfirmation(user, plan) {
    const planNames = { free: 'Free', basic: 'Basic', pro: 'Pro', agency: 'Agency' };
    const planName  = planNames[plan] || plan;
    const html = emailWrapper('Subscription Confirmed', `
        <h2 style="color:#fff;margin-top:0;font-size:22px;">Subscription Activated ✅</h2>
        <p>Hi ${user.name}, your <strong style="color:#06b6d4;">${planName} plan</strong> is now active.</p>
        <table width="100%" style="background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.2);border-radius:10px;padding:20px;margin:20px 0;">
          <tr><td style="color:#94a3b8;font-size:13px;">Plan</td><td style="color:#fff;font-weight:700;text-align:right;">${planName}</td></tr>
          <tr><td style="color:#94a3b8;font-size:13px;">Status</td><td style="color:#10b981;font-weight:700;text-align:right;">Active</td></tr>
          <tr><td style="color:#94a3b8;font-size:13px;">Billed</td><td style="color:#fff;font-weight:700;text-align:right;">Monthly</td></tr>
        </table>
        ${btn(`${APP_URL}/billing.html`, 'Manage Subscription')}
        <p style="color:#64748b;font-size:13px;">You can cancel anytime from your billing page. No questions asked.</p>
    `);
    return sendEmail({ to: user.email, subject: `Your ${planName} plan is now active — LeadGenPro`, html });
}

// ─── 3. Payment Receipt ───────────────────────────────────────────────────────
async function sendPaymentReceipt(user, { plan, amount, invoiceId, date }) {
    const planNames = { free: 'Free', basic: 'Basic', pro: 'Pro', agency: 'Agency' };
    const planName  = planNames[plan] || plan;
    const formattedDate = date ? new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString();
    const html = emailWrapper('Payment Receipt', `
        <h2 style="color:#fff;margin-top:0;font-size:22px;">Payment Received 💳</h2>
        <p>Hi ${user.name}, thank you for your payment. Here's your receipt:</p>
        <table width="100%" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:20px;margin:20px 0;border-collapse:collapse;">
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:10px 0;color:#94a3b8;font-size:13px;">Invoice</td>
            <td style="padding:10px 0;color:#e2e8f0;text-align:right;font-family:monospace;">${invoiceId || 'INV-' + Date.now()}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:10px 0;color:#94a3b8;font-size:13px;">Date</td>
            <td style="padding:10px 0;color:#e2e8f0;text-align:right;">${formattedDate}</td>
          </tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
            <td style="padding:10px 0;color:#94a3b8;font-size:13px;">Plan</td>
            <td style="padding:10px 0;color:#e2e8f0;text-align:right;">${planName}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#94a3b8;font-size:13px;font-weight:700;">Total</td>
            <td style="padding:10px 0;color:#10b981;text-align:right;font-weight:800;font-size:18px;">$${(amount / 100).toFixed(2)}</td>
          </tr>
        </table>
        ${btn(`${APP_URL}/billing.html`, 'View Billing History')}
        <p style="color:#64748b;font-size:13px;">Need help? <a href="${APP_URL}/contact.html" style="color:#06b6d4;">Contact our support team</a>.</p>
    `);
    return sendEmail({ to: user.email, subject: `Payment receipt — LeadGenPro ${planName} Plan`, html });
}

// ─── 4. Trial Expiration Reminder ─────────────────────────────────────────────
async function sendTrialExpirationReminder(user, daysLeft = 3) {
    const html = emailWrapper('Your Trial Is Ending Soon', `
        <h2 style="color:#fff;margin-top:0;font-size:22px;">Your trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} ⏳</h2>
        <p>Hi ${user.name}, your LeadGenPro trial period is almost over.</p>
        <p>Don't lose access to your leads and campaigns. Upgrade to a paid plan to:</p>
        <ul style="padding-left:20px;color:#94a3b8;margin-bottom:20px;">
          <li style="margin-bottom:6px;">Keep all your discovered leads</li>
          <li style="margin-bottom:6px;">Continue AI-powered outreach campaigns</li>
          <li style="margin-bottom:6px;">Get up to 500 leads/mo on Basic, unlimited on Pro</li>
        </ul>
        ${btn(`${APP_URL}/pricing.html`, 'Upgrade Now — Avoid Losing Access')}
        <p style="color:#64748b;font-size:13px;">Plans start at just $49/mo. Cancel anytime.</p>
    `);
    return sendEmail({ to: user.email, subject: `⚠️ Your LeadGenPro trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`, html });
}

// ─── 5. Password Reset ────────────────────────────────────────────────────────
async function sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${APP_URL}/reset-password.html?token=${resetToken}`;
    const html = emailWrapper('Reset Your Password', `
        <h2 style="color:#fff;margin-top:0;font-size:22px;">Reset Your Password 🔐</h2>
        <p>Hi ${user.name}, we received a request to reset your password.</p>
        <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
        ${btn(resetUrl, 'Reset Password')}
        <p>Or copy this link:</p>
        <code style="display:block;background:rgba(255,255,255,0.06);padding:12px;border-radius:6px;font-size:12px;word-break:break-all;color:#06b6d4;">${resetUrl}</code>
        <p style="margin-top:20px;color:#64748b;font-size:13px;">If you didn't request a password reset, you can safely ignore this email.</p>
    `);
    return sendEmail({ to: user.email, subject: 'Reset your LeadGenPro password', html });
}

module.exports = {
    sendWelcomeEmail,
    sendSubscriptionConfirmation,
    sendPaymentReceipt,
    sendTrialExpirationReminder,
    sendPasswordResetEmail,
};
