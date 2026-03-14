/**
 * LeadGenPro - Global Application Controller
 * Handles Auth, Navigation, Global UI Components, and shared Actions.
 */

// Global state
window.currentLeads = [];
window.currentAILead = null;

// Global Utilities
window.showToast = (message, type = 'info') => {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }, 100);
};

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('[LeadGenPro] App Booting...');

    // ── AUTH GUARD ─────────────────────────────────────────────
    const lgpToken = localStorage.getItem('lgp_token');
    const lgpUserRaw = localStorage.getItem('lgp_user');
    const lgpUser = (lgpUserRaw && lgpUserRaw !== 'undefined') ? JSON.parse(lgpUserRaw) : null;

    if (!lgpToken && !window.location.pathname.match(/\/(login|signup|register|index|pricing|how-it-works|case-studies|contact|privacy|terms|refund)/)) {
        window.location.href = '/login';
        return;
    }

    // Attach token to every fetch automatically
    const _origFetch = window.fetch;
    window.fetch = (url, opts = {}) => {
        opts.headers = opts.headers || {};
        if (lgpToken && typeof opts.headers === 'object' && !(opts.headers instanceof Headers)) {
            opts.headers['Authorization'] = `Bearer ${lgpToken}`;
        }
        return _origFetch(url, opts).then(res => {
            if (res.status === 401 && !window.location.pathname.includes('/login')) {
                localStorage.removeItem('lgp_token');
                localStorage.removeItem('lgp_user');
                window.location.href = '/login';
            }
            return res;
        });
    };

    // Global Header/Sidebar Population
    if (lgpUser) {
        const nameElems = document.querySelectorAll('#user-name');
        const emailElems = document.querySelectorAll('#user-email');
        const avatarElems = document.querySelectorAll('#user-avatar');
        
        nameElems.forEach(el => el.textContent = lgpUser.name || 'User');
        emailElems.forEach(el => el.textContent = lgpUser.email || '');
        avatarElems.forEach(el => el.textContent = (lgpUser.name || 'U')[0].toUpperCase());

        if (lgpUser.role === 'admin') {
            const adminNav = document.getElementById('nav-admin');
            if (adminNav) adminNav.style.display = 'block';
        }
    }

    // Logout
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try { await fetch('/api/auth/logout', { method: 'POST' }); } catch(e) {}
            localStorage.removeItem('lgp_token');
            localStorage.removeItem('lgp_user');
            window.location.href = '/login';
        });
    }

    // ── GLOBAL DASHBOARD LOGIC ──────────────────────────────────
    const leadsList = document.getElementById('leads-list');
    const campaignSelector = document.getElementById('campaign-selector');
    const refreshBtn = document.getElementById('btn-refresh');
    const filterStatus = document.getElementById('filter-status');
    const leadsSearch = document.getElementById('leads-search');
    
    let currentCampaignFile = '';

    if (leadsList) {
        initDashboard();
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadLeads);
    }

    if (campaignSelector) {
        campaignSelector.addEventListener('change', () => {
            currentCampaignFile = campaignSelector.value;
            loadLeads();
        });
    }

    if (filterStatus) {
        filterStatus.addEventListener('change', () => renderLeads(window.currentLeads));
    }

    // Global Modal Close Listeners (Event Delegation)
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    // ── DASHBOARD UI FUNCTIONS ──────────────────────────────────

    async function initDashboard() {
        console.log('[Dashboard] Initializing data...');
        try {
            const res = await fetch('/api/campaign-stats');
            const data = await res.json();

            if (data.campaigns && data.campaigns.length > 0) {
                // Populate Dropdown
                if (campaignSelector) {
                    campaignSelector.innerHTML = data.campaigns.map(camp => 
                        `<option style="color:#000;" value="${escapeAttr(camp.file)}">${escapeHtml(camp.name)}</option>`
                    ).join('');
                }
                currentCampaignFile = data.campaigns[0].file;

                // Populate Sidebar Summary Table if it exists
                const sidebarCampaigns = document.getElementById('campaigns-list');
                if (sidebarCampaigns) {
                    sidebarCampaigns.innerHTML = data.campaigns.slice(0, 5).map(camp => `
                        <tr>
                            <td class="company-name" style="font-weight: 600;">${escapeHtml(camp.name)}</td>
                            <td>${camp.total}</td>
                            <td>${camp.sent}</td>
                            <td><span style="color: ${camp.openRate > 15 ? 'var(--success)' : 'var(--text-muted)'}">${camp.openRate}%</span></td>
                            <td><span class="badge-status ${camp.status === 'Completed' ? 'status-qualified' : 'status-new'}">${camp.status}</span></td>
                        </tr>
                    `).join('');
                }
            } else {
                const onboardModal = document.getElementById('onboarding-modal');
                if (onboardModal && !localStorage.getItem('lgp_onboarded')) {
                    onboardModal.style.display = 'flex';
                }
            }
        } catch (error) {
            console.error('Data initialization failed:', error);
        }

        loadLeads();
        loadReferralInfo();
    }

    async function loadLeads() {
        if (!leadsList) return;
        leadsList.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Fetching pipeline data...</td></tr>';

        try {
            const url = currentCampaignFile ? `/api/leads?file=${encodeURIComponent(currentCampaignFile)}` : '/api/leads';
            const response = await fetch(url);
            const data = await response.json();

            window.currentLeads = data.leads || [];
            renderLeads(window.currentLeads);
            updateStats(data.stats);
        } catch (error) {
            leadsList.innerHTML = '<tr><td colspan="12" style="text-align: center; color: var(--danger);">Failed to connect to data engine.</td></tr>';
        }
    }

    function renderLeads(leads) {
        if (!leadsList) return;
        
        const statusVal = filterStatus ? filterStatus.value : 'all';
        const searchVal = leadsSearch ? leadsSearch.value.toLowerCase() : '';

        const filtered = leads.filter(l => {
            const matchesStatus = (statusVal === 'all') || (l.status && l.status.toLowerCase() === statusVal.toLowerCase());
            const matchesSearch = !searchVal || 
                                (l.name && l.name.toLowerCase().includes(searchVal)) ||
                                (l.email && l.email.toLowerCase().includes(searchVal));
            return matchesStatus && matchesSearch;
        });

        if (filtered.length === 0) {
            leadsList.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 2rem; color: var(--text-muted);">No leads match current filters.</td></tr>';
            return;
        }

        leadsList.innerHTML = filtered.map((l, i) => `
            <tr>
                <td style="font-weight: 500; min-width: 140px;">${escapeHtml(l.name || l.title)}</td>
                <td><span class="email-cell" onclick="copyToClipboard('${l.email}')">${escapeHtml(l.email || '—')}</span></td>
                <td style="font-size: 0.8rem; opacity: 0.8;">${escapeHtml(l.phone || '—')}</td>
                <td>${l.website ? `<a href="${l.website}" target="_blank" class="web-link"><i class="fas fa-external-link-alt"></i></a>` : '—'}</td>
                <td><span class="score-badge tier-${(l.scoreTier || 'Cold').toLowerCase()}">${l.score || 0}</span></td>
                <td><button class="btn-icon" onclick="viewAI(${l.index || i})"><i class="fas fa-brain"></i></button></td>
                <td>${l.opened ? '<i class="fas fa-check-circle" style="color:var(--success)"></i>' : '<i class="fas fa-minus" style="opacity:0.2"></i>'}</td>
                <td>${l.clicked ? '<i class="fas fa-mouse-pointer" style="color:var(--cyan)"></i>' : '<i class="fas fa-minus" style="opacity:0.2"></i>'}</td>
                <td style="font-size:0.75rem; white-space:nowrap;">${l.followUp || 'None'}</td>
                <td><span class="badge-status status-${(l.status || 'New').toLowerCase()}">${l.status || 'New'}</span></td>
                <td><span style="font-size:0.7rem; opacity:0.6;">${l.queue || '—'}</span></td>
                <td style="font-size:0.7rem;">${l.websiteHealth || '—'}</td>
                <td>
                    <div style="display:flex; gap: 0.4rem;">
                        <button class="btn btn-sm btn-primary" onclick="previewEmail(${l.index || i})"><i class="fas fa-envelope"></i> Outreach</button>
                        <button class="btn btn-sm btn-outline" onclick="viewTimeline(${l.index || i})"><i class="fas fa-history"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function updateStats(stats) {
        if (!stats) return;
        const sTotal = document.getElementById('stat-total-leads');
        const sEmails = document.getElementById('stat-leads-with-emails');
        const sSent = document.getElementById('stat-outreach-sent');
        const sQual = document.getElementById('stat-qualified-leads');

        if (sTotal) sTotal.textContent = stats.total || 0;
        if (sEmails) sEmails.textContent = stats.withEmails || 0;
        if (sSent) sSent.textContent = stats.sent || 0;
        if (sQual) sQual.textContent = stats.qualified || 0;
    }

    // ── GLOBAL ACTION HANDLER ──────────────────────────────────

    window.triggerAction = async (action, params = {}) => {
        const consoleModal = document.getElementById('console-modal');
        const consoleOutput = document.getElementById('console-output');
        
        if (consoleModal) consoleModal.style.display = 'flex';
        if (consoleOutput) consoleOutput.innerHTML = `[System] Initiating ${action.toUpperCase()}...\n`;

        try {
            const response = await fetch('/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...params })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                if (consoleOutput) {
                    consoleOutput.innerHTML += chunk;
                    consoleOutput.scrollTop = consoleOutput.scrollHeight;
                }
            }
            
            // Refresh relevant data after action finishes
            if (leadsList) loadLeads();
            window.showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} completed.`, 'success');

        } catch (err) {
            if (consoleOutput) consoleOutput.innerHTML += `\n[Fatal Error] ${err.message}`;
            window.showToast('Action failed: ' + err.message, 'error');
        }
    };

    // ── SHARED WINDOW FUNCTIONS ────────────────────────────────

    window.previewEmail = async (index) => {
        const lead = window.currentLeads[index];
        if (!lead) return;

        const previewModal = document.getElementById('preview-modal');
        const pSubject = document.getElementById('preview-subject');
        const pBody = document.getElementById('preview-body');

        if (pSubject) pSubject.textContent = 'Generating template...';
        if (pBody) pBody.textContent = 'AI is crafting a personalized hook...';
        if (previewModal) previewModal.style.display = 'flex';

        try {
            const res = await fetch('/api/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead, campaign: currentCampaignFile })
            });
            const data = await res.json();
            if (pSubject) pSubject.textContent = data.subject || 'No Subject';
            if (pBody) pBody.innerHTML = (data.html || data.body || 'No content generated').replace(/\n/g, '<br>');
        } catch (err) {
            if (pBody) pBody.textContent = 'Failed to generate preview.';
        }
    };

    window.viewAI = async (index) => {
        const lead = window.currentLeads[index];
        if (!lead) return;
        window.currentAILead = lead;

        const aiModal = document.getElementById('ai-modal');
        const nameEl = document.getElementById('ai-lead-name');
        const scoreEl = document.getElementById('ai-score-num');
        const insightEl = document.getElementById('ai-insight-text');

        if (nameEl) nameEl.textContent = l.name || l.title || 'Client Analysis';
        if (scoreEl) scoreEl.textContent = lead.score || 0;
        if (insightEl) insightEl.textContent = 'Analyzing digital footprint...';
        if (aiModal) aiModal.style.display = 'flex';

        try {
            const res = await fetch('/api/ai-insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead })
            });
            const data = await res.json();
            if (insightEl) insightEl.textContent = data.insight;
        } catch(e) {
            if (insightEl) insightEl.textContent = 'AI Insight module currently unavailable.';
        }
    };

    window.viewTimeline = async (index) => {
        const lead = window.currentLeads[index];
        if (!lead) return;
        const timelineModal = document.getElementById('timeline-modal');
        const timelineContainer = document.getElementById('timeline-container');

        if (timelineContainer) timelineContainer.innerHTML = 'Loading activity logs...';
        if (timelineModal) timelineModal.style.display = 'flex';

        try {
            const leadId = lead.id || encodeURIComponent(lead.name);
            const res = await fetch(`/api/lead/${leadId}/activity`);
            const data = await res.json();
            
            if (timelineContainer) {
                if (!data.activities || data.activities.length === 0) {
                    timelineContainer.innerHTML = '<div style="color:var(--text-muted)">No activity recorded yet for this prospect.</div>';
                } else {
                    timelineContainer.innerHTML = data.activities.map(a => `
                        <div class="timeline-item" style="margin-bottom: 1rem; position: relative;">
                            <div style="font-size: 0.7rem; color: var(--text-muted);">${new Date(a.timestamp).toLocaleString()}</div>
                            <div style="font-size: 0.85rem; color: var(--text-main); font-weight: 500;">
                                <i class="fas fa-circle" style="font-size: 0.5rem; color: var(--cyan); margin-right: 8px;"></i>
                                ${a.type.replace(/_/g, ' ').toUpperCase()}
                            </div>
                        </div>
                    `).join('');
                }
            }
        } catch (e) {
            if (timelineContainer) timelineContainer.innerHTML = 'Failed to load timeline.';
        }
    };

    window.copyToClipboard = (text) => {
        if (!text || text === '—') return;
        navigator.clipboard.writeText(text);
        window.showToast('Copied to clipboard', 'success');
    };

    // Global Referral Helpers
    async function loadReferralInfo() {
        const linkDisplay = document.getElementById('ref-link-display');
        if (!linkDisplay) return;
        try {
            const res = await fetch('/api/referral');
            const data = await res.json();
            linkDisplay.textContent = data.referralLink;
            window.currentReferralLink = data.referralLink;
        } catch (err) {}
    }

    window.copyRefLink = () => {
        const link = window.currentReferralLink || document.getElementById('ref-link-display')?.textContent;
        if (link) {
            navigator.clipboard.writeText(link);
            window.showToast('Referral link copied!', 'success');
        }
    };

    window.sendInvite = async () => {
        const emailInput = document.getElementById('invite-email');
        if (!emailInput) return;
        const email = emailInput.value.trim();
        if (!email.includes('@')) return window.showToast('Valid email required', 'error');

        try {
            const res = await fetch('/api/referral/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails: [email] })
            });
            const data = await res.json();
            window.showToast(data.message, 'success');
            emailInput.value = '';
        } catch (err) {
            window.showToast('Invite failed.', 'error');
        }
    };

    // Helpers (Now Global)
    window.escapeHtml = (str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    window.escapeAttr = (str) => {
        if (!str) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
});
