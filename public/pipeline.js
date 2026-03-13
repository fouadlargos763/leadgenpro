let pipelineClients = [];

async function loadPipeline() {
    try {
        const res = await fetch('/api/all-clients', {
            headers: { Authorization: `Bearer ${localStorage.getItem('lgp_token')}` }
        });
        const data = await res.json();
        pipelineClients = data.clients || [];
        renderPipeline();
    } catch (error) {
        console.error('Failed to load pipeline:', error);
    }
}

function renderPipeline() {
    const query = document.getElementById('pipeline-search').value.toLowerCase();
    
    const validStates = ['New', 'Contacted', 'Replied', 'Qualified', 'Closed'];
    const buckets = { 'New': [], 'Contacted': [], 'Replied': [], 'Qualified': [], 'Closed': [] };
    
    pipelineClients.forEach(c => {
        if (query && !(c.name && c.name.toLowerCase().includes(query)) && !(c.email && c.email.toLowerCase().includes(query))) return;
        const status = validStates.includes(c.status) ? c.status : 'New';
        buckets[status].push(c);
    });

    for (let status of validStates) {
        const colClass = status.toLowerCase();
        const headerCount = document.getElementById(`count-${colClass}`);
        if (headerCount) headerCount.innerText = buckets[status].length;
        
        const column = document.querySelector(`.col-${colClass} .kanban-body`);
        if (column) {
            column.innerHTML = buckets[status].map(c => `
                <div class="kanban-card" draggable="true" ondragstart="drag(event, '${c.id}', '${c.file}')" data-id="${c.id}">
                    <h4>${c.name || 'Unknown Client'}</h4>
                    <p><i class="fas fa-envelope"></i> ${c.email || 'No email'}</p>
                    <div class="contact">
                        <span><i class="fas fa-phone"></i> ${c.phone || 'N/A'}</span>
                        ${c.website ? `<span><i class="fas fa-globe"></i> ${c.website}</span>` : ''}
                    </div>
                </div>
            `).join('');
        }
    }
}

let draggedItemId = null;
let draggedItemFile = null;

function drag(ev, id, file) {
    draggedItemId = id;
    draggedItemFile = file;
    ev.dataTransfer.setData("text", id);
    ev.target.style.opacity = "0.5";
}

document.addEventListener('dragend', (ev) => {
    if (ev.target.className.includes('kanban-card')) {
        ev.target.style.opacity = "1";
    }
});

function allowDrop(ev) {
    ev.preventDefault();
}

async function drop(ev, newStatus) {
    ev.preventDefault();
    if (!draggedItemId || !draggedItemFile) return;

    const lead = pipelineClients.find(c => c.id === draggedItemId && c.file === draggedItemFile);
    if (!lead || lead.status === newStatus) return;

    // Immediately update UI optimisticly
    lead.status = newStatus;
    renderPipeline();

    // Persist cleanly via the endpoint
    try {
        await fetch('/api/leads/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('lgp_token')}` },
            body: JSON.stringify({ leadId: draggedItemId, file: draggedItemFile, updates: { status: newStatus } })
        });
    } catch (error) {
        alert('Failed to update status on server.');
        loadPipeline(); // rollback
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadPipeline();
});
