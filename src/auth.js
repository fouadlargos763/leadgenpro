const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'leadgenpro-super-secret-jwt-key-2026';
const SALT_ROUNDS = 10;

// ---- User DB helpers (flat JSON file) ----

function loadUsers() {
    if (!fs.existsSync(DB_PATH)) return [];
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveUsers(users) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

function findUserByEmail(email) {
    return loadUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

function findUserById(id) {
    return loadUsers().find(u => u.id === id);
}

function findUserByReferralCode(code) {
    if (!code) return null;
    return loadUsers().find(u => u.referralCode === code);
}

// ---- Registration ----

async function registerUser(name, email, password, referralCode = null) {
    const existing = findUserByEmail(email);
    if (existing) throw new Error('An account with this email already exists.');

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const users = loadUsers();
    
    // First user is automatically admin for convenience in this project
    const role = users.length === 0 ? 'admin' : 'user';

    // Generate unique referral code (e.g., name + random 4 chars)
    const baseCode = (name.split(' ')[0] || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const newReferralCode = `${baseCode}_${randomSuffix}`;

    const newUser = {
        id: `user_${Date.now()}`,
        name,
        email: email.toLowerCase(),
        password_hash,
        role,
        referralCode: newReferralCode,
        created_at: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);

    // Track the referral if applicable
    if (referralCode) {
        const referrer = findUserByReferralCode(referralCode);
        if (referrer) {
            try {
                const { logReferral } = require('./referrals');
                logReferral(referrer.id, newUser.id);
                console.log(`[REFERRAL] User ${newUser.id} registered via link from ${referrer.id}`);
            } catch (e) {
                console.error('[REFERRAL ERROR]', e);
            }
        }
    }

    return { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, referralCode: newUser.referralCode, created_at: newUser.created_at };
}

// ---- Login ----

async function loginUser(email, password) {
    const user = findUserByEmail(email);
    if (!user) throw new Error('Invalid email or password.');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new Error('Invalid email or password.');

    const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role || 'user' },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role || 'user', created_at: user.created_at } };
}

// ---- JWT Middleware ----

function requireAuth(req, res, next) {
    // Check Authorization header OR httpOnly cookie
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    } else if (req.cookies && req.cookies.lgp_token) {
        token = req.cookies.lgp_token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.user && req.user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ error: 'Forbidden: Admin access only.' });
        }
    });
}

module.exports = { registerUser, loginUser, requireAuth, requireAdmin, findUserById, findUserByReferralCode, loadUsers, saveUsers, JWT_SECRET };
