/**
 * LeadGenPro - Pipeline (Kanban) Page Logic
 * Implements drag-and-drop workflow for client stages.
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('[Pipeline] Initializing...');

    let pipelineClients = [];
    const searchInput = document.getElementById('pipeline-search');
    const board = document.querySelector('.kanban-board');

    // Initial Load
    loadPipeline();

    // Event Listeners
    if (searchInput) {
        searchInput.addEventListener('input', renderPipeline);
    }

    // Drag and Drop Delegation
    if (board) {
        board.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('kanban-card')) {
                const id = e.target.getAttribute('data-id');
                const file = e.target.getAttribute('data-file');
                e.dataTransfer.setData('text/plain', JSON.stringify({ id, file }));
                e.target.style.opacity = '0.5';
            }
        });

        board.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('kanban-card')) {
                e.target.style.opacity = '1';
            }
        });

        board.addEventListener('dragover', (e) => {
            e.preventDefault(); // Required for drop
            const column = e.target.closest('.kanban-column');
            if (column) column.style.background = 'rgba(255,255,255,0.06)';
        });

        board.addEventListener('dragleave', (e) => {
            const column = e.target.closest('.kanban-column');
            if (column) column.style.background = 'rgba(255,255,255,0.03)';
        });

        board.addEventListener('drop', async (e) => {
            e.preventDefault();
            const column = e.target.closest('.kanban-column');
            if (!column) return;
            
            column.style.background = 'rgba(255,255,255,0.03)';
            const newStatus = column.getAttribute('data-status');
            
            try {
                const rawData = e.dataTransfer.getData('text/plain');
                if (!rawData) return;
                
                const data = JSON.parse(rawData);
                const { id, file } = data;
                
                if (!id || !file) return;

                const client = pipelineClients.find(c => c.id === id && c.file === file);
                if (!client) return;

                if (client.status === newStatus) return;

                // Optimistic Update
                const oldStatus = client.status;
                client.status = newStatus;
                renderPipeline();

                // Persistence
                const res = await fetch('/api/leads/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId: id, file: file, updates: { status: newStatus } })
                });

                if (!res.ok) {
                    throw new Error('Server update failed');
                }
                
                showToast(`Lead moved to ${newStatus}`, 'success');

            } catch (err) {
                console.error('[Pipeline] Drop Error:', err);
                showToast('Failed to update stage. Refreshing...', 'error');
                loadPipeline(); // Rollback
            }
        });
    }

    /**
     * Fetch all clients (aggregated)
     */
    async function loadPipeline() {
        try {
            const res = await fetch('/api/all-clients');
            if (!res.ok) throw new Error('Authentication expired or server offline');
            
            const data = await res.json();
            pipelineClients = data.clients || [];
            renderPipeline();
        } catch (error) {
            console.error('[Pipeline] Load Error:', error);
            showToast('Unable to synchronize pipeline data.', 'error');
        }
    }

    /**
     * Render board columns
     */
    function renderPipeline() {
        const query = searchInput ? searchInput.value.toLowerCase() : '';
        const validStates = ['New', 'Contacted', 'Replied', 'Qualified', 'Closed'];
        const buckets = { 'New': [], 'Contacted': [], 'Replied': [], 'Qualified': [], 'Closed': [] };
        
        pipelineClients.forEach(c => {
            const match = !query || 
                        (c.name && c.name.toLowerCase().includes(query)) || 
                        (c.email && c.email.toLowerCase().includes(query)) ||
                        (c.website && c.website.toLowerCase().includes(query));
            
            if (!match) return;
            
            const status = validStates.includes(c.status) ? c.status : 'New';
            buckets[status].push(c);
        });

        for (let status of validStates) {
            const colId = status.toLowerCase();
            const headerCount = document.getElementById(`count-${colId}`);
            if (headerCount) headerCount.innerText = buckets[status].length;
            
            const column = document.querySelector(`.col-${colId} .kanban-body`);
            if (column) {
                if (buckets[status].length === 0) {
                    column.innerHTML = '<div style="text-align:center; padding: 2rem; color:var(--text-muted); font-size: 0.8rem; border: 1px dashed var(--border-glass); border-radius: 8px;">No leads here.</div>';
                } else {
                    column.innerHTML = buckets[status].map(c => `
                        <div class="kanban-card" draggable="true" 
                             data-id="${escapeAttr(c.id)}" 
                             data-file="${escapeAttr(c.file)}">
                            <h4>${escapeHtml(c.name || 'Unknown Client')}</h4>
                            <p title="Click to view details (feature coming soon)"><i class="fas fa-envelope"></i> ${escapeHtml(c.email || 'No email')}</p>
                            <div class="contact">
                                <span><i class="fas fa-phone"></i> ${escapeHtml(c.phone || 'N/A')}</span>
                                ${c.website ? `<span title="${escapeAttr(c.website)}"><i class="fas fa-globe"></i> Website</span>` : ''}
                            </div>
                        </div>
                    `).join('');
                }
            }
        }
    }

    // Helpers
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function escapeAttr(str) {
        if (!str) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function showToast(msg, type = 'info') {
        if (window.showToast) {
            window.showToast(msg, type);
        } else {
            console.log(`[Toast] ${type}: ${msg}`);
        }
    }
});
