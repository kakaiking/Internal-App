const API_URL = '/api/goals';

// Pagination & State variables
let viewingRecordId = null;
let cachedGoals = null;
let currentPage = 1;
let currentLeaderboardPage = 1;
let lastSearchQuery = '';

const ITEMS_PER_PAGE = 5;
const LEADERBOARD_ITEMS_PER_PAGE = 5;

async function getGoals(forceRefresh = false) {
    if (cachedGoals && !forceRefresh) {
        return cachedGoals;
    }
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API issue');
        cachedGoals = await response.json();
        return cachedGoals;
    } catch (e) {
        console.error('Error fetching goals:', e);
        return [];
    }
}

async function saveGoals(data) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('API issue');
        cachedGoals = null; // Clear local cache
        await render(true); // Force fresh render
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving goals:', e);
        alert('Failed to save goals data to the server.');
    }
}

async function saveWeeklyGoals() {
    const user = document.getElementById('userId').value.trim();
    const inputs = document.querySelectorAll('.g-item');
    const goalsArray = Array.from(inputs).map(i => i.value.trim());

    if (!user) return alert('Please enter your name/username');
    if (goalsArray.some(g => g === '')) {
        return alert('Please enter exactly 5 goals for this week');
    }

    const currentDB = await getGoals();
    
    const record = {
        id: Date.now(),
        user,
        goals: goalsArray.map(g => ({ text: g, done: false })),
        weekId: getWeekIdentifier(new Date())
    };

    currentDB.push(record);
    await saveGoals(currentDB);

    // Broadcast email notification to all team members
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: `weekly goals for ${user}`,
        module: 'Goals',
        excludeEmail: actor.email
    });
    
    // Reset inputs
    document.getElementById('userId').value = '';
    inputs.forEach(i => i.value = '');

    closeGoalModal();
}

async function toggleGoal(recordId, goalIndex) {
    const data = await getGoals();
    const item = data.find(r => r.id === recordId);
    if (item) {
        item.goals[goalIndex].done = !item.goals[goalIndex].done;
        await saveGoals(data);
    }
}

async function deleteRecord(recordId) {
    if (!confirm('Are you sure you want to delete this weekly goals commitment card?')) return;
    const data = await getGoals(true);
    const deletedRecord = data.find(r => r.id === recordId);
    const filtered = data.filter(r => r.id !== recordId);
    if (viewingRecordId === recordId) {
        closeGoalsViewModal();
    }
    await saveGoals(filtered);

    // Broadcast email notification to all team members
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedRecord ? `${deletedRecord.user}'s goals (${deletedRecord.weekId})` : 'a goals record',
        module: 'Goals',
        excludeEmail: actor.email
    });
}

