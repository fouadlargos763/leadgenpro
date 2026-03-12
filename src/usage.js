const fs = require('fs');
const path = require('path');

const USAGE_PATH = path.join(__dirname, '..', 'data', 'usage.json');

function getCurrentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function loadUsage() {
    if (!fs.existsSync(USAGE_PATH)) return {};
    return JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8'));
}

function saveUsage(usage) {
    const dir = path.dirname(USAGE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_PATH, JSON.stringify(usage, null, 2));
}

function getUsage(userId) {
    const usage = loadUsage();
    const month = getCurrentMonth();
    
    if (!usage[userId] || usage[userId].month !== month) {
        // Auto-reset for new month
        return { userId, leadsGenerated: 0, month };
    }
    return usage[userId];
}

function incrementUsage(userId, amount = 1) {
    const usage = loadUsage();
    const month = getCurrentMonth();
    
    if (!usage[userId] || usage[userId].month !== month) {
        usage[userId] = { userId, leadsGenerated: amount, month };
    } else {
        usage[userId].leadsGenerated += amount;
    }
    
    saveUsage(usage);
    console.log(`[USAGE TRACK] User ${userId}: ${usage[userId].leadsGenerated} leads in ${month}`);
    return usage[userId];
}

module.exports = { getUsage, incrementUsage, getCurrentMonth };
