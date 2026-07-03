// modules/apps/detail.js
const API_URL = '/api/apps';
const GITHUB_COMMITS_API = '/api/github-commits';
let currentApp = null;
let appId = null;

// Parse appId from query parameter
function parseQueryId() {
    const urlParams = new URLSearchParams(window.location.search);
    appId = parseInt(urlParams.get('id'), 10);
}

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
        // Trigger dashboard stats update in parent window if available
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving apps:', e);
        alert('Failed to save data to physical database server.');
    }
}

async function loadAppDetail() {
    const apps = await getApps();
    currentApp = apps.find(a => a.id === appId);

    if (!currentApp) {
        document.querySelector('.container').innerHTML = `
            <a href="index.html" class="back-link">
                <i class="fa-solid fa-arrow-left"></i> Back to Directory
            </a>
            <div class="empty-state" style="margin-top: 40px;">
                <i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>
                <p>Application not found. It may have been deleted.</p>
            </div>
        `;
        return;
    }

    renderAppDetail();
}

function renderAppDetail() {
    // Header
    const nameEl = document.getElementById('appNameHeader');
    if (nameEl) {
        nameEl.innerHTML = `<a href="index.html"><i class="fa-solid fa-arrow-left" style="color: #6366f1; margin-right: 8px;"></i></a> <h2 style="margin: 0 auto;">${currentApp.name}</h2>`;
    }

    // Description Tab
    const descEl = document.getElementById('appDescriptionText');
    if (descEl) {
        descEl.innerHTML = currentApp.desc;
    }

    // GitHub Commits Tab Setup
    const commitsCard = document.getElementById('githubCommitsCard');
    if (commitsCard) {
        commitsCard.style.display = 'block';
        if (currentApp.githubRepo) {
            loadGithubCommits();
        } else {
            // Render a clean fallback message if no repo is linked
            const container = document.getElementById('githubCommitsContainer');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state" style="border: none; background: transparent; padding: 20px 0;">
                        <i class="fa-brands fa-github" style="font-size: 1.8rem; margin-bottom: 8px; opacity: 0.4;"></i>
                        <p style="margin: 0; color: #6b7280; font-style: italic;">No GitHub repository linked to this application yet.</p>
                    </div>`;
            }
        }
    }

    // Tickets Tab
    const ticketsContainer = document.getElementById('ticketsContainer');
    if (ticketsContainer) {
        const openTickets = currentApp.tickets.filter(t => t.status === 'Open').length;
        const totalTickets = currentApp.tickets.length;

        if (totalTickets === 0) {
            ticketsContainer.innerHTML = `<p style="font-size:0.95rem; color:#6b7280; font-style:italic; margin:0; padding: 10px 0;">No support tickets filed.</p>`;
        } else {
            ticketsContainer.innerHTML = `
                <div style="margin-bottom: 12px; font-size: 0.85rem; color: #9ca3af;">
                    <span class="badge ${openTickets > 0 ? 'danger' : 'success'}">
                        ${openTickets} Open / ${totalTickets} Total
                    </span>
                </div>
                <ul style="list-style:none; padding:0; margin:0;">
                    ${currentApp.tickets.map(t => `
                        <li style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.15); padding:10px 14px; border-radius:8px; margin-bottom:8px; font-size:0.9rem; border: 1px solid rgba(255, 255, 255, 0.03);">
                            <span style="text-decoration: ${t.status === 'Resolved' ? 'line-through' : 'none'}; color: ${t.status === 'Resolved' ? '#6b7280' : '#d1d5db'}">
                                ${t.text}
                            </span>
                            <span class="badge ${t.status === 'Resolved' ? 'success' : 'danger'}" style="cursor:pointer; user-select: none;" onclick="handleToggleTicket(${t.id})" title="Click to toggle status">
                                ${t.status === 'Resolved' ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-exclamation"></i>'} ${t.status}
                            </span>
                        </li>
                    `).join('')}
                </ul>
            `;
        }
    }
}


// async function handleAddChangelog() {
//     const text = prompt('Enter new changelog entry:');
//     if (!text || !text.trim()) return;

//     const apps = await getApps();
//     const app = apps.find(a => a.id === appId);
//     if (app) {
//         if (!app.changelogs) app.changelogs = [];
//         app.changelogs.push(text.trim());
//         await saveApps(apps);
//         currentApp = app;
//         renderAppDetail();
//     }
// }

async function handleFileTicket() {
    const text = prompt('Enter support ticket description:');
    if (!text || !text.trim()) return;

    const apps = await getApps();
    const app = apps.find(a => a.id === appId);
    if (app) {
        if (!app.tickets) app.tickets = [];
        app.tickets.push({ id: Date.now(), text: text.trim(), status: 'Open' });
        await saveApps(apps);
        currentApp = app;
        renderAppDetail();
    }
}

async function handleToggleTicket(ticketId) {
    const apps = await getApps();
    const app = apps.find(a => a.id === appId);
    if (app) {
        const ticket = app.tickets.find(t => t.id === ticketId);
        if (ticket) {
            ticket.status = ticket.status === 'Open' ? 'Resolved' : 'Open';
            await saveApps(apps);
            currentApp = app;
            renderAppDetail();
        }
    }
}

async function loadGithubCommits() {
    const container = document.getElementById('githubCommitsContainer');
    if (!container || !currentApp.githubRepo) return;

    container.innerHTML = `<div style="text-align:center; padding:20px;"><i class="fa-solid fa-circle-notch fa-spin" style="color:#6366f1;"></i></div>`;

    try {
        const res = await fetch(`${GITHUB_COMMITS_API}?repo=${encodeURIComponent(currentApp.githubRepo)}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            container.innerHTML = `<p style="color:#ef4444; font-size:0.9rem; margin:0;"><i class="fa-solid fa-triangle-exclamation"></i> ${err.error || 'Could not load commits.'}</p>`;
            return;
        }

        const commits = await res.json();
        if (!commits.length) {
            container.innerHTML = `<p style="color:#6b7280; font-style:italic; margin:0;">No commits found.</p>`;
            return;
        }

        container.innerHTML = `
            <ul style="list-style:none; padding:0; margin:0;">
                ${commits.map(c => `
                    <li style="padding:10px 14px; background:rgba(0,0,0,0.15); border-radius:8px; margin-bottom:8px; border: 1px solid rgba(255,255,255,0.03);">
                        <div style="display:flex; justify-content:space-between; gap:12px;">
                            <span style="color:#d1d5db; font-size:0.9rem;">${escapeHtml(c.message)}</span>
                            <a href="${c.url}" target="_blank" rel="noopener noreferrer" style="color:#818cf8; font-size:0.8rem; text-decoration:none; white-space:nowrap;">
                                <i class="fa-solid fa-code-commit"></i> ${c.sha}
                            </a>
                        </div>
                        <div style="font-size:0.75rem; color:#6b7280; margin-top:4px;">
                            ${escapeHtml(c.author)} · ${c.date ? new Date(c.date).toLocaleDateString() : ''}
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
    } catch (e) {
        console.error('Error loading commits:', e);
        container.innerHTML = `<p style="color:#ef4444; font-size:0.9rem; margin:0;">Failed to load commits.</p>`;
    }
}

window.handleRefreshCommits = function () {
    loadGithubCommits();
};

// Basic escaping since commit messages come from an external API (GitHub)
// and are inserted via innerHTML — treat them as untrusted text.
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

window.switchDetailTab = function (tabName) {
    const tabs = ['description', 'changelogs', 'tickets'];
    tabs.forEach(t => {
        const contentEl = document.getElementById(`tab-${t}`);
        if (contentEl) {
            contentEl.style.display = t === tabName ? 'block' : 'none';
        }
    });

    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${tabName}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    parseQueryId();
    loadAppDetail();
});