function getWeekIdentifier(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${weekNo}`;
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

async function render(forceRefresh = false) {
    const container = document.getElementById('goalsHistory');
    const leaderboardContainer = document.getElementById('leaderboard');
    const mainPaginationContainer = document.getElementById('mainPagination');
    const lbPaginationContainer = document.getElementById('leaderboardPagination');

    if (!container || !leaderboardContainer) return;

    const data = await getGoals(forceRefresh);
    const searchQuery = (document.getElementById('searchGoals')?.value || '').toLowerCase().trim();

    // Reset pagination to Page 1 if query text changes
    if (searchQuery !== lastSearchQuery) {
        currentPage = 1;
        lastSearchQuery = searchQuery;
    }

    // Filter commitments based on search query
    const filteredData = data.filter(record => {
        const userMatch = record.user.toLowerCase().includes(searchQuery);
        const goalMatch = record.goals.some(g => g.text.toLowerCase().includes(searchQuery));
        const weekMatch = record.weekId.toLowerCase().includes(searchQuery);
        return userMatch || goalMatch || weekMatch;
    });

    container.innerHTML = '';
    leaderboardContainer.innerHTML = '';

    // Handle History pagination parameters
    const totalCount = filteredData.length;
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
        currentPage = maxPage;
    }

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const sortedData = [...filteredData].sort((a, b) => b.id - a.id);
    const paginatedData = sortedData.slice(startIdx, endIdx);

    // Render History
    if (totalCount === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                
                <p>${searchQuery ? 'No commitments match your search query.' : 'No goals logged yet. Click "New Goals" to get started.'}</p>
            </div>
        `;
        if (mainPaginationContainer) mainPaginationContainer.innerHTML = '';
    } else {
        paginatedData.forEach(record => {
            const completedCount = record.goals.filter(g => g.done).length;
            const pct = Math.round((completedCount / 5) * 100);
            
            const card = document.createElement('div');
            card.className = 'card accordion-card';
            card.style.cursor = 'pointer';
            card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
            card.style.transition = 'all 0.2s ease';
            card.setAttribute('onclick', `openGoalsViewModal(${record.id})`);

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding: 2px;">
                    <strong style="font-size: 0.85rem;">
                        <span style="color:#fb7185;">${record.weekId}</span> 
                        <span style="color:white; margin-left:4px;"> ${record.user}</span>
                    </strong>
                    <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="event.stopPropagation(); deleteRecord(${record.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                
                <div class="infographics-bar" style="margin: 4px 0; height: 6px;">
                    <div class="infographics-fill" style="width: ${pct}%"></div>
                </div>
                <p style="font-size:0.75rem; color:#9ca3af; margin:0; font-weight:500; padding: 2px;">
                     ${completedCount}/5 completed (${pct}%)
                </p>
            `;
            container.appendChild(card);
        });

        // Render Main History Pagination
        if (mainPaginationContainer) {
            const startRange = startIdx + 1;
            const endRange = Math.min(endIdx, totalCount);
            const prevDisabled = currentPage === 1;
            const nextDisabled = endIdx >= totalCount;

            mainPaginationContainer.innerHTML = `
                <span>${startRange}-${endRange} of ${totalCount}</span>
                <div style="display: flex; gap: 6px;">
                    <button onclick="changeMainPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#fb7185'}; border: none; color: ${prevDisabled ? '#4b5563' : 'white'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                    <button onclick="changeMainPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#fb7185'}; border: none; color: ${nextDisabled ? '#4b5563' : 'white'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
                </div>
            `;
        }
    }

    // Compute Leaderboard
    if (data.length === 0) {
        leaderboardContainer.innerHTML = `<p style="font-size:0.9rem; color:#6b7280; font-style:italic; margin:0; text-align:center;">No data logged</p>`;
        if (lbPaginationContainer) lbPaginationContainer.innerHTML = '';
        return;
    }

    const userStats = {};
    data.forEach(r => {
        if (!userStats[r.user]) userStats[r.user] = { attempted: 0, completed: 0 };
        userStats[r.user].attempted += 5;
        userStats[r.user].completed += r.goals.filter(g => g.done).length;
    });

    const sortedUsers = Object.entries(userStats).sort((a,b) => b[1].completed - a[1].completed);
    const totalLbCount = sortedUsers.length;

    // Leaderboard page constraint
    const maxLbPage = Math.max(1, Math.ceil(totalLbCount / LEADERBOARD_ITEMS_PER_PAGE));
    if (currentLeaderboardPage > maxLbPage) {
        currentLeaderboardPage = maxLbPage;
    }

    const lbStartIdx = (currentLeaderboardPage - 1) * LEADERBOARD_ITEMS_PER_PAGE;
    const lbEndIdx = lbStartIdx + LEADERBOARD_ITEMS_PER_PAGE;
    const paginatedLbUsers = sortedUsers.slice(lbStartIdx, lbEndIdx);
    
    paginatedLbUsers.forEach(([username, stats], relativeIdx) => {
        const absoluteIdx = lbStartIdx + relativeIdx;
        const pct = Math.round((stats.completed / stats.attempted) * 100 || 0);
        let rankBadge = '';
        
        if (absoluteIdx === 0) {
            rankBadge = '';
        } else if (absoluteIdx === 1) {
            rankBadge = '';
        } else if (absoluteIdx === 2) {
            rankBadge = '';
        } else {
            rankBadge = `<span style="color:#6b7280; font-weight:bold; font-size:0.9rem; width:16px; text-align:center; display:inline-block;">${absoluteIdx + 1}</span>`;
        }

        const entry = document.createElement('div');
        entry.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:rgba(0,0,0,0.15); border-radius:10px; border:1px solid rgba(255,255,255,0.03);";
        entry.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                ${rankBadge}
                <strong style="color:white; font-size:0.95rem;">${username}</strong>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.9rem; font-weight:600; color:#10b981;">${pct}% Met</div>
                <div style="font-size:0.75rem; color:#6b7280;">${stats.completed}/${stats.attempted} goals</div>
            </div>
        `;
        leaderboardContainer.appendChild(entry);
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
                <button onclick="changeLeaderboardPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#fb7185'}; border: none; color: ${prevDisabled ? '#4b5563' : 'white'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button onclick="changeLeaderboardPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#fb7185'}; border: none; color: ${nextDisabled ? '#4b5563' : 'white'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
    }
}

// Modal handling functions - Goal Modal
window.openGoalModal = function () {
    const modal = document.getElementById('goalModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeGoalModal = function () {
    const modal = document.getElementById('goalModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Leaderboard Modal
window.openLeaderboardModal = function () {
    const modal = document.getElementById('leaderboardModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeLeaderboardModal = function () {
    const modal = document.getElementById('leaderboardModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Goals View Modal
window.openGoalsViewModal = function (recordId) {
    viewingRecordId = recordId;
    const modal = document.getElementById('goalsViewModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
    renderGoalsViewContent();
};

window.closeGoalsViewModal = function () {
    const modal = document.getElementById('goalsViewModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        viewingRecordId = null;
    }, 300);
};

// Sub-render function to display specific goals of the viewing card inside modal
async function renderGoalsViewContent() {
    if (!viewingRecordId) return;
    const data = await getGoals();
    const record = data.find(r => r.id === viewingRecordId);
    if (!record) {
        closeGoalsViewModal();
        return;
    }

    const titleElem = document.getElementById('goalsViewTitle');
    const metaElem = document.getElementById('goalsViewMeta');
    const listElem = document.getElementById('goalsViewList');

    if (titleElem) {
        titleElem.innerHTML = ` ${record.user}'s Goals`;
    }

    const completedCount = record.goals.filter(g => g.done).length;
    const pct = Math.round((completedCount / 5) * 100);

    if (metaElem) {
        metaElem.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 6px;">
                <span>Week: <strong style="color: #fb7185;">${record.weekId}</strong></span>
                <span><strong>${completedCount} of 5 completed (${pct}%)</strong></span>
            </div>
            <div class="infographics-bar" style="margin: 4px 0; height: 8px;">
                <div class="infographics-fill" style="width: ${pct}%"></div>
            </div>
        `;
    }

    if (listElem) {
        listElem.innerHTML = record.goals.map((g, idx) => `
            <div class="goal-item-row" style="margin-bottom: 4px; padding: 10px 12px; display: flex; align-items: center;">
                <input type="checkbox" class="goal-checkbox" style="width:16px; height:16px; margin-right:12px;" ${g.done ? 'checked' : ''} onchange="toggleGoalInModal(${record.id}, ${idx})">
                <span style="font-size:0.9rem; transition:all 0.2s; text-decoration: ${g.done ? 'line-through' : 'none'}; color: ${g.done ? '#6b7280' : '#d1d5db'}">
                    ${g.text}
                </span>
            </div>
        `).join('');
    }
}

// Checkbox handler specifically within the viewing modal
window.toggleGoalInModal = async function(recordId, goalIndex) {
    await toggleGoal(recordId, goalIndex);
    renderGoalsViewContent(); // Update modal immediately
};

// Close modals when user clicks outside of the active container boundary
window.onclick = function (event) {
    const goalModal = document.getElementById('goalModal');
    const leaderboardModal = document.getElementById('leaderboardModal');
    const goalsViewModal = document.getElementById('goalsViewModal');
    if (event.target === goalModal) {
        closeGoalModal();
    }
    if (event.target === leaderboardModal) {
        closeLeaderboardModal();
    }
    if (event.target === goalsViewModal) {
        closeGoalsViewModal();
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