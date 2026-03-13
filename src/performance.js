/**
 * performance.js — LeadGenPro SaaS Platform
 * Centralised performance layer:
 *   • NodeCache in-memory API response cache
 *   • Cache-key builder (per-user, per-file)
 *   • cacheMiddleware factory (drop-in Express middleware)
 *   • invalidateUserCache — bust cache after data-mutating actions
 *   • requestTimer — structured per-request timing logs
 *   • deduplicateQuery — prevent identical in-flight scraping jobs
 */

const NodeCache = require('node-cache');

// ─── Cache configuration ──────────────────────────────────────────────────────
// stdTTL: seconds before an entry expires automatically
// checkperiod: how often (seconds) expired entries are purged from memory
const cache = new NodeCache({
    stdTTL: 600,          // 10-minute default TTL
    checkperiod: 120,     // sweep expired keys every 2 minutes
    useClones: false,     // avoid deep-cloning; we never mutate cached objects
    maxKeys: 500,         // hard ceiling — evict oldest when exceeded
});

// ─── Cache key helpers ────────────────────────────────────────────────────────

/**
 * Build a deterministic cache key for the /api/leads endpoint.
 * Scoped to user + campaign file so different users never share data.
 * @param {string} userId
 * @param {string} [file]  specific campaign filename, or empty for the latest
 */
function leadsKey(userId, file = '') {
    return `leads::${userId}::${file || 'latest'}`;
}

/**
 * Build a key for /api/campaign-stats (also expensive — iterates all files).
 */
function campaignStatsKey(userId) {
    return `campaign_stats::${userId}`;
}

/**
 * Convenience: bust all cache entries that belong to a specific user.
 * Call this after any data-mutating action (find, enrich, send, status update).
 * @param {string} userId
 */
function invalidateUserCache(userId) {
    const keys = cache.keys().filter(k => k.includes(`::${userId}`) || k.includes(`${userId}::`));
    if (keys.length > 0) {
        cache.del(keys);
    }
}

// ─── Express middleware factory ───────────────────────────────────────────────

/**
 * Returns an Express middleware that:
 *   1. Checks the cache for this request's key
 *   2. If hit → returns cached JSON immediately (zero file I/O)
 *   3. If miss → lets the route run, then caches the JSON before responding
 *
 * @param {Function} keyFn  (req) => cacheKey string
 * @param {number}   [ttl]  override for this route (seconds), default = 600
 */
function cacheMiddleware(keyFn, ttl = 600) {
    return (req, res, next) => {
        const key = keyFn(req);
        const cached = cache.get(key);

        if (cached !== undefined) {
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('X-Cache-Key', key);
            return res.json(cached);
        }

        // Intercept res.json() to store the payload before it goes out
        const originalJson = res.json.bind(res);
        res.json = (payload) => {
            if (res.statusCode === 200) {
                cache.set(key, payload, ttl);
            }
            res.setHeader('X-Cache', 'MISS');
            // Restore and call
            res.json = originalJson;
            return res.json(payload);
        };

        next();
    };
}

// ─── Duplicate-query deduplication guard ─────────────────────────────────────
// Prevents two identical lead searches (same user + category + location) from
// running concurrently.  The first request runs; subsequent identical requests
// while the first is in progress get a 429 telling them to wait.

const inFlightSearches = new Set();

/**
 * Middleware: checks the in-flight set for this user+query combination.
 * Must be used BEFORE the route spawns the child process.
 * Call `releaseSearch(key)` when the process ends.
 */
function deduplicateSearch(req, res, next) {
    const { category, location } = req.body;
    const uid = req.user?.id;
    if (!uid || !category || !location) return next();

    const key = `search::${uid}::${category.toLowerCase().trim()}::${location.toLowerCase().trim()}`;
    if (inFlightSearches.has(key)) {
        return res.status(429).json({
            error: 'An identical search is already running. Please wait for it to complete.',
        });
    }

    inFlightSearches.add(key);
    req._dedupeKey = key;
    next();
}

/**
 * Release the in-flight search lock once the child process finishes.
 * @param {string} key
 */
function releaseSearch(key) {
    if (key) inFlightSearches.delete(key);
}

// ─── Request timing middleware ────────────────────────────────────────────────

/**
 * Attaches `req._startTime` at request start, then logs total duration
 * in `X-Response-Time` header and via the security logger (warn if slow).
 * Import `logger` from security.js lazily to avoid circular dependency.
 */
const SLOW_THRESHOLD_MS = 1500; // warn when a request takes this long

function requestTimer(req, res, next) {
    req._startTime = Date.now();

    res.on('finish', () => {
        const durationMs = Date.now() - req._startTime;
        
        if (durationMs >= SLOW_THRESHOLD_MS) {
            try {
                const { logger } = require('./security');
                logger.warn('Slow request detected', {
                    method:   req.method,
                    path:     req.path,
                    status:   res.statusCode,
                    duration: `${durationMs}ms`,
                    user:     req.user?.id,
                });
            } catch (_) { /* security not loaded yet */ }
        }
    });

    next();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    cache,
    leadsKey,
    campaignStatsKey,
    invalidateUserCache,
    cacheMiddleware,
    deduplicateSearch,
    releaseSearch,
    requestTimer,
};
