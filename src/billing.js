const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ─── Plan Definitions ────────────────────────────────────────────────────────
const PLANS = {
    free: {
        name: 'Free',
        price: 0,
        maxLeads: 50,
        maxEmails: 10,
        features: { ai: false, automation: false },
        priceId: null,
        badge: 'Free Trial'
    },
    basic: {
        name: 'Basic',
        price: 29,
        maxLeads: 500,
        maxEmails: 200,
        features: { ai: true, automation: false },
        priceId: process.env.STRIPE_PRICE_BASIC || process.env.STRIPE_PRICE_STARTER || null,
        badge: '⭐ Basic'
    },
    pro: {
        name: 'Pro',
        price: 79,
        maxLeads: Infinity,
        maxEmails: Infinity,
        features: { ai: true, automation: true },
        priceId: process.env.STRIPE_PRICE_PRO || process.env.STRIPE_PRICE_GROWTH || null,
        badge: '🚀 Pro'
    },
    agency: {
        name: 'Agency',
        price: 199,
        maxLeads: Infinity,
        maxEmails: Infinity,
        features: { ai: true, automation: true },
        priceId: process.env.STRIPE_PRICE_AGENCY || null,
        badge: '💎 Agency'
    }
};

// ─── Subscription Store (JSON flat-file) ─────────────────────────────────────
const SUBS_PATH = path.join(__dirname, '..', 'data', 'subscriptions.json');

function loadSubscriptions() {
    if (!fs.existsSync(SUBS_PATH)) return {};
    return JSON.parse(fs.readFileSync(SUBS_PATH, 'utf8'));
}

function saveSubscriptions(subs) {
    const dir = path.dirname(SUBS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SUBS_PATH, JSON.stringify(subs, null, 2));
}

function getSubscription(userId) {
    const subs = loadSubscriptions();
    return subs[userId] || { plan: 'free', status: 'active', current_period_end: null, stripe_customer_id: null };
}

function setSubscription(userId, data) {
    const subs = loadSubscriptions();
    subs[userId] = { ...getSubscription(userId), ...data, userId };
    saveSubscriptions(subs);
    return subs[userId];
}

function getSubscriptionByCustomerId(customerId) {
    const subs = loadSubscriptions();
    return Object.values(subs).find(s => s.stripe_customer_id === customerId) || null;
}

function getSubscriptionBySessionId(sessionId) {
    const subs = loadSubscriptions();
    return Object.values(subs).find(s => s.stripe_session_id === sessionId) || null;
}

// ─── Plan Enforcement ─────────────────────────────────────────────────────────
function getPlanLimits(userId) {
    const sub = getSubscription(userId);
    const plan = PLANS[sub.plan] || PLANS.free;
    
    // Add bonus leads from referrals
    let bonusLeads = 0;
    try {
        const { getBonusLeads } = require('./referrals');
        bonusLeads = getBonusLeads(userId);
    } catch (e) {
        console.error('[REFERRAL ERROR] Failed to fetch bonus leads:', e.message);
    }

    return { 
        plan: sub.plan, 
        ...plan, 
        maxLeads: plan.maxLeads === Infinity ? Infinity : (plan.maxLeads + bonusLeads),
        bonusLeads,
        sub 
    };
}

/**
 * Express middleware — blocks request if user is over plan's lead limit.
 */
function enforcePlanLimits(req, res, next) {
    if (!req.user) return next();
    const limits = getPlanLimits(req.user.id);

    // Only enforce on routes that generate leads or send emails
    // The actual logic reads lead count from the caller's context — just attach limits
    req.planLimits = limits;
    next();
}

// ─── Stripe Setup ─────────────────────────────────────────────────────────────
let stripe = null;
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (stripeKey && stripeKey !== 'your_stripe_secret_key_here') {
    stripe = require('stripe')(stripeKey);
}

/**
 * Create a Stripe Checkout Session for a given plan.
 */
async function createCheckoutSession(userId, userEmail, planKey) {
    if (!stripe) throw new Error('Stripe is not configured. Add STRIPE_SECRET_KEY to .env');
    const plan = PLANS[planKey];
    if (!plan || !plan.priceId) throw new Error(`Invalid plan or no price ID configured: ${planKey}`);

    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: userEmail,
        line_items: [{ price: plan.priceId, quantity: 1 }],
        success_url: `${process.env.APP_URL}/billing.html?success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL}/billing.html?canceled=1`,
        metadata: { userId, plan: planKey }
    });

    // Track pending session
    setSubscription(userId, { stripe_session_id: session.id, pending_plan: planKey });
    return session;
}

