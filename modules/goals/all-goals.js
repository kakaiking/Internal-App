// modules/goals/all-goals.js
const API_URL = '/api/goals';

let cachedWorkspaceGoals = null;
let cachedAppsList = []; // stores digital suite app list for mentions tagging
let currentTab = 'annual'; // default tab
let activeViewingId = null;

async function getWorkspaceGoals(forceRefresh = false) {
    if (cachedWorkspaceGoals && !forceRefresh) {
        return cachedWorkspaceGoals;
    }
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API issue');
        cachedWorkspaceGoals = await response.json();
        return cachedWorkspaceGoals;
    } catch (e) {
        console.error('Error fetching workspace goals:', e);
        return [];
    }
}

async function saveWorkspaceGoals(data) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('API issue');
        cachedWorkspaceGoals = null;
        await renderWorkspace(true);
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving goals:', e);
        alert('Failed to save data to the server.');
    }
}

// Fetches registered suite application profiles
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

// Switching tab logic
window.switchWorkspaceTab = function (tabName) {
    currentTab = tabName;
    const tabs = ['annual', 'quarterly', 'monthly', 'weekly', 'daily'];
    tabs.forEach(t => {
        const contentEl = document.getElementById(`tab-${t}`);
        if (contentEl) {
            contentEl.style.display = t === tabName ? 'block' : 'none';
        }
    });

    // Update tab button visual state
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${tabName}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Adapt layout of header add button
    const actionBtn = document.getElementById('addGoalBtn');
    if (actionBtn) {
        const capitalized = tabName.charAt(0).toUpperCase() + tabName.slice(1);
        actionBtn.innerHTML = `<i class="fa-solid fa-plus"></i> New ${capitalized} Goal`;
    }
};

// Configures and clears the unified modal before loading
window.handleOpenUnifiedModal = function () {
    document.getElementById('goalTitle').value = '';
    document.getElementById('goalItemInput').innerHTML = ''; // cleared contenteditable
    document.getElementById('modalItemsList').innerHTML = '';
    hideAppDropdown();

    const titleFieldContainer = document.getElementById('titleFieldContainer');
    const titleFieldLabel = document.getElementById('titleFieldLabel');
    const itemsLabel = document.getElementById('itemsLabel');

    // Toggle specific fields dynamically based on the current active tab
    if (['annual', 'quarterly', 'monthly'].includes(currentTab)) {
        titleFieldContainer.style.display = 'block';
        if (currentTab === 'annual') {
            titleFieldLabel.innerText = 'Annual Objective / Theme';
            itemsLabel.innerText = 'Yearly Commitments';
        } else if (currentTab === 'quarterly') {
            titleFieldLabel.innerText = 'Quarterly Focus Area';
            itemsLabel.innerText = 'Quarterly Commitments';
        } else {
            titleFieldLabel.innerText = 'Monthly Theme';
            itemsLabel.innerText = 'Monthly Commitments';
        }
    } else {
        titleFieldContainer.style.display = 'none';
        if (currentTab === 'weekly') {
            itemsLabel.innerText = 'Weekly Commitments';
        } else {
            itemsLabel.innerText = 'Daily Commitments';
        }
    }

    openUnifiedModal();
};

// Saves information generated inside unifiedModal
window.saveUnifiedGoal = async function () {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };
    const user = actor.name || 'Anonymous';
    const title = document.getElementById('goalTitle').value.trim();
    const itemsArray = getGoalsFromList('modalItemsList');

    if (!user) return alert('Your user session name could not be identified.');

    // Validate limit constraints (Minimum 5, Maximum 15)
    if (itemsArray.length < 5) {
        return alert('Validation Error: You must add at least 5 goals/milestones.');
    }
    if (itemsArray.length > 15) {
        return alert('Validation Error: A maximum of 15 goals/milestones is allowed.');
    }

    // Programmatically calculate period identifiers based on active tab and today's date
    let periodId = '';
    const now = new Date();

    if (currentTab === 'annual') {
        periodId = `${now.getFullYear()}`;
        if (!title) return alert('Please enter your Annual Objective/Theme.');
    } else if (currentTab === 'quarterly') {
        const quarter = Math.floor(now.getMonth() / 3) + 1;
        periodId = `${now.getFullYear()}-Q${quarter}`;
        if (!title) return alert('Please enter your Quarterly Focus Area.');
    } else if (currentTab === 'monthly') {
        const month = String(now.getMonth() + 1).padStart(2, '0');
        periodId = `${now.getFullYear()}-M${month}`;
        if (!title) return alert('Please enter your Monthly Theme.');
    } else if (currentTab === 'weekly') {
        periodId = getWeekIdentifier(now);
    } else if (currentTab === 'daily') {
        periodId = now.toISOString().split('T')[0];
    }

    const currentDB = await getWorkspaceGoals();
    const record = {
        id: Date.now(),
        user,
        title: title || '',
        goals: itemsArray.map(item => ({ text: item, done: false })),
        weekId: currentTab === 'weekly' ? periodId : null, // keep backward compatibility
        periodId: periodId,
        type: currentTab
    };

    currentDB.push(record);
    await saveWorkspaceGoals(currentDB);

    // Notify Team Members
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: `${currentTab} goals (${periodId})`,
        module: 'Goals',
        excludeEmail: actor.email
    });

    closeUnifiedModal();
};

