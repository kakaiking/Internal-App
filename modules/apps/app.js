const API_URL = '/api/apps';

async function getApps() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Network issue');
        return await response.json();
    } catch (e) {
        console.error('Error loading apps:', e);
        return [];
    }
}

async function saveApps(apps) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apps)
        });
        if (!response.ok) throw new Error('Network issue');
        await renderApps();
        // Trigger dashboard stats update in parent window if available
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving apps:', e);
        alert('Failed to save data to physical database server.');
    }
}

async function addApp() {
    const name = document.getElementById('appName').value.trim();
    const desc = document.getElementById('appDesc').value.trim();
    const changelog = document.getElementById('appChangelog').value.trim();

    if (!name || !desc || !changelog) return alert('All fields are required');

    const apps = await getApps();
    const newApp = {
        id: Date.now(),
        name,
        desc,
        changelogs: [changelog],
        tickets: []
    };

    apps.push(newApp);
    await saveApps(apps);

    document.getElementById('appName').value = '';
    document.getElementById('appDesc').value = '';
    document.getElementById('appChangelog').value = '';

    closeModal();
}

async function deleteApp(appId) {
    if (!confirm('Are you sure you want to remove this application from the directory?')) return;

    const apps = await getApps();
    const filteredApps = apps.filter(a => a.id !== appId);
    await saveApps(filteredApps);
}

async function renderApps() {
    const container = document.getElementById('appList');
    if (!container) return;

    container.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; padding:30px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem; color:#6366f1;"></i></div>';

    const apps = await getApps();
    const searchQuery = (document.getElementById('searchApps')?.value || '').toLowerCase().trim();

    // Filter apps based on search query
    const filteredApps = apps.filter(app =>
        app.name.toLowerCase().includes(searchQuery) ||
        app.desc.toLowerCase().includes(searchQuery)
    );

    container.innerHTML = '';

    if (filteredApps.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-folder-open"></i>
                <p>${searchQuery ? 'No applications match your search query.' : 'No apps registered yet. Click "Add New App" to get started.'}</p>
            </div>
        `;
        return;
    }

    filteredApps.forEach(app => {
        const card = document.createElement('div');
        card.className = 'card clickable-card';
        card.onclick = () => {
            window.location.href = `detail.html?id=${app.id}`;
        };

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0;">
                <h4 style="margin:0; display:flex; align-items:center; gap:8px;">
                    ${app.name}
                </h4>
                <div>
                  <button class="secondary-btn" style="padding:6px 10px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(68, 239, 68, 0.1); color:#44ef44; border: 1px solid rgba(239, 239, 68, 0.2); transition: all 0.2s;" onclick="event.stopPropagation(); editApp(${app.id})">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button class="secondary-btn" style="padding:6px 10px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(239, 68, 68, 0.1); color:#ef4444; border: 1px solid rgba(239, 68, 68, 0.2); transition: all 0.2s;" onclick="event.stopPropagation(); deleteApp(${app.id})">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
            </div>
            
            <p style="margin-bottom:16px; color:#cbd5e1; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; min-height: 4.5em;">${app.desc}</p>
            
            
        `;
        container.appendChild(card);
    });
}

// Modal functions
window.openModal = function () {
    const modal = document.getElementById('registerModal');
    if (!modal) return;
    modal.style.display = 'flex';
    // Force browser reflow to enable CSS transitions
    modal.offsetHeight;
    modal.classList.add('show');
};

window.closeModal = function () {
    const modal = document.getElementById('registerModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Close modal when clicking outside of it
window.onclick = function (event) {
    const modal = document.getElementById('registerModal');
    if (event.target === modal) {
        closeModal();
    }
};

document.addEventListener('DOMContentLoaded', renderApps);
