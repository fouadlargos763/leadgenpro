/**
 * ── Clients Page Script (Fixed & Robust) ──────────────────────────────────
 * Handles: Load, Render, Filter, Add, Edit, Refresh
 */

// Global state for clients
window.rawClients = [];

// ── Auth helper ─────────────────────────────────────────────────────────────
function getAuthHeader() {
    const token = localStorage.getItem('lgp_token');
    return { 'Authorization': `Bearer ${token}` };
}

// ── 1. LOAD & RENDER ─────────────────────────────────────────────────────────
async function loadClients() {
    console.log('[Clients] Fetching all-clients...');
    const list = document.getElementById('clients-list');
    if (list) list.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Loading clients…</td></tr>';

    try {
        const res = await fetch('/api/all-clients', { headers: getAuthHeader() });
        if (res.status === 401) { window.location.href = '/login'; return; }
        
        const data = await res.json();
        window.rawClients = data.clients || [];
        console.log(`[Clients] Found ${window.rawClients.length} clients.`);
        renderClients(window.rawClients);
    } catch (error) {
        console.error('[Clients] Failed to load clients:', error);
        if (list) list.innerHTML = `<tr><td colspan="7" style="color:var(--danger); text-align:center; padding:2rem;">Failed to load clients. Check your connection.</td></tr>`;
    }
}

function renderClients(clients) {
    const list = document.getElementById('clients-list');
    if (!list) return;

    if (!clients || clients.length === 0) {
        list.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted);">
            <div style="font-size:2rem; margin-bottom:1rem;">📋</div>
            <div style="font-weight:600; margin-bottom:0.5rem;">No clients found</div>
            <div style="font-size:0.85rem;">Generate leads from the Dashboard or add a client manually.</div>
        </td></tr>`;
        return;
    }

    list.innerHTML = clients.map((c, i) => {
        const statusColor = {
            'New': '#6366f1',
            'Contacted': '#22d3ee',
            'Replied': '#f59e0b',
            'Qualified': '#10b981',
            'Closed': '#94a3b8'
        }[c.status] || '#94a3b8';

        const websiteHtml = c.website
            ? `<a href="${c.website.startsWith('http') ? c.website : 'https://' + c.website}" target="_blank" rel="noopener" style="color:var(--cyan); text-decoration:none;"><i class="fas fa-external-link-alt"></i> Link</a>`
            : `<span style="color:var(--text-muted)">—</span>`;

        return `<tr>
            <td style="font-weight:600; color:var(--text-main);">${escapeHtml(c.name || 'Unknown')}</td>
            <td>${c.email ? escapeHtml(c.email) : '<span style="color:var(--text-muted)">No email</span>'}</td>
            <td>${c.phone && c.phone !== 'N/A' ? escapeHtml(c.phone) : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${websiteHtml}</td>
            <td><span style="padding:3px 10px; border-radius:20px; font-size:0.75rem; font-weight:600; background:${statusColor}22; color:${statusColor}; border:1px solid ${statusColor}44;">${escapeHtml(c.status || 'New')}</span></td>
            <td class="client-notes" title="${escapeAttr(c.notes || '')}">${c.notes ? escapeHtml(c.notes) : '<span style="opacity:0.4">No notes</span>'}</td>
            <td>
                <button class="btn btn-sm btn-outline btn-edit-lead" data-index="${i}" title="Edit client">
                    <i class="fas fa-pen"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    // Re-attach listeners to generated buttons
    document.querySelectorAll('.btn-edit-lead').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = btn.getAttribute('data-index');
            openClientEdit(parseInt(index));
        });
    });
}

