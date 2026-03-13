let rawClients = [];

async function loadClients() {
    const list = document.getElementById('clients-list');
    if (list) list.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading clients...</td></tr>';
    
    try {
        const res = await fetch('/api/all-clients', {
            headers: { Authorization: `Bearer ${localStorage.getItem('lgp_token')}` }
        });
        const data = await res.json();
        console.log('[Clients] API Data:', data);
        rawClients = data.clients || [];
        console.log('[Clients] Raw Clients count:', rawClients.length);
        renderClients(rawClients);
    } catch (error) {
        console.error('Failed to load clients:', error);
        if (list) list.innerHTML = `<tr><td colspan="7" style="color:var(--danger); text-align:center;">Failed to load clients.</td></tr>`;
    }
}

function renderClients(clients) {
    const list = document.getElementById('clients-list');
    if (!list) return;
    
    if (clients.length === 0) {
        list.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No clients found in any campaigns. Try generating leads first.</td></tr>';
        return;
    }
    
    list.innerHTML = clients.map(c => `
        <tr>
            <td style="font-weight:600; color:var(--text-main);">${c.name || 'Unknown'}</td>
            <td>${c.email || '<span style="color:var(--text-muted);">No Email</span>'}</td>
            <td>${c.phone || '<span style="color:var(--text-muted);">No Phone</span>'}</td>
            <td>${c.website ? `<a href="${c.website.startsWith('http') ? c.website : 'https://'+c.website}" target="_blank" style="color:var(--cyan);"><i class="fas fa-external-link-alt"></i> Link</a>` : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td><span class="badge-status status-${(c.status || 'new').toLowerCase().replace(' ','')}">${c.status || 'New'}</span></td>
            <td class="client-notes" title="${c.notes || ''}">${c.notes || '<span style="opacity: 0.5;">No notes</span>'}</td>
            <td>
                <button class="btn btn-sm btn-outline" onclick="openClientEdit('${c.id}', '${c.file}')"><i class="fas fa-pen"></i></button>
            </td>
        </tr>
    `).join('');
}

function filterClients(query) {
    if (!query) return renderClients(rawClients);
    const q = query.toLowerCase();
    const filtered = rawClients.filter(c => 
        (c.name && c.name.toLowerCase().includes(q)) || 
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
    );
    renderClients(filtered);
}

function openClientEdit(id, file) {
    const client = rawClients.find(c => c.id === id && c.file === file);
    if (!client) return;
    
    document.getElementById('edit-client-id').value = id;
    document.getElementById('edit-client-file').value = file;
    document.getElementById('edit-client-status').value = client.status || 'New';
    document.getElementById('edit-client-notes').value = client.notes || '';
    
    document.getElementById('client-edit-modal').style.display = 'flex';
}

function closeClientModal() {
    document.getElementById('client-edit-modal').style.display = 'none';
}

async function saveClientEdit() {
    const id = document.getElementById('edit-client-id').value;
    const file = document.getElementById('edit-client-file').value;
    const status = document.getElementById('edit-client-status').value;
    const notes = document.getElementById('edit-client-notes').value;
    
    try {
        await fetch('/api/leads/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('lgp_token')}` },
            body: JSON.stringify({ leadId: id, file, updates: { status, notes } })
        });
        
        closeClientModal();
        loadClients();
    } catch (error) {
        alert('Failed to save client: ' + error.message);
    }
}

function openAddClientModal() {
    document.getElementById('client-add-modal').style.display = 'flex';
}

function closeAddClientModal() {
    document.getElementById('client-add-modal').style.display = 'none';
}

async function submitAddClient() {
    const name = document.getElementById('add-client-name').value;
    const email = document.getElementById('add-client-email').value;
    const status = document.getElementById('add-client-status').value;

    if(!name) return alert('Company name is required.');

    try {
        const res = await fetch('/api/leads/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('lgp_token')}` },
            body: JSON.stringify({ name, email, status })
        });
        const data = await res.json();
        if(res.ok) {
            closeAddClientModal();
            loadClients();
        } else {
            alert(data.error);
        }
    } catch (err) {
        alert('Failed to add client.');
    }
}

// Ensure the profile loads from app.js logic natively and load our clients list.
document.addEventListener('DOMContentLoaded', () => {
    loadClients();
});
