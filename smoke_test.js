const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const uid = 'user_1773261779301';

function getUserDataDir(userId) {
    return path.join(dataDir, 'users', userId);
}

const userDir = getUserDataDir(uid);
let allClients = [];
let fileCount = 0;

const findLeadsInDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => f.startsWith('leads_') || f.startsWith('enriched_'));
    for (const file of files) {
        try {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) continue;

            const leads = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            fileCount++;
            leads.forEach((l, i) => {
                const id = l.id || `lead-${i}`;
                allClients.push({
                    ...l,
                    id: id,
                    file: file,
                    status: l.status || 'New',
                    notes: l.notes || ''
                });
            });
        } catch (e) {
            console.error(`[Error] Failed to read ${file}:`, e.message);
        }
    }
};

// 1. Load user-specific data
findLeadsInDir(userDir);
const userSpecificCount = allClients.length;

// 2. Legacy fallback
if (allClients.length < 5) {
    findLeadsInDir(dataDir);
}

console.log('--- DB Smoke Test ---');
console.log('User Folder Leads:', userSpecificCount);
console.log('Total Leads (incl. fallback):', allClients.length);
console.log('Files processed:', fileCount);
if (allClients.length > 0) {
    console.log('First lead name:', allClients[0].name);
    console.log('Last lead name:', allClients[allClients.length - 1].name);
}
