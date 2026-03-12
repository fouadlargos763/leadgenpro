const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Analyzes a website URL to identify marketing and technical weaknesses.
 * @param {string} url - The lead's website URL.
 * @returns {Promise<object>} - Analysis object.
 */
async function analyzeWebsite(url) {
    if (!url || url === 'N/A' || !url.startsWith('http')) {
        return {
            status: 'error',
            error: 'Invalid URL',
            health: '🔴 Needs Improvement',
            issues: ['No website found']
        };
    }

    try {
        const startTime = Date.now();
        const response = await axios.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeadGenPro-Analyzer/1.0' }
        });
        const duration = Date.now() - startTime;

        const $ = cheerio.load(response.data);
        const title = $('title').text() || 'No Title';
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        const forms = $('form').length;
        const formText = $('form').text().toLowerCase();

        const hasContactPage = url.toLowerCase().includes('contact') || $('a').filter(function () {
            return $(this).text().toLowerCase().includes('contact');
        }).length > 0;

        const hasQuoteForm = formText.includes('quote') || formText.includes('booking') || formText.includes('estimate');
        const isResponsive = $('meta[name="viewport"]').length > 0;

        const issues = [];
        let seoScore = 100;

        if (!metaDesc) {
            issues.push('Missing meta description');
            seoScore -= 20;
        }
        if (title.length < 10) {
            issues.push('Very short page title');
            seoScore -= 10;
        }
        if (!hasContactPage) {
            issues.push('No clear contact page found');
        }
        if (!hasQuoteForm) {
            issues.push('Missing online quote/booking form');
        }
        if (!isResponsive) {
            issues.push('Not optimized for mobile');
        }
        if (duration > 3000) {
            issues.push('Slow page load speed');
        }

        let speedScore = Math.max(0, 100 - Math.floor(duration / 100));

        let health = '🟢 Good';
        if (issues.length > 3) health = '🔴 Needs Improvement';
        else if (issues.length > 0) health = '🟡 Average';

        return {
            status: 'success',
            title,
            metaDescription: metaDesc,
            hasContactPage,
            hasQuoteForm,
            isResponsive,
            seoScore,
            speedScore,
            loadTime: duration,
            health,
            issues
        };
    } catch (error) {
        return {
            status: 'error',
            error: error.message,
            health: '🔴 Needs Improvement',
            issues: ['Could not reach website']
        };
    }
}

module.exports = { analyzeWebsite };
