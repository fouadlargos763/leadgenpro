const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cookieParser = require('cookie-parser');
const { calculateLeadScore } = require('./src/scoring');
const { generateEmailContent, sendFollowUpEmail, sendOutreachEmail } = require('./src/mailer');
const { generatePersonalizedHook } = require('./src/aiPersonalizer');
const { generateLeadInsight, optimizeEmail } = require('./src/aiInsights');
const { analyzeWebsite } = require('./src/websiteAnalyzer');
const { registerUser, loginUser, requireAuth, requireAdmin, loadUsers, saveUsers } = require('./src/auth');
const { createCheckoutSession, handleWebhookEvent, getPlanLimits, cancelSubscription, getSubscription, setSubscription, PLANS } = require('./src/billing');
const { incrementUsage, getUsage } = require('./src/usage');
const { trackEvent, getAnalyticsMetrics, getRevenueMetrics } = require('./src/analytics');
const { logReferral, getAllReferrals, getUserReferrals, getBonusLeads } = require('./src/referrals');
const {
    logger,
    authLimiter, leadsLimiter, subscriptionLimiter, aiLimiter, inviteLimiter, globalLimiter,
    validateCategory, validateLocation, validateCampaignName, validateEmail, validateName,
    helmetConfig, productionErrorHandler,
    logAuthAttempt, logApiUsage, logSubscriptionEvent, logReferralAbuse,
} = require('./src/security');
const compression = require('compression');
const {
    cacheMiddleware, leadsKey, campaignStatsKey,
    invalidateUserCache, deduplicateSearch, releaseSearch,
    requestTimer,
} = require('./src/performance');
const { sendWelcomeEmail, sendSubscriptionConfirmation, sendPaymentReceipt } = require('./src/notifications');
const { startBackupScheduler } = require('./src/backup');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');

