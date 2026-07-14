const API_URL = '/api/calendar';

// Pagination, Navigation & State variables
let viewingEventId = null;
let editingEventId = null;
let cachedEvents = null;
let currentPage = 1;
let lastSearchQuery = '';

const ITEMS_PER_PAGE = 5;

// Calendar Modal view navigation states
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth(); // 0-11
let selectedCalendarDateStr = null;

// Fetches corporate event schedule with local redundancy backup
async function getEvents(forceRefresh = false) {
    if (cachedEvents && !forceRefresh) {
        return cachedEvents;
    }
    try {
        const response = await fetch(API_URL);
        if (response.ok) {
            cachedEvents = await response.json();
            return cachedEvents;
        }
    } catch (e) {
        console.warn('API endpoint connection unavailable. Using localStorage dataset.', e);
    }

    const localData = localStorage.getItem('calendar_events');
    if (localData) {
        cachedEvents = JSON.parse(localData);
    } else {
        cachedEvents = [
            { id: 1, author: 'Phil', title: 'Bank Registration, NSE and OPDC', date: '2025-06-26', loc: 'Conference Room 3' },
            { id: 2, author: 'Alice', title: 'Q3 Central Planning Sync', date: new Date().toISOString().split('T')[0], loc: 'https://meet.google.com/xyz-pdq-abc' }
        ];
        localStorage.setItem('calendar_events', JSON.stringify(cachedEvents));
    }
    return cachedEvents;
}

// Persists items in local storage or database
async function saveEvents(events) {
    let savedToDatabase = false;
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(events)
        });
        if (response.ok) {
            savedToDatabase = true;
        }
    } catch (e) {
        console.warn('Failed database write. Saving locally to client.', e);
    }

    if (!savedToDatabase) {
        localStorage.setItem('calendar_events', JSON.stringify(events));
    }

    cachedEvents = null; // Clear local cache memory
    await renderEvents(true);

    if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
        try {
            window.parent.loadDashboardStats();
        } catch (err) {
            console.warn('Unable to reach parent stats module:', err);
        }
    }
}

// Add New Event Handler
window.addEvent = async function () {
    const author = document.getElementById('evAuthor').value.trim();
    const title = document.getElementById('evTitle').value.trim();
    const date = document.getElementById('evDate').value;
    const loc = document.getElementById('evLoc').value.trim();

    if (!author || !title || !date || !loc) return alert('Please complete all form fields');

    const events = await getEvents();
    events.push({ id: Date.now(), author, title, date, loc });
    await saveEvents(events);

    // Broadcast email notification to all team members
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    window.notifyTeam && window.notifyTeam({
        action: 'added',
        actorName: actor.name,
        itemName: `${title} (${date})`,
        module: 'Calendar',
        excludeEmail: actor.email
    });
    
    // Clear elements
    document.getElementById('evAuthor').value = '';
    document.getElementById('evTitle').value = '';
    document.getElementById('evDate').value = '';
    document.getElementById('evLoc').value = '';

    closeCalendarModal();
};

window.deleteEvent = async function (id) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const events = await getEvents(true);
    const deletedEvent = events.find(ev => ev.id == id);
    if (deletedEvent && (deletedEvent.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only delete your own events.");
        return;
    }
    if (!confirm('Are you sure you want to remove this event from the calendar?')) return;
    const filtered = events.filter(ev => ev.id != id);
    if (viewingEventId == id) {
        closeEventDetailModal();
    }
    await saveEvents(filtered);

    // Broadcast email notification to all team members
    window.notifyTeam && window.notifyTeam({
        action: 'deleted',
        actorName: actor.name,
        itemName: deletedEvent ? `${deletedEvent.title} (${deletedEvent.date})` : 'a calendar event',
        module: 'Calendar',
        excludeEmail: actor.email
    });
};

// Main schedule list page navigation
window.changeMainPage = function (direction) {
    currentPage += direction;
    renderEvents();
};

