const fs = require('fs');
const path = require('path');

const analyticsFile = path.join(__dirname, '..', 'data', 'analytics.json');

/**
 * Tracks a SaaS event and stores it in analytics.json
 * @param {string} userId - ID of the user triggering the event
 * @param {string} eventType - Type of event (user_signup, lead_search, etc.)
 * @param {object} metadata - Additional context for the event
 */
function trackEvent(userId, eventType, metadata = {}) {
    const event = {
        timestamp: new Date().toISOString(),
        userId,
        eventType,
        metadata
    };

    console.log(`[ANALYTICS] Tracking event: ${eventType} for user: ${userId}`);

    try {
        let analytics = [];
        if (fs.existsSync(analyticsFile)) {
            const content = fs.readFileSync(analyticsFile, 'utf8');
            analytics = JSON.parse(content || '[]');
        }

        analytics.push(event);

        // Keep file size manageable (optional, but good for demo)
        if (analytics.length > 5000) analytics.shift();

        fs.writeFileSync(analyticsFile, JSON.stringify(analytics, null, 2));
    } catch (err) {
        console.error('[ANALYTICS ERROR] Failed to track event:', err.message);
    }
}

/**
 * Calculates growth metrics for the admin dashboard
 */
function getAnalyticsMetrics() {
    try {
        if (!fs.existsSync(analyticsFile)) {
            return {
                totalUsers: 0,
                newUsersToday: 0,
                leadsGenerated: 0,
                campaignsCreated: 0,
                emailsGenerated: 0,
                dau: 0,
                topIndustries: [],
                topCities: []
            };
        }

        const analytics = JSON.parse(fs.readFileSync(analyticsFile, 'utf8') || '[]');
        const today = new Date().toISOString().split('T')[0];

        // 1. Total & New Users
        const signups = analytics.filter(e => e.eventType === 'user_signup');
        const uniqueUserIds = [...new Set(analytics.map(e => e.userId))];
        const newUsersToday = signups.filter(e => e.timestamp.startsWith(today)).length;

        // 2. Platform Activity
        const searches = analytics.filter(e => e.eventType === 'lead_search');
        const campaigns = analytics.filter(e => e.eventType === 'campaign_created');
        const emails = analytics.filter(e => e.eventType === 'email_generated');

        let totalLeadsGenerated = 0;
        searches.forEach(e => {
            if (e.metadata && e.metadata.count) totalLeadsGenerated += e.metadata.count;
        });

        // 3. DAU (Daily Active Users - anyone who did something today)
        const dailyActiveUsers = [...new Set(analytics.filter(e => e.timestamp.startsWith(today)).map(e => e.userId))].length;

        // 4. Top Industries & Cities
        const industries = {};
        const cities = {};

        searches.forEach(e => {
            if (e.metadata.category) {
                industries[e.metadata.category] = (industries[e.metadata.category] || 0) + 1;
            }
            if (e.metadata.location) {
                cities[e.metadata.location] = (cities[e.metadata.location] || 0) + 1;
            }
        });

        const topIndustries = Object.entries(industries)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        const topCities = Object.entries(cities)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        return {
            totalUsers: uniqueUserIds.length,
            newUsersToday,
            leadsGenerated: totalLeadsGenerated,
            campaignsCreated: campaigns.length,
            emailsGenerated: emails.length,
            dau: dailyActiveUsers,
            topIndustries,
            topCities
        };

    } catch (err) {
        console.error('[ANALYTICS ERROR] Failed to calculate metrics:', err.message);
        return {};
    }
}

const { loadUsers } = require('./auth');

/**
 * Calculates revenue and subscription metrics for the admin dashboard
 */
function getRevenueMetrics() {
    const subsPath = path.join(__dirname, '..', 'data', 'subscriptions.json');
    const PLANS = {
        free: { price: 0 },
        basic: { price: 29 },
        pro: { price: 79 },
        agency: { price: 199 }
    };

    try {
        if (!fs.existsSync(subsPath)) return {};
        const subscriptions = JSON.parse(fs.readFileSync(subsPath, 'utf8'));
        const analytics = fs.existsSync(analyticsFile) ? JSON.parse(fs.readFileSync(analyticsFile, 'utf8') || '[]') : [];

        let mrr = 0;
        const planDistribution = { free: 0, basic: 0, pro: 0, agency: 0 };
        const activeUsersPerPlan = { free: [], basic: [], pro: [], agency: [] };

        // 1. Calculate MRR & Plan Distribution from current state
        Object.entries(subscriptions).forEach(([uid, sub]) => {
            const planKey = (sub.plan || 'free').toLowerCase();
            const status = sub.status || 'inactive';

            if (status === 'active' || status === 'trialing') {
                const price = PLANS[planKey]?.price || 0;
                mrr += price;
                if (planDistribution[planKey] !== undefined) {
                    planDistribution[planKey]++;
                    activeUsersPerPlan[planKey].push(uid);
                }
            } else {
                planDistribution.free++; // Count inactive as free for distribution if they exist in sub store
            }
        });

        const activeSubCount = Object.values(planDistribution).reduce((a, b) => a + b, 0) - planDistribution.free;

        // 2. Churn Rate Calculation (based on cancellations in last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const cancellations = analytics.filter(e => 
            e.eventType === 'subscription_canceled' && 
            new Date(e.timestamp) > thirtyDaysAgo
        ).length;

        // Churn % = (Cancellations in period / Total customers at start of period)
        // Simplified: (Cancellations last 30d / Current Active Subs)
        const churnRate = activeSubCount > 0 ? (cancellations / (activeSubCount + cancellations)) * 100 : 0;

        return {
            mrr,
            arr: mrr * 12,
            activeSubscriptions: activeSubCount,
            planDistribution,
            churnRate: churnRate.toFixed(2),
            cancellationsLast30Days: cancellations
        };

    } catch (err) {
        console.error('[ANALYTICS ERROR] Revenue calculation failed:', err.message);
        return {};
    }
}

module.exports = { trackEvent, getAnalyticsMetrics, getRevenueMetrics };
