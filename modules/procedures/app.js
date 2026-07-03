const API_URL = '/api/procedures';

async function getProcedures() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API failure');
        return await response.json();
    } catch (e) {
        console.error('Error fetching procedures:', e);
        return [];
    }
}

async function saveProcedures(procs) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(procs)
        });
        if (!response.ok) throw new Error('API failure');
        await render();
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving procedures:', e);
        alert('Failed to save procedures runbook to database.');
    }
}

async function addProcedure() {
    const category = document.getElementById('procCat').value;
    const title = document.getElementById('procTitle').value.trim();
    const steps = document.getElementById('procSteps').value.trim();

    if (!title || !steps) return alert('A title and execution guide details are required');

    const procs = await getProcedures();
    procs.push({ id: Date.now(), category, title, steps });
    await saveProcedures(procs);

    document.getElementById('procTitle').value = '';
    document.getElementById('procSteps').value = '';

    closeProcedureModal();
}

async function deleteProcedure(id) {
    if (!confirm('Are you sure you want to remove this procedure runbook?')) return;
    const procs = await getProcedures();
    const filtered = procs.filter(p => p.id !== id);
    await saveProcedures(filtered);
}

async function render() {
    const container = document.getElementById('proceduresList');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem; color:#a78bfa;"></i></div>';

    const list = await getProcedures();
    const filterVal = document.getElementById('filterCategory').value;
    const searchQuery = (document.getElementById('searchProcedures')?.value || '').toLowerCase().trim();

    // Filter by Dropdown Category
    let filtered = list;
    if (filterVal !== 'All') {
        filtered = list.filter(p => p.category === filterVal);
    }

    // Filter by Search Query
    filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(searchQuery) ||
        p.steps.toLowerCase().includes(searchQuery) ||
        p.category.toLowerCase().includes(searchQuery)
    );

    container.innerHTML = '';

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-scroll"></i>
                <p>${searchQuery ? 'No procedures match your search query.' : 'No procedures found for this category.'}</p>
            </div>
        `;
        return;
    }

    // Sort: newest first
    filtered.sort((a,b) => b.id - a.id);

    filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '16px';
        
        // Parse steps into array of lines
        const stepLines = p.steps.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1.1rem; color:white;">
                    <i class="fa-solid fa-terminal" style="color:#a78bfa; margin-right:8px;"></i>
                    ${p.title}
                </h4>
                <div style="display:flex; gap:8px; align-items:center;">
                    <span class="badge" style="background:rgba(167, 139, 250, 0.15); color:#a78bfa; border-color:rgba(167, 139, 250, 0.3);">
                        ${p.category}
                    </span>
                    <button class="secondary-btn" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="deleteProcedure(${p.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <p style="font-size:0.8rem; color:#6b7280; font-weight:600; margin:12px 0 6px 0; text-transform:uppercase; letter-spacing:0.5px;">
                <i class="fa-solid fa-list-check"></i> Checklist Runner (Progress Helper)
            </p>
            
            <div style="display:flex; flex-direction:column; gap:6px; background:rgba(0,0,0,0.2); padding:14px; border-radius:10px; border:1px solid rgba(255,255,255,0.03);">
                ${stepLines.map((line, idx) => {
                    const uniqueId = `check-${p.id}-${idx}`;
                    return `
                        <label for="${uniqueId}" style="display:flex; align-items:flex-start; gap:10px; padding:6px; border-radius:6px; cursor:pointer; transition:all 0.15s;" class="step-label" onclick="toggleLabelStrike('${uniqueId}')">
                            <input type="checkbox" id="${uniqueId}" style="width:16px; height:16px; margin:2px 0 0 0; cursor:pointer; flex-shrink:0;">
                            <span id="text-${uniqueId}" style="font-size:0.88rem; color:#d1d5db; line-height:1.4;">${line}</span>
                        </label>
                    `;
                }).join('')}
            </div>
        `;
        container.appendChild(card);
    });
}

// Client-side visual toggle helper for runbooks
window.toggleLabelStrike = function(checkboxId) {
    // Wait a brief tick for checkbox state change
    setTimeout(() => {
        const checkbox = document.getElementById(checkboxId);
        const textSpan = document.getElementById(`text-${checkboxId}`);
        if (checkbox && textSpan) {
            if (checkbox.checked) {
                textSpan.style.textDecoration = 'line-through';
                textSpan.style.color = '#6b7280';
            } else {
                textSpan.style.textDecoration = 'none';
                textSpan.style.color = '#d1d5db';
            }
        }
    }, 20);
};

// Modal handling functions
window.openProcedureModal = function () {
    const modal = document.getElementById('procedureModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeProcedureModal = function () {
    const modal = document.getElementById('procedureModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Close modal when user clicks outside the modal boundary box
window.onclick = function (event) {
    const modal = document.getElementById('procedureModal');
    if (event.target === modal) {
        closeProcedureModal();
    }
};

document.addEventListener('DOMContentLoaded', render);