// Render Main directory schedule
window.renderEvents = async function (forceRefresh = false) {
    const container = document.getElementById('eventCalendar');
    const mainPaginationContainer = document.getElementById('mainPagination');

    if (!container) return;

    const events = await getEvents(forceRefresh);
    const searchQuery = (document.getElementById('searchEvents')?.value || '').toLowerCase().trim();

    // Revert page counter if query changes
    if (searchQuery !== lastSearchQuery) {
        currentPage = 1;
        lastSearchQuery = searchQuery;
    }

    container.innerHTML = '';

    // Filter elements
    const filtered = events.filter(p => 
        (p.title && p.title.toLowerCase().includes(searchQuery)) ||
        (p.author && p.author.toLowerCase().includes(searchQuery)) ||
        (p.date && p.date.toLowerCase().includes(searchQuery)) ||
        (p.loc && p.loc.toLowerCase().includes(searchQuery))
    );

    const totalCount = filtered.length;

    if (totalCount === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 24px; color: #6b7280;">
                
                <p style="font-size: 0.9rem; margin: 0;">${searchQuery ? 'No matching events found.' : 'No upcoming scheduled events.'}</p>
            </div>
        `;
        if (mainPaginationContainer) mainPaginationContainer.innerHTML = '';
        return;
    }

    // Chronological order display
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Handle history list pagination bounds
    const maxPage = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
        currentPage = maxPage;
    }

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginatedEvents = filtered.slice(startIdx, endIdx);

    const todayStr = new Date().toISOString().split('T')[0];

    paginatedEvents.forEach(ev => {
        const isToday = ev.date === todayStr;
        const card = document.createElement('div');
        card.className = 'card accordion-card';
        card.style.cursor = 'pointer';
        card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        if (isToday) {
            card.style.borderLeft = '4px solid #f472b6';
            card.style.background = 'rgba(244, 114, 182, 0.05)';
        }
        card.style.transition = 'all 0.2s ease';
        card.setAttribute('onclick', `openEventDetailModal(${ev.id})`);

        const typeBadge = ev.pendingType ? `<span class="badge" style="font-size:0.7rem; padding:2px 6px; margin-left:6px; background:${ev.pendingType === 'create' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)'}; color:${ev.pendingType === 'create' ? '#10b981' : '#6366f1'}; border:1px solid ${ev.pendingType === 'create' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'};">${ev.pendingType.toUpperCase()}</span>` : '';
        const actionButtons = ev.pendingId ? `
            <div style="display: flex; align-items: center; gap: 4px;">
                <button class="secondary-btn" style="padding:4px 8px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(16, 185, 129, 0.15); color:#10b981; border: 1px solid rgba(16, 185, 129, 0.2); margin-bottom:0;" onclick="event.stopPropagation(); approvePending(${ev.pendingId})">
                    Approve
                </button>
                <button class="secondary-btn" style="padding:4px 8px; font-size:0.7rem; width:auto; border-radius:4px; background:rgba(239, 68, 68, 0.15); color:#ef4444; border: 1px solid rgba(239, 68, 68, 0.2); margin-bottom:0;" onclick="event.stopPropagation(); rejectPending(${ev.pendingId})">
                    Reject
                </button>
            </div>
        ` : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding: 2px;">
                <strong style="font-size: 0.85rem; color: white; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; display: flex; align-items: center; gap: 6px;">
                    ${ev.title} ${typeBadge}
                    ${isToday ? '<span style="margin-left:4px; font-size:0.6rem; padding:1px 3px; background: #ef4444; color: white; border-radius: 3px;"> TODAY</span>' : ''}
                </strong>
                ${actionButtons}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px; margin-top: 4px; font-size: 0.75rem;">
                <span style="color: #9ca3af;"> ${ev.author || 'Anonymous'}</span>
                <span style="color: #f472b6; font-size:0.7rem;"> ${new Date(ev.date + 'T00:00:00').toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>
            </div>
        `;
        container.appendChild(card);
    });

    // Render schedule list navigation controls
    if (mainPaginationContainer) {
        const startRange = startIdx + 1;
        const endRange = Math.min(endIdx, totalCount);
        const prevDisabled = currentPage === 1;
        const nextDisabled = endIdx >= totalCount;

        mainPaginationContainer.innerHTML = `
            <span>${startRange}-${endRange} of ${totalCount}</span>
            <div style="display: flex; gap: 6px;">
                <button onclick="changeMainPage(-1)" ${prevDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${prevDisabled ? 'rgba(255,255,255,0.05)' : '#f472b6'}; border: none; color: ${prevDisabled ? '#4b5563' : 'white'}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button onclick="changeMainPage(1)" ${nextDisabled ? 'disabled' : ''} style="width: auto; padding: 4px 8px; font-size: 0.8rem; background: ${nextDisabled ? 'rgba(255,255,255,0.05)' : '#f472b6'}; border: none; color: ${nextDisabled ? '#4b5563' : 'white'}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'}; border-radius: 4px;">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
    }
};

// Modal Control Functions - Calendar Monthly View Grid
window.openCalendarViewModal = function () {
    const modal = document.getElementById('calendarViewModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force browser layout recalculation
    modal.classList.add('show');
    
    // Set view focus to current date month as default on launch
    currentCalendarYear = new Date().getFullYear();
    currentCalendarMonth = new Date().getMonth();
    selectedCalendarDateStr = null;

    renderCalendarGrid();
};

window.closeCalendarViewModal = function () {
    const modal = document.getElementById('calendarViewModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

window.changeMonth = function (direction) {
    currentCalendarMonth += direction;
    if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear -= 1;
    } else if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear += 1;
    }
    renderCalendarGrid();
};

// Generates structural monthly layout and populates matching calendar days
async function renderCalendarGrid() {
    const monthYearLabel = document.getElementById('calendarMonthYear');
    const grid = document.getElementById('calendarGrid');
    const dayViewBox = document.getElementById('selectedDayEventsContainer');

    if (!monthYearLabel || !grid) return;

    grid.innerHTML = '';
    if (dayViewBox) dayViewBox.style.display = 'none';

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    monthYearLabel.textContent = `${monthNames[currentCalendarMonth]} ${currentCalendarYear}`;

    // Get calendar constraints for target month
    const firstDayOfWeek = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
    const daysInMonth = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();

    const events = await getEvents();
    const todayStr = new Date().toISOString().split('T')[0];

    // Padding empty cells representing trailing previous month weekdays
    for (let i = 0; i < firstDayOfWeek; i++) {
        const emptyPad = document.createElement('div');
        emptyPad.style.padding = '8px';
        grid.appendChild(emptyPad);
    }

    // Fill days of the selected month
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.style.cssText = `
            padding: 8px 4px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            position: relative;
            color: #cbd5e1;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid transparent;
            transition: all 0.15s ease;
        `;

        const monthPaddingStr = String(currentCalendarMonth + 1).padStart(2, '0');
        const dayPaddingStr = String(day).padStart(2, '0');
        const targetDateStr = `${currentCalendarYear}-${monthPaddingStr}-${dayPaddingStr}`;

        cell.textContent = day;

        // Apply Today Highlight indicator
        const isToday = targetDateStr === todayStr;
        if (isToday) {
            cell.style.border = '1px solid #f472b6';
            cell.style.color = '#f472b6';
            cell.style.fontWeight = 'bold';
        }

        // Filter events on this specific calendar day
        const matchedEvents = events.filter(e => e.date === targetDateStr);
        if (matchedEvents.length > 0) {
            cell.style.background = 'rgba(244, 114, 182, 0.15)';
            cell.style.color = '#ffffff';
            cell.style.fontWeight = '700';

            // Tiny dot signifier below day value
            const dotIndicator = document.createElement('div');
            dotIndicator.style.cssText = `
                position: absolute;
                bottom: 3px;
                left: 50%;
                transform: translateX(-50%);
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: #f472b6;
            `;
            cell.appendChild(dotIndicator);
        }

        // Apply visual selection style
        if (selectedCalendarDateStr === targetDateStr) {
            cell.style.background = '#f472b6';
            cell.style.color = '#000000';
            cell.style.fontWeight = 'bold';
        }

        cell.onclick = () => {
            selectedCalendarDateStr = targetDateStr;
            renderCalendarGrid(); // Refresh grid layout selection indicator highlights
            displayDayEventItems(targetDateStr, matchedEvents);
        };

        grid.appendChild(cell);
    }
}

// Display selected day event lists inside the sub-container
function displayDayEventItems(dateStr, matchedEvents) {
    const container = document.getElementById('selectedDayEventsContainer');
    const title = document.getElementById('selectedDayTitle');
    const displayList = document.getElementById('selectedDayEventsList');

    if (!container || !title || !displayList) return;

    container.style.display = 'block';

    const humanFriendlyDate = new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
    title.innerHTML = ` Events on ${humanFriendlyDate}`;

    displayList.innerHTML = '';
    if (matchedEvents.length === 0) {
        displayList.innerHTML = `<p style="font-size:0.8rem; color:#6b7280; font-style:italic; margin:0; padding: 4px 0;">No active schedule entries logged for this date.</p>`;
    } else {
        matchedEvents.forEach(item => {
            const element = document.createElement('div');
            element.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 12px;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.15s ease;
            `;
            element.onmouseenter = () => { element.style.background = 'rgba(255, 255, 255, 0.08)'; };
            element.onmouseleave = () => { element.style.background = 'rgba(255, 255, 255, 0.03)'; };
            
            element.onclick = (e) => {
                e.stopPropagation();
                closeCalendarViewModal();
                openEventDetailModal(item.id);
            };

            element.innerHTML = `
                <span style="font-size: 0.85rem; color: #ffffff; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;">
                    ${item.title}
                </span>
                <span style="font-size: 0.75rem; color: #9ca3af;">
                     ${item.author || 'Anonymous'}
                </span>
            `;
            displayList.appendChild(element);
        });
    }
}