/**
 * STRIPE WEBHOOK: Must be handled with RAW body before express.json()
 */
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    try {
        const result = await handleWebhookEvent(req.body, sig);
        return res.json(result);
    } catch (err) {
        console.error(`[Webhook Error] ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
});

// ── Security & Utility Middleware ──────────────────────────────────────────────
app.use(helmet(helmetConfig));
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
    credentials: true
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(globalLimiter);      // broad global rate limit on all routes
app.use(compression({         // gzip/deflate all text responses
    level: 6,                 // balanced speed vs compression ratio
    threshold: 1024,          // skip tiny payloads < 1 KB
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    },
}));
app.use(requestTimer);        // X-Response-Time header + slow-request warnings

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

/**
 * AUTH: Register
 */
app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { name, email, password, referralCode } = req.body;

    // ── Input validation ──
    const nameCheck  = validateName(name);
    const emailCheck = validateEmail(email);
    if (!nameCheck.valid)  return res.status(400).json({ error: nameCheck.error });
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.error });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    try {
        const user = await registerUser(nameCheck.value, emailCheck.value, password, referralCode);
        trackEvent(user.id, 'user_signup', { email: user.email, name: user.name, referralCode: referralCode || 'direct' });
        logAuthAttempt(req, true, 'register');
        // Fire welcome email (non-blocking — failure must not break registration)
        sendWelcomeEmail(user).catch(e => logger.warn('Welcome email failed', { email: user.email, err: e.message }));
        res.status(201).json({ success: true, user });
    } catch (err) {
        logAuthAttempt(req, false, err.message);
        res.status(400).json({ error: err.message });
    }
});

/**
 * AUTH: Login
 */
app.post('/api/auth/login', authLimiter, async (req, res) => {
    const emailCheck = validateEmail(req.body.email);
    if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.error });
    if (!req.body.password) return res.status(400).json({ error: 'Password is required.' });

    try {
        const { token, user } = await loginUser(emailCheck.value, req.body.password);
        res.cookie('lgp_token', token, {
            httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        logAuthAttempt(req, true, 'login');
        return res.json({ token, user });
    } catch (err) {
        logAuthAttempt(req, false, `login failed: ${err.message}`);
        res.status(401).json({ error: err.message });
    }
});

/**
 * AUTH: Logout
 */
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('lgp_token');
    return res.json({ success: true });
});

/**
 * AUTH: Get current user
 */
app.get('/api/auth/me', requireAuth, (req, res) => {
    return res.json({ user: req.user });
});

/**
 * BILLING: Create Checkout Session
 */
app.post('/api/create-checkout-session', requireAuth, subscriptionLimiter, async (req, res) => {
    const { plan } = req.body;
    const VALID_PLANS = ['free', 'basic', 'pro', 'agency'];
    if (!plan || !VALID_PLANS.includes(plan)) return res.status(400).json({ error: 'Invalid plan specified.' });

    try {
        const session = await createCheckoutSession(req.user.id, req.user.email, plan);
        logSubscriptionEvent(req.user.id, 'checkout_session_created', { plan });
        return res.json({ url: session.url });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * BILLING: Get Subscription Details & Usage
 */
app.get('/api/subscription/details', requireAuth, subscriptionLimiter, (req, res) => {
    const uid = req.user.id;
    const limits = getPlanLimits(uid);
    const usage = getUsage(uid);

    res.json({
        plan: limits.name,
        planKey: limits.plan,
        status: limits.sub.status,
        renewalDate: limits.sub.current_period_end,
        maxLeads: limits.maxLeads,
        leadsUsed: usage.leadsGenerated
    });
});

/**
 * BILLING: Cancel Subscription
 */
app.post('/api/cancel-subscription', requireAuth, subscriptionLimiter, async (req, res) => {
    try {
        await cancelSubscription(req.user.id);
        logSubscriptionEvent(req.user.id, 'subscription_canceled', { manual: true });
        return res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * ADMIN: Fetch All Users & Stats
 */
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = loadUsers();
    const adminData = users.map(u => {
        const sub = getSubscription(u.id);
        const usage = getUsage(u.id);
        return {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role || 'user',
            created_at: u.created_at,
            plan: sub.plan,
            status: sub.status,
            leadsUsed: usage.leadsGenerated
        };
    });

    // Provide Aggregates
    const stats = {
        totalUsers: users.length,
        activeSubs: adminData.filter(u => u.status === 'active' && u.plan !== 'free').length,
        freeUsers: adminData.filter(u => u.plan === 'free').length,
        estimatedRevenue: adminData.reduce((acc, u) => {
            const plan = PLANS[u.plan];
            return u.status === 'active' ? acc + (plan?.price || 0) : acc;
        }, 0)
    };

    return res.json({ users: adminData, stats });
});

/**
 * ADMIN: Manually Update User Subscription
 */
app.post('/api/admin/update-subscription', requireAdmin, (req, res) => {
    const { userId, plan, status } = req.body;
    if (!userId || !plan) return res.status(400).json({ error: 'User ID and Plan are required.' });

    try {
        setSubscription(userId, { plan, status: status || 'active' });
        trackEvent(userId, 'plan_upgrade', { fromAdmin: true, newPlan: plan });
        console.log(`[ADMIN ACTION] User ${userId} plan manually set to ${plan} by admin ${req.user.id}`);
        return res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * WAITLIST: Capture early interest
 */
const WAITLIST_PATH = path.join(dataDir, 'waitlist.json');
app.post('/api/waitlist', (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

    let waitlist = [];
    if (fs.existsSync(WAITLIST_PATH)) {
        waitlist = JSON.parse(fs.readFileSync(WAITLIST_PATH, 'utf8'));
    }

    if (waitlist.find(w => w.email === email)) {
        return res.json({ success: true, message: 'Already on list' });
    }

    waitlist.push({ email, timestamp: new Date().toISOString() });
    fs.writeFileSync(WAITLIST_PATH, JSON.stringify(waitlist, null, 2));
    return res.json({ success: true });
});

/**
 * ADMIN: Get Waitlist
 */
app.get('/api/admin/waitlist', requireAdmin, (req, res) => {
    if (!fs.existsSync(WAITLIST_PATH)) return res.json({ waitlist: [] });
    const waitlist = JSON.parse(fs.readFileSync(WAITLIST_PATH, 'utf8'));
    return res.json({ waitlist: waitlist.reverse() });
});

/**
 * ADMIN: Fetch Platform Analytics & Growth Metrics
 */
app.get('/api/admin/analytics', requireAdmin, (req, res) => {
    const metrics = getAnalyticsMetrics();
    return res.json(metrics);
});

/**
 * ADMIN: Fetch Platform Revenue & Subscription Metrics
 */
app.get('/api/admin/revenue', requireAdmin, (req, res) => {
    const metrics = getRevenueMetrics();
    return res.json(metrics);
});

/**
 * ADMIN: Fetch Referral Tracking
 */
app.get('/api/admin/referrals', requireAdmin, (req, res) => {
    const referrals = getAllReferrals();
    // Enrich with names
    const users = loadUsers();
    const enriched = referrals.map(r => {
        const referrer = users.find(u => u.id === r.referrerId);
        const referee = users.find(u => u.id === r.refereeId);
        return {
            ...r,
            referrerName: referrer ? referrer.name : 'Unknown',
            referrerEmail: referrer ? referrer.email : '',
            refereeName: referee ? referee.name : 'Deleted User',
            refereeEmail: referee ? referee.email : ''
        };
    });
    return res.json(enriched);
});

/**
 * USER: Get Referral Info
 */
app.get('/api/referral', requireAuth, (req, res) => {
    const uid = req.user.id;
    const users = loadUsers();
    const user = users.find(u => u.id === uid);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const refs = getUserReferrals(uid);
    const bonusLeads = getBonusLeads(uid);
    
    res.json({
        referralCode: user.referralCode,
        referralLink: `${process.env.APP_URL || 'http://localhost:' + port}/register.html?ref=${user.referralCode}`,
        count: refs.length,
        bonusLeads
    });
});

/**
 * USER: Invite Friends via Email
 */
app.post('/api/referral/invite', requireAuth, inviteLimiter, async (req, res) => {
    const { emails } = req.body;
    if (!emails || !Array.isArray(emails)) return res.status(400).json({ error: 'Array of emails required' });

    // Enforce max 10 invites per request to prevent bulk spam
    if (emails.length > 10) {
        logReferralAbuse(req, 'Bulk invite attempt: ' + emails.length + ' emails in one request');
        return res.status(400).json({ error: 'Maximum 10 invites per request.' });
    }

    // Validate every email in the array
    const validEmails = [];
    const invalidEmails = [];
    for (const email of emails) {
        const check = validateEmail(email);
        if (check.valid) validEmails.push(check.value);
        else invalidEmails.push(email);
    }
    if (invalidEmails.length > 0) {
        return res.status(400).json({ error: `Invalid email addresses: ${invalidEmails.join(', ')}` });
    }

    const uid = req.user.id;
    const user = findUserById(uid);
    if (!user || !user.referralCode) {
        return res.status(404).json({ error: 'User referral code not found.' });
    }
    const referralLink = `${process.env.APP_URL || 'http://localhost:' + port}/register.html?ref=${user.referralCode}`;

    logger.info('Referral invites sent', { uid, count: validEmails.length });
    validEmails.forEach(email => {
        console.log(`[MOCK EMAIL] To: ${email} | Subject: Join LeadGenPro | Body: Hey, join me on LeadGenPro using my link: ${referralLink}`);
    });

    return res.json({ message: `Successfully sent ${validEmails.length} invites!` });
});

/**
 * MULTI-TENANT: Get a user's private data directory, creating it if needed.
 */
function getUserDataDir(userId) {
    const dir = path.join(dataDir, 'users', userId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * Utility: Find the latest lead file or return a specific one (USER-SCOPED)
 */
function getLeadsPath(userId, specificFile = null) {
    // Legacy fallback: also check root /data for initial setup
    const userDir = getUserDataDir(userId);

    if (specificFile) {
        // User-scoped first
        const userPath = path.join(userDir, specificFile);
        if (fs.existsSync(userPath)) return userPath;
        // Legacy root fallback (read-only migration support)
        const rootPath = path.join(dataDir, specificFile);
        if (fs.existsSync(rootPath)) return rootPath;
        return null;
    }

    const userFiles = fs.readdirSync(userDir);
    const enriched = userFiles.filter(f => f.startsWith('enriched_')).sort();
    const raw = userFiles.filter(f => f.startsWith('leads_')).sort();
    if (enriched.length > 0) return path.join(userDir, enriched[enriched.length - 1]);
    if (raw.length > 0) return path.join(userDir, raw[raw.length - 1]);

    // Legacy fallback: show root data if user has nothing yet
    if (fs.existsSync(dataDir)) {
        const rootFiles = fs.readdirSync(dataDir);
        const rootEnriched = rootFiles.filter(f => f.startsWith('enriched_')).sort();
        if (rootEnriched.length > 0) return path.join(dataDir, rootEnriched[rootEnriched.length - 1]);
    }
    return null;
}

/**
 * Utility: Safely load email tracking data (USER-SCOPED)
 */
function getTrackingData(userId) {
    const trackingFile = path.join(getUserDataDir(userId), 'email_tracking.json');
    if (fs.existsSync(trackingFile)) return JSON.parse(fs.readFileSync(trackingFile, 'utf8'));
    return {};
}

/**
 * Utility: Safely load email click data (USER-SCOPED)
 */
function getClickData(userId) {
    const clickFile = path.join(getUserDataDir(userId), 'email_clicks.json');
    if (fs.existsSync(clickFile)) return JSON.parse(fs.readFileSync(clickFile, 'utf8'));
    return {};
}

/**
 * Utility: Log Lead Activity Event (USER-SCOPED)
 */
function logActivity(userId, leadId, event, metadata = {}) {
    const activityFile = path.join(getUserDataDir(userId), 'lead_activity.json');
    let activities = [];
    if (fs.existsSync(activityFile)) activities = JSON.parse(fs.readFileSync(activityFile, 'utf8'));
    activities.push({ leadId, event, timestamp: new Date().toISOString(), metadata });
    fs.writeFileSync(activityFile, JSON.stringify(activities, null, 2));
}

/**
 * Utility: Safely load follow-up queue (USER-SCOPED)
 */
function getFollowupQueue(userId) {
    const qFile = path.join(getUserDataDir(userId), 'followup_queue.json');
    if (fs.existsSync(qFile)) return JSON.parse(fs.readFileSync(qFile, 'utf8'));
    return [];
}

function saveFollowupQueue(userId, queue) {
    const qFile = path.join(getUserDataDir(userId), 'followup_queue.json');
    fs.writeFileSync(qFile, JSON.stringify(queue, null, 2));
}

/**
 * Utility: Safely load email sending queue (USER-SCOPED)
 */
function getEmailQueue(userId) {
    const qFile = path.join(getUserDataDir(userId), 'email_queue.json');
    if (fs.existsSync(qFile)) return JSON.parse(fs.readFileSync(qFile, 'utf8'));
    return [];
}

function saveEmailQueue(userId, queue) {
    const qFile = path.join(getUserDataDir(userId), 'email_queue.json');
    fs.writeFileSync(qFile, JSON.stringify(queue, null, 2));
}

/**
 * Utility: Calculate total leads currently stored for a user
 */
function getUserLeadCount(userId) {
    const userDir = getUserDataDir(userId);
    if (!fs.existsSync(userDir)) return 0;
    const files = fs.readdirSync(userDir).filter(f => f.startsWith('leads_') || f.startsWith('enriched_'));
    let total = 0;
    files.forEach(f => {
        try {
            const leads = JSON.parse(fs.readFileSync(path.join(userDir, f), 'utf8'));
            total += (Array.isArray(leads) ? leads.length : 0);
        } catch (e) { }
    });
    return total;
}

/**
 * Utility: Get all registered user IDs (for background schedulers)
 */
function getAllUserIds() {
    const usersDir = path.join(dataDir, 'users');
    if (!fs.existsSync(usersDir)) return [];
    return fs.readdirSync(usersDir).filter(f =>
        fs.statSync(path.join(usersDir, f)).isDirectory()
    );
}

/**
 * API: List all available campaign batches (USER-SCOPED)
 */
app.get('/api/campaigns', requireAuth, (req, res) => {
    const uid = req.user.id;
    const userDir = getUserDataDir(uid);
    const files = fs.readdirSync(userDir)
        .filter(f => f.startsWith('enriched_leads_'))
        .sort().reverse();
    return res.json({ campaigns: files });
});

/**
 * API: Get detailed Campaign Statistics (USER-SCOPED)
 * Cached for 10 min per user — invalidated on any data-mutating action.
 */
app.get('/api/campaign-stats', requireAuth,
    cacheMiddleware(req => campaignStatsKey(req.user.id)),
    (req, res) => {
    const uid = req.user.id;
    const userDir = getUserDataDir(uid);
    const trackingData = getTrackingData(uid);

    const files = fs.readdirSync(userDir)
        .filter(f => f.startsWith('enriched_leads_'))
        .sort().reverse();

    const campaigns = files.map(file => {
        const leads = JSON.parse(fs.readFileSync(path.join(userDir, file), 'utf8'));
        const total = leads.length;
        const sent = leads.filter(l => l.status === 'Contacted' || l.status === 'Qualified').length;
        let opens = 0;
        leads.forEach(l => {
            const id = l.id || encodeURIComponent(l.title || l.name || 'your business');
            if (trackingData[id]) opens++;
        });
        let match = file.match(/_([0-9]+)\.json$/);
        let name = 'Unknown Campaign';
        if (match) {
            const date = new Date(parseInt(match[1]));
            name = `Batch: ${date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
        }
        let status = 'Draft';
        if (sent > 0 && sent < total) status = 'Running';
        if (sent > 0 && sent >= total) status = 'Completed';
        return { name, file, total, sent, opens, openRate: sent > 0 ? Math.round((opens / sent) * 100) : 0, status };
    });
    return res.json({ campaigns });
});

