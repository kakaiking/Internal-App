const API_URL = '/api/meetings';

async function getMeetings() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API request failed');
        return await response.json();
    } catch (e) {
        console.error('Error fetching meetings:', e);
        return [];
    }
}

async function saveMeetings(data) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('API request failed');
        await renderMeetings();
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving meetings:', e);
        alert('Failed to save meetings to physical database server.');
    }
}

async function addMeeting() {
    const time = document.getElementById('mTime').value;
    const link = document.getElementById('mLink').value.trim();
    const agenda = document.getElementById('mAgenda').value.trim();

    if (!time || !link || !agenda) return alert('Fill in all fields');

    const meetings = await getMeetings();
    meetings.push({
        id: Date.now(),
        time,
        link,
        agenda,
        minutes: ''
    });
    
    await saveMeetings(meetings);
    
    // Reset form fields
    document.getElementById('mTime').value = '';
    document.getElementById('mLink').value = '';
    document.getElementById('mAgenda').value = '';

    closeMeetingModal();
}

async function addMinutes(id) {
    const meetings = await getMeetings();
    const index = meetings.findIndex(m => m.id === id);
    if (index === -1) return;

    const currentMinutes = meetings[index].minutes || '';
    const minutes = prompt('Add/Update post-meeting minutes:', currentMinutes);
    if (minutes === null) return;
    
    meetings[index].minutes = minutes.trim();
    await saveMeetings(meetings);
}

async function deleteMeeting(id) {
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    const meetings = await getMeetings();
    const filtered = meetings.filter(m => m.id !== id);
    await saveMeetings(filtered);
}

async function renderMeetings() {
    const container = document.getElementById('meetingsList');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem; color:#818cf8;"></i></div>';

    const meetings = await getMeetings();
    const searchQuery = (document.getElementById('searchMeetings')?.value || '').toLowerCase().trim();
    const now = new Date();

    // Filter meetings based on agenda, post-meeting minutes, or status matching
    const filteredMeetings = meetings.filter(m => {
        const mDate = new Date(m.time);
        const diffMs = mDate - now;
        let status = '';
        if (diffMs > 0) status = 'upcoming';
        else if (diffMs <= 0 && Math.abs(diffMs) < 60 * 60 * 1000) status = 'in progress';
        else status = 'completed';

        return m.agenda.toLowerCase().includes(searchQuery) || 
               (m.minutes || '').toLowerCase().includes(searchQuery) ||
               mDate.toLocaleString().toLowerCase().includes(searchQuery) ||
               status.includes(searchQuery);
    });

    container.innerHTML = '';

    if (filteredMeetings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-video-slash"></i>
                <p>${searchQuery ? 'No meetings match your search query.' : 'No meetings scheduled yet. Click "Schedule Meeting" to get started.'}</p>
            </div>
        `;
        return;
    }

    // Sort meetings: upcoming first, then past
    filteredMeetings.sort((a, b) => new Date(a.time) - new Date(b.time));

    filteredMeetings.forEach(m => {
        const mDate = new Date(m.time);
        const diffMs = mDate - now;
        
        let statusBadge = '';
        let badgeClass = '';

        if (diffMs > 0) {
            statusBadge = '<i class="fa-regular fa-clock"></i> Upcoming';
            badgeClass = 'pending';
        } else if (diffMs <= 0 && Math.abs(diffMs) < 60 * 60 * 1000) { // 1 hour duration
            statusBadge = '<i class="fa-solid fa-record-vinyl fa-beat" style="color:#ef4444;"></i> In Progress';
            badgeClass = 'danger';
        } else {
            statusBadge = '<i class="fa-solid fa-circle-check"></i> Completed';
            badgeClass = 'success';
        }

        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '16px';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1.05rem;">
                    <i class="fa-solid fa-calendar-day" style="color:#818cf8; margin-right:8px;"></i>
                    ${mDate.toLocaleString()}
                </h4>
                <div style="display:flex; gap:8px; align-items:center;">
                    <span class="badge ${badgeClass}">${statusBadge}</span>
                    <button class="secondary-btn" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(239,68,68,0.1); color:#ef4444;" onclick="deleteMeeting(${m.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <p style="margin-bottom:12px; color:#e5e7eb;">
                <strong>Agenda:</strong> ${m.agenda}
            </p>
            
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
                <a href="${m.link}" target="_blank" style="text-decoration:none; display:inline-block;">
                    <button class="secondary-btn" style="padding:6px 12px; font-size:0.8rem; width:auto; border-radius:6px; color:#818cf8; background:rgba(129, 140, 248, 0.1); border-color:rgba(129,140,248,0.2);">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Join Meeting Link
                    </button>
                </a>
            </div>

            <div style="background: rgba(0, 0, 0, 0.2); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-size:0.85rem; font-weight:600; color:#9ca3af;">
                        <i class="fa-solid fa-file-invoice"></i> Post-Meeting Minutes
                    </span>
                    <button class="secondary-btn" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:6px;" onclick="addMinutes(${m.id})">
                        <i class="fa-solid fa-pencil"></i> Edit Minutes
                    </button>
                </div>
                <p style="margin: 0; font-size: 0.88rem; color: ${m.minutes ? '#10b981' : '#6b7280'}; font-style: ${m.minutes ? 'normal' : 'italic'};">
                    ${m.minutes ? m.minutes : 'Pending meeting completion - Minutes not yet entered.'}
                </p>
            </div>
        `;
        container.appendChild(card);
    });
}

// Modal handling functions
window.openMeetingModal = function () {
    const modal = document.getElementById('meetingModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.offsetHeight; // Force layout calculation to ensure transitions apply smoothly
    modal.classList.add('show');
};

window.closeMeetingModal = function () {
    const modal = document.getElementById('meetingModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Close modal when user clicks outside the modal box
window.onclick = function (event) {
    const modal = document.getElementById('meetingModal');
    if (event.target === modal) {
        closeMeetingModal();
    }
};

document.addEventListener('DOMContentLoaded', renderMeetings);