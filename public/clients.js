// ── Clients Page Script ──────────────────────────────────────────────────────
// Handles: Load, Render, Filter, Add, Edit, Refresh

// Clients UI Actions Implementation - Trigger Deploy
let rawClients = [];

// ── Auth helper (token from localStorage, set by app.js) ────────────────────
function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem('lgp_token')}` };
}

// ── 1. LOAD & RENDER ─────────────────────────────────────────────────────────
async function loadClients() {
    const list = document.getElementById('clients-list');
    if (list) list.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Loading clients…</td></tr>';

    try {
        const res = await fetch('/api/all-clients', { headers: authHeader() });
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();
        rawClients = data.clients || [];
        renderClients(rawClients);
    } catch (error) {
        console.error('Failed to load clients:', error);
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
            'New': 'var(--primary)',
            'Contacted': 'var(--cyan)',
            'Replied': 'var(--gold)',
            'Qualified': 'var(--success)',
            'Closed': 'var(--text-muted)'
        }[c.status] || 'var(--text-muted)';

        const websiteHtml = c.website
            ? `<a href="${c.website.startsWith('http') ? c.website : 'https://' + c.website}" target="_blank" rel="noopener" style="color:var(--cyan); text-decoration:none;"><i class="fas fa-external-link-alt"></i> Link</a>`
            : `<span style="color:var(--text-muted)">—</span>`;

        return `<tr>
            <td style="font-weight:600; color:var(--text-main);">${escHtml(c.name || 'Unknown')}</td>
            <td>${c.email ? escHtml(c.email) : '<span style="color:var(--text-muted)">No email</span>'}</td>
            <td>${c.phone && c.phone !== 'N/A' ? escHtml(c.phone) : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${websiteHtml}</td>
            <td><span style="padding:3px 10px; border-radius:20px; font-size:0.75rem; font-weight:600; background:${statusColor}22; color:${statusColor}; border:1px solid ${statusColor}44;">${escHtml(c.status || 'New')}</span></td>
            <td class="client-notes" title="${escAttr(c.notes || '')}">${c.notes ? escHtml(c.notes) : '<span style="opacity:0.4">No notes</span>'}</td>
            <td>
                <button class="btn btn-sm btn-outline" onclick="openClientEdit(${i})" title="Edit client">
                    <i class="fas fa-pen"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ── 2. FILTER ────────────────────────────────────────────────────────────────
function filterClients(query) {
    if (!query || query.trim() === '') return renderClients(rawClients);
    const q = query.toLowerCase().trim();
    const filtered = rawClients.filter(c =>
        (c.name  && c.name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
    );
    renderClients(filtered);
}

// ── 3. EDIT CLIENT ───────────────────────────────────────────────────────────
function openClientEdit(index) {
    const client = rawClients[index];
    if (!client) { console.error('Client not found at index', index); return; }

    // Store index for save
    document.getElementById('edit-client-id').value   = client.id   || '';
    document.getElementById('edit-client-file').value = client.file || '';
    document.getElementById('edit-client-status').value = client.status || 'New';
    document.getElementById('edit-client-notes').value  = client.notes  || '';

    // Populate extra fields if they exist in the modal
    const emailEl = document.getElementById('edit-client-email');
    const phoneEl = document.getElementById('edit-client-phone');
    if (emailEl) emailEl.value = client.email || '';
    if (phoneEl) phoneEl.value = (client.phone && client.phone !== 'N/A') ? client.phone : '';

    document.getElementById('client-edit-modal').style.display = 'flex';
}

function closeClientModal() {
    document.getElementById('client-edit-modal').style.display = 'none';
}

async function saveClientEdit() {
    const id     = document.getElementById('edit-client-id').value;
    const file   = document.getElementById('edit-client-file').value;
    const status = document.getElementById('edit-client-status').value;
    const notes  = document.getElementById('edit-client-notes').value;

    const emailEl = document.getElementById('edit-client-email');
    const phoneEl = document.getElementById('edit-client-phone');
    const updates = { status, notes };
    if (emailEl && emailEl.value.trim()) updates.email = emailEl.value.trim();
    if (phoneEl && phoneEl.value.trim()) updates.phone = phoneEl.value.trim();

    const saveBtn = document.getElementById('btn-save-client-edit');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    try {
        const res = await fetch('/api/leads/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ leadId: id, file, updates })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');

        closeClientModal();
        await loadClients();
        showToast('Client updated successfully!', 'success');
    } catch (error) {
        showToast('Failed to save: ' + error.message, 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save'; }
    }
}

// ── 4. ADD CLIENT ────────────────────────────────────────────────────────────
function openAddClientModal() {
    // Clear previous values
    ['add-client-name','add-client-email','add-client-phone','add-client-website','add-client-notes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const statusEl = document.getElementById('add-client-status');
    if (statusEl) statusEl.value = 'New';

    document.getElementById('client-add-modal').style.display = 'flex';
}

function closeAddClientModal() {
    document.getElementById('client-add-modal').style.display = 'none';
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
    if (createBtn) { createBtn.disabled = true; createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    try {
        const res = await fetch('/api/leads/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ name, email, phone, website, notes, status })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add client');

        closeAddClientModal();
        await loadClients();
        showToast(`"${name}" added successfully!`, 'success');
    } catch (err) {
        showToast('Failed to add client: ' + err.message, 'error');
    } finally {
        if (createBtn) { createBtn.disabled = false; createBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Client'; }
    }
}

// ── 5. TOAST NOTIFICATIONS ───────────────────────────────────────────────────
function showToast(message, type = 'success') {
    let toast = document.getElementById('clients-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'clients-toast';
        toast.style.cssText = `
            position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
            padding: 0.9rem 1.5rem; border-radius: 12px; font-size: 0.9rem;
            font-family: 'Outfit', sans-serif; font-weight: 500;
            display: flex; align-items: center; gap: 0.6rem;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            transition: all 0.3s ease; opacity: 0; transform: translateY(10px);
        `;
        document.body.appendChild(toast);
    }

    const colors = {
        success: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', color: '#6ee7b7', icon: 'fa-check-circle' },
        error:   { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)',  color: '#fca5a5', icon: 'fa-exclamation-circle' }
    };
    const c = colors[type] || colors.success;
    toast.style.background   = c.bg;
    toast.style.border       = `1px solid ${c.border}`;
    toast.style.color        = c.color;
    toast.innerHTML = `<i class="fas ${c.icon}"></i> ${escHtml(message)}`;

    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    // Auto-dismiss
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
    }, 3500);
}

// ── 6. HELPERS ───────────────────────────────────────────────────────────────
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── 7. INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadClients();

    // Close modals when clicking backdrop
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
});
