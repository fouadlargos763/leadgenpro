const { OpenAI } = require('openai');
require('dotenv').config();

const openai = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here'
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

// ─── Deterministic fallback insight generator ─────────────────────────────────

const CATEGORY_INSIGHTS = {
    roofing: "This roofing company likely needs a modern local landing page to capture seasonal demand spikes.",
    plumbing: "Plumbing businesses without websites lose 60%+ of emergency calls to competitors with online presence.",
    hvac: "HVAC companies often miss out on seasonal leads — a dedicated landing page with seasonal CTAs could convert 3x more visitors.",
    dentist: "Dental practices with low web scores often lose patients to competitors with faster, mobile-friendly booking pages.",
    dentists: "Dental practices with low web scores often lose patients to competitors with faster, mobile-friendly booking pages.",
    lawyer: "Law firms heavily depend on first-impression trust — a clean, credibility-focused website is mission critical.",
    attorney: "Law firms heavily depend on first-impression trust — a clean, credibility-focused website is mission critical.",
    'real estate': "Real estate agents without strong SEO miss 80% of organic local home buyer searches.",
    insurance: "Insurance agencies can dramatically increase leads with a fast quote form and trust-building case studies page.",
    marketing: "Surprisingly, many marketing agencies have poor websites — this creates a high-converting pain point in your pitch.",
    electrician: "Electricians rarely have strong web presence, making an outreach about a professional site highly relevant.",
    landscaping: "Landscaping businesses grow rapidly with seasonal local SEO landing pages for spring/summer services.",
    chiropractor: "Chiropractic offices with online booking and patient testimonials convert 2–3x better than average.",
};

/**
 * Generates a short, sharp business insight for a lead.
 * Uses OpenAI if available; falls back to deterministic templates.
 */
async function generateLeadInsight(lead) {
    const businessName = lead.name || lead.title || 'this business';
    const category = (lead.category || 'local business').toLowerCase();
    const hasWebsite = lead.hasWebsite || !!lead.website;
    const city = lead.address ? lead.address.split(',')[0] : 'their area';

    // Use cached insight
    if (lead.aiInsight) return lead.aiInsight;

    // Try OpenAI first
    if (openai) {
        const websiteCtx = hasWebsite
            ? `They have a website${lead.websiteAnalysis?.issues?.length ? ` but it has issues: ${lead.websiteAnalysis.issues.slice(0, 2).join(', ')}` : '.'}`
            : "They have NO website.";

        const prompt = `You are a sharp sales analyst. Write ONE concise sentence (max 20 words) explaining why a ${category} business called "${businessName}" in ${city} is a valuable outreach prospect for a web design / digital marketing agency. ${websiteCtx} Be specific and direct. No fluff.`;

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 50,
                temperature: 0.8
            });
            return response.choices[0].message.content.trim().replace(/^"|"$/g, '');
        } catch (err) {
            console.error('[AI Insight Error]', err.message);
        }
    }

    // Deterministic fallback based on category
    for (const [key, insight] of Object.entries(CATEGORY_INSIGHTS)) {
        if (category.includes(key)) return insight;
    }

    // Generic fallback
    if (!hasWebsite) {
        return `${businessName} has no website, making them an ideal prospect for a new client-getting site.`;
    }
    return `${businessName} in ${city} likely has untapped digital growth potential worth exploring.`;
}

/**
 * Analyzes an outreach email draft and suggests improvements.
 * @param {object} emailDraft - { subject, body }
 * @param {object} lead
 * @returns {{ improvedSubject: string, improvedBody: string, suggestions: string[] }}
 */
async function optimizeEmail(emailDraft, lead) {
    const { subject, body } = emailDraft;
    const businessName = lead.name || lead.title || 'the business';

    // Deterministic suggestions (always run)
    const suggestions = [];

    if (!subject || subject.length < 5) {
        suggestions.push("⚠️ Subject line is too short — try something specific like their business name or pain point.");
    } else if (subject.toLowerCase().includes('check out') || subject.toLowerCase().includes('hey there')) {
        suggestions.push("🔄 Subject line is too generic — try '[BusinessName] – Found Something on Your Site' instead.");
    }

    if (body && body.length > 350) {
        suggestions.push("✂️ Email body is too long (>350 chars). Cold emails under 150 words get 3× more replies.");
    }
    if (body && !body.includes('?')) {
        suggestions.push("❓ Missing a clear question or CTA — always end with a yes/no question to reduce friction.");
    }
    if (body && (body.toLowerCase().includes('i hope this email') || body.toLowerCase().includes('i am reaching out'))) {
        suggestions.push("🚫 Opening with 'I hope this email...' or 'I am reaching out...' is low converting — lead with a specific observation instead.");
    }
    if (body && !body.toLowerCase().includes(businessName.toLowerCase().split(' ')[0])) {
        suggestions.push(`🎯 Personalize more — use "${businessName}" in the email body for higher response rates.`);
    }

    // If no suggestions, give a positive note
    if (suggestions.length === 0) {
        suggestions.push("✅ Email looks solid! Subject is clear and body is concise and direct.");
    }

    // Try AI improvement if available
    if (openai) {
        const prompt = `You are an expert cold email copywriter. Improve this outreach email for a business called "${businessName}".

Current Subject: ${subject}
Current Body: ${body}

Rules:
- Subject: max 8 words, specific, curiosity-inducing
- Body: max 4 sentences, lead with a specific observation, end with a single yes/no question
- No "I hope this finds you well", no generic openers
- Sound human, not like a template

Respond ONLY in JSON: {"subject": "...", "body": "..."}`;

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 250,
                temperature: 0.85
            });

            const raw = response.choices[0].message.content.trim();
            const json = JSON.parse(raw.replace(/```json|```/g, '').trim());
            return {
                improvedSubject: json.subject || subject,
                improvedBody: json.body || body,
                suggestions
            };
        } catch (err) {
            console.error('[Email Optimize Error]', err.message);
        }
    }

    // Fallback: return original with suggestions only
    return {
        improvedSubject: subject,
        improvedBody: body,
        suggestions
    };
}

module.exports = { generateLeadInsight, optimizeEmail };
