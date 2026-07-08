const API_URL = '/api/glossary';

// Pagination & State variables
let viewingGlossaryId = null;
let editingTermId = null;
let cachedGlossary = null;
let currentPage = 1;
let currentLeaderboardPage = 1;
let lastSearchQuery = '';
let selectedLetter = 'All';

const ITEMS_PER_PAGE = 5;
const LEADERBOARD_ITEMS_PER_PAGE = 5;

async function getTerms(forceRefresh = false) {
    if (cachedGlossary && !forceRefresh) {
        return cachedGlossary;
    }
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API failure');
        cachedGlossary = await response.json();
        return cachedGlossary;
    } catch (e) {
        console.error('Error fetching glossary:', e);
        return [];
    }
}

async function saveTerms(db) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(db)
        });
        if (!response.ok) throw new Error('API failure');
        cachedGlossary = null; // Clear local cache
        await render(true); // Force fresh render
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving glossary:', e);
        alert('Failed to save glossary term to database.');
    }
}

async function addTerm() {
    const author = document.getElementById('termAuthor').value.trim();
    const term = document.getElementById('termWord').value.trim();
    const def = document.getElementById('termDefinition').value.trim();

    if (!author || !term || !def) return alert('Your name, terminology abbreviation, and definition are required');

    const db = await getTerms();
    db.push({ id: Date.now(), author, term, def });
    await saveTerms(db);

    // Broadcast email notification to all team members
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: term,
        module: 'Glossary',
        excludeEmail: actor.email
    });

    // Reset inputs
    document.getElementById('termAuthor').value = '';
    document.getElementById('termWord').value = '';
    document.getElementById('termDefinition').value = '';

    closeGlossaryModal();
}

async function deleteTerm(id) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const db = await getTerms(true);
    const deletedTerm = db.find(item => item.id === id);
    if (deletedTerm && (deletedTerm.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only delete your own glossary terms.");
        return;
    }
    if (!confirm('Are you sure you want to remove this term from the glossary?')) return;
    const filtered = db.filter(item => item.id !== id);
    if (viewingGlossaryId === id) {
        closeGlossaryDetailModal();
    }
    await saveTerms(filtered);

    // Broadcast email notification to all team members
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedTerm ? deletedTerm.term : 'a glossary term',
        module: 'Glossary',
        excludeEmail: actor.email
    });
}

function selectAlphabet(letter) {
    selectedLetter = letter;
    currentPage = 1; // Reset to page 1 on alphabet filter changes
    render();
}

// Navigation controllers
window.changeMainPage = function (direction) {
    currentPage += direction;
    render();
};

window.changeLeaderboardPage = function (direction) {
    currentLeaderboardPage += direction;
    render();
};

async function renderAlphabetBar(list) {
    const bar = document.getElementById('alphabetBar');
    if (!bar) return;
    bar.innerHTML = '';

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const firstLetters = new Set(list.map(item => item.term.charAt(0).toUpperCase()));

    // Create 'All' button
    const allBtn = document.createElement('button');
    allBtn.textContent = 'All';
    allBtn.style.cssText = `padding: 4px 8px; font-size: 0.75rem; width: auto; margin-bottom: 0; border-radius: 4px; ${selectedLetter === 'All' ? 'background:#2dd4bf; color:black; font-weight:bold;' : 'background:transparent; color:#9ca3af; border:none; cursor:pointer;'}`;
    allBtn.onclick = () => selectAlphabet('All');
    bar.appendChild(allBtn);

    alphabet.forEach(letter => {
        const btn = document.createElement('button');
        btn.textContent = letter;
        const hasTerms = firstLetters.has(letter);

        let btnStyle = `padding: 4px 8px; font-size: 0.75rem; width: auto; margin-bottom: 0; border-radius: 4px; border: none;`;

        if (selectedLetter === letter) {
            btnStyle += `background:#2dd4bf; color:black; font-weight:bold; cursor:pointer;`;
        } else if (hasTerms) {
            btnStyle += `background:rgba(255,255,255,0.06); color:white; cursor:pointer;`;
        } else {
            btnStyle += `background:transparent; color:rgba(255,255,255,0.15); cursor:default; pointer-events:none;`;
        }

        btn.style.cssText = btnStyle;
        btn.onclick = () => selectAlphabet(letter);
        bar.appendChild(btn);
    });
}