/**
 * API: Get all leads and aggregate stats (USER-SCOPED)
 * Cached per user+file for 10 min. Invalidated when data changes.
 */
app.get('/api/leads', requireAuth, leadsLimiter,
    cacheMiddleware(req => leadsKey(req.user.id, req.query.file || '')),
    (req, res) => {
    const uid = req.user.id;
    const targetPath = getLeadsPath(uid, req.query.file);
    if (!targetPath) {
        return res.json({ leads: [], stats: { total: 0, withEmails: 0, sent: 0, qualified: 0 } });
    }

    try {
        const leads = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        const trackingData = getTrackingData(uid);
        const clickData = getClickData(uid);
        const queueData = getEmailQueue(uid);

        const stats = {
            total: leads.length,
            withEmails: leads.filter(l => l.email).length,
            sent: leads.filter(l => l.status === 'Contacted').length,
            qualified: leads.filter(l => l.status === 'Qualified').length
        };

        const leadsWithIdsAndScores = leads.map((l, i) => {
            const scoreData = calculateLeadScore(l);
            const id = l.id || `lead-${i}`;
            const trackingId = l.id || encodeURIComponent(l.title || l.name || 'your business');
            const queuedItem = queueData.find(q => q.leadId === id || q.leadId === trackingId);
            const queueStatus = queuedItem ? (queuedItem.status.charAt(0).toUpperCase() + queuedItem.status.slice(1)) : 'None';
            return {
                ...l,
                id: id,
                status: l.status || 'New',
                score: scoreData.score,
                scoreTier: scoreData.tier,
                scoreReasons: scoreData.reasons,
                opened: !!trackingData[trackingId] || !!trackingData[id],
                clicked: !!clickData[trackingId] || !!clickData[id],
                followUp: l.followUpStatus || (l.status === 'Contacted' ? 'Scheduled' : 'None'),
                queue: queueStatus,
                websiteHealth: l.websiteAnalysis ? l.websiteAnalysis.health : '—'
            };
        }).sort((a, b) => b.score - a.score);

        return res.json({ leads: leadsWithIdsAndScores, stats });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read data file' });
    }
});
/**
 * API: AI Lead Insights — score breakdown + insight text (USER-SCOPED)
 */
