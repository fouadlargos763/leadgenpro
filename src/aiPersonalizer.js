const { OpenAI } = require('openai');
require('dotenv').config();

const openai = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here'
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

/**
 * Generates a personalized opening line, enriched with website analysis if available.
 * @param {object} lead - Lead data object
 * @returns {Promise<string>} - The personalized hook
 */
async function generatePersonalizedHook(lead) {
    const businessName = lead.title || lead.name || 'your business';
    const city = lead.address || 'your area';
    const category = lead.category || 'local business';
    const website = lead.website || 'no website';

    // Return cached hook if it exists
    if (lead.aiHook) return lead.aiHook;

    // Build context string from website analysis if present
    let websiteContext = '';
    if (lead.websiteAnalysis && lead.websiteAnalysis.status === 'success') {
        const issues = lead.websiteAnalysis.issues || [];
        const seo = lead.websiteAnalysis.seoScore;
        const speed = lead.websiteAnalysis.speedScore;
        websiteContext = `\nWebsite analysis found these issues:\n${issues.map(i => `- ${i}`).join('\n')}\nSEO Score: ${seo}/100, Speed Score: ${speed}/100`;
    }

    if (!openai) {
        // Smart fallback using website analysis if available
        if (lead.websiteAnalysis && lead.websiteAnalysis.issues && lead.websiteAnalysis.issues.length > 0) {
            const topIssue = lead.websiteAnalysis.issues[0];
            return `I looked at ${businessName}'s website and noticed that it has a key issue: ${topIssue.toLowerCase()}. Fixing this could meaningfully boost your local lead flow.`;
        }
        return `I noticed your business, ${businessName}, has a strong reputation in ${city} — I have a quick idea that could help you get even more local leads.`;
    }

    const prompt = `Write a short (MAX 25 words) personalized opening line for a cold sales email.

Business name: ${businessName}
City: ${city}
Category: ${category}
Website: ${website}${websiteContext}

Goal: Offer website optimization or landing page services. Use specific insights from the website analysis if available. Sound like a genuine observation by someone who checked their site. No pleasantries. No "I hope this finds you well".`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 60,
            temperature: 0.85
        });
        return response.choices[0].message.content.trim().replace(/^"|"$/g, '');
    } catch (error) {
        console.error('AI Personalization Error:', error.message);
        return `I checked out ${businessName}'s website and spotted a few quick wins that could help bring in more local leads.`;
    }
}

module.exports = { generatePersonalizedHook };

