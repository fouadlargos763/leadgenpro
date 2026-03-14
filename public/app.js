document.addEventListener('DOMContentLoaded', () => {
    // ── AUTH GUARD ─────────────────────────────────────────────
    const lgpToken = localStorage.getItem('lgp_token');
    const lgpUser = JSON.parse(localStorage.getItem('lgp_user') || 'null');
    if (!lgpToken) {
        window.location.href = '/login';
        return;
    }

    // Attach token to every fetch automatically
    const _origFetch = window.fetch;
    window.fetch = (url, opts = {}) => {
        opts.headers = opts.headers || {};
        if (typeof opts.headers === 'object' && !(opts.headers instanceof Headers)) {
            opts.headers['Authorization'] = `Bearer ${lgpToken}`;
        }
        return _origFetch(url, opts).then(res => {
            if (res.status === 401) {
                localStorage.removeItem('lgp_token');
                localStorage.removeItem('lgp_user');
                window.location.href = '/login';
            }
            return res;
        });
    };

    // Populate user profile in sidebar
    if (lgpUser) {
        const nameEl = document.getElementById('user-name');
        const emailEl = document.getElementById('user-email');
        const dateEl = document.getElementById('user-since');
        const avatarEl = document.getElementById('user-avatar');
        if (nameEl) nameEl.textContent = lgpUser.name || 'User';
        if (emailEl) emailEl.textContent = lgpUser.email || '';
        if (dateEl && lgpUser.created_at) {
            const d = new Date(lgpUser.created_at);
            dateEl.textContent = `Member since ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
        }
        if (avatarEl) avatarEl.textContent = (lgpUser.name || 'U')[0].toUpperCase();

        // Show Admin Nav if user is admin
        if (lgpUser.role === 'admin') {
            const adminNav = document.getElementById('nav-admin');
            if (adminNav) adminNav.style.display = 'block';
        }
    }

    // Logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            localStorage.removeItem('lgp_token');
            localStorage.removeItem('lgp_user');
            window.location.href = '/login';
        });
    }
    // ── END AUTH ────────────────────────────────────────────────

    // DOM Elements - Using null-safe variables
    const leadsList = document.getElementById('leads-list');
    const refreshBtn = document.getElementById('btn-refresh');
    const actionButtons = document.querySelectorAll('.action-btn');
    const modal = document.getElementById('console-modal');
    const previewModal = document.getElementById('preview-modal');
    const timelineModal = document.getElementById('timeline-modal');
    const analysisModal = document.getElementById('analysis-modal');
    const closeModal = document.querySelectorAll('.close-modal');
    const consoleOutput = document.getElementById('console-output');
    const campaignsList = document.getElementById('campaigns-list');
    
    const statsElements = {
        total: document.getElementById('stat-total-leads'),
        withEmails: document.getElementById('stat-leads-with-emails'),
        sent: document.getElementById('stat-outreach-sent'),
        qualified: document.getElementById('stat-qualified-leads')
    };

    const campaignSelector = document.getElementById('campaign-selector');
    let currentCampaignFile = '';

    // Initial Load - Only if leadsList exists (indicating we are on the dashboard)
    if (leadsList) {
        initDashboard();
    }

    // Event Listeners - Defensive attachments
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadLeads);
    }

    if (campaignSelector) {
        campaignSelector.addEventListener('change', () => {
            currentCampaignFile = campaignSelector.value;
            loadLeads();
        });
    }

    if (actionButtons.length > 0) {
        actionButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                if (action === 'find') {
                    const fmodal = document.getElementById('find-modal');
                    if (fmodal) fmodal.style.display = 'flex';
                    return;
                }
                triggerAction(action, { campaignFile: currentCampaignFile });
            });
        });
    }

    if (closeModal.length > 0) {
        closeModal.forEach(btn => {
            btn.addEventListener('click', () => {
                if (modal) modal.style.display = 'none';
                if (previewModal) previewModal.style.display = 'none';
                if (timelineModal) timelineModal.style.display = 'none';
                if (analysisModal) analysisModal.style.display = 'none';
                const fmodal = document.getElementById('find-modal');
                if (fmodal) fmodal.style.display = 'none';
            });
        });
    }

    window.onclick = (event) => {
        if (modal && event.target == modal) modal.style.display = 'none';
        if (previewModal && event.target == previewModal) previewModal.style.display = 'none';
        if (timelineModal && event.target == timelineModal) timelineModal.style.display = 'none';
        if (analysisModal && event.target == analysisModal) analysisModal.style.display = 'none';
        const fmodal = document.getElementById('find-modal');
        if (fmodal && event.target == fmodal) fmodal.style.display = 'none';
    };

    const findBtn = document.getElementById('btn-execute-find');
    if (findBtn) {
        findBtn.addEventListener('click', () => {
            const fmodal = document.getElementById('find-modal');
            const industry = document.getElementById('find-industry')?.value.trim();
            const city = document.getElementById('find-city')?.value.trim();
            const country = document.getElementById('find-country')?.value.trim();
            const maxLeads = document.getElementById('find-limit')?.value || 50;

            if (!industry || (!city && !country)) {
                alert('Industry and at least one Location (City/Country) are required!');
                return;
            }

            if (fmodal) fmodal.style.display = 'none';
            const locationCombined = [city, country].filter(Boolean).join(', ');
            const campaignName = `${industry} in ${locationCombined}`;
            triggerAction('find', { category: industry, location: locationCombined, campaignName, maxLeads: parseInt(maxLeads) });
        });
    }

    window.currentLeads = [];

    // Functions
    async function initDashboard() {
        try {
            const res = await fetch('/api/campaign-stats');
            const data = await res.json();

            if (data.campaigns && data.campaigns.length > 0) {
                // Populate Campaign table
                if (campaignsList) {
                    campaignsList.innerHTML = data.campaigns.map(camp => `
                        <tr>
                            <td class="company-name" style="font-weight: 600;">${camp.name}</td>
                            <td>${camp.total}</td>
                            <td>${camp.sent}</td>
                            <td><span style="color: ${camp.openRate > 0 ? 'var(--success)' : 'var(--text-muted)'}">${camp.openRate}%</span></td>
                            <td><span class="badge-status ${camp.status === 'Completed' ? 'status-qualified' : camp.status === 'Running' ? 'status-new' : 'status-contacted'}">${camp.status}</span></td>
                        </tr>
                    `).join('');
                }

                // DASHBOARD DROPDOWN
                if (campaignSelector) {
                    campaignSelector.innerHTML = data.campaigns.map(camp => {
                        return `<option style="color:#000;" value="${camp.file}">${camp.name}</option>`;
                    }).join('');
                }
                currentCampaignFile = data.campaigns[0].file; // Set default
            } else {
                if (campaignSelector) campaignSelector.innerHTML = '<option style="color:#000;" value="">No campaigns found...</option>';
                if (campaignsList) campaignsList.innerHTML = '<tr><td colspan="5" style="text-align:center;">No campaigns found.</td></tr>';
                
                // SHOW ONBOARDING IF NO CAMPAIGNS & NOT DISMISSED
                const onboardModal = document.getElementById('onboarding-modal');
                if (onboardModal && !localStorage.getItem('lgp_onboarded')) {
                    onboardModal.style.display = 'flex';
                }
            }
        } catch (error) {
            console.error('Failed to load campaigns:', error);
        }

        loadReferralInfo();
        loadLeads(); // Load leads for the current/default file
    }

    async function loadReferralInfo() {
        try {
            const res = await fetch('/api/referral');
            const data = await res.json();
            
            const linkDisplay = document.getElementById('ref-link-display');
            const bonusDisplay = document.getElementById('val-bonus-leads');
            
            if (linkDisplay) linkDisplay.textContent = data.referralLink;
            if (bonusDisplay) bonusDisplay.textContent = data.bonusLeads || 0;
            
            window.currentReferralLink = data.referralLink;
        } catch (err) {
            console.error('Failed to load referral info:', err);
        }
    }

    window.copyRefLink = () => {
        const link = window.currentReferralLink || document.getElementById('ref-link-display').textContent;
        navigator.clipboard.writeText(link);
        const btn = event.currentTarget;
        const origText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => btn.innerHTML = origText, 2000);
    };

    window.sendInvite = async () => {
        const emailInput = document.getElementById('invite-email');
        const statusEl = document.getElementById('invite-status');
        const email = emailInput.value.trim();
        
        if (!email || !email.includes('@')) {
            alert('Please enter a valid email address.');
            return;
        }
        
        try {
            const res = await fetch('/api/referral/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails: [email] })
            });
            const data = await res.json();
            
            statusEl.textContent = data.message;
            statusEl.style.display = 'block';
            statusEl.style.color = 'var(--success)';
            emailInput.value = '';
            
            setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
        } catch (err) {
            statusEl.textContent = 'Failed to send invite.';
            statusEl.style.display = 'block';
            statusEl.style.color = 'var(--danger)';
        }
    };

    // ── DASHBOARD TIPS ──
    const tips = [
        "Start by generating leads for your niche.",
        "Use AI Personlization to increase open rates.",
        "Check back daily for new lead health audits.",
        "Always preview your outreach before sending.",
        "Target cities with lower competition first."
    ];
    let tipIndex = 0;
    setInterval(() => {
        tipIndex = (tipIndex + 1) % tips.length;
        const tipEl = document.getElementById('dashboard-tip');
        if (tipEl) {
            tipEl.style.opacity = 0;
            setTimeout(() => {
                tipEl.textContent = tips[tipIndex];
                tipEl.style.opacity = 1;
            }, 300);
        }
    }, 10000);

    async function loadLeads() {
        if (!leadsList) return; // Silent return if not on dashboard
        try {
            leadsList.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 3rem; color: var(--text-muted);">Loading leads from data storage...</td></tr>';

            const url = currentCampaignFile ? `/api/leads?file=${encodeURIComponent(currentCampaignFile)}` : '/api/leads';
            const response = await fetch(url);
            const data = await response.json();

            window.currentLeads = data.leads || [];
            renderLeads(window.currentLeads);
            updateStats(data.stats);
        } catch (error) {
            console.error('Failed to load leads:', error);
            if (leadsList) leadsList.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 3rem; color: var(--danger);">Error loading data. Make sure the server is running.</td></tr>';
        }
    }

    // ── PAGINATED LEAD RENDERER ──────────────────────────────────────────────
    // Renders 50 rows at a time to keep the DOM light for large datasets.
    const PAGE_SIZE = 50;
    let renderedCount = 0;
    let activeLeads   = [];

    function renderLeads(leads) {
        renderedCount = 0;
        activeLeads   = leads;

        if (!leads || leads.length === 0) {
            leadsList.innerHTML = `
                <tr><td colspan="13" style="padding: 3rem 2rem;">
                    <div style="max-width: 480px; margin: 0 auto; text-align: center;">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">🚀</div>
                        <div style="font-family:'Outfit',sans-serif; font-size: 1.4rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem;">Ready to find your first leads?</div>
                        <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 2rem;">Follow these 3 steps to get started:</div>
                        <div style="text-align: left; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem;">
                            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;">
                                <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#06b6d4,#6366f1);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;color:#fff;flex-shrink:0;">1</div>
                                <div><strong style="color:#fff;">Choose a business category</strong><br><span style="color:var(--text-muted);font-size:0.82rem;">e.g. Roofing, Plumbing, Real Estate</span></div>
                            </div>
                            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;">
                                <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;color:#fff;flex-shrink:0;">2</div>
                                <div><strong style="color:#fff;">Enter a target city</strong><br><span style="color:var(--text-muted);font-size:0.82rem;">e.g. Columbus, Phoenix, Austin</span></div>
                            </div>
                            <div style="display:flex;align-items:center;gap:1rem;">
                                <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#10b981,#06b6d4);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;color:#fff;flex-shrink:0;">3</div>
                                <div><strong style="color:#fff;">Click "Find Leads"</strong><br><span style="color:var(--text-muted);font-size:0.82rem;">AI will discover and score businesses for you</span></div>
                            </div>
                        </div>
                        <button onclick="document.querySelector('.action-btn[data-action=find]')?.click()" style="padding:0.85rem 2rem;background:linear-gradient(135deg,#06b6d4,#6366f1);border:none;border-radius:12px;color:#fff;font-family:'Outfit',sans-serif;font-weight:700;cursor:pointer;font-size:0.95rem;">
                            <i class="fas fa-search" style="margin-right:8px;"></i>Find My First Leads
                        </button>
                    </div>
                </td></tr>`;
            _removeLoadMoreBtn();
            return;
        }


        leadsList.innerHTML = '';
        _appendLeadRows(Math.min(PAGE_SIZE, leads.length));

        // Show / hide the "Load More" sentinel
        if (leads.length > PAGE_SIZE) {
            _attachLoadMoreBtn();
        } else {
            _removeLoadMoreBtn();
        }
    }

    /** Build and insert <tr> nodes for leads[start...end] */
    function _appendLeadRows(count) {
        const fragment = document.createDocumentFragment();
        const end = Math.min(renderedCount + count, activeLeads.length);

        for (let index = renderedCount; index < end; index++) {
            const lead = activeLeads[index];
            const tr = document.createElement('tr');
            const score = lead.score || 0;
            const scoreColor = score >= 70 ? 'score-green bg-green' : score >= 40 ? 'score-yellow bg-yellow' : 'score-red bg-red';
            const [scoreClass, bgClass] = scoreColor.split(' ');

            tr.innerHTML = `
                <td>
                    <div class="company-name">${lead.name || 'Unknown Corp'}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${lead.category || 'Business'}</div>
                </td>
                <td>${lead.email || '<span style="color: var(--danger); font-size: 0.75rem;">Missing</span>'}</td>
                <td>${lead.phone || 'N/A'}</td>
                <td><a href="${lead.website}" target="_blank" rel="noopener" style="color: var(--cyan); text-decoration: none;">Link <i class="fas fa-external-link-alt" style="font-size: 0.7rem;"></i></a></td>
                <td>
                    <div class="score-wrapper">
                        <span class="score-number ${scoreClass}">${score}</span>
                        <div class="score-bar-container">
                            <div class="score-bar-fill ${bgClass}" style="width: ${score}%;"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <button onclick="viewAI(${index})" title="AI Lead Intelligence" style="background: linear-gradient(135deg, rgba(99,179,237,0.15), rgba(99,179,237,0.05)); border: 1px solid rgba(99,179,237,0.3); color: var(--cyan); border-radius: 8px; padding: 5px 10px; cursor: pointer; font-size: 0.8rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.background='rgba(99,179,237,0.25)'" onmouseout="this.style.background='linear-gradient(135deg, rgba(99,179,237,0.15), rgba(99,179,237,0.05))'"><i class="fas fa-brain"></i></button>
                </td>
                <td>${lead.opened ? '<span style="color:var(--success); font-weight:600; font-size:0.875rem;"><i class="fas fa-eye"></i> Opened</span>' : '<span style="color:var(--text-muted); font-size:0.875rem;"><i class="fas fa-times"></i> Not opened</span>'}</td>
                <td>${lead.clicked ? '<span style="color:var(--cyan); font-weight:600; font-size:0.875rem;"><i class="fas fa-link"></i> Clicked</span>' : '<span style="color:var(--text-muted); font-size:0.875rem;"><i class="fas fa-times"></i> Not clicked</span>'}</td>
                <td><span style="font-size: 0.8rem; color: ${lead.followUp !== 'None' ? 'var(--cyan)' : 'var(--text-muted)'};">${lead.followUp}</span></td>
                <td>
                    <select class="status-select" onchange="updateStatus('${lead.id || lead.name}', this.value)" style="background: transparent; border: 1px solid var(--border-glass); border-radius: 4px; padding: 2px 5px; font-size: 0.75rem;">
                        <option value="New" ${lead.status === 'New' ? 'selected' : ''}>New</option>
                        <option value="Contacted" ${lead.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
                        <option value="Replied" ${lead.status === 'Replied' ? 'selected' : ''}>Replied</option>
                        <option value="Qualified" ${lead.status === 'Qualified' ? 'selected' : ''}>Qualified</option>
                        <option value="Closed" ${lead.status === 'Closed' ? 'selected' : ''}>Closed</option>
                    </select>
                </td>
                <td><span style="font-size: 0.8rem; color: ${lead.queue !== 'None' ? 'var(--cyan)' : 'var(--text-muted)'};">${lead.queue}</span></td>
                <td style="font-size: 0.85rem;">
                    <button onclick="viewAnalysis(${index})" style="background:none; border:none; cursor:pointer; font-size: 0.9rem; color: var(--text-muted);" title="View Website Audit">
                        ${lead.websiteHealth || '—'}
                    </button>
                </td>
                <td>
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-start;">
                        <button class="btn btn-secondary btn-sm" onclick="previewEmail(${index})" title="Preview Outreach"><i class="fas fa-envelope"></i> Preview</button>
                        <button class="btn btn-primary btn-sm" onclick="viewTimeline(${index})" title="View Timeline"><i class="fas fa-history"></i></button>
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        }
        leadsList.appendChild(fragment);
        renderedCount = end;
    }

    function _attachLoadMoreBtn() {
        _removeLoadMoreBtn();
        const tfoot = leadsList.closest('table').querySelector('tfoot') || (() => {
            const tf = document.createElement('tfoot');
            leadsList.closest('table').appendChild(tf);
            return tf;
        })();
        tfoot.innerHTML = `
            <tr id="load-more-row">
                <td colspan="13" style="text-align:center; padding: 1rem;">
                    <button id="btn-load-more" class="btn btn-secondary"
                        style="min-width: 200px;">
                        Load More (${activeLeads.length - renderedCount} remaining)
                    </button>
                </td>
            </tr>`;
        document.getElementById('btn-load-more').addEventListener('click', () => {
            _appendLeadRows(PAGE_SIZE);
            if (renderedCount >= activeLeads.length) _removeLoadMoreBtn();
            else document.getElementById('btn-load-more').textContent =
                `Load More (${activeLeads.length - renderedCount} remaining)`;
        });
    }

    function _removeLoadMoreBtn() {
        const row = document.getElementById('load-more-row');
        if (row) row.remove();
    }

    /** Expose a live-filter function for the search input (if present) */
    window.filterLeads = (query) => {
        if (!window.currentLeads || !window.currentLeads.length) return;
        const q = query.toLowerCase().trim();
        const filtered = q
            ? window.currentLeads.filter(l =>
                (l.name || '').toLowerCase().includes(q) ||
                (l.email || '').toLowerCase().includes(q) ||
                (l.category || '').toLowerCase().includes(q) ||
                (l.city || '').toLowerCase().includes(q))
            : window.currentLeads;
        renderLeads(filtered);
    };


    window.exportCSV = () => {
        if (!window.activeLeads || !window.activeLeads.length) return alert('No leads to export.');
        
        const headers = ["Name", "Email", "Phone", "Website", "Status", "Address", "City", "Category"];
        const csvRows = [headers.join(",")];
        
        window.activeLeads.forEach(l => {
            const row = [
                `"${(l.name || '').replace(/"/g, '""')}"`,
                `"${(l.email || '').replace(/"/g, '""')}"`,
                `"${(l.phone || '').replace(/"/g, '""')}"`,
                `"${(l.website || '').replace(/"/g, '""')}"`,
                `"${(l.status || 'New').replace(/"/g, '""')}"`,
                `"${(l.address || '').replace(/"/g, '""')}"`,
                `"${(l.city || '').replace(/"/g, '""')}"`,
                `"${(l.category || '').replace(/"/g, '""')}"`
            ];
            csvRows.push(row.join(","));
        });
        
        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `leads_export_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    function updateStats(stats) {
        if (!stats) return;
        if (statsElements.total) statsElements.total.textContent = stats.total || 0;
        if (statsElements.withEmails) statsElements.withEmails.textContent = stats.withEmails || 0;
        if (statsElements.sent) statsElements.sent.textContent = stats.sent || 0;
        if (statsElements.qualified) statsElements.qualified.textContent = stats.qualified || 0;
    }

    // ── AI INTELLIGENCE PANEL ──
    const aiModal = document.getElementById('ai-modal');
    const emailOptimizerModal = document.getElementById('email-optimizer-modal');
    let currentAILead = null;

    window.viewAI = async (index) => {
        const lead = window.currentLeads[index];
        if (!lead) return;
        currentAILead = lead;

        const nameEl = document.getElementById('ai-lead-name');
        const scoreEl = document.getElementById('ai-score-num');
        const insightEl = document.getElementById('ai-insight-text');
        const reasonsEl = document.getElementById('ai-score-reasons');
        const badgeEl = document.getElementById('ai-tier-badge');

        if (nameEl) nameEl.textContent = lead.name || lead.title || 'Unknown Lead';
        if (scoreEl) scoreEl.textContent = lead.score || 0;
        if (insightEl) insightEl.textContent = '⏳ Generating AI insight...';
        if (reasonsEl) reasonsEl.innerHTML = '';

        // Tier badge
        const tier = lead.scoreTier || 'Cold';
        const tierColors = { Hot: '#ff4757', Warm: '#ffa502', Cold: '#a4b0be' };
        if (badgeEl) {
            badgeEl.textContent = `🔥 ${tier}`;
            badgeEl.style.background = `${tierColors[tier]}22`;
            badgeEl.style.border = `1px solid ${tierColors[tier]}55`;
            badgeEl.style.color = tierColors[tier];
        }

        // Score reasons
        if (reasonsEl && lead.scoreReasons && lead.scoreReasons.length) {
            reasonsEl.innerHTML = lead.scoreReasons
                .map(r => `<li style="padding: 6px 10px; background: rgba(255,255,255,0.03); border-radius: 6px;">${r}</li>`)
                .join('');
        }

        if (aiModal) aiModal.style.display = 'flex';

        // Fetch AI insight
        try {
            const res = await fetch('/api/ai-insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead })
            });
            const data = await res.json();
            if (insightEl) insightEl.textContent = data.insight || 'No insight available.';
        } catch (err) {
            if (insightEl) insightEl.textContent = 'AI insight unavailable.';
        }
    };

    const btnOptimize = document.getElementById('btn-ai-optimize-email');
    if (btnOptimize) {
        btnOptimize.addEventListener('click', async () => {
            if (!currentAILead) return;
            if (aiModal) aiModal.style.display = 'none';
            if (emailOptimizerModal) emailOptimizerModal.style.display = 'flex';
            
            const suggsEl = document.getElementById('optimizer-suggestions');
            const origSubEl = document.getElementById('orig-subject');
            const newSubEl = document.getElementById('new-subject');
            const newBodyEl = document.getElementById('new-body');

            if (suggsEl) suggsEl.innerHTML = '<li>⏳ Analyzing email...</li>';
            if (origSubEl) origSubEl.textContent = '...';
            if (newSubEl) newSubEl.textContent = '...';
            if (newBodyEl) newBodyEl.textContent = '...';

            // First fetch the preview email, then optimize it
            try {
                const previewRes = await fetch('/api/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lead: currentAILead, campaign: currentCampaignFile })
                });
                const emailDraft = await previewRes.json();

                const optRes = await fetch('/api/email-optimize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emailDraft, lead: currentAILead })
                });
                const opt = await optRes.json();

                if (suggsEl) {
                    suggsEl.innerHTML = (opt.suggestions || [])
                        .map(s => `<li style="padding: 6px 10px; background: rgba(255,165,0,0.06); border-radius: 6px; border-left: 3px solid var(--gold);">${s}</li>`)
                        .join('');
                }
                if (origSubEl) origSubEl.textContent = emailDraft.subject || '—';
                if (newSubEl) newSubEl.textContent = opt.improvedSubject || emailDraft.subject;
                if (newBodyEl) newBodyEl.textContent = opt.improvedBody || emailDraft.body || '—';
            } catch (err) {
                if (suggsEl) suggsEl.innerHTML = `<li style="color: var(--danger);">Error: ${err.message}</li>`;
            }
        });
    }

    window.triggerAction = async function triggerAction(action, params = {}) {
        if (modal) modal.style.display = 'flex';
        if (consoleOutput) consoleOutput.innerHTML = `[System] Initiating ${action.toUpperCase()} process...\n`;

        const token = localStorage.getItem('lgp_token');

        try {
            const response = await fetch('/api/action', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ action, ...params })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Server responded with ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const text = decoder.decode(value);
                if (consoleOutput) {
                    consoleOutput.innerHTML += text;
                    consoleOutput.scrollTop = consoleOutput.scrollHeight;
                }
            }

            if (consoleOutput) consoleOutput.innerHTML += `\n[System] Action ${action} completed successfully.`;
            loadLeads(); // Refresh table after action
        } catch (error) {
            if (consoleOutput) consoleOutput.innerHTML += `\n[Error] ${error.message}`;
        }
    }

    // ── CSV EXPORT ──────────────────────────────────────────────────────────
    window.exportCSV = async () => {
        const btn = document.getElementById('btn-export-csv');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting…'; }
        try {
            const url = currentCampaignFile
                ? `/api/leads/export?file=${encodeURIComponent(currentCampaignFile)}`
                : '/api/leads/export';
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${localStorage.getItem('lgp_token')}` }
            });
            if (!res.ok) {
                const err = await res.json();
                alert('Export failed: ' + (err.error || 'Unknown error'));
                return;
            }
            const blob = await res.blob();
            const a    = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `leadgenpro-leads-${Date.now()}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (err) {
            alert('Failed to export: ' + err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> Export CSV'; }
        }
    };

    // Global functions for inline Event handlers
    window.updateStatus = async (leadId, newStatus) => {
        try {
            await fetch('/api/leads/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadId, status: newStatus, file: currentCampaignFile })
            });
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    };

    window.previewEmail = async (index) => {
        const lead = window.currentLeads[index];
        if (!lead) return;
        window.currentPreviewLead = lead; // store for send button

        const subEl = document.getElementById('preview-subject');
        const bodyEl = document.getElementById('preview-body');

        try {
            if (subEl) subEl.textContent = `Loading preview...`;
            if (bodyEl) bodyEl.innerHTML = `Please wait...`;
            if (previewModal) previewModal.style.display = 'flex';
            
            // Reset edit state
            if (bodyEl) {
                bodyEl.contentEditable = false;
                bodyEl.style.background = 'white';
            }

            const response = await fetch('/api/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead: lead, campaign: currentCampaignFile })
            });
            const data = await response.json();

            if (subEl) subEl.textContent = data.subject || 'No Subject';
            if (bodyEl) bodyEl.innerHTML = data.html || 'No Content'; 
        } catch (error) {
            console.error('Failed to load preview:', error);
            if (bodyEl) bodyEl.innerHTML = `<span style="color:red">Failed to generate preview.</span>`;
        }
    };

    // Wire up Preview Modal Actions
    const btnSendPreview = document.getElementById('btn-send-preview');
    if (btnSendPreview) {
        btnSendPreview.onclick = async () => {
            if (!window.currentPreviewLead) return;
            const lead = window.currentPreviewLead;
            btnSendPreview.disabled = true;
            btnSendPreview.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            
            try {
                const res = await fetch('/api/leads/send-one', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        leadId: lead.id || lead.name, 
                        campaign: currentCampaignFile,
                        customBody: document.getElementById('preview-body').innerHTML 
                    })
                });
                const data = await res.json();
                if (data.success) {
                    alert('Email sent successfully!');
                    previewModal.style.display = 'none';
                    loadLeads();
                } else {
                    alert('Error: ' + data.error);
                }
            } catch (err) {
                alert('Failed to send email: ' + err.message);
            } finally {
                btnSendPreview.disabled = false;
                btnSendPreview.innerHTML = '<i class="fas fa-paper-plane"></i> Send Email';
            }
        };
    }

    const btnEditPreview = document.querySelector('#preview-modal .btn-secondary i.fa-edit')?.parentElement;
    if (btnEditPreview) {
        btnEditPreview.onclick = () => {
            const bodyEl = document.getElementById('preview-body');
            const isEditing = bodyEl.contentEditable === 'true';
            bodyEl.contentEditable = !isEditing;
            bodyEl.style.background = isEditing ? 'white' : '#f8fafc';
            bodyEl.style.border = isEditing ? 'none' : '2px dashed var(--primary)';
            btnEditPreview.innerHTML = isEditing ? '<i class="fas fa-edit"></i> Edit Draft' : '<i class="fas fa-save"></i> Finish Edit';
        };
    }

    window.viewTimeline = async (index) => {
        const lead = window.currentLeads[index];
        if (!lead) return;

        try {
            const container = document.getElementById('timeline-container');
            if (container) container.innerHTML = '<div style="color: var(--text-muted);">Loading events...</div>';
            if (timelineModal) timelineModal.style.display = 'flex';

            const leadId = lead.id || encodeURIComponent(lead.title || lead.name || 'your business');
            const response = await fetch(`/api/lead/${leadId}/activity`);
            const data = await response.json();

            if (!container) return;

            if (!data.activities || data.activities.length === 0) {
                container.innerHTML = '<div style="color: var(--text-muted); padding: 1rem 0;">No activity tracked yet.</div>';
                return;
            }

            container.innerHTML = data.activities.map(a => {
                const date = new Date(a.timestamp);
                const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const timeString = a.timestamp ? formatter.format(date) : 'Unknown time';

                let icon = '<i class="fas fa-circle"></i>';
                let title = a.event;
                let color = 'var(--text-muted)';
                let extra = '';

                if (a.event === 'email_sent') {
                    icon = '<i class="fas fa-paper-plane"></i>'; title = 'Email Sent'; color = 'var(--cyan)';
                    extra = `Campaign: ${a.metadata?.campaign || 'Unknown'}`;
                } else if (a.event === 'email_opened') {
                    icon = '<i class="fas fa-eye"></i>'; title = 'Email Opened'; color = 'var(--success)';
                } else if (a.event === 'link_clicked') {
                    icon = '<i class="fas fa-link"></i>'; title = 'Link Clicked'; color = 'var(--danger)';
                    extra = `<a href="${a.metadata?.url}" target="_blank" style="color:var(--cyan);font-size:0.8rem;">${a.metadata?.url}</a>`;
                } else if (a.event === 'lead_discovered') {
                    icon = '<i class="fas fa-search"></i>'; title = 'Lead Discovered'; color = 'var(--primary)';
                } else if (a.event.startsWith('status_updated')) {
                    icon = '<i class="fas fa-sync"></i>'; title = 'Status Updated'; color = 'var(--warning)';
                }

                return `
                    <div style="position: relative; margin-bottom: 1.5rem;">
                        <div style="position: absolute; left: -2.85rem; top: 0; width: 1.5rem; height: 1.5rem; border-radius: 50%; background: ${color}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">
                            ${icon}
                        </div>
                        <div style="font-weight: 600; font-size: 0.95rem; color: #111;">${title}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">${timeString}</div>
                        ${extra ? `<div style="font-size: 0.85rem; background: var(--bg-card); padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border-glass); margin-top: 0.5rem;">${extra}</div>` : ''}
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Failed to load timeline:', error);
            const container = document.getElementById('timeline-container');
            if (container) container.innerHTML = '<div style="color:red">Failed to load activity history.</div>';
        }
    };

    window.viewAnalysis = async (index) => {
        const lead = window.currentLeads[index];
        if (!lead) return;

        const container = document.getElementById('analysis-container');
        const modal = document.getElementById('analysis-modal');
        if (modal) modal.style.display = 'flex';

        // Wire re-analyze button
        const reBtn = document.getElementById('btn-run-analysis');
        if (reBtn) {
            reBtn.onclick = async () => {
                lead.websiteAnalysis = null; // Clear cache to re-fetch
                if (container) container.innerHTML = '<div style="color:var(--text-muted)">Re-analyzing...</div>';
                await doAnalysis();
            };
        }

        async function doAnalysis() {
            // Use cached data if available
            if (lead.websiteAnalysis) {
                renderAnalysis(lead.websiteAnalysis);
                return;
            }
            if (!lead.website) {
                if (container) container.innerHTML = '<div style="color:var(--danger)">No website URL available for this lead.</div>';
                return;
            }
            if (container) container.innerHTML = '<div style="color:var(--text-muted)">🔍 Analyzing website, please wait...</div>';
            try {
                const res = await fetch('/api/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId: lead.id || lead.name, url: lead.website, file: currentCampaignFile })
                });
                const data = await res.json();
                lead.websiteAnalysis = data;
                window.currentLeads[index].websiteAnalysis = data;
                renderAnalysis(data);
            } catch (err) {
                if (container) container.innerHTML = `<div style="color:var(--danger)">Error: ${err.message}</div>`;
            }
        }

        function renderAnalysis(a) {
            if (!container) return;
            if (a.status === 'error') {
                container.innerHTML = `<div style="color:var(--danger)">⚠️ ${a.error || 'Could not analyze website'}</div>`;
                return;
            }
            const issueHtml = (a.issues || []).map(i =>
                `<li style="margin-bottom:0.4rem; color: var(--danger);">⚠️ ${i}</li>`
            ).join('') || '<li style="color:var(--success)">✅ No critical issues found</li>';

            const sScore = a.seoScore ?? '—';
            const spScore = a.speedScore ?? '—';
            const seoColor = sScore >= 70 ? 'var(--success)' : sScore >= 40 ? 'var(--warning)' : 'var(--danger)';
            const speedColor = spScore >= 70 ? 'var(--success)' : spScore >= 40 ? 'var(--warning)' : 'var(--danger)';

            container.innerHTML = `
                <div style="margin-bottom:1.5rem;">
                    <div style="font-size:1.4rem; font-weight:700; margin-bottom:0.5rem;">${a.health || '—'}</div>
                    <div style="font-size:0.85rem; color:var(--text-muted);">${a.title || ''}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">${a.metaDescription || '<em>No meta description</em>'}</div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom:1.5rem;">
                    <div style="background:var(--bg-card); border:1px solid var(--border-glass); border-radius:8px; padding:1rem; text-align:center;">
                        <div style="font-size:1.8rem; font-weight:700; color:${seoColor};">${sScore}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">SEO Score</div>
                    </div>
                    <div style="background:var(--bg-card); border:1px solid var(--border-glass); border-radius:8px; padding:1rem; text-align:center;">
                        <div style="font-size:1.8rem; font-weight:700; color:${speedColor};">${spScore}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">Speed Score</div>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:0.75rem; margin-bottom:1.5rem; font-size:0.8rem;">
                    <div style="background:var(--bg-card); border:1px solid var(--border-glass); border-radius:6px; padding:0.75rem; text-align:center;">
                        ${a.hasContactPage ? '✅' : '❌'}<br>Contact Page
                    </div>
                    <div style="background:var(--bg-card); border:1px solid var(--border-glass); border-radius:6px; padding:0.75rem; text-align:center;">
                        ${a.hasQuoteForm ? '✅' : '❌'}<br>Quote Form
                    </div>
                    <div style="background:var(--bg-card); border:1px solid var(--border-glass); border-radius:6px; padding:0.75rem; text-align:center;">
                        ${a.isResponsive ? '✅' : '❌'}<br>Mobile Ready
                    </div>
                </div>
                <div>
                    <div style="font-weight:600; margin-bottom:0.5rem; font-size:0.9rem;">Issues Detected</div>
                    <ul style="padding-left:1rem; margin:0;">${issueHtml}</ul>
                </div>
            `;
        }

        await doAnalysis();
    };

    // ── UNIVERSAL CLOSE-MODAL HANDLER (covers all modals incl. AI ones) ──
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-modal') || e.target.closest('.close-modal')) {
            document.querySelectorAll('.modal').forEach(m => {
                if (m.contains(e.target.closest('.close-modal') || e.target)) {
                    m.style.display = 'none';
                }
            });
        }
    });
});
