/**
 * AI Lead Scoring Engine
 * Evaluates each lead across multiple dimensions.
 * Returns a score (0–100) and a human-readable breakdown.
 */

const HIGH_VALUE_CATEGORIES = [
    'marketing agency', 'marketing agencies', 'dentist', 'dentists',
    'law firm', 'lawyer', 'lawyers', 'attorney', 'roofing', 'hvac',
    'plumber', 'plumbing', 'electrician', 'chiropractor', 'landscaping',
    'real estate', 'insurance', 'accounting', 'financial advisor'
];

const COMPETITIVE_CITIES = [
    'new york', 'los angeles', 'chicago', 'houston', 'phoenix',
    'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose',
    'austin', 'miami', 'seattle', 'denver'
];

/**
 * Calculates a rich lead score with scoring breakdown reasons.
 * @param {object} lead
 * @returns {{ score: number, reasons: string[], tier: string }}
 */
function calculateLeadScore(lead) {
    let score = 0;
    const reasons = [];

    // ── Contact Availability (up to 40pts) ───────────────────────
    if (lead.email && lead.email.trim() !== '') {
        score += 35;
        reasons.push('✅ Has a reachable email address (+35)');
    } else {
        reasons.push('⚠️ No email found — enrichment recommended');
    }

    if (lead.phone && lead.phone.trim() !== '') {
        score += 10;
        reasons.push('✅ Phone number available (+10)');
    }

    // ── Website Opportunity (up to 30pts) ─────────────────────────
    if (!lead.hasWebsite || !lead.website) {
        score += 30;
        reasons.push('🚀 No website — high opportunity for web services (+30)');
    } else {
        // If they have a website but it has issues, partial score
        if (lead.websiteAnalysis) {
            const seoScore = lead.websiteAnalysis.seoScore || 0;
            const speedScore = lead.websiteAnalysis.speedScore || 0;
            const avgQuality = (seoScore + speedScore) / 2;
            if (avgQuality < 40) {
                score += 20;
                reasons.push(`📉 Website quality is very poor (avg ${Math.round(avgQuality)}/100) — upgrade opportunity (+20)`);
            } else if (avgQuality < 65) {
                score += 10;
                reasons.push(`📊 Website has room for improvement (avg ${Math.round(avgQuality)}/100) (+10)`);
            } else {
                reasons.push(`✔️ Website appears reasonably healthy (${Math.round(avgQuality)}/100)`);
            }
        } else {
            reasons.push('🌐 Has a website — needs analysis to score fully');
        }
    }

    // ── Business Category Value (up to 20pts) ─────────────────────
    if (lead.category) {
        const cat = lead.category.toLowerCase();
        const isHighValue = HIGH_VALUE_CATEGORIES.some(hvc => cat.includes(hvc));
        if (isHighValue) {
            score += 20;
            reasons.push(`⭐ High-value business category: "${lead.category}" (+20)`);
        } else {
            reasons.push(`ℹ️ Standard business category: "${lead.category}"`);
        }
    }

    // ── Location Factor (up to 10pts) ─────────────────────────────
    if (lead.address) {
        score += 5;
        reasons.push('📍 Location data available (+5)');

        const addr = lead.address.toLowerCase();
        const isCompetitive = COMPETITIVE_CITIES.some(city => addr.includes(city));
        if (isCompetitive) {
            score += 5;
            reasons.push('🏙️ Located in high-competition metro — urgency to stand out (+5)');
        }
    }

    // ── Cap and classify ──────────────────────────────────────────
    const finalScore = Math.min(score, 100);

    let tier;
    if (finalScore >= 75) tier = 'Hot';
    else if (finalScore >= 45) tier = 'Warm';
    else tier = 'Cold';

    return { score: finalScore, reasons, tier };
}

/**
 * Legacy compat: return just the numeric score
 * (used by existing rows in app.js that call .score)
 */
function calculateLeadScoreSimple(lead) {
    return calculateLeadScore(lead).score;
}

module.exports = { calculateLeadScore, calculateLeadScoreSimple };
