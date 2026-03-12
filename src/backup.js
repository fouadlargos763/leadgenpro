/**
 * backup.js — LeadGenPro SaaS Platform
 * Daily automated backup of critical data files.
 * Runs as a scheduled task using setInterval.
 *
 * Backed-up data:
 *   - data/users.json          (user accounts)
 *   - data/analytics.json      (event tracking)
 *   - data/referrals.json      (referral records)
 *   - data/waitlist.json       (early-access emails)
 *   - data/users/**            (per-user lead files)
 *
 * Backups are written to: data/backups/YYYY-MM-DD/
 * Retention: 7 days (older backups auto-deleted)
 */

const fs   = require('fs');
const path = require('path');

const dataDir    = path.join(__dirname, '..', 'data');
const backupRoot = path.join(dataDir, 'backups');

// Top-level files to back up
const TOP_LEVEL_FILES = ['users.json', 'analytics.json', 'referrals.json', 'waitlist.json', 'subscriptions.json'];

// How many days of backups to retain
const RETENTION_DAYS = 7;

// ─── Core backup function ─────────────────────────────────────────────────────

function runBackup() {
    try {
        const stamp    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const destDir  = path.join(backupRoot, stamp);
        fs.mkdirSync(destDir, { recursive: true });

        let fileCount = 0;

        // 1. Back up top-level data files
        for (const file of TOP_LEVEL_FILES) {
            const src = path.join(dataDir, file);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, path.join(destDir, file));
                fileCount++;
            }
        }

        // 2. Back up per-user lead files (data/users/<userId>/*.json)
        const usersDir = path.join(dataDir, 'users');
        if (fs.existsSync(usersDir)) {
            const userFolders = fs.readdirSync(usersDir).filter(u =>
                fs.statSync(path.join(usersDir, u)).isDirectory()
            );
            for (const uid of userFolders) {
                const srcUserDir  = path.join(usersDir, uid);
                const destUserDir = path.join(destDir, 'users', uid);
                fs.mkdirSync(destUserDir, { recursive: true });
                const userFiles = fs.readdirSync(srcUserDir).filter(f => f.endsWith('.json'));
                for (const f of userFiles) {
                    fs.copyFileSync(path.join(srcUserDir, f), path.join(destUserDir, f));
                    fileCount++;
                }
            }
        }

        console.log(`[Backup] ✅ Backup completed: ${stamp} — ${fileCount} files copied to ${destDir}`);

        // 3. Prune backups older than RETENTION_DAYS
        pruneOldBackups();

    } catch (err) {
        console.error('[Backup] ❌ Backup failed:', err.message);
    }
}

function pruneOldBackups() {
    if (!fs.existsSync(backupRoot)) return;
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const dirs   = fs.readdirSync(backupRoot);
    for (const dir of dirs) {
        const fullPath = path.join(backupRoot, dir);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        const mtime = fs.statSync(fullPath).mtimeMs;
        if (mtime < cutoff) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`[Backup] 🗑 Pruned old backup: ${dir}`);
        }
    }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function startBackupScheduler() {
    // Run once immediately on server start
    runBackup();
    // Then once every 24 hours
    setInterval(runBackup, TWENTY_FOUR_HOURS);
    console.log('[Backup] 🕐 Daily backup scheduler started (every 24h).');
}

module.exports = { runBackup, startBackupScheduler };
