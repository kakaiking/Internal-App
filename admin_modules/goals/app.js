const API_URL = '/api/goals';

// Pagination & State variables
let viewingRecordId = null;
let cachedGoals = null;
let currentPage = 1;
let currentLeaderboardPage = 1;
let lastSearchQuery = '';
let currentTab = 'annual';

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
    
    // Capture scope selection
    const scopeElement = document.querySelector('input[name="goalScope"]:checked');
    const scope = scopeElement ? scopeElement.value : 'personal';

    const record = {
        id: Date.now(),
        user,
        goals: goalsArray.map(g => ({ text: g, done: false })),
        weekId: getWeekIdentifier(new Date()),
        scope: scope
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
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const data = await getGoals();
    const item = data.find(r => r.id === recordId);
    if (item) {
        if (item.user.toLowerCase() !== actor.name.toLowerCase()) {
            alert("Permission Denied: You can only modify your own goals.");
            return;
        }
        item.goals[goalIndex].done = !item.goals[goalIndex].done;
        await saveGoals(data);
    }
}

async function deleteRecord(recordId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const data = await getGoals(true);
    const deletedRecord = data.find(r => r.id === recordId);
    if (deletedRecord && deletedRecord.user.toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only delete your own goals.");
        return;
    }
    if (!confirm('Are you sure you want to delete this goals commitment card?')) return;
    const filtered = data.filter(r => r.id !== recordId);
    if (viewingRecordId === recordId) {
        closeGoalsViewModal();
    }
    await saveGoals(filtered);

    // Broadcast email notification to all team members
    const deletedPeriod = deletedRecord ? (deletedRecord.periodId || deletedRecord.weekId || 'Target') : 'Target';
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedRecord ? `${deletedRecord.user}'s goals (${deletedPeriod})` : 'a goals record',
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

window.switchGoalsTab = function (tabName) {
    currentTab = tabName;
    currentPage = 1;
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${tabName}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    render();
};

async function render(forceRefresh = false) {
    const loader = document.getElementById('goalsLoader');
    const content = document.getElementById('goalsContent');
    if (loader && content) {
        loader.style.display = 'flex';
        content.style.display = 'none';
    }
    try {
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

    // Filter commitments based on tab and search query
    const filteredData = data.filter(record => {
        let type = record.type;
        if (!type) {
            if (record.weekId) type = 'weekly';
            else type = 'annual';
        } else if (type === 'short-term') {
            type = 'weekly';
        } else if (type === 'long-term') {
            type = 'annual';
        }

        if (type !== currentTab) return false;

        const resolvedPeriod = record.periodId || record.weekId || 'Target';
        const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

        const userMatch = record.user ? record.user.toLowerCase().includes(searchQuery) : false;
        const goalMatch = record.goals ? record.goals.some(g => g.text.toLowerCase().includes(searchQuery)) : false;
        const weekMatch = resolvedPeriod ? resolvedPeriod.toLowerCase().includes(searchQuery) : false;
        const typeMatch = capitalizedType ? capitalizedType.toLowerCase().includes(searchQuery) : false;
        const titleMatch = record.title ? record.title.toLowerCase().includes(searchQuery) : false;
        return userMatch || goalMatch || weekMatch || typeMatch || titleMatch;
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
            let type = record.type;
            if (!type) {
                if (record.weekId) type = 'weekly';
                else type = 'annual';
            } else if (type === 'short-term') {
                type = 'weekly';
            } else if (type === 'long-term') {
                type = 'annual';
            }

            const resolvedPeriod = record.periodId || record.weekId || 'Target';
            const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
            const displayTitle = (record.title && record.title.trim()) ? formatGoalText(record.title) : capitalizedType;

            const totalGoalsCount = record.goals.length || 1;
            const completedCount = record.goals.filter(g => g.done).length;
            const pct = Math.round((completedCount / totalGoalsCount) * 100);
            
            const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
            const recordUser = (record.user && typeof record.user === 'string') ? record.user.toLowerCase() : '';
            const actorName = (actor.name && typeof actor.name === 'string') ? actor.name.toLowerCase() : '';
            const isOwner = recordUser !== '' && recordUser === actorName;
            const deleteButton = isOwner ? `
                <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="event.stopPropagation(); deleteRecord(${record.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            ` : '';

            const actionButtons = record.pendingId ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                    <button class="secondary-btn" style="padding:4px 8px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(16, 185, 129, 0.15); color:#10b981; border: 1px solid rgba(16, 185, 129, 0.2); margin-bottom:0;" onclick="event.stopPropagation(); approvePending(${record.pendingId})">
                        Approve
                    </button>
                    <button class="secondary-btn" style="padding:4px 8px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239, 68, 68, 0.15); color:#ef4444; border: 1px solid rgba(239, 68, 68, 0.2); margin-bottom:0;" onclick="event.stopPropagation(); rejectPending(${record.pendingId})">
                        Reject
                    </button>
                </div>
            ` : '';

            let pendingBadge = '';
            if (record.pendingId) {
                if (record.pendingType === 'goals_completed') {
                    pendingBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Completed 5 Goals</span>`;
                } else {
                    pendingBadge = `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Pending Global</span>`;
                }
            } else {
                const scopeBadge = record.scope === 'global' ? 
                    `<span style="background: rgba(99, 102, 241, 0.15); color: #818cf8; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Global</span>` : 
                    `<span style="background: rgba(156, 163, 175, 0.15); color: #cbd5e1; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Personal</span>`;
                pendingBadge = scopeBadge;
            }
            
            const card = document.createElement('div');
            card.className = 'card accordion-card';
            card.style.cursor = 'pointer';
            card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
            card.style.transition = 'all 0.2s ease';
            card.setAttribute('onclick', `openGoalsViewModal(${record.id})`);

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <h4 style="margin:0; color:white; font-size:0.95rem; font-weight:600;">${displayTitle}</h4>
                    <div style="display:flex; align-items:center; gap:4px;">
                        ${actionButtons}
                        ${deleteButton}
                    </div>
                </div>
                <p style="font-size:0.75rem; color:#9ca3af; margin:0 0 10px 0; display: flex; align-items: center; gap: 4px;">
                    <span>${record.user} • ${resolvedPeriod}</span>
                    ${pendingBadge}
                </p>
                <div class="infographics-bar" style="height:6px; margin: 10px 0;">
                    <div class="infographics-fill" style="width: ${pct}%"></div>
                </div>
                <p style="font-size:0.75rem; color:#9ca3af; margin:0;">${completedCount}/${record.goals.length} metrics reached (${pct}%)</p>
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
        userStats[r.user].attempted += r.goals.length;
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

    } finally {
        if (loader && content) {
            loader.style.display = 'none';
            content.style.display = '';
        }
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

    let type = record.type;
    if (!type) {
        if (record.weekId) type = 'weekly';
        else type = 'annual';
    } else if (type === 'short-term') {
        type = 'weekly';
    } else if (type === 'long-term') {
        type = 'annual';
    }
    const resolvedPeriod = record.periodId || record.weekId || 'Target';
    const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

    const totalGoalsCount = record.goals.length || 1;
    const completedCount = record.goals.filter(g => g.done).length;
    const pct = Math.round((completedCount / totalGoalsCount) * 100);

    const scopeBadge = record.pendingId ? 
        (record.pendingType === 'goals_completed' ? 
            `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Completed 5 Goals</span>` : 
            `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Pending Global</span>`) :
        (record.scope === 'global' ? 
            `<span style="background: rgba(99, 102, 241, 0.15); color: #818cf8; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Global</span>` : 
            `<span style="background: rgba(156, 163, 175, 0.15); color: #cbd5e1; padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 6px;">Personal</span>`);

    if (metaElem) {
        metaElem.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 6px; align-items: center;">
                <span style="display: flex; align-items: center; gap: 4px;">
                    <span>${capitalizedType}: <strong style="color: #fb7185;">${resolvedPeriod}</strong></span>
                    ${scopeBadge}
                </span>
                <span><strong>${completedCount} of ${record.goals.length} completed (${pct}%)</strong></span>
            </div>
            ${record.title ? `<div style="font-size: 0.9rem; color: #cbd5e1; font-weight: 500; margin-bottom: 8px;">${formatGoalText(record.title)}</div>` : ''}
            <div class="infographics-bar" style="margin: 4px 0; height: 8px;">
                <div class="infographics-fill" style="width: ${pct}%"></div>
            </div>
        `;
    }

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const isOwner = record.user.toLowerCase() === actor.name.toLowerCase();

    if (listElem) {
        listElem.innerHTML = record.goals.map((g, idx) => `
            <div class="goal-item-row" style="margin-bottom: 4px; padding: 10px 12px; display: flex; align-items: center;">
                <input type="checkbox" class="goal-checkbox" style="width:16px; height:16px; margin-right:12px;" ${g.done ? 'checked' : ''} ${isOwner ? '' : 'disabled'} onchange="toggleGoalInModal(${record.id}, ${idx})">
                <span style="font-size:0.9rem; transition:all 0.2s; text-decoration: ${g.done ? 'line-through' : 'none'}; color: ${g.done ? '#6b7280' : '#d1d5db'}">
                    ${formatGoalText(g.text)}
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

async function approvePending(id) {
    if (!confirm('Approve this goals review record?')) return;
    const res = await fetch(`/api/goals/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        cachedGoals = null;
        await render(true);
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } else {
        alert('Failed to approve goals record.');
    }
}

async function rejectPending(id) {
    if (!confirm('Reject and delete this goals review record?')) return;
    const res = await fetch(`/api/goals/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        cachedGoals = null;
        await render(true);
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } else {
        alert('Failed to reject goals record.');
    }
}

let cachedAppsList = [];
async function fetchDigitalSuiteApps() {
    try {
        const res = await fetch('/api/apps');
        if (res.ok) {
            cachedAppsList = await res.json();
        }
    } catch (e) {
        console.error('Failed to load apps directory for tagging matching:', e);
    }
}

function formatGoalText(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);

    // Matches tags case-insensitively and replaces them with database-capitalized strings styled in purple
    if (cachedAppsList && cachedAppsList.length > 0) {
        cachedAppsList.forEach(app => {
            const regex = new RegExp(`@${escapeRegExp(app.name)}\\b`, 'gi');
            escaped = escaped.replace(regex, `<span style="color: #c084fc; font-weight: 600;">@${app.name}</span>`);
        });
    }
    return escaped;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

async function waitForFirebaseAndStart() {
    console.log("Goals waitForFirebaseAndStart: checking window.FirebaseDB", !!window.FirebaseDB);
    if (window.FirebaseDB) {
        console.log("Goals window.FirebaseDB is defined! Running render...");
        await fetchDigitalSuiteApps();
        
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        if (tabParam && ['annual', 'quarterly', 'monthly', 'weekly', 'daily'].includes(tabParam)) {
            window.switchGoalsTab(tabParam);
        } else {
            window.switchGoalsTab('annual');
        }
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);