// ── 2. FILTER ────────────────────────────────────────────────────────────────
function filterClients(query) {
    if (!query || query.trim() === '') return renderClients(window.rawClients);
    const q = query.toLowerCase().trim();
    const filtered = window.rawClients.filter(c =>
        (c.name  && c.name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
    );
    renderClients(filtered);
}

// ── 3. REFRESH ───────────────────────────────────────────────────────────────
async function refreshClients() {
    console.log('[Clients] Refresh triggered.');
    const btn = document.getElementById('btn-refresh-clients');
    const icon = btn?.querySelector('i');
    
    if (icon) icon.style.animation = 'spin 0.8s linear infinite';
    if (btn) btn.disabled = true;

    try {
        await loadClients();
    } finally {
        if (icon) icon.style.animation = '';
        if (btn) btn.disabled = false;
    }
}

// ── 4. EDIT MODAL ────────────────────────────────────────────────────────────
function openClientEdit(index) {
    console.log(`[Clients] Opening edit for index ${index}`);
    const client = window.rawClients[index];
    if (!client) { console.error('[Clients] Client not found at index', index); return; }

    // Populate data
    document.getElementById('edit-client-id').value   = client.id   || '';
    document.getElementById('edit-client-file').value = client.file || '';
    document.getElementById('edit-client-status').value = client.status || 'New';
    document.getElementById('edit-client-notes').value  = client.notes  || '';

    const emailEl = document.getElementById('edit-client-email');
    const phoneEl = document.getElementById('edit-client-phone');
    if (emailEl) emailEl.value = client.email || '';
    if (phoneEl) phoneEl.value = (client.phone && client.phone !== 'N/A') ? client.phone : '';

    const modal = document.getElementById('client-edit-modal');
    if (modal) modal.style.display = 'flex';
}

function closeEditModal() {
    const modal = document.getElementById('client-edit-modal');
    if (modal) modal.style.display = 'none';
}

async function saveClientEdit() {
    const id     = document.getElementById('edit-client-id').value;
    const file   = document.getElementById('edit-client-file').value;
    const status = document.getElementById('edit-client-status').value;
    const notes  = document.getElementById('edit-client-notes').value;

    const email = document.getElementById('edit-client-email')?.value.trim();
    const phone = document.getElementById('edit-client-phone')?.value.trim();
    
    const updates = { status, notes, email, phone };
    const saveBtn = document.getElementById('btn-save-client-edit');
    
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    try {
        const res = await fetch('/api/leads/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ leadId: id, file, updates })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');

        closeEditModal();
        await loadClients();
        showToast('Client updated successfully!', 'success');
    } catch (error) {
        showToast('Failed to save: ' + error.message, 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save'; }
    }
}

// ── 5. ADD MODAL ─────────────────────────────────────────────────────────────
function openAddModal() {
    console.log('[Clients] Opening add manual client modal.');
    ['add-client-name','add-client-email','add-client-phone','add-client-website','add-client-notes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const statusEl = document.getElementById('add-client-status');
    if (statusEl) statusEl.value = 'New';

    const modal = document.getElementById('client-add-modal');
    if (modal) modal.style.display = 'flex';
}

function closeAddModal() {
    const modal = document.getElementById('client-add-modal');
    if (modal) modal.style.display = 'none';
}

async function submitAddClient() {
    const name    = (document.getElementById('add-client-name')?.value    || '').trim();
    const email   = (document.getElementById('add-client-email')?.value   || '').trim();
    const phone   = (document.getElementById('add-client-phone')?.value   || '').trim();
    const website = (document.getElementById('add-client-website')?.value || '').trim();
    const notes   = (document.getElementById('add-client-notes')?.value   || '').trim();
    const status  = document.getElementById('add-client-status')?.value || 'New';

    if (!name) {
        showToast('Company name is required.', 'error');
        document.getElementById('add-client-name')?.focus();
        return;
    }

    const createBtn = document.getElementById('btn-create-client');
    if (createBtn) { createBtn.disabled = true; createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…'; }

    try {
        const res = await fetch('/api/leads/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ name, email, phone, website, notes, status })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add client');

        closeAddModal();
        await loadClients();
        showToast(`"${name}" added successfully!`, 'success');
    } catch (err) {
        showToast('Failed to add client: ' + err.message, 'error');
    } finally {
        if (createBtn) { createBtn.disabled = false; createBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Client'; }
    }
}

// ── 6. UTILS & HELPERS ──────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    let toast = document.getElementById('clients-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'clients-toast';
        document.body.appendChild(toast);
    }
    
    toast.style.cssText = `
        position: fixed; bottom: 2rem; right: 2rem; z-index: 10000;
        padding: 0.9rem 1.5rem; border-radius: 12px; font-size: 0.9rem;
        font-family: 'Outfit', sans-serif; font-weight: 500;
        display: flex; align-items: center; gap: 0.6rem;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        transition: all 0.3s ease; opacity: 1; transform: translateY(0);
    `;

    const colors = {
        success: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', color: '#6ee7b7', icon: 'fa-check-circle' },
        error:   { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)',  color: '#fca5a5', icon: 'fa-exclamation-circle' }
    };
    const c = colors[type] || colors.success;
    toast.style.background = c.bg;
    toast.style.border = `1px solid ${c.border}`;
    toast.style.color = c.color;
    toast.innerHTML = `<i class="fas ${c.icon}"></i> ${escapeHtml(message)}`;

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── 7. INITIALIZATION ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Clients] Initializing page events...');
    
    // Initial data load
    loadClients();

    // Search bar event
    const searchInput = document.getElementById('clients-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterClients(e.target.value));
    }

    // Modal trigger: Add Manual Client
    const addBtn = document.getElementById('btn-add-client');
    if (addBtn) addBtn.addEventListener('click', openAddModal);

    // Modal trigger: Refresh
    const refreshBtn = document.getElementById('btn-refresh-clients');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshClients);

    // Modal Save Actions
    const saveEditBtn = document.getElementById('btn-save-client-edit');
    if (saveEditBtn) saveEditBtn.addEventListener('click', saveClientEdit);

    const saveAddBtn = document.getElementById('btn-create-client');
    if (saveAddBtn) saveAddBtn.addEventListener('click', submitAddClient);

    // Close/Cancel Buttons
    const cancelEdit = document.getElementById('btn-cancel-edit');
    const closeEdit = document.getElementById('btn-close-edit-modal');
    if (cancelEdit) cancelEdit.addEventListener('click', closeEditModal);
    if (closeEdit) closeEdit.addEventListener('click', closeEditModal);

    const cancelAdd = document.getElementById('btn-cancel-add');
    const closeAdd = document.getElementById('btn-close-add-modal');
    if (cancelAdd) cancelAdd.addEventListener('click', closeAddModal);
    if (closeAdd) closeAdd.addEventListener('click', closeAddModal);

    // Global Modal Backdrop Click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    console.log('[Clients] Event listeners attached successfully.');
});