// Controls creation UI list additions
window.addGoalItemUI = function (listId, inputId) {
    const input = document.getElementById(inputId);
    // Use textContent to fetch raw clean plaintext (strips interactive tags automatically)
    const text = input.textContent.trim();
    if (!text) return;

    const list = document.getElementById(listId);
    if (list.querySelectorAll('li').length >= 15) {
        alert('Validation Error: A maximum of 15 items is allowed.');
        return;
    }

    const li = createGoalListItem(text);
    list.appendChild(li);
    input.innerHTML = ''; // Reset editor layout
    hideAppDropdown();
};

window.createGoalListItem = function (text) {
    const li = document.createElement('li');
    li.className = 'goal-item';
    li.innerHTML = `
        <i class="fa-solid fa-grip-vertical drag-handle"></i>
        <span class="goal-content">${formatGoalText(text)}</span>
        <div class="goal-actions">
            <button type="button" class="goal-btn" onclick="editGoalUI(this)"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="goal-btn" onclick="this.closest('li').remove()"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;
    return li;
};

window.editGoalUI = function (btn) {
    const li = btn.closest('li');
    const span = li.querySelector('.goal-content');

    // Get actual raw value by removing styling spans
    const rawText = span.innerText;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'goal-input';
    input.value = rawText;

    span.replaceWith(input);
    input.focus();

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'goal-btn';
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';

    const actions = li.querySelector('.goal-actions');
    const editBtn = actions.querySelector('.fa-pen').closest('button');

    editBtn.replaceWith(saveBtn);

    const save = () => {
        const newSpan = document.createElement('span');
        newSpan.className = 'goal-content';
        newSpan.innerHTML = formatGoalText(input.value.trim() || rawText);
        input.replaceWith(newSpan);

        const newEditBtn = document.createElement('button');
        newEditBtn.type = 'button';
        newEditBtn.className = 'goal-btn';
        newEditBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        newEditBtn.onclick = function () { editGoalUI(this); };
        saveBtn.replaceWith(newEditBtn);
    };

    saveBtn.onclick = save;
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            save();
        }
    });
};

function getGoalsFromList(listId) {
    const list = document.getElementById(listId);
    const goals = [];
    list.querySelectorAll('li').forEach(li => {
        const span = li.querySelector('.goal-content');
        if (span) {
            // Retrieve plaintext contents ignoring HTML styled highlights
            goals.push(span.innerText.trim());
        } else {
            const input = li.querySelector('.goal-input');
            if (input) goals.push(input.value.trim());
        }
    });
    return goals.filter(g => g.length > 0);
}

// Global Main Rendering System
async function renderWorkspace(forceRefresh = false) {
    const grids = {
        annual: document.getElementById('annualGrid'),
        quarterly: document.getElementById('quarterlyGrid'),
        monthly: document.getElementById('monthlyGrid'),
        weekly: document.getElementById('weeklyGrid'),
        daily: document.getElementById('dailyGrid')
    };

    if (!grids.annual || !grids.quarterly || !grids.monthly || !grids.weekly || !grids.daily) return;

    const data = await getWorkspaceGoals(forceRefresh);
    const searchQuery = (document.getElementById('searchWorkspace')?.value || '').toLowerCase().trim();

    // Clear previous elements
    Object.keys(grids).forEach(key => grids[key].innerHTML = '');

    const counts = { annual: 0, quarterly: 0, monthly: 0, weekly: 0, daily: 0 };
    const sortedData = [...data].sort((a, b) => b.id - a.id);
    const actor = window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };

    sortedData.forEach(record => {
        // Map types and evaluate backward compatibility
        let type = record.type;
        if (!type) {
            if (record.weekId) type = 'weekly';
            else type = 'annual'; // fallback mapping for legacy long-term cards
        } else if (type === 'short-term') {
            type = 'weekly';
        } else if (type === 'long-term') {
            type = 'annual';
        }

        const resolvedPeriod = record.periodId || record.weekId || 'Target';

        // Filters evaluation
        const userMatch = record.user.toLowerCase().includes(searchQuery);
        const titleMatch = record.title ? record.title.toLowerCase().includes(searchQuery) : false;
        const periodMatch = resolvedPeriod.toLowerCase().includes(searchQuery);
        const goalMatch = record.goals.some(g => g.text.toLowerCase().includes(searchQuery));

        if (searchQuery && !(userMatch || titleMatch || periodMatch || goalMatch)) {
            return;
        }

        const completedCount = record.goals.filter(g => g.done).length;
        const totalCount = record.goals.length || 1;
        const pct = Math.round((completedCount / totalCount) * 100);

        const isOwner = record.user.toLowerCase() === actor.name.toLowerCase();
        const deleteButton = isOwner ? `
            <button class="secondary-btn" style="padding:2px 6px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="event.stopPropagation(); deleteWorkspaceRecord(${record.id})">
                <i class="fa-solid fa-trash"></i>
            </button>
        ` : '';

        const card = document.createElement('div');
        card.className = 'card accordion-card';
        card.style.cursor = 'pointer';
        card.setAttribute('onclick', `openDetailsViewModal(${record.id})`);

        // Render card variations based on high-level themes vs simple actions list
        const showTitle = ['annual', 'quarterly', 'monthly'].includes(type);
        const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <strong style="font-size:0.85rem; color:#fb7185;">${capitalizedType} (${resolvedPeriod})</strong>
                ${deleteButton}
            </div>
            ${showTitle && record.title ? `<h4 style="margin:0 0 8px 0; color:white; font-size:0.95rem;">${formatGoalText(record.title)}</h4>` : ''}
            <p style="font-size:0.75rem; color:#cbd5e1; margin:0 0 10px 0;">User: <strong>${record.user}</strong></p>
            <div class="infographics-bar" style="height:6px;">
                <div class="infographics-fill" style="width: ${pct}%"></div>
            </div>
            <p style="font-size:0.75rem; color:#9ca3af; margin:0;">${completedCount}/${record.goals.length} metrics reached (${pct}%)</p>
        `;

        if (grids[type]) {
            grids[type].appendChild(card);
            counts[type]++;
        }
    });

    // Populate empty layouts
    Object.keys(grids).forEach(key => {
        if (counts[key] === 0) {
            const label = key.charAt(0).toUpperCase() + key.slice(1);
            grids[key].innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No ${label} goals mapped to current workspace filter.</p></div>`;
        }
    });
}

// Manual Refresh
window.handleWorkspaceRefresh = async function () {
    const icon = document.querySelector('.header-container .refresh-btn i');
    if (icon) icon.classList.add('fa-spin');
    try {
        await renderWorkspace(true);
    } catch (e) {
        console.error('Refresh issue:', e);
    } finally {
        if (icon) {
            setTimeout(() => icon.classList.remove('fa-spin'), 500);
        }
    }
};

// Removal Handler
window.deleteWorkspaceRecord = async function (id) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };
    const data = await getWorkspaceGoals(true);
    const item = data.find(r => r.id === id);

    if (item && item.user.toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only remove your own goal cards.");
        return;
    }
    if (!confirm('Are you sure you want to delete this goal record?')) return;

    const filtered = data.filter(r => r.id !== id);
    if (activeViewingId === id) {
        closeDetailsModal();
    }
    await saveWorkspaceGoals(filtered);

    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: item ? `goal entry matching user ${item.user}` : 'a goal record',
        module: 'Goals',
        excludeEmail: actor.email
    });
};

// Checkbox interactive triggers
window.toggleSubGoalInModal = async function (recordId, index) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };
    const data = await getWorkspaceGoals();
    const item = data.find(r => r.id === recordId);
    if (item) {
        if (item.user.toLowerCase() !== actor.name.toLowerCase()) {
            alert("Permission Denied: You can only complete your own goals.");
            await renderWorkspace();
            return;
        }
        item.goals[index].done = !item.goals[index].done;
        await saveWorkspaceGoals(data);
        renderDetailsContent();
    }
};

// Detailed Modals Control
window.openDetailsViewModal = function (recordId) {
    activeViewingId = recordId;
    const modal = document.getElementById('detailsViewModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('show');
    renderDetailsContent();
};

async function renderDetailsContent() {
    if (!activeViewingId) return;
    const data = await getWorkspaceGoals();
    const record = data.find(r => r.id === activeViewingId);
    if (!record) {
        closeDetailsModal();
        return;
    }

    const titleEl = document.getElementById('detailsTitle');
    const metaEl = document.getElementById('detailsMeta');
    const listEl = document.getElementById('detailsList');

    const totalCount = record.goals.length || 1;
    const completedCount = record.goals.filter(g => g.done).length;
    const pct = Math.round((completedCount / totalCount) * 100);

    let type = record.type;
    if (!type) {
        type = record.weekId ? 'weekly' : 'annual';
    } else if (type === 'short-term') {
        type = 'weekly';
    } else if (type === 'long-term') {
        type = 'annual';
    }

    const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
    titleEl.innerText = `${capitalizedType} Goal Information`;

    const resolvedPeriod = record.periodId || record.weekId || 'Target';

    metaEl.innerHTML = `
        <div style="margin-bottom: 10px;">
            <p style="margin: 0 0 6px 0; font-size: 0.95rem; color: white;">Owner: <strong>${record.user}</strong></p>
            <p style="margin: 0 0 6px 0; font-size: 0.9rem; color: #fb7185;">Period: ${resolvedPeriod}</p>
            ${record.title ? `<p style="margin: 4px 0 0 0; font-size: 0.9rem; color: #cbd5e1; font-weight: 500;">${formatGoalText(record.title)}</p>` : ''}
        </div>
        <div class="infographics-bar" style="height: 6px; margin: 8px 0;">
            <div class="infographics-fill" style="width: ${pct}%"></div>
        </div>
        <span style="font-size: 0.75rem; color:#9ca3af;">Progress: ${completedCount}/${record.goals.length} items met (${pct}%)</span>
    `;

    const actor = window.getSessionActor ? window.getSessionActor() : { name: '', email: '' };
    const isOwner = record.user.toLowerCase() === actor.name.toLowerCase();

    listEl.innerHTML = record.goals.map((g, index) => `
        <div class="goal-item-row">
            <input type="checkbox" class="goal-checkbox" ${g.done ? 'checked' : ''} ${isOwner ? '' : 'disabled'} onchange="toggleSubGoalInModal(${record.id}, ${index})">
            <span style="font-size:0.85rem; text-decoration: ${g.done ? 'line-through' : 'none'}; color: ${g.done ? '#6b7280' : '#d1d5db'}">
                ${formatGoalText(g.text)}
            </span>
        </div>
    `).join('');
}

// Modal View Toggles
window.openUnifiedModal = function () {
    const modal = document.getElementById('unifiedGoalModal');
    const headerTitle = document.getElementById('unifiedModalTitle');
    const typeLabel = currentTab.charAt(0).toUpperCase() + currentTab.slice(1);
    headerTitle.innerText = `Set ${typeLabel} Goal`;

    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('show');
};

window.closeUnifiedModal = function () {
    const modal = document.getElementById('unifiedGoalModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        hideAppDropdown();
    }, 300);
};

window.closeDetailsModal = function () {
    const modal = document.getElementById('detailsViewModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        activeViewingId = null;
    }, 300);
};

// Validation Info Modal View Controls
window.openValidationInfoModal = function () {
    const modal = document.getElementById('validationInfoModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('show');
};

window.closeValidationInfoModal = function () {
    const modal = document.getElementById('validationInfoModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Backdrop Click handlers
window.onclick = function (e) {
    const unifiedModal = document.getElementById('unifiedGoalModal');
    const detailsModal = document.getElementById('detailsViewModal');
    const validationModal = document.getElementById('validationInfoModal');
    if (e.target === unifiedModal) closeUnifiedModal();
    if (e.target === detailsModal) closeDetailsModal();
    if (e.target === validationModal) closeValidationInfoModal();
};

function getWeekIdentifier(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${weekNo}`;
}

// ---- APP TAG dropdown core interactions ----

function showAppDropdown() {
    const dropdown = document.getElementById('appTagDropdown');
    if (dropdown) dropdown.style.display = 'block';
}

function hideAppDropdown() {
    const dropdown = document.getElementById('appTagDropdown');
    const searchInput = document.getElementById('appTagSearch');
    if (dropdown) dropdown.style.display = 'none';
    if (searchInput) searchInput.value = '';
}

function populateAppDropdown(searchFilter = '') {
    const listEl = document.getElementById('appTagList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const filtered = cachedAppsList.filter(app =>
        app.name.toLowerCase().includes(searchFilter.toLowerCase())
    );

    if (filtered.length === 0) {
        listEl.innerHTML = `<span style="font-size:0.75rem; color:#6b7280; padding:4px 8px;">No apps found</span>`;
        return;
    }

    filtered.forEach(app => {
        const item = document.createElement('div');
        item.className = 'app-tag-item';
        item.innerText = app.name;
        item.onclick = (e) => {
            e.stopPropagation();
            insertSelectedTag(app.name);
        };
        listEl.appendChild(item);
    });
}

// Places typing caret/cursor at the very end of contenteditable block
function placeCaretAtEnd(el) {
    el.focus();
    if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

window.insertSelectedTag = function (appName) {
    const inputEl = document.getElementById('goalItemInput');
    if (!inputEl) return;

    const val = inputEl.textContent;
    const words = val.split(/\s+/);

    // Find the last typed word starting with '@' and replace it with properly cased app name span
    for (let i = words.length - 1; i >= 0; i--) {
        if (words[i].startsWith('@')) {
            words[i] = `<span style="color: #c084fc; font-weight: 600;" contenteditable="false">@${appName}</span>`;
            break;
        }
    }

    inputEl.innerHTML = words.map(w => w.startsWith('<span') ? w : escapeHtml(w)).join(' ') + '&nbsp;';
    placeCaretAtEnd(inputEl);
    hideAppDropdown();
};

// Formats user input to colorize tagging text elements in purple
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

// Bind custom autocomplete listeners onto the contenteditable input field
function initAppTagEventListeners() {
    const inputEl = document.getElementById('goalItemInput');
    const dropdownSearch = document.getElementById('appTagSearch');

    if (inputEl) {
        inputEl.addEventListener('input', (e) => {
            const val = inputEl.textContent;
            const words = val.split(/\s+/);
            const lastWord = words[words.length - 1] || '';

            if (lastWord.startsWith('@')) {
                showAppDropdown();
                const filterQuery = lastWord.slice(1);
                populateAppDropdown(filterQuery);
            } else {
                hideAppDropdown();
            }
        });

        // Intercept key strokes to check and replace typed matches
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Suppress actual newlines inside contenteditable
                addGoalItemUI('modalItemsList', 'goalItemInput');
            }

            if (e.key === ' ' || e.keyCode === 32) {
                const val = inputEl.textContent;
                const words = val.split(/\s+/);
                const lastWord = words[words.length - 1];

                if (lastWord && lastWord.startsWith('@')) {
                    const typedAppName = lastWord.slice(1).toLowerCase();
                    const matchedApp = cachedAppsList.find(app => app.name.toLowerCase() === typedAppName);

                    if (matchedApp) {
                        e.preventDefault(); // Intercept default space inserting
                        words[words.length - 1] = `<span style="color: #c084fc; font-weight: 600;" contenteditable="false">@${matchedApp.name}</span>`;
                        inputEl.innerHTML = words.map(w => w.startsWith('<span') ? w : escapeHtml(w)).join(' ') + '&nbsp;';
                        placeCaretAtEnd(inputEl);
                        hideAppDropdown();
                    }
                }
            }
        });
    }

    if (dropdownSearch) {
        dropdownSearch.addEventListener('input', (e) => {
            populateAppDropdown(e.target.value);
        });
    }
}

async function waitForFirebaseAndInitialize() {
    if (window.FirebaseDB) {
        await fetchDigitalSuiteApps(); // populate digital suite details
        initAppTagEventListeners();
        renderWorkspace(true);
        const listContainer = document.getElementById('modalItemsList');
        if (listContainer && typeof Sortable !== 'undefined') {
            new Sortable(listContainer, { animation: 150, handle: '.drag-handle' });
        }
    } else {
        setTimeout(waitForFirebaseAndInitialize, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndInitialize);