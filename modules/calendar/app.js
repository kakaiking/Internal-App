const API_URL = '/api/calendar';

async function getEvents() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API failure');
        return await response.json();
    } catch (e) {
        console.error('Error fetching calendar events:', e);
        return [];
    }
}

async function saveEvents(events) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(events)
        });
        if (!response.ok) throw new Error('API failure');
        await renderEvents();
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving calendar events:', e);
        alert('Failed to update corporate event calendar.');
    }
}

async function addEvent() {
    const title = document.getElementById('evTitle').value.trim();
    const date = document.getElementById('evDate').value;
    const type = document.getElementById('evType').value;
    const loc = document.getElementById('evLoc').value.trim();

    if (!title || !date || !loc) return alert('Please complete all form fields');

    const events = await getEvents();
    events.push({ id: Date.now(), title, date, type, loc });
    await saveEvents(events);
    
    // Reset fields
    document.getElementById('evTitle').value = '';
    document.getElementById('evDate').value = '';
    document.getElementById('evLoc').value = '';

    closeCalendarModal();
}

async function deleteEvent(id) {
    if (!confirm('Are you sure you want to remove this event from the calendar?')) return;
    const events = await getEvents();
    const filtered = events.filter(ev => ev.id !== id);
    await saveEvents(filtered);
}

async function renderEvents() {
    const container = document.getElementById('eventCalendar');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem; color:#f472b6;"></i></div>';

    const events = await getEvents();
    const filterVal = document.getElementById('filterType').value;
    const searchQuery = (document.getElementById('searchEvents')?.value || '').toLowerCase().trim();

    // Filter by Dropdown Type
    let filtered = events;
    if (filterVal !== 'All') {
        filtered = events.filter(ev => ev.type === filterVal);
    }

    // Filter by Search Query
    filtered = filtered.filter(ev => 
        ev.title.toLowerCase().includes(searchQuery) ||
        ev.loc.toLowerCase().includes(searchQuery) ||
        ev.date.toLowerCase().includes(searchQuery)
    );

    container.innerHTML = '';

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-calendar-xmark"></i>
                <p>${searchQuery ? 'No calendar events match your search query.' : 'No upcoming events match the current filter criteria.'}</p>
            </div>
        `;
        return;
    }

    // Sort events by date ascending (chronological)
    filtered.sort((a,b) => new Date(a.date) - new Date(b.date));

    const todayStr = new Date().toISOString().split('T')[0];

    filtered.forEach(ev => {
        const isToday = ev.date === todayStr;
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '16px';
        
        if (isToday) {
            card.style.borderLeft = '4px solid #f472b6';
            card.style.background = 'rgba(244, 114, 182, 0.05)';
        }

        const isLink = ev.loc.startsWith('http://') || ev.loc.startsWith('https://');

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <h4 style="margin:0;">
                    ${ev.title} 
                    ${isToday ? '<span class="badge danger" style="margin-left:6px; font-size:0.7rem;"><i class="fa-solid fa-bell"></i> TODAY</span>' : ''}
                </h4>
                <div style="display:flex; gap:8px; align-items:center;">
                    <span class="badge" style="background:${ev.type === 'Virtual' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color:${ev.type === 'Virtual' ? '#3b82f6' : '#10b981'}; border-color:${ev.type === 'Virtual' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)'};">
                        <i class="fa-solid ${ev.type === 'Virtual' ? 'fa-globe' : 'fa-building-columns'}"></i> ${ev.type}
                    </span>
                    <button class="secondary-btn" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="deleteEvent(${ev.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <p style="margin-bottom:8px; font-size:0.9rem; color:#cbd5e1;">
                <i class="fa-regular fa-calendar" style="color:#6b7280; margin-right:6px;"></i> 
                <strong>Date:</strong> ${new Date(ev.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            
            <p style="margin:0; font-size:0.9rem; color:#cbd5e1; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-map-pin" style="color:#6b7280; margin-right:6px;"></i>
                <strong>Location/Link:</strong>
                ${isLink ? `<a href="${ev.loc}" target="_blank" style="color:#6366f1; text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:500;">${ev.loc} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.75rem;"></i></a>` : `<span>${ev.loc}</span>`}
            </p>
        `;
        container.appendChild(card);
    });
}

// Modal handling functions
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

// Close modal when user clicks outside the modal boundary box
window.onclick = function (event) {
    const modal = document.getElementById('calendarModal');
    if (event.target === modal) {
        closeCalendarModal();
    }
};

document.addEventListener('DOMContentLoaded', renderEvents);