app.post('/api/ai-insights', requireAuth, aiLimiter, async (req, res) => {
    const { lead } = req.body;
    if (!lead) return res.status(400).json({ error: 'Lead object required' });

    try {
        const scoreData = calculateLeadScore(lead);
        const insight = await generateLeadInsight(lead);

        res.json({
            score: scoreData.score,
            tier: scoreData.tier,
            scoreReasons: scoreData.reasons,
            insight
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * API: AI Email Optimization — suggest improvements (USER-SCOPED)
 */
app.post('/api/email-optimize', requireAuth, aiLimiter, async (req, res) => {
    const { emailDraft, lead } = req.body;
    if (!emailDraft || !lead) return res.status(400).json({ error: 'emailDraft and lead are required' });

    try {
        const result = await optimizeEmail(emailDraft, lead);
        return res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * API: Update Lead Status (USER-SCOPED)
 */
app.post('/api/leads/status', requireAuth, (req, res) => {
    const uid = req.user.id;
    const { leadId, status, file } = req.body;
    const targetPath = getLeadsPath(uid, file);
    if (!targetPath) return res.status(404).json({ error: 'No data file found' });

    // 403 guard: verify the resolved path is within the user's directory
    const userDir = getUserDataDir(uid);
    if (!targetPath.startsWith(userDir) && !targetPath.startsWith(dataDir)) {
        return res.status(403).json({ error: 'Forbidden: access denied' });
    }

    try {
        const leads = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        const updatedLeads = leads.map((l, i) => {
            const currentId = l.id || `lead-${i}`;
            const trackingId = l.id || encodeURIComponent(l.title || l.name || 'your business');
            const targetIdToCheck = currentId === leadId ? currentId : trackingId;
            if (currentId === leadId || l.name === leadId) {
                if (l.status !== status) {
                    if (status === 'Contacted') {
                        logActivity(uid, targetIdToCheck, 'email_sent', { status, file });
                        const queue = getFollowupQueue(uid);
                        const nextSendStr = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
                        if (!queue.find(q => q.leadId === targetIdToCheck)) {
                            queue.push({ leadId: targetIdToCheck, campaign: file, step: 1, nextSend: nextSendStr });
                            saveFollowupQueue(uid, queue);
                        }
                    } else {
                        logActivity(uid, targetIdToCheck, `status_updated_to_${status.toLowerCase()}`, { file });
                    }
                }
                return { ...l, status };
            }
            return l;
        });
        fs.writeFileSync(targetPath, JSON.stringify(updatedLeads, null, 2));
        invalidateUserCache(uid); // bust stale leads cache
        return res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

/**
 * API: Trigger CLI Action (Stream Output)
 * 'find' actions are deduplicated — identical concurrent searches are blocked.
 */
app.post('/api/action', requireAuth, leadsLimiter, deduplicateSearch, (req, res) => {
    const { action, category, location, campaignName } = req.body;
    const uid = req.user.id;
    const limits = getPlanLimits(uid);

    // ── Input Validation for 'find' action ──
    const VALID_ACTIONS = ['find', 'enrich', 'mock', 'mail', 'send'];
    if (!action || !VALID_ACTIONS.includes(action)) {
        return res.status(400).json({ error: 'Invalid action specified.' });
    }

    if (action === 'find') {
        const catCheck = validateCategory(category);
        const locCheck = validateLocation(location);
        if (!catCheck.valid) return res.status(400).json({ error: catCheck.error });
        if (!locCheck.valid) return res.status(400).json({ error: locCheck.error });

        if (campaignName) {
            const nameCheck = validateCampaignName(campaignName);
            if (!nameCheck.valid) return res.status(400).json({ error: nameCheck.error });
        }
    }

    logger.info('Action triggered', { uid, action, category, location, plan: limits.plan });

    // Lead Discovery Limitation (Monthly Usage Check)
    if (action === 'find') {
        const usage = getUsage(uid);
        if (usage.leadsGenerated >= limits.maxLeads) {
            logger.warn('Monthly lead limit hit', { uid, limit: limits.maxLeads });
            return res.status(403).json({ error: 'Monthly lead limit reached. Upgrade your plan to discover more leads.' });
        }
    }

    // AI Personalization Limitation
    if (action === 'enrich' || action === 'mail') {
        if (!limits.features.ai && limits.plan === 'free') {
            return res.status(403).json({ error: 'AI Personalization is not available on the Free plan. Please upgrade.' });
        }
    }

    // Automation Limitation (Queueing)
    if (action === 'send') {
        if (!limits.features.automation && limits.plan === 'free') {
            return res.status(403).json({ error: 'Campaign automation is only available on Pro plans.' });
        }
    }

    const actionMap = {
        'find': ['src/index.js', 'find'],
        'enrich': ['src/index.js', 'enrich'],
        'mock': ['src/index.js', 'mock'],
        'mail': ['src/index.js', 'mail'],
        'send': ['src/index.js', 'send']
    };

    // Append sanitised arguments for 'find' action
    const args = [...actionMap[action]];
    if (action === 'find') {
        const catClean = validateCategory(category).value;
        const locClean = validateLocation(location).value;
        if (catClean) args.push(catClean);
        if (locClean) args.push(locClean);
        if (campaignName && validateCampaignName(campaignName).valid) args.push(campaignName);
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const env = Object.assign({}, process.env, {
        USER_DATA_DIR: getUserDataDir(uid),
        APP_UID: uid
    });

    const cmd = spawn(process.execPath, args, { cwd: __dirname, env });

    let stdoutBuffer = '';
    cmd.stdout.on('data', (data) => {
        const text = data.toString();
        stdoutBuffer += text;
        res.write(text);
    });

    cmd.stderr.on('data', (data) => {
        res.write(`[Error] ${data.toString()}`);
    });

    cmd.on('close', (code) => {
        // Post-processing: track stats and invalidate stale caches
        if (action === 'find' && code === 0) {
            const match = stdoutBuffer.match(/Found (\d+) total businesses/);
            if (match) {
                const count = parseInt(match[1]);
                incrementUsage(uid, count);
                trackEvent(uid, 'lead_search', { category, location, count });
                if (campaignName) {
                    trackEvent(uid, 'campaign_created', { name: campaignName });
                }
            }
        }
        // Bust user cache after any successful mutating action
        if (code === 0) invalidateUserCache(uid);
        // Release the in-flight deduplicate lock
        releaseSearch(req._dedupeKey);
        res.write(`\n>>> Action completed with code ${code} <<<\n`);
        return res.end();
    });
});

/**
 * API: Render Email Preview (USER-SCOPED)
 */
app.post('/api/preview', requireAuth, async (req, res) => {
    const uid = req.user.id;
    const { lead, campaign } = req.body;
    if (!lead) return res.status(400).json({ error: 'Lead required' });

    if (!lead.aiHook) {
        lead.aiHook = await generatePersonalizedHook(lead);
        trackEvent(uid, 'email_generated', { leadId: lead.id || lead.name, campaign });
        const targetPath = getLeadsPath(uid, campaign);
        if (targetPath && fs.existsSync(targetPath)) {
            try {
                const leads = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
                const index = leads.findIndex(l => (l.id === lead.id || l.name === lead.name));
                if (index !== -1) {
                    leads[index].aiHook = lead.aiHook;
                    fs.writeFileSync(targetPath, JSON.stringify(leads, null, 2));
                }
            } catch (err) { console.error('Failed to cache AI hook:', err); }
        }
    }
    const content = generateEmailContent(lead, campaign || 'default', uid);
    return res.json(content);
});

/**
 * API: Analyze a single lead's website on demand (USER-SCOPED)
 */
app.post('/api/analyze', requireAuth, async (req, res) => {
    const uid = req.user.id;
    const { leadId, url, file } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const analysis = await analyzeWebsite(url);
    const targetPath = getLeadsPath(uid, file);
    if (targetPath && fs.existsSync(targetPath)) {
        try {
            const leads = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
            const idx = leads.findIndex(l => l.id === leadId || l.name === leadId);
            if (idx !== -1) {
                leads[idx].websiteAnalysis = analysis;
                fs.writeFileSync(targetPath, JSON.stringify(leads, null, 2));
            }
        } catch (err) { console.error('Failed to save website analysis:', err); }
    }
    return res.json(analysis);
});

/**
 * API: Bulk analyze all leads in a campaign file (USER-SCOPED)
 */
app.post('/api/analyze-bulk', requireAuth, async (req, res) => {
    const uid = req.user.id;
    const { getPlanLimits } = require('./src/billing');
    const limits = getPlanLimits(uid);

    if (!limits.features.ai) {
        return res.status(403).json({ error: 'Website Analysis (AI) is not available on your current plan.' });
    }

    const { file } = req.body;
    const targetPath = getLeadsPath(uid, file);
    if (!targetPath) return res.status(404).json({ error: 'File not found' });

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' });
    try {
        const leads = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        let analyzed = 0;
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            const url = lead.website;
            if (!url || lead.websiteAnalysis) {
                res.write(`[Skip] ${lead.name || lead.title} — already analyzed or no URL\n`);
                continue;
            }
            res.write(`[Analyzing] ${lead.name || lead.title} → ${url}\n`);
            const analysis = await analyzeWebsite(url);
            leads[i].websiteAnalysis = analysis;
            analyzed++;
        }
        fs.writeFileSync(targetPath, JSON.stringify(leads, null, 2));
        res.write(`\n✅ Done. Analyzed ${analyzed} websites.\n`);
    } catch (err) {
        res.write(`[Error] ${err.message}\n`);
    }
    return res.end();
});

/**
 * TRACKING: Webhook for 1x1 Pixel
 */
app.get('/track/open', (req, res) => {
    const { leadId, campaign, uid } = req.query;
    if (leadId && uid) {
        const userDir = getUserDataDir(uid);
        const trackingFile = path.join(userDir, 'email_tracking.json');
        let trackingData = getTrackingData(uid);
        trackingData[leadId] = { opened: true, openedAt: new Date().toISOString(), campaign };
        fs.writeFileSync(trackingFile, JSON.stringify(trackingData, null, 2));
        console.log(`[Tracking] Email opened for lead: ${decodeURIComponent(leadId)} by user: ${uid}`);
        logActivity(uid, leadId, 'email_opened', { campaign });
    }

    // Return a 1x1 transparent GIF
    const buf = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': buf.length
    });
    return res.end(buf);
});

/**
 * TRACKING: Webhook for Link Clicks
 */
app.get('/track/click', (req, res) => {
    const { leadId, campaign, url, uid } = req.query;
    if (leadId && url && uid) {
        const userDir = getUserDataDir(uid);
        const clickFile = path.join(userDir, 'email_clicks.json');
        let clickData = getClickData(uid);
        if (!clickData[leadId]) {
            clickData[leadId] = [];
        }
        clickData[leadId].push({ clicked: true, clickedAt: new Date().toISOString(), campaign, url });
        fs.writeFileSync(clickFile, JSON.stringify(clickData, null, 2));
        console.log(`[Tracking] Link clicked by lead: ${decodeURIComponent(leadId)} -> ${url} (User: ${uid})`);
        logActivity(uid, leadId, 'link_clicked', { campaign, url });
    }

    // Redirect user to original URL
    return res.redirect(url || '/');
});

/**
 * API: Get Lead Activity (USER-SCOPED)
 */
app.get('/api/lead/:id/activity', requireAuth, (req, res) => {
    const uid = req.user.id;
    const leadId = req.params.id;
    const activityFile = path.join(getUserDataDir(uid), 'lead_activity.json');
    let activities = [];
    if (fs.existsSync(activityFile)) {
        activities = JSON.parse(fs.readFileSync(activityFile, 'utf8'));
    }
    const leadActivities = activities.filter(a => a.leadId === leadId || a.leadId === encodeURIComponent(leadId));
    leadActivities.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return res.json({ activities: leadActivities });
});

app.get('/health', (req, res) => {
    res.json({
        status: "ok",
        service: "LeadGenPro",
        timestamp: new Date().toISOString()
    });
});



/**
 * SCHEDULER: Background Follow-up Automation (iterates ALL users)
 */
setInterval(async () => {
    const { getPlanLimits } = require('./src/billing');
    for (const uid of getAllUserIds()) {
        const limits = getPlanLimits(uid);
        if (!limits.features.automation) continue; // Skip if plan doesn't support automation

        const queue = getFollowupQueue(uid);
        if (queue.length === 0) continue;
        let queueChanged = false;
        const now = new Date();
        for (let i = queue.length - 1; i >= 0; i--) {
            const item = queue[i];
            if (new Date(item.nextSend) <= now) {
                const filePath = getLeadsPath(uid, item.campaign);
                if (!filePath || !fs.existsSync(filePath)) {
                    queue.splice(i, 1); queueChanged = true; continue;
                }
                const leads = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const leadIndex = leads.findIndex(l => {
                    const cid = l.id || '';
                    const tid = encodeURIComponent(l.title || l.name || 'your business');
                    return cid === item.leadId || tid === item.leadId || l.name === item.leadId;
                });
                if (leadIndex === -1) { queue.splice(i, 1); queueChanged = true; continue; }
                const lead = leads[leadIndex];
                if (['Qualified', 'Replied', 'Closed'].includes(lead.status)) {
                    queue.splice(i, 1); queueChanged = true; continue;
                }
                try {
                    await sendFollowUpEmail(lead, item.step, item.campaign, false, uid);
                    logActivity(uid, item.leadId, `followup_${item.step}_sent`, { step: item.step, campaign: item.campaign });
                    lead.followUpStatus = `Follow-up #${item.step} sent`;
                    fs.writeFileSync(filePath, JSON.stringify(leads, null, 2));
                    if (item.step === 1) {
                        item.step = 2;
                        item.nextSend = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
                    } else { queue.splice(i, 1); }
                    queueChanged = true;
                } catch (err) { console.error(`Scheduler Error on ${item.leadId}:`, err); }
            }
        }
        if (queueChanged) saveFollowupQueue(uid, queue);
    }
}, 60 * 1000);

/**
 * CONFIGURATION: Rate Limiting mimicking human behavior
 */
const SEND_CONFIG = {
    emailsPerBatch: 10,
    delayBetweenBatches: 10 * 60 * 1000 // 10 minutes
};

/**
 * SCHEDULER: Email Sending Queue Processor (iterates ALL users)
 */
setInterval(async () => {
    const { getPlanLimits } = require('./src/billing');
    for (const uid of getAllUserIds()) {
        const limits = getPlanLimits(uid);
        if (!limits.features.automation && limits.plan === 'free') continue; // Only Pro/Agency get background queueing

        const queue = getEmailQueue(uid);
        const pendingEmails = queue.filter(q => q.status === 'pending' && new Date(q.scheduledSend) <= new Date());
        if (pendingEmails.length === 0) continue;

        let queueChanged = false;
        const emailsToProcess = pendingEmails.slice(0, SEND_CONFIG.emailsPerBatch);
        console.log(`[Batch Processor] User ${uid}: Processing ${emailsToProcess.length} emails...`);

        for (const item of emailsToProcess) {
            const filePath = getLeadsPath(uid, item.campaign);
            if (!filePath || !fs.existsSync(filePath)) {
                item.status = 'failed'; queueChanged = true; continue;
            }
            const leads = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const leadIndex = leads.findIndex(l => {
                const cid = l.id || '';
                const tid = encodeURIComponent(l.title || l.name || 'your business');
                return cid === item.leadId || tid === item.leadId || l.name === item.leadId;
            });
            if (leadIndex !== -1) {
                const lead = leads[leadIndex];
                try {
                    if (!lead.aiHook) {
                        console.log(`[AI] Generating hook for ${lead.title || lead.name}...`);
                        lead.aiHook = await generatePersonalizedHook(lead);
                        trackEvent(uid, 'email_generated', { leadId: item.leadId, campaign: item.campaign, via: 'scheduler' });
                    }
                    item.status = 'sending';
                    saveEmailQueue(uid, queue);
                    await sendOutreachEmail(lead, false, item.campaign, uid);
                    item.status = 'sent';
                    queueChanged = true;
                    if (lead.status === 'New') {
                        lead.status = 'Contacted';
                        fs.writeFileSync(filePath, JSON.stringify(leads, null, 2));
                        logActivity(uid, item.leadId, 'email_sent', { status: 'Contacted', campaign: item.campaign });
                        const followupQueue = getFollowupQueue(uid);
                        const nextSendStr = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
                        if (!followupQueue.find(q => q.leadId === item.leadId)) {
                            followupQueue.push({ leadId: item.leadId, campaign: item.campaign, step: 1, nextSend: nextSendStr });
                            saveFollowupQueue(uid, followupQueue);
                        }
                    }
                } catch (err) {
                    console.error(`Email queue error for user ${uid} lead ${item.leadId}:`, err);
                    item.status = 'failed'; queueChanged = true;
                }
            } else {
                item.status = 'failed_missing'; queueChanged = true;
            }
        }
        if (queueChanged) saveEmailQueue(uid, queue);
    }
}, SEND_CONFIG.delayBetweenBatches);

/**
 * Global Error Handler (structured + production-safe)
 */
app.use(productionErrorHandler);

/**
 * API: Export leads as CSV (USER-SCOPED)
 */
app.get('/api/leads/export', requireAuth, (req, res) => {
    const uid = req.user.id;
    const targetPath = getLeadsPath(uid, req.query.file || '');
    if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).json({ error: 'No lead data found to export.' });
    }

    try {
        const leads = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        if (!leads.length) return res.status(404).json({ error: 'No leads to export.' });

        // Build CSV
        const headers = ['Name', 'Email', 'Phone', 'Website', 'Category', 'City', 'Score', 'Status', 'Opened', 'Clicked', 'Follow-Up'];
        const rows = leads.map(l => [
            (l.name  || l.title  || '').replace(/,/g, ' '),
            (l.email || '').replace(/,/g, ' '),
            (l.phone || '').replace(/,/g, ' '),
            (l.website || '').replace(/,/g, ' '),
            (l.category || '').replace(/,/g, ' '),
            (l.city || '').replace(/,/g, ' '),
            l.score || 0,
            l.status || 'New',
            l.opened ? 'Yes' : 'No',
            l.clicked ? 'Yes' : 'No',
            l.followUpStatus || 'None',
        ]);

        const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(',')).join('\r\n');
        const filename = `leadgenpro-leads-${Date.now()}.csv`;

        logger.info('CSV export', { uid, rows: rows.length });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv); // BOM for Excel UTF-8 compatibility
    } catch (err) {
        res.status(500).json({ error: 'Failed to export leads.' });
    }
});

app.listen(port, () => {
    console.log(`\n=======================================`);
    console.log(`🚀 LeadGen Pro Backend Live on port ${port}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📄 Legal pages: /privacy.html | /terms.html | /refund.html | /contact.html`);
    console.log(`📊 Admin: /admin.html | /admin/analytics | /admin/revenue | /admin/referrals`);
    console.log(`=======================================\n`);
    // Start daily backup scheduler
    startBackupScheduler();
});
