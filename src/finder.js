const { ApifyClient } = require('apify-client');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const client = new ApifyClient({
    token: process.env.APIFY_API_KEY,
});

/**
 * Modular function to find businesses without websites using the official apify/google-maps-scraper actor.
 * This version uses deep-search features to extract emails and contact info.
 */
async function findBusinessesWithoutWebsites(category = "marketing agencies", location = "Columbus, Ohio", maxResults = 50) {

    console.log(`[Discovery] Deep-searching for "${category}" in "${location}"...`);

    const input = {
        searchStringsArray: [`${category} in ${location}`],
        maxCrawledPlaces: maxResults,
    };

    try {
        console.log("[Apify] Running official Google Maps Scraper actor (Deep Search)...");
        // We use the official 'apify/google-maps-scraper' as requested
        const run = await client
            .actor("compass/crawler-google-places")
            .call(input);

        console.log("[Apify] Fetching deep-scraped results from dataset...");
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        // Map all collected businesses to a standard format for enrichment
        const leads = items.map(item => {
            // The official scraper often places emails in an 'emails' array or a 'contactEmail' field
            let foundEmail = item.email || item.contactEmail;
            if (!foundEmail && item.emails && item.emails.length > 0) {
                foundEmail = item.emails[0];
            }

            return {
                name: item.title,
                phone: item.phone,
                address: item.address,
                email: foundEmail || null,
                website: item.website || null,
                googleMapsUrl: item.url,
                category: category,
                hasWebsite: !!item.website
            };
        });

        const withEmail = leads.filter(l => l.email).length;
        const noWebsiteCount = leads.filter(l => !l.hasWebsite).length;

        console.log(`[Success] Found ${leads.length} total businesses.`);
        console.log(`[Stats] ${noWebsiteCount} have no website, ${leads.length - noWebsiteCount} have existing sites.`);
        console.log(`[Stats] ${withEmail} have emails discovered directly from Maps.`);

        return leads;

    } catch (error) {
        console.error("[Error] Discovery failed:", error.message);
        throw error;
    }
}

/**
 * Saves leads to the data folder.
 */
function saveLeads(leads, customName = null) {
    const dataDir = process.env.USER_DATA_DIR || path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const safeName = customName ? customName.toLowerCase().replace(/\s+/g, '_') : `columbus_${Date.now()}`;
    const fileName = `leads_${safeName}.json`;
    const filePath = path.join(dataDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(leads, null, 2));
    return filePath;
}

if (require.main === module) {
    findBusinessesWithoutWebsites().then(leads => {
        const path = saveLeads(leads);
        console.log(`Leads saved to: ${path}`);
        console.log(leads);
    });
}

module.exports = { findBusinessesWithoutWebsites, saveLeads };