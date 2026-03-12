const { ApifyClient } = require('apify-client');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const client = new ApifyClient({
    token: process.env.APIFY_API_KEY,
});

/**
 * Extracts the base domain from a URL (e.g., 'https://www.google.com/contact' -> 'google.com').
 */
function getDomain(url) {
    if (!url) return '';
    try {
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
        // Fallback for malformed URLs
        return url.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '').toLowerCase();
    }
}

const processDataDir = process.env.USER_DATA_DIR || path.join(__dirname, '..', 'data');
const logFile = path.join(processDataDir, 'process_log.txt');
function logTrace(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
    console.log(msg);
}

/**
 * Normalizes a URL to help with mapping (removes protocol, www, and trailing slashes).
 */
function normalizeUrl(url) {
    if (!url) return '';
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
}

/**
 * Enriches a list of leads by searching for their email addresses using the contact-details-scraper.
 */
async function enrichLeads(leads) {
    logTrace(`\n=======================================`);
    logTrace(`>>> ENRICHER START (Executing: ${__filename}) <<<`);
    logTrace(`[Leads] Processing ${leads.length} leads.`);
    logTrace(`=======================================\n`);

    // Prepare URLs for the scraper (Website -> Social -> Google Maps)
    const startUrls = leads
        .map(lead => {
            const url = lead.website || lead.socialUrl || lead.googleMapsUrl;
            return url ? { url } : null;
        })
        .filter(url => url !== null);

    if (startUrls.length === 0) {
        logTrace('[Enricher Warning] No valid URLs found to enrich in the lead data.');
        return leads;
    }

    const input = {
        startUrls: startUrls.slice(0, 30),
        maxRequestsPerStartUrl: 50,
        maxDepth: 2,
        sameEnqueuingLimit: 1,
    };

    try {
        logTrace(`[Apify] Launching vdrmota/contact-info-scraper on ${startUrls.length} targets...`);
        const run = await client.actor("vdrmota/contact-info-scraper").call(input);

        logTrace(`[Apify] Run completed. Fetching results from dataset: ${run.defaultDatasetId}`);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        // --- NEW: Cache raw results for debugging ---
        const rawPath = path.join(processDataDir, 'raw_scraper_output.json');
        fs.writeFileSync(rawPath, JSON.stringify(items, null, 2));
        logTrace(`[Debug] Raw scraper output saved to: ${rawPath} (Check this if emails are still null!)`);

        // Create a map of DOMAIN -> EMAIL to overcome URL format differences
        const domainEmailMap = {};
        items.forEach(item => {
            const foundEmail = (item.emails && item.emails.length > 0) ? item.emails[0] :
                (item.contactEmail || item.personalEmail || item.personalEmail);

            if (foundEmail) {
                const domain = getDomain(item.startUrl || item.url);
                if (domain) {
                    domainEmailMap[domain] = foundEmail;
                    logTrace(`[Found Evidence] Domain: ${domain} | Email: ${foundEmail}`);
                }
            }
        });

        // Update the original leads by matching the base domain
        const enrichedLeads = leads.map(lead => {
            if (lead.email) return lead; // Skip if already has one

            const leadUrl = lead.website || lead.socialUrl || lead.googleMapsUrl;
            const domain = getDomain(leadUrl);

            if (domainEmailMap[domain]) {
                logTrace(`[Match Success] Linked ${domainEmailMap[domain]} to business: ${lead.name}`);
                return { ...lead, email: domainEmailMap[domain], enriched: true };
            }
            return lead;
        });

        const newEmails = enrichedLeads.filter(l => l.enriched).length;
        logTrace(`\n[Success] Phase 2 complete. Found ${newEmails} new matches.`);

        return enrichedLeads;

    } catch (error) {
        logTrace(`[Enrichment Error] Fatal failure call: ${error.message}`);
        return leads;
    }
}

/**
 * Saves enriched leads to the data folder.
 */
function saveEnrichedLeads(leads) {
    const dataDir = process.env.USER_DATA_DIR || path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const fileName = `enriched_leads_${Date.now()}.json`;
    const filePath = path.join(dataDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(leads, null, 2));
    return filePath;
}

module.exports = { enrichLeads, saveEnrichedLeads };