// Modal handling functions - Calendar Event Modal
window.openCalendarModal = function () {
    const modal = document.getElementById('calendarModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeCalendarModal = function () {
    const modal = document.getElementById('calendarModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Modal handling functions - Event Detail Viewer Modal
window.openEventDetailModal = function (evId) {
    viewingEventId = evId;
    const modal = document.getElementById('eventDetailModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
    renderEventDetailContent();
};

window.closeEventDetailModal = function () {
    const modal = document.getElementById('eventDetailModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        viewingEventId = null;
    }, 300);
};

// Modal handling functions - Edit Event Modal
window.openEditCalendarModal = async function (evId) {
    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const events = await getEvents();
    const item = events.find(ev => ev.id == evId);
    if (!item) return;
    if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
        alert("Permission Denied: You can only edit your own events.");
        return;
    }
    editingEventId = evId;

    document.getElementById('editEvId').value = item.id;
    document.getElementById('editEvAuthor').value = item.author || '';
    document.getElementById('editEvTitle').value = item.title || '';
    document.getElementById('editEvDate').value = item.date || '';
    document.getElementById('editEvLoc').value = item.loc || '';

    const modal = document.getElementById('editCalendarModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation
    modal.classList.add('show');
};

window.closeEditCalendarModal = function () {
    const modal = document.getElementById('editCalendarModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        editingEventId = null;
    }, 300);
};

// Save Edit Action
window.saveEditEvent = async function () {
    const id = parseInt(document.getElementById('editEvId').value);
    const author = document.getElementById('editEvAuthor').value.trim();
    const title = document.getElementById('editEvTitle').value.trim();
    const date = document.getElementById('editEvDate').value;
    const loc = document.getElementById('editEvLoc').value.trim();

    if (!author || !title || !date || !loc) return alert('Please complete all form fields');

    const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
    const events = await getEvents(true);
    const item = events.find(ev => ev.id == id);
    if (item) {
        if ((item.author || '').toLowerCase() !== actor.name.toLowerCase()) {
            alert("Permission Denied: You can only edit your own events.");
            return;
        }
        item.author = author;
        item.title = title;
        item.date = date;
        item.loc = loc;
        await saveEvents(events);

        // Broadcast email notification to all team members
        window.notifyTeam && window.notifyTeam({
            action: 'edited',
            actorName: actor.name,
            itemName: `${title} (${date})`,
            module: 'Calendar',
            excludeEmail: actor.email
        });
    }
    closeEditCalendarModal();
};

// Sub-render function to display selected event details inside modal view details
async function renderEventDetailContent() {
    if (!viewingEventId) return;
    const events = await getEvents();
    const ev = events.find(item => item.id == viewingEventId);
    if (!ev) {
        closeEventDetailModal();
        return;
    }

    const titleElem = document.getElementById('detailEventTitle');
    const metaElem = document.getElementById('detailEventMeta');
    const dateElem = document.getElementById('detailEventDate');
    const locContainer = document.getElementById('detailEventLocContainer');

    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = ev.date === todayStr;

    if (titleElem) {
        titleElem.innerHTML = ` ${ev.title}`;
    }
    if (metaElem) {
        metaElem.innerHTML = `
            <span>Organizer: <strong>${ev.author || 'Anonymous'}</strong></span>
            ${isToday ? '<span class="badge danger" style="font-size:0.7rem; background: #ef4444; padding: 1px 4px; border-radius: 3px; color: white;"> TODAY</span>' : ''}
        `;
    }
    if (dateElem) {
        dateElem.textContent = new Date(ev.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    if (locContainer) {
        const isLink = ev.loc.startsWith('http://') || ev.loc.startsWith('https://');
        if (isLink) {
            locContainer.innerHTML = `<a href="${ev.loc}" target="_blank" style="color:#f472b6; text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:500;">${ev.loc} </a>`;
        } else {
            locContainer.textContent = ev.loc;
        }
    }
}

// Close modal when user clicks outside the modal box boundary
window.onclick = function (event) {
    const calendarModal = document.getElementById('calendarModal');
    const calendarViewModal = document.getElementById('calendarViewModal');
    const eventDetailModal = document.getElementById('eventDetailModal');
    const editCalendarModal = document.getElementById('editCalendarModal');
    
    if (event.target === calendarModal) {
        closeCalendarModal();
    }
    if (event.target === calendarViewModal) {
        closeCalendarViewModal();
    }
    if (event.target === eventDetailModal) {
        closeEventDetailModal();
    }
    if (event.target === editCalendarModal) {
        closeEditCalendarModal();
    }
};

async function approvePending(id) {
    if (!confirm('Approve this calendar event?')) return;
    const res = await fetch(`/api/calendar/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        cachedEvents = null;
        await renderEvents(true);
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } else {
        alert('Failed to approve event.');
    }
}

async function rejectPending(id) {
    if (!confirm('Reject and discard this calendar event?')) return;
    const res = await fetch(`/api/calendar/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        cachedEvents = null;
        await renderEvents(true);
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } else {
        alert('Failed to reject event.');
    }
}

function waitForFirebaseAndStart() {
    if (window.FirebaseDB) {
        renderEvents(true);
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
document.addEventListener('DOMContentLoaded', waitForFirebaseAndStart);