/**
 * security.js — LeadGenPro SaaS Platform
 * Centralised security hardening:
 *   • Rate limiters (per route group)
 *   • Input validation / sanitisation helpers
 *   • Structured Winston logger
 *   • Production-safe error handler
 */

const rateLimit = require('express-rate-limit');
const validator = require('validator');
const winston   = require('winston');
const path      = require('path');
const fs        = require('fs');

// ─── LOGGER SETUP ────────────────────────────────────────────────────────────
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'leadgenpro' },
    transports: [
        // Error-only file
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5 * 1024 * 1024,   // 5 MB
            maxFiles: 5,
        }),
        // Combined log (all levels)
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 10 * 1024 * 1024,  // 10 MB
            maxFiles: 10,
        }),
        // Security-specific audit log
        new winston.transports.File({
            filename: path.join(logsDir, 'security.log'),
            level: 'warn',
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
        }),
    ],
});

// In development, also log to console in a readable format
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
                return `${timestamp} [${level}] ${message}${metaStr}`;
            })
        )
    }));
}

// ─── RATE LIMITERS ───────────────────────────────────────────────────────────

/** Auth endpoints: login / register — strict */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15-minute window
    max: 20,                     // 20 attempts per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
    handler(req, res, next, options) {
        logger.warn('Auth rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            method: req.method,
        });
        res.status(429).json(options.message);
    }
});

/** Leads / scraping endpoints — moderate */
const leadsLimiter = rateLimit({
    windowMs: 60 * 1000,         // 1-minute window
    max: 30,                     // 30 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many lead requests. Please slow down.' },
    handler(req, res, next, options) {
        logger.warn('Leads rate limit exceeded', {
            ip: req.ip,
            user: req.user?.id,
            path: req.path,
        });
        res.status(429).json(options.message);
    }
});

/** Subscription / billing endpoints — moderate */
const subscriptionLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,   // 10-minute window
    max: 30,                     // 30 per 10 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many billing requests. Please wait a moment.' },
    handler(req, res, next, options) {
        logger.warn('Billing rate limit exceeded', { ip: req.ip, user: req.user?.id });
        res.status(429).json(options.message);
    }
});

/** AI endpoints are expensive — very strict */
const aiLimiter = rateLimit({
    windowMs: 60 * 1000,         // 1-minute window
    max: 10,                     // 10 AI calls per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI rate limit reached. Please wait before requesting more AI insights.' },
    handler(req, res, next, options) {
        logger.warn('AI rate limit exceeded', { ip: req.ip, user: req.user?.id });
        res.status(429).json(options.message);
    }
});

/** Referral invite endpoint — anti-spam */
const inviteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1-hour window
    max: 20,                     // Max 20 invites per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Invite limit reached. You can send up to 20 invites per hour.' },
    handler(req, res, next, options) {
        logger.warn('Referral invite abuse attempt', { ip: req.ip, user: req.user?.id });
        res.status(429).json(options.message);
    }
});

/** Global catch-all for public endpoints */
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15-minute window
    max: 300,                    // 300 general requests per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Request limit exceeded. Please try again later.' },
});

// ─── INPUT VALIDATION HELPERS ─────────────────────────────────────────────────

const ALLOWED_CATEGORIES = new Set([
    'roofing', 'plumbing', 'electrician', 'hvac', 'landscaping', 'painting',
    'cleaning', 'pest control', 'real estate', 'marketing', 'accounting',
    'legal', 'dental', 'medical', 'auto repair', 'construction', 'flooring',
    'pool service', 'moving', 'photography', 'catering', 'gym', 'salon',
    'veterinary', 'childcare', 'tutoring', 'it services', 'web design',
    'insurance', 'mortgage', 'solar', 'security', 'general contractor',
    // Allow any for flexibility, but sanitise
]);

/** Validate and sanitise an outreach/business category string */
function validateCategory(value) {
    if (!value || typeof value !== 'string') return { valid: false, error: 'Category is required.' };
    const cleaned = validator.trim(value);
    if (cleaned.length < 2 || cleaned.length > 80) {
        return { valid: false, error: 'Category must be between 2 and 80 characters.' };
    }
    // Only allow letters, numbers, spaces, ampersand, hyphen
    if (!/^[a-zA-Z0-9\s&\-]+$/.test(cleaned)) {
        return { valid: false, error: 'Category contains invalid characters.' };
    }
    return { valid: true, value: cleaned };
}