async function render(forceRefresh = false) {
    const container = document.getElementById('glossaryList');
    const board = document.getElementById('glossaryLeaderboard');
    const mainPaginationContainer = document.getElementById('mainPagination');
    const lbPaginationContainer = document.getElementById('leaderboardPagination');

    if (!container || !board) return;

    const list = await getTerms(forceRefresh);

    // Sort terms alphabetically
    list.sort((a, b) => a.term.localeCompare(b.term));

    // Render A-Z Navigation Header using all terms
    renderAlphabetBar(list);

    // Apply Search Query & Alphabet Filters
    const query = (document.getElementById('searchBar')?.value || '').toLowerCase().trim();
    if (query !== lastSearchQuery) {
        currentPage = 1;
        lastSearchQuery = query;
    }

    let filtered = list.filter(item =>
        item.term.toLowerCase().includes(query) ||
        item.def.toLowerCase().includes(query) ||
        (item.author && item.author.toLowerCase().includes(query))
    );

    if (selectedLetter !== 'All') {
        filtered = filtered.filter(item => item.term.charAt(0).toUpperCase() === selectedLetter);
    }

    container.innerHTML = '';
    board.innerHTML = '';

    // Render Contributor Leaderboard (always generated using complete data)
    const counts = {};
    list.forEach(item => {
        const contributor = item.author || 'Anonymous';
        counts[contributor] = (counts[contributor] || 0) + 1;
    });
    const ranking = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const totalLbCount = ranking.length;

    if (totalLbCount === 0) {
        board.innerHTML = '<p style="font-size:0.85rem; color:#6b7280; font-style:italic; margin:0; text-align:center; width:100%;">No contributor publications logged yet.</p>';
        if (lbPaginationContainer) lbPaginationContainer.innerHTML = '';
    } else {
        // Leaderboard page constraint
        const maxLbPage = Math.max(1, Math.ceil(totalLbCount / LEADERBOARD_ITEMS_PER_PAGE));
        if (currentLeaderboardPage > maxLbPage) {
            currentLeaderboardPage = maxLbPage;
        }

        const lbStartIdx = (currentLeaderboardPage - 1) * LEADERBOARD_ITEMS_PER_PAGE;
        const lbEndIdx = lbStartIdx + LEADERBOARD_ITEMS_PER_PAGE;
        const paginatedLbUsers = ranking.slice(lbStartIdx, lbEndIdx);

        paginatedLbUsers.forEach(([user, val], relativeIdx) => {
            const absoluteIdx = lbStartIdx + relativeIdx;
            const entry = document.createElement('div');
            entry.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:rgba(0,0,0,0.15); border-radius:10px; border:1px solid rgba(255,255,255,0.03);";

            let rankBadge = '';
            if (absoluteIdx === 0) {
                rankBadge = '';
            } else if (absoluteIdx === 1) {
                rankBadge = '';
            } else if (absoluteIdx === 2) {
                rankBadge = '';
            } else {
                rankBadge = `<span style="color:#6b7280; font-weight:bold; font-size:0.85rem; width:16px; text-align:center; display:inline-block;">${absoluteIdx + 1}</span>`;
            }

            entry.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    ${rankBadge}
                    <strong style="color:white; font-size:0.9rem;">${user}</strong>
                </div>
                <div style="font-size:0.8rem; color:#9ca3af; font-weight:600;">
                    ${val} term${val > 1 ? 's' : ''}
                </div>
            `;
            board.appendChild(entry);
        });

        // Render Leaderboard Pagination controls
        if (lbPaginationContainer) {
            const startRange = lbStartIdx + 1;
            const endRange = Math.min(lbEndIdx, totalLbCount);
            const prevDisabled = currentLeaderboardPage === 1;
            const nextDisabled = lbEndIdx >= totalLbCount;

            lbPaginationContainer.innerHTML = `
                <span>${startRange}-${endRange} of ${totalLbCount}</span>
                <div style="display: flex; gap: 6px;">
                    <button onclick="changeLeaderboardPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#2dd4bf'}; border: none; color: ${prevDisabled ? '#4b5563' : '#111827'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                    <button onclick="changeLeaderboardPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#2dd4bf'}; border: none; color: ${nextDisabled ? '#4b5563' : '#111827'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
                </div>
            `;
        }
    }

    const totalCount = filtered.length;

    if (totalCount === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                
                <p>No terminology matches your current search or alphabet selections.</p>
            </div>
        `;
        if (mainPaginationContainer) mainPaginationContainer.innerHTML = '';
        return;
    }

    // Handle History pagination parameters
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
        currentPage = maxPage;
    }

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginatedTerms = filtered.slice(startIdx, endIdx);

    paginatedTerms.forEach(item => {
        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
        const isOwner = (item.author || '').toLowerCase() === actor.name.toLowerCase();
        const actionButtons = isOwner ? `
            <div style="display: flex; align-items: center; gap: 4px;">
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(45, 212, 191, 0.1); color:#2dd4bf; margin-bottom:0; border: 1px solid rgba(45, 212, 191, 0.15);" onclick="event.stopPropagation(); openEditGlossaryModal(${item.id})">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="event.stopPropagation(); deleteTerm(${item.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = 'card accordion-card';
        card.style.cursor = 'pointer';
        card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        card.style.transition = 'all 0.2s ease';
        card.setAttribute('onclick', `openGlossaryDetailModal(${item.id})`);

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding: 2px;">
                <strong style="font-size: 0.85rem; color: #2dd4bf; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;">
                    
                    ${item.term}
                </strong>
                ${actionButtons}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px; margin-top: 4px; font-size: 0.75rem;">
                <span style="color: #9ca3af;"> ${item.author || 'Anonymous'}</span>
                <span style="color: #6b7280; font-size:0.7rem;">${item.def.length} chars</span>
            </div>
        `;
        container.appendChild(card);
    });

    // Render Main Directory Pagination
    if (mainPaginationContainer) {
        const startRange = startIdx + 1;
        const endRange = Math.min(endIdx, totalCount);
        const prevDisabled = currentPage === 1;
        const nextDisabled = endIdx >= totalCount;

        mainPaginationContainer.innerHTML = `
            <span>${startRange}-${endRange} of ${totalCount}</span>
            <div style="display: flex; gap: 6px;">
                <button onclick="changeMainPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#2dd4bf'}; border: none; color: ${prevDisabled ? '#4b5563' : '#111827'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button onclick="changeMainPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#2dd4bf'}; border: none; color: ${nextDisabled ? '#4b5563' : '#111827'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px; font-weight: bold;">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
    }
}

// Modal handling functions - Register Term Modal
window.openGlossaryModal = function () {
    const modal = document.getElementById('glossaryModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeGlossaryModal = function () {
    const modal = document.getElementById('glossaryModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Contributors Leaderboard Modal
window.openGlossaryLeaderboardModal = function () {
    const modal = document.getElementById('glossaryLeaderboardModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
    render();
};

window.closeGlossaryLeaderboardModal = function () {
    const modal = document.getElementById('glossaryLeaderboardModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Glossary Detail Viewer Modal
window.openGlossaryDetailModal = function (termId) {
    viewingGlossaryId = termId;
    const modal = document.getElementById('glossaryDetailModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
    renderGlossaryDetailContent();
};

window.closeGlossaryDetailModal = function () {
    const modal = document.getElementById('glossaryDetailModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        viewingGlossaryId = null;
    }, 300);
};

// Modal handling functions - Edit Term Modal
window.openEditGlossaryModal = async function (termId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const db = await getTerms();
    const item = db.find(i => i.id === termId);
    if (!item) return;
    if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only edit your own glossary terms.");
        return;
    }
    editingTermId = termId;

    document.getElementById('editTermId').value = item.id;
    document.getElementById('editTermAuthor').value = item.author || '';
    document.getElementById('editTermWord').value = item.term || '';
    document.getElementById('editTermDefinition').value = item.def || '';

    const modal = document.getElementById('editGlossaryModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout
    modal.classList.add('show');
};

window.closeEditGlossaryModal = function () {
    const modal = document.getElementById('editGlossaryModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        editingTermId = null;
    }, 300);
};

// Edit Term save action
window.saveEditTerm = async function () {
    const id = parseInt(document.getElementById('editTermId').value);
    const author = document.getElementById('editTermAuthor').value.trim();
    const term = document.getElementById('editTermWord').value.trim();
    const def = document.getElementById('editTermDefinition').value.trim();

    if (!author || !term || !def) return alert('Your name, terminology abbreviation, and definition are required');

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const db = await getTerms(true);
    const item = db.find(i => i.id === id);
    if (item) {
        if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
            alert("Permission Denied: You can only edit your own glossary terms.");
            return;
        }
        item.author = author;
        item.term = term;
        item.def = def;
        await saveTerms(db);

        // Broadcast email notification to all team members
        window.notifyTeam && window.notifyTeam({
            action: 'edited',
            actorName: actor.name,
            itemName: term,
            module: 'Glossary',
            excludeEmail: actor.email
        });
    }
    closeEditGlossaryModal();
};

// Sub-render function to display selected glossary runbook inside modal view details
async function renderGlossaryDetailContent() {
    if (!viewingGlossaryId) return;
    const glossary = await getTerms();
    const item = glossary.find(i => i.id === viewingGlossaryId);
    if (!item) {
        closeGlossaryDetailModal();
        return;
    }

    const titleElem = document.getElementById('detailGlossaryTitle');
    const metaElem = document.getElementById('detailGlossaryMeta');
    const bodyElem = document.getElementById('detailGlossaryBody');

    if (titleElem) {
        titleElem.innerHTML = `${item.term}`;
    }
    if (metaElem) {
        metaElem.innerHTML = `
            <span>By : <strong>${item.author || 'Anonymous'}</strong></span>
        `;
    }
    if (bodyElem) {
        bodyElem.textContent = item.def;
    }
}

// Close modal when user clicks outside the modal box boundary
window.onclick = function (event) {
    const glossaryModal = document.getElementById('glossaryModal');
    const glossaryLeaderboardModal = document.getElementById('glossaryLeaderboardModal');
    const glossaryDetailModal = document.getElementById('glossaryDetailModal');
    const editGlossaryModal = document.getElementById('editGlossaryModal');

    if (event.target === glossaryModal) {
        closeGlossaryModal();
    }
    if (event.target === glossaryLeaderboardModal) {
        closeGlossaryLeaderboardModal();
    }
    if (event.target === glossaryDetailModal) {
        closeGlossaryDetailModal();
    }
    if (event.target === editGlossaryModal) {
        closeEditGlossaryModal();
    }
};

function waitForFirebaseAndStart() {
    if (window.FirebaseDB) {
        render(true);
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);