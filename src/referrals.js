const fs = require('fs');
const path = require('path');

const REF_PATH = path.join(__dirname, '..', 'data', 'referrals.json');

function loadReferrals() {
    if (!fs.existsSync(REF_PATH)) return [];
    return JSON.parse(fs.readFileSync(REF_PATH, 'utf8'));
}

function saveReferrals(refs) {
    const dir = path.dirname(REF_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REF_PATH, JSON.stringify(refs, null, 2));
}

/**
 * Log a successful referral sign up
 */
function logReferral(referrerId, refereeId) {
    const refs = loadReferrals();
    refs.push({
        referrerId,
        refereeId,
        timestamp: new Date().toISOString(),
        rewarded: false,
        rewardType: 'extra_leads',
        rewardAmount: 100
    });
    saveReferrals(refs);
}

/**
 * Get all referrals (for admin)
 */
function getAllReferrals() {
    return loadReferrals();
}

/**
 * Get referrals for a specific user
 */
function getUserReferrals(userId) {
    return loadReferrals().filter(r => r.referrerId === userId);
}

/**
 * Calculate total bonus leads for a user
 */
function getBonusLeads(userId) {
    return loadReferrals()
        .filter(r => r.referrerId === userId)
        .reduce((sum, r) => sum + (r.rewardAmount || 0), 0);
}

module.exports = { logReferral, getAllReferrals, getUserReferrals, getBonusLeads };