/** Validate and sanitise a city / location string */
function validateLocation(value) {
    if (!value || typeof value !== 'string') return { valid: false, error: 'Location is required.' };
    const cleaned = validator.trim(value);
    if (cleaned.length < 2 || cleaned.length > 100) {
        return { valid: false, error: 'Location must be between 2 and 100 characters.' };
    }
    // Letters, numbers, spaces, commas, periods, hyphens — block script injection chars
    if (!/^[a-zA-Z0-9\s,.\-']+$/.test(cleaned)) {
        return { valid: false, error: 'Location contains invalid characters.' };
    }
    return { valid: true, value: cleaned };
}

/** Validate campaign names */
function validateCampaignName(value) {
    if (!value || typeof value !== 'string') return { valid: false, error: 'Campaign name is required.' };
    const cleaned = validator.trim(value);
    if (cleaned.length < 2 || cleaned.length > 100) {
        return { valid: false, error: 'Campaign name must be 2–100 characters.' };
    }
    if (!/^[a-zA-Z0-9\s\-_'".&]+$/.test(cleaned)) {
        return { valid: false, error: 'Campaign name contains invalid characters.' };
    }
    return { valid: true, value: cleaned };
}

/** Validate a plain email address */
function validateEmail(value) {
    if (!value || typeof value !== 'string') return { valid: false, error: 'Email is required.' };
    const cleaned = validator.trim(value).toLowerCase();
    if (!validator.isEmail(cleaned)) {
        return { valid: false, error: 'Invalid email address format.' };
    }
    if (cleaned.length > 254) {
        return { valid: false, error: 'Email address is too long.' };
    }
    return { valid: true, value: cleaned };
}

/** Validate a user's display name / full name */
function validateName(value) {
    if (!value || typeof value !== 'string') return { valid: false, error: 'Name is required.' };
    const cleaned = validator.trim(value);
    if (cleaned.length < 2 || cleaned.length > 80) {
        return { valid: false, error: 'Name must be between 2 and 80 characters.' };
    }
    if (/<[^>]*>/.test(cleaned)) {
        return { valid: false, error: 'Name contains invalid characters (HTML not allowed).' };
    }
    return { valid: true, value: cleaned };
}

// ─── HARDENED HELMET CONFIG ───────────────────────────────────────────────────

const helmetConfig = {
    // Content-Security-Policy: allow same-origin scripts + Google Fonts + Cloudflare CDN
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
            styleSrc:       ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdnjs.cloudflare.com'],
            fontSrc:        ["'self'", 'fonts.gstatic.com', 'cdnjs.cloudflare.com'],
            imgSrc:         ["'self'", 'data:', 'https:'],
            connectSrc:     ["'self'"],
            frameSrc:       ["'none'"],
            objectSrc:      ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
    },
    // Prevent clickjacking — no iframes
    frameguard: { action: 'deny' },
    // Strict HTTPS in production
    hsts: process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    // Disable MIME-type sniffing
    noSniff: true,
    // Enable XSS filter in older browsers
    xssFilter: true,
    // Hide Express fingerprint
    hidePoweredBy: true,
    // Deny cross-origin embedding
    crossOriginEmbedderPolicy: false,     // relaxed for CDN assets
    crossOriginResourcePolicy: { policy: 'cross-origin' },
};

// ─── PRODUCTION-SAFE ERROR HANDLER ───────────────────────────────────────────

function productionErrorHandler(err, req, res, next) {
    const statusCode = err.status || err.statusCode || 500;
    const isProd = process.env.NODE_ENV === 'production';

    logger.error('Unhandled server error', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        user: req.user?.id,
        ip: req.ip,
    });

    res.status(statusCode).json({
        error: isProd
            ? (statusCode < 500 ? err.message : 'An internal server error occurred.')
            : err.message,
        ...(isProd ? {} : { stack: err.stack }),
    });
}

// ─── SECURITY EVENT HELPERS ───────────────────────────────────────────────────

function logAuthAttempt(req, success, reason = '') {
    const level = success ? 'info' : 'warn';
    logger.log(level, `Auth attempt — ${success ? 'SUCCESS' : 'FAILURE'}`, {
        event: success ? 'auth_success' : 'auth_failure',
        ip: req.ip,
        email: req.body?.email,
        reason,
    });
}

function logApiUsage(userId, endpoint, metadata = {}) {
    logger.info('API usage', { event: 'api_call', userId, endpoint, ...metadata });
}

function logSubscriptionEvent(userId, event, metadata = {}) {
    logger.info('Subscription event', { event, userId, ...metadata });
}

function logReferralAbuse(req, reason) {
    logger.warn('Referral abuse detected', {
        event: 'referral_abuse',
        ip: req.ip,
        user: req.user?.id,
        reason,
    });
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

module.exports = {
    logger,
    // Rate limiters
    authLimiter,
    leadsLimiter,
    subscriptionLimiter,
    aiLimiter,
    inviteLimiter,
    globalLimiter,
    // Validators
    validateCategory,
    validateLocation,
    validateCampaignName,
    validateEmail,
    validateName,
    // Helmet config
    helmetConfig,
    // Handlers
    productionErrorHandler,
    // Log helpers
    logAuthAttempt,
    logApiUsage,
    logSubscriptionEvent,
    logReferralAbuse,
};
