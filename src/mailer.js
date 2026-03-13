const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT == 465,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Generates a high-converting cold email based on whether the lead has a website or not.
 */
function generateEmailContent(lead, campaignName = 'default', uid = '') {
    const businessName = lead.title || lead.name || 'your business';
    const hasWebsite = !!lead.website || lead.hasWebsite;

    // Fallback ID if missing
    const leadId = lead.id || encodeURIComponent(businessName);
    const uidParam = uid ? `&uid=${uid}` : '';

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const trackingPixel = `<img src="${baseUrl}/track/open?leadId=${leadId}&campaign=${encodeURIComponent(campaignName)}${uidParam}" width="1" height="1" style="display:none;" />`;

    const aiHook = lead.aiHook ? `${lead.aiHook}\n\n` : '';
    const aiHookHtml = lead.aiHook ? `<p>${lead.aiHook}</p>` : '';

    if (!hasWebsite) {
        // Template A: No Website (New Build Pitch)
        const portfolioUrl = 'https://myportfolio.com';
        const bookingUrl = 'https://calendly.com/mylocalbooking';

        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const trackedPortfolio = `${baseUrl}/track/click?leadId=${leadId}&campaign=${encodeURIComponent(campaignName)}${uidParam}&url=${encodeURIComponent(portfolioUrl)}`;
        const trackedBooking = `${baseUrl}/track/click?leadId=${leadId}&campaign=${encodeURIComponent(campaignName)}${uidParam}&url=${encodeURIComponent(bookingUrl)}`;

        const subject = `Helping ${businessName} get more local project leads in Columbus`;
        const text = `Hi ${businessName} team,\n\n${aiHook}I was recently looking at local contractors in Columbus and came across your company listing.\n\nI noticed you don't have a website for your business yet. In our local market, the first thing most homeowners do when they need a contractor is search online to request a quote or see if a company is legitimate. By not having a professional landing page, you're likely missing out on local quote requests that are going straight to your competitors instead.\n\nI specialize in building simple, high-converting landing pages for construction companies that help you:\n1. Show up when local customers search for your services.\n2. Collect project details and quote requests automatically.\n3. Build trust with a professional online portfolio of your work.\n\nCheck out our recent work here:\n${trackedPortfolio}\n\nWould you be open to a 10-minute "no-pressure" chat this week? I'd love to show you how we can get more local leads coming directly to your phone.\n\nBook a time here: ${trackedBooking}\n\nBest regards,\n\n[Your Name]\nConstruction Web Growth Specialist`;

        const html = `<p>Hi ${businessName} team,</p>
${aiHookHtml}
<p>I was recently looking at local contractors in Columbus and came across your company listing.</p>
<p>I noticed you don't have a website for your business yet. In our local market, the first thing most homeowners do when they need a contractor is search online to request a quote or see if a company is legitimate. By not having a professional landing page, you're likely missing out on local quote requests that are going straight to your competitors instead.</p>
<p>I specialize in building simple, high-converting landing pages for construction companies that help you:</p>
<ol>
    <li>Show up when local customers search for your services.</li>
    <li>Collect project details and quote requests automatically.</li>
    <li>Build trust with a professional online portfolio of your work.</li>
</ol>
<p>Check out our recent work here:<br><a href="${trackedPortfolio}">View Portfolio</a></p>
<p>Would you be open to a 10-minute "no-pressure" chat this week? I'd love to show you how we can get more local leads coming directly to your phone.<br><a href="${trackedBooking}">Book a quick chat</a></p>
<p>Best regards,<br><br>[Your Name]<br>Construction Web Growth Specialist</p>${trackingPixel}`;

        return { subject, text, html };
    } else {
        // Template B: Has Website (Performance Upgrade Pitch)
        const portfolioUrl = 'https://myportfolio.com';
        const bookingUrl = 'https://calendly.com/mylocalbooking';

        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const trackedPortfolio = `${baseUrl}/track/click?leadId=${leadId}&campaign=${encodeURIComponent(campaignName)}${uidParam}&url=${encodeURIComponent(portfolioUrl)}`;
        const trackedBooking = `${baseUrl}/track/click?leadId=${leadId}&campaign=${encodeURIComponent(campaignName)}${uidParam}&url=${encodeURIComponent(bookingUrl)}`;
        const trackedWebsite = `${baseUrl}/track/click?leadId=${leadId}&campaign=${encodeURIComponent(campaignName)}${uidParam}&url=${encodeURIComponent(lead.website)}`;

        const subject = `Improving ${businessName}'s booking conversion rates in Columbus`;
        const text = `Hi ${businessName} team,\n\n${aiHook}I was recently looking at your website at ${trackedWebsite} and really liked the work you're showcasing in the Columbus area.\n\nAs a specialist in high-performance web design for local contractors, I notice many sites in our industry look great but could be converted into even more of a lead-generation machine. Small tweaks to how potential customers request quotes or view your portfolio can often lead to a 20-30% increase in monthly inquiries.\n\nI've put together a few ideas on how we could modernize your online presence to ensure no potential projects are slipping through the cracks.\n\nCheck out examples of our high-converting designs here:\n${trackedPortfolio}\n\nWould you be open to a quick 10-minute chat this week to see if these improvements could help grow your local booking numbers?\n\nBook a time here: ${trackedBooking}\n\nBest regards,\n\n[Your Name]\nConversion Optimization Specialist`;

        const html = `<p>Hi ${businessName} team,</p>
${aiHookHtml}
<p>I was recently looking at your website at <a href="${trackedWebsite}">${lead.website}</a> and really liked the work you're showcasing in the Columbus area.</p>
<p>As a specialist in high-performance web design for local contractors, I notice many sites in our industry look great but could be converted into even more of a lead-generation machine. Small tweaks to how potential customers request quotes or view your portfolio can often lead to a 20-30% increase in monthly inquiries.</p>
<p>I've put together a few ideas on how we could modernize your online presence to ensure no potential projects are slipping through the cracks.</p>
<p>Check out examples of our high-converting designs here:<br><a href="${trackedPortfolio}">View Portfolio</a></p>
<p>Would you be open to a quick 10-minute chat this week to see if these improvements could help grow your local booking numbers?<br><a href="${trackedBooking}">Book a quick chat</a></p>
<p>Best regards,<br><br>[Your Name]<br>Conversion Optimization Specialist</p>${trackingPixel}`;

        return { subject, text, html };
    }
}