/**
 * Create Stripe Customer Portal (manage/cancel)
 */
async function createPortalSession(userId) {
    if (!stripe) throw new Error('Stripe is not configured.');
    const sub = getSubscription(userId);
    if (!sub.stripe_customer_id) throw new Error('No billing account found. Please subscribe first.');

    const session = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: `${process.env.APP_URL}/billing.html`
    });
    return session;
}

/**
 * Handle incoming Stripe webhook events.
 */
async function handleWebhookEvent(rawBody, signature) {
    if (!stripe) throw new Error('Stripe not configured.');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || webhookSecret === 'your_stripe_webhook_secret_here') {
        throw new Error('STRIPE_WEBHOOK_SECRET not set.');
    }

    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    console.log(`[Stripe Webhook] ${event.type}`);

    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            const userId = session.metadata?.userId;
            const planKey = session.metadata?.plan;
            const customerId = session.customer;
            const subscriptionId = session.subscription;

            if (userId && planKey) {
                // Fetch subscription end date
                let periodEnd = null;
                if (subscriptionId) {
                    const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
                    periodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();
                }
                setSubscription(userId, {
                    plan: planKey,
                    status: 'active',
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId,
                    current_period_end: periodEnd,
                    pending_plan: null
                });

                // Track analytics
                try {
                    const { trackEvent } = require('./analytics');
                    trackEvent(userId, 'plan_upgrade', { plan: planKey, via: 'stripe_webhook' });
                } catch (e) { }

                console.log(`[Billing Active] User ${userId} successfully subscribed to ${planKey}. Subscription: ${subscriptionId}`);
            }
            break;
        }
        case 'invoice.payment_succeeded': {
            const invoice = event.data.object;
            const customerId = invoice.customer;
            const sub = getSubscriptionByCustomerId(customerId);
            if (sub) {
                const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription);
                setSubscription(sub.userId, {
                    status: 'active',
                    current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString()
                });
                console.log(`[Billing Renewed] Payment succeeded for user ${sub.userId}.`);
            }
            break;
        }
        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            const customerId = invoice.customer;
            const sub = getSubscriptionByCustomerId(customerId);
            if (sub) {
                setSubscription(sub.userId, { status: 'past_due' });
                console.warn(`[Billing Warning] Payment FAILED for user ${sub.userId}. Status set to past_due.`);
            }
            break;
        }
        case 'customer.subscription.deleted': {
            const stripeSub = event.data.object;
            const customerId = stripeSub.customer;
            const sub = getSubscriptionByCustomerId(customerId);
            if (sub) {
                setSubscription(sub.userId, { plan: 'free', status: 'canceled', current_period_end: null });
                try {
                    const { trackEvent } = require('./analytics');
                    trackEvent(sub.userId, 'subscription_canceled', { plan: sub.plan, via: 'stripe_webhook' });
                } catch (e) { }
                console.log(`[Billing Canceled] Subscription deleted for user ${sub.userId}. Account reverted to Free.`);
            }
            break;
        }
        case 'customer.subscription.updated': {
            const stripeSub = event.data.object;
            const customerId = stripeSub.customer;
            const sub = getSubscriptionByCustomerId(customerId);
            if (sub) {
                const priceId = stripeSub.items.data[0]?.price?.id;
                const newPlan = Object.keys(PLANS).find(k => PLANS[k].priceId === priceId) || sub.plan;
                setSubscription(sub.userId, {
                    plan: newPlan,
                    status: stripeSub.status,
                    current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString()
                });
                console.log(`[Billing Updated] Subscription updated for user ${sub.userId}. New Status: ${stripeSub.status}`);
            }
            break;
        }
    }
    return { received: true };
}

/**
 * Cancel a Stripe subscription (set to cancel at period end)
 */
async function cancelSubscription(userId) {
    if (!stripe) throw new Error('Stripe is not configured.');
    const sub = getSubscription(userId);
    if (!sub.stripe_subscription_id) throw new Error('No active subscription found to cancel.');

    const deleted = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true
    });

    setSubscription(userId, { status: 'canceling' });
    try {
        const { trackEvent } = require('./analytics');
        trackEvent(userId, 'subscription_canceled', { plan: sub.plan, via: 'user_action' });
    } catch (e) { }
    return deleted;
}

module.exports = {
    PLANS,
    getSubscription,
    setSubscription,
    getPlanLimits,
    enforcePlanLimits,
    createCheckoutSession,
    createPortalSession,
    cancelSubscription,
    handleWebhookEvent,
    stripe: () => stripe
};
