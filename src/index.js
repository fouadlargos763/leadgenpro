const { findBusinessesWithoutWebsites, saveLeads } = require('./finder');
const { enrichLeads, saveEnrichedLeads } = require('./enricher');
const { sendOutreachEmail } = require('./mailer');
require('dotenv').config();

/**
 * Main application entry point.
 * Usage: 
 *   node src/index.js find      <- Phase 1: Discover all leads
 *   node src/index.js enrich    <- Phase 2: Find missing emails via Scraper
 *   node src/index.js mock      <- Testing: Inject test emails to bypass limits
 *   node src/index.js mail      <- Phase 3: Preview outreach (Dry Run)
 *   node src/index.js send      <- Phase 4: LIVE campaign
 */
async function main() {
    const apiKey = process.env.APIFY_API_KEY || '';
    console.log(`\n[Diagnostic] Executing main script: ${__filename}`);
    console.log(`[Credential Check] Using Apify Key starting with: ${apiKey.substring(0, 12)}...\n`);

    const action = process.argv[2] || 'find';
    const fs = require('fs');
    const path = require('path');
    const dataDir = process.env.USER_DATA_DIR || path.join(__dirname, '..', 'data');

    if (action === 'find') {
        const category = process.argv[3] || 'marketing agencies';
        const location = process.argv[4] || 'Columbus, Ohio';
        const campaignName = process.argv[5] || null;

        console.log('--- Phase 1: Discovery ---');
        const leads = await findBusinessesWithoutWebsites(category, location);
        const filePath = saveLeads(leads, campaignName);
        console.log(`\nNext step: Review or run enrichment: node src/index.js enrich`);
    }

    else if (action === 'enrich') {
        console.log('\n=======================================');
        console.log('--- PHASE 2: ENRICHMENT STARTING ---');
        console.log('=======================================\n');

        if (!fs.existsSync(dataDir)) {
            console.error('ERROR: No /data directory found. Run "find" first.');
            return;
        }

        const files = fs.readdirSync(dataDir).filter(f => f.startsWith('leads_')).sort();
        if (files.length === 0) {
            console.error('ERROR: No lead files (leads_*.json) found in /data.');
            return;
        }

        const latestFile = path.join(dataDir, files[files.length - 1]);
        console.log(`[File System] Loading leads from: ${files[files.length - 1]}`);

        const leads = JSON.parse(fs.readFileSync(latestFile));
        console.log(`[Status] Successfully loaded ${leads.length} leads. Passing to enricher...`);

        const enrichedLeads = await enrichLeads(leads);
        const filePath = saveEnrichedLeads(enrichedLeads);
        console.log(`\n[Success] ENRICHMENT COMPLETE.`);
        console.log(`[File System] Saved ${enrichedLeads.length} leads to: ${path.basename(filePath)}`);
        console.log('Next step: node src/index.js mail');
    }

    else if (action === 'mock') {
        console.log('\n--- Phase 2.5: Mock Enrichment (Credit Bypass) ---');
        const files = fs.readdirSync(dataDir).filter(f => f.startsWith('leads_')).sort();
        if (files.length === 0) return console.error('ERROR: No lead files found. Run "find" first.');

        const latestFile = path.join(dataDir, files[files.length - 1]);
        const leads = JSON.parse(fs.readFileSync(latestFile));

        console.log(`[Status] Injecting 3 test emails into ${leads.length} leads...`);
        const mockedLeads = leads.map((l, i) => {
            // Assign dummy emails to the first 3 leads to test the mailer
            if (i < 3) return { ...l, email: `test-lead-${i}@example.com`, enriched: true };
            return l;
        });

        const filePath = saveEnrichedLeads(mockedLeads);
        console.log(`\n[Success] Created mock data file: ${path.basename(filePath)}`);
        console.log('>>> IMPORTANT: Now run: node src/index.js mail');
    }

    else if (action === 'mail' || action === 'send') {
        const isDryRun = action === 'mail';
        console.log(`\n--- Phase 3: Outreach (${isDryRun ? 'DRY RUN' : 'LIVE'}) ---`);

        if (!fs.existsSync(dataDir)) {
            console.error('ERROR: No /data folder found.');
            return;
        }

        const enrichedFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('enriched_')).sort();
        const rawFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('leads_')).sort();
        const filesToUse = enrichedFiles.length > 0 ? enrichedFiles : rawFiles;

        if (filesToUse.length === 0) {
            console.error('ERROR: No lead data files found in /data.');
            return;
        }

        const latestFileName = filesToUse[filesToUse.length - 1];
        const latestFile = path.join(dataDir, latestFileName);
        console.log(`[File System] Loading: ${latestFileName}`);

        const leads = JSON.parse(fs.readFileSync(latestFile));
        const reachableLeads = leads.filter(l => l.email);

        console.log(`[Audit] Total leads in file: ${leads.length}`);
        console.log(`[Audit] Leads with valid emails: ${reachableLeads.length}`);

        if (reachableLeads.length === 0) {
            console.log('\n>>> WARNING: No reachable leads found. Run "node src/index.js mock" to create test data! <<<\n');
            return;
        }

        console.log(`\nStarting outreach for ${reachableLeads.length} leads...\n`);

        const { queueEmail } = require('./mailer');
        for (const lead of reachableLeads) {
            if (isDryRun) {
                await sendOutreachEmail(lead, true);
            } else {
                queueEmail(lead, latestFileName, process.env.APP_UID);
            }
        }

        console.log(`\n${isDryRun ? 'Preview' : 'Live campaign'} complete.`);
    }

    else {
        console.log('Unknown action. Use "find", "enrich", "mail", or "send".');
    }
}

main().catch(err => console.error('Critical Error:', err));
