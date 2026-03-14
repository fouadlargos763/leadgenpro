/**
 * LeadGenPro - Campaigns Page Logic
 * Handles campaign listing, creation, and template management.
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('[Campaigns] Initializing...');

    // DOM Elements
    const campaignsList = document.getElementById('campaigns-list');
    const btnOpenNewCampaign = document.getElementById('btn-open-new-campaign');
    const btnOpenTemplateManager = document.getElementById('btn-open-template-manager');
    const btnCloseNewCampaign = document.getElementById('btn-close-new-campaign');
    const btnCancelNewCampaign = document.getElementById('btn-cancel-new-campaign');
    const btnLaunchNewCampaign = document.getElementById('btn-launch-new-campaign');
    const btnCloseTemplateManager = document.getElementById('btn-close-template-manager');
    const btnSaveTemplate = document.getElementById('btn-save-template');
    const btnPreviewRendering = document.getElementById('btn-preview-rendering');
    
    const newCampaignModal = document.getElementById('new-campaign-modal');
    const templateModal = document.getElementById('template-modal');
    const findModal = document.getElementById('find-modal');
    const consoleModal = document.getElementById('console-modal');
    
    const btnCloseFindModal = document.getElementById('btn-close-find-modal');
    const btnCancelFindModal = document.getElementById('btn-cancel-find-modal');
    const btnExecuteFind = document.getElementById('btn-execute-find');

    const campNameInput = document.getElementById('camp-name');
    const campSourceSelect = document.getElementById('camp-source');
    
    // Initial Load
    loadCampaigns();

    // Event Listeners
    if (btnOpenNewCampaign) {
        btnOpenNewCampaign.addEventListener('click', () => {
            if (newCampaignModal) newCampaignModal.style.display = 'flex';
        });
    }

    const closeNewCampaign = () => {
        if (newCampaignModal) newCampaignModal.style.display = 'none';
    };

    if (btnCloseNewCampaign) btnCloseNewCampaign.addEventListener('click', closeNewCampaign);
    if (btnCancelNewCampaign) btnCancelNewCampaign.addEventListener('click', closeNewCampaign);

    if (btnOpenTemplateManager) {
        btnOpenTemplateManager.addEventListener('click', () => {
            if (templateModal) templateModal.style.display = 'flex';
        });
    }

    const closeTemplate = () => {
        if (templateModal) templateModal.style.display = 'none';
    };

    if (btnCloseTemplateManager) btnCloseTemplateManager.addEventListener('click', closeTemplate);
    if (btnSaveTemplate) btnSaveTemplate.addEventListener('click', closeTemplate);

    if (btnLaunchNewCampaign) {
        btnLaunchNewCampaign.addEventListener('click', () => {
            const src = campSourceSelect ? campSourceSelect.value : 'new';
            if (newCampaignModal) newCampaignModal.style.display = 'none';

            if (src === 'new') {
                if (findModal) {
                    findModal.style.display = 'flex';
                    const industryInput = document.getElementById('find-industry');
                    if (industryInput && campNameInput && campNameInput.value) {
                        industryInput.value = campNameInput.value;
                    }
                } else {
                    showToast('Scraper component is currently offline.', 'error');
                }
            } else {
                const campaignName = (campNameInput && campNameInput.value) ? campNameInput.value : 'Sandbox Broadcast';
                if (window.triggerAction) {
                    window.triggerAction('send', { campaignName });
                } else {
                    showToast('Global action framework not loaded.', 'error');
                }
            }
        });
    }

    if (btnCloseFindModal) {
        btnCloseFindModal.addEventListener('click', () => {
            if (findModal) findModal.style.display = 'none';
        });
    }

    if (btnCancelFindModal) {
        btnCancelFindModal.addEventListener('click', () => {
            if (findModal) findModal.style.display = 'none';
        });
    }

    // Override or set Find Leads execution for this page
    if (btnExecuteFind) {
        // Remove existing listeners if any (though and cloneNode(true) is a bit heavy, let's just make sure we only add ours)
        const newBtn = btnExecuteFind.cloneNode(true);
        btnExecuteFind.parentNode.replaceChild(newBtn, btnExecuteFind);
        
        newBtn.addEventListener('click', () => {
            const industry = document.getElementById('find-industry')?.value.trim();
            const city = document.getElementById('find-city')?.value.trim();
            const country = document.getElementById('find-country')?.value.trim();
            const maxLeads = document.getElementById('find-limit')?.value || 50;

            if (!industry || (!city && !country)) {
                showToast('Industry and at least one Location are required!', 'error');
                return;
            }

            if (findModal) findModal.style.display = 'none';
            const locationCombined = [city, country].filter(Boolean).join(', ');
            const campaignName = `${industry} in ${locationCombined}`;
            
            if (window.triggerAction) {
                window.triggerAction('find', { category: industry, location: locationCombined, campaignName, maxLeads: parseInt(maxLeads) });
            } else {
                showToast('Global action framework not loaded.', 'error');
            }
        });
    }

    // Modal Background Clicks
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    /**
     * Fetch and render campaigns list
     */
    async function loadCampaigns() {
        if (!campaignsList) return;
        campaignsList.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading active campaigns...</td></tr>';

        try {
            const response = await fetch('/api/campaign-stats');
            if (!response.ok) throw new Error('API server unreachable');
            
            const data = await response.json();
            const campaigns = data.campaigns || [];
            
            if (campaigns.length === 0) {
                campaignsList.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No campaigns found. Create your first one to start outreach.</td></tr>';
                return;
            }

            campaignsList.innerHTML = campaigns.map(c => `
                <tr>
                    <td style="font-weight:600; color:white;">
                        <i class="fas fa-folder-open" style="color:var(--primary); margin-right:8px;"></i> ${escapeHtml(c.name)}
                    </td>
                    <td>${c.total} <span style="font-size:0.75rem; color:var(--text-muted);">(Total)</span></td>
                    <td>${c.sent} <span style="font-size:0.75rem; color:var(--text-muted);">(Sent)</span></td>
                    <td><span style="color:${c.openRate > 15 ? 'var(--success)' : (c.openRate > 0 ? 'var(--gold)' : 'var(--text-muted)')}">${c.openRate}%</span></td>
                    <td><span class="badge-status ${getStatusClass(c.status)}">${c.status}</span></td>
                    <td>
                        <div style="display:flex; gap:0.5rem;">
                            <button class="btn btn-sm btn-outline" title="View Leads" onclick="location.href='/clients?file=${encodeURIComponent(c.file)}'">
                                <i class="fas fa-users"></i>
                            </button>
                            <button class="btn btn-sm btn-primary launch-batch-btn" data-file="${escapeAttr(c.file)}" title="Launch Bulk Email">
                                <i class="fas fa-paper-plane"></i> Launch
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');

            // Attach listeners to dynamic buttons
            document.querySelectorAll('.launch-batch-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const file = btn.getAttribute('data-file');
                    executeCampaignAction('send', file);
                });
            });

        } catch (error) {
            console.error('[Campaigns] Error:', error);
            campaignsList.innerHTML = `<tr><td colspan="6" style="color:var(--danger); text-align:center; padding:2rem;">
                <i class="fas fa-exclamation-triangle"></i> Failed to load: ${error.message}
            </td></tr>`;
        }
    }

    /**
     * Trigger batch action (Mail/Send) for a specific campaign file
     */
    function executeCampaignAction(action, targetFile) {
        if (!confirm(`Are you sure you want to trigger "${action}" for this batch? This will communicate with external prospects.`)) return;
        
        if (window.triggerAction) {
            window.triggerAction(action, { campaignFile: targetFile });
        } else {
            showToast('Global action framework not found.', 'error');
        }
    }

    // Helper: Status Badge CSS Class
    function getStatusClass(status) {
        if (status === 'Completed') return 'status-qualified';
        if (status === 'Running') return 'status-new';
        if (status === 'Shared') return 'status-contacted';
        return 'status-new';
    }

    // Helper: Escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function escapeAttr(str) {
        if (!str) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Helper: Toast (Uses global if available, else simple alert)
    function showToast(msg, type = 'info') {
        if (window.showToast) {
            window.showToast(msg, type);
        } else {
            alert(msg);
        }
    }
});