/**
 * Sends or logs an outreach email.
 * @param {object} lead 
 * @param {boolean} dryRun If true, only logs the email to console.
 */
async function sendOutreachEmail(lead, dryRun = true, campaignName = 'default', uid = '') {
    const email = lead.email;
    const { subject, text, html } = generateEmailContent(lead, campaignName, uid);

    if (!email || email === 'Not found in listing') {
        const fallbackAction = lead.website ? `[Fallback] Visit Contact Form: ${lead.website}` : '[Skip] No contact info available';
        console.log(`${fallbackAction} for: ${lead.name}`);
        return;
    }

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: subject,
        text: text,
        html: html
    };

    if (dryRun) {
        console.log(`\n--- [DRY RUN] Outreach to: ${lead.title || lead.name} ---`);
        console.log(`To: ${email}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body Snippet: ${text.substring(0, 100)}...`);
        console.log('-------------------------------------------\n');
        return;
    }

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Sent] Email sent to ${lead.title || lead.name}: ${info.messageId}`);
    } catch (error) {
        console.error(`[Error] Failed to send to ${lead.title || lead.name}:`, error.message);
    }
}

/**
 * Generates content for automated follow-up steps (1 or 2)
 */
function generateFollowUpContent(lead, step, campaignName = 'default', uid = '') {
    const businessName = lead.title || lead.name || 'your business';
    const leadId = lead.id || encodeURIComponent(businessName);
    const uidParam = uid ? `&uid=${uid}` : '';
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const trackingPixel = `<img src="${baseUrl}/track/open?leadId=${leadId}&campaign=${encodeURIComponent(campaignName)}${uidParam}" width="1" height="1" style="display:none;" />`;

    let subject = '';
    let html = '';
    let text = '';

    if (step === 1) {
        subject = `Quick follow-up`;
        text = `Hi ${businessName},\nJust wanted to follow up on my previous message.\nDid you have a chance to take a look?`;
        html = `<p>Hi ${businessName},</p><p>Just wanted to follow up on my previous message.</p><p>Did you have a chance to take a look?</p>${trackingPixel}`;
    } else {
        subject = `Final quick note`;
        text = `Hi ${businessName},\nJust a quick final note in case my previous emails got buried.\nHappy to share a quick idea to improve your website conversions.`;
        html = `<p>Hi ${businessName},</p><p>Just a quick final note in case my previous emails got buried.</p><p>Happy to share a quick idea to improve your website conversions.</p>${trackingPixel}`;
    }

    return { subject, text, html };
}

/**
 * Sends a follow-up email
 */
async function sendFollowUpEmail(lead, step, campaignName = 'default', dryRun = false, uid = '') {
    const email = lead.email;
    const { subject, text, html } = generateFollowUpContent(lead, step, campaignName, uid);

    if (!email || email === 'Not found in listing') return;

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: subject,
        text: text,
        html: html
    };

    if (dryRun) {
        console.log(`\n--- [DRY RUN] Follow-up Iteration ${step} to: ${email} ---`);
        return;
    }

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[Sent] Follow-up #${step} sent to ${lead.title || lead.name}`);
    } catch (error) {
        if (error.code === 'ECONNREFUSED' && !process.env.EMAIL_HOST) {
            console.log(`[Simulated] Follow-up #${step} sent to ${email} (no SMTP configured)`);
        } else {
            console.error(`[Error] Failed to send follow-up to ${lead.title || lead.name}:`, error.message);
        }
    }
}

/**
 * Queues an email to be sent by the background processor
 */
function queueEmail(lead, campaignName = 'default', uid = '') {
    const fs = require('fs');
    const path = require('path');
    const dataDir = process.env.USER_DATA_DIR || path.join(__dirname, '..', 'data');
    const queueFile = path.join(dataDir, 'email_queue.json');
    let queue = [];
    if (fs.existsSync(queueFile)) {
        queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    }

    const businessName = lead.title || lead.name || 'your business';
    const leadId = lead.id || encodeURIComponent(businessName);

    const existing = queue.find(q => q.leadId === leadId && q.campaign === campaignName && q.status === 'pending');
    if (!existing) {
        queue.push({
            leadId,
            campaign: campaignName,
            status: 'pending',
            scheduledSend: new Date().toISOString()
        });
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
        console.log(`[Queued] Email scheduled for ${businessName}`);
    } else {
        console.log(`[Skip] Email already pending for ${businessName}`);
    }
}

module.exports = { sendOutreachEmail, generateEmailContent, generateFollowUpContent, sendFollowUpEmail, queueEmail };
