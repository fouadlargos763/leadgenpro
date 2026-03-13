async function loadCampaigns() {
    const list = document.getElementById('campaigns-list');
    if (!list) return;

    try {
        const response = await fetch('/api/campaign-stats', {
            headers: { Authorization: `Bearer ${localStorage.getItem('lgp_token')}` }
        });
        const data = await response.json();
        const campaigns = data.campaigns || [];
        
        if (campaigns.length === 0) {
            list.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No active campaigns. Create one above to get started.</td></tr>';
            return;
        }

        list.innerHTML = campaigns.map(c => `
            <tr>
                <td style="font-weight:600; color:white;"><i class="fas fa-folder-open" style="color:var(--primary); margin-right:8px;"></i> ${c.name}</td>
                <td>${c.total} <span style="font-size:0.75rem; color:var(--text-muted);">(Extracted)</span></td>
                <td>${c.sent} <span style="font-size:0.75rem; color:var(--text-muted);">(Delivered)</span></td>
                <td><span style="color:${c.openRate > 0 ? 'var(--success)' : 'var(--text-muted)'}">${c.openRate}%</span></td>
                <td><span class="badge-status ${c.status === 'Completed' ? 'status-qualified' : c.status === 'Running' ? 'status-new' : 'status-contacted'}">${c.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline" style="margin-right:0.25rem;" title="View Leads" onclick="window.location.href='/clients?file=${encodeURIComponent(c.file)}'"><i class="fas fa-users"></i></button>
                    <button class="btn btn-sm btn-primary" title="Launch Email Engine" onclick="executeCampaignAction('send', '${c.file}')"><i class="fas fa-paper-plane"></i> Launch</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        list.innerHTML = `<tr><td colspan="6" style="color:var(--danger); text-align:center;">Failed to load campaigns: ${error.message}</td></tr>`;
    }
}

function openNewCampaignModal() {
    document.getElementById('new-campaign-modal').style.display = 'flex';
}

function closeNewCampaignModal() {
    document.getElementById('new-campaign-modal').style.display = 'none';
}

function openTemplateManager() {
    document.getElementById('template-modal').style.display = 'flex';
}

function closeTemplateManager() {
    document.getElementById('template-modal').style.display = 'none';
}

function launchNewCampaign() {
    const src = document.getElementById('camp-source').value;
    document.getElementById('new-campaign-modal').style.display = 'none';

    if (src === 'new') {
        const findModal = document.getElementById('find-modal');
        if (findModal) {
            findModal.style.display = 'flex';
            // Pre-fill the campaign name to match the input if provided
            const inputName = document.getElementById('camp-name').value;
            if(inputName) {
                document.getElementById('find-industry').value = inputName;
            }
        } else {
            alert('Scraper component is currently offline. Please wait or check active campaigns.');
        }
    } else {
        const campaignName = document.getElementById('camp-name').value || 'Sandbox Broadcast';
        if (typeof triggerAction !== 'undefined') {
             triggerAction('send', { campaignName });
             alert('Broadcast sequence initiated. Emails are being queued for all existing leads.');
        } else {
             alert('Action framework failed to bind. Please reload page.');
        }
    }
}

async function executeCampaignAction(action, targetFile) {
    if (!confirm('Are you sure you want to execute batch network requests for this campaign?')) return;
    
    const consoleModal = document.getElementById('console-modal');
    if(consoleModal) consoleModal.style.display = 'flex';
    
    if (typeof triggerAction !== 'undefined') {
        triggerAction(action, { campaignFile: targetFile });
    } else {
        alert('Action framework failed to bind. Please reload page.');
    }
}

// Override Find leads hook from app.js to handle logic completely within campaigns page
setTimeout(() => {
    const btnExecuteFind = document.getElementById('btn-execute-find');
    if (btnExecuteFind) {
        btnExecuteFind.replaceWith(btnExecuteFind.cloneNode(true)); // remove old listeners assigned by app.js
        const newBtn = document.getElementById('btn-execute-find');
        newBtn.addEventListener('click', () => {
             const industry = document.getElementById('find-industry').value.trim();
             const city = document.getElementById('find-city').value.trim();
             const country = document.getElementById('find-country').value.trim();
             const maxLeads = document.getElementById('find-limit').value || 50;

             if (!industry || (!city && !country)) {
                 alert('Industry and at least one Location (City/Country) are required!');
                 return;
             }

             document.getElementById('find-modal').style.display = 'none';
             const locationCombined = [city, country].filter(Boolean).join(', ');
             const campaignName = `${industry} in ${locationCombined}`;
             triggerAction('find', { category: industry, location: locationCombined, campaignName, maxLeads: parseInt(maxLeads) });
        });
    }
}, 500); // Give app.js time to execute first so we can cleanly hook.

document.addEventListener('DOMContentLoaded', () => {
    loadCampaigns();
});
