// app.js
const activeModules = new Map();

// Helper to set greeting based on local time
function setDynamicGreeting() {
    const greetingEl = document.getElementById('greeting');
    if (!greetingEl) return;
    const hour = new Date().getHours();
    let text = "Welcome Back";
    if (hour < 12) {
        text = "Good Morning";
    } else if (hour < 18) {
        text = "Good Afternoon, Team";
    } else {
        text = "Good Evening";
    }
    greetingEl.innerHTML = `<i class="fa-regular fa-hand-peace" style="color: #6366f1; margin-right: 8px;"></i>${text}`;
}

// Fetch stats for all modules from their physical json DBs
async function loadDashboardStats() {
    const modules = [
        { key: 'apps', elementId: 'statApps' },
        { key: 'meetings', elementId: 'statMeetings' },
        { key: 'messages', elementId: 'statMessages' },
        { key: 'calendar', elementId: 'statCalendar' },
        { key: 'goals', elementId: 'statGoals' },
        { key: 'skills', elementId: 'statSkills' },
        { key: 'procedures', elementId: 'statProcedures' },
        { key: 'glossary', elementId: 'statGlossary' }
    ];

    for (const mod of modules) {
        const el = document.getElementById(mod.elementId);
        if (!el) continue;

        try {
            const response = await fetch(`/api/${mod.key}`);
            if (!response.ok) throw new Error('API offline');
            const data = await response.json();
            
            if (mod.key === 'goals') {
                // For goals, show number of users with active goals in current week
                const uniqueUsers = new Set(data.map(item => item.user));
                el.textContent = uniqueUsers.size;
            } else if (mod.key === 'messages') {
                el.textContent = data.length;
            } else {
                el.textContent = data.length;
            }
        } catch (err) {
            // Fallback if server is not running
            console.warn(`Failed fetching dashboard stats for ${mod.key}:`, err);
            el.textContent = '0';
        }
    }
}

function loadModule(folderName, displayName) {
    const iframe = document.getElementById('moduleFrame');
    const welcomeScreen = document.getElementById('welcomeScreen');
    
    welcomeScreen.style.display = 'none';
    iframe.style.display = 'block';
    iframe.src = `modules/${folderName}/index.html`;

    activeModules.clear();
    activeModules.set(folderName, displayName);
    
    updateActiveBar(folderName);
    updateDockSelection(folderName);
}

// Function to go back to welcome screen dashboard
function showDashboard() {
    const iframe = document.getElementById('moduleFrame');
    const welcomeScreen = document.getElementById('welcomeScreen');
    
    iframe.style.display = 'none';
    iframe.src = '';
    welcomeScreen.style.display = 'flex';
    
    activeModules.clear();
    updateActiveBar(null);
    updateDockSelection(null);
    loadDashboardStats(); // Refresh stats when returning
}

function updateActiveBar(activeKey) {
    const listContainer = document.getElementById('activeList');
    listContainer.innerHTML = '';

    if (activeModules.size === 0) {
        listContainer.innerHTML = `<span class="no-active"><i class="fa-solid fa-info-circle"></i> Dock inactive — Select a module to begin</span>`;
        return;
    }

    activeModules.forEach((name, key) => {
        const span = document.createElement('span');
        span.className = `active-tab ${key === activeKey ? 'active' : ''}`;
        
        let iconHtml = '';
        if (key === 'apps') iconHtml = '<i class="fa-solid fa-laptop-code"></i>';
        else if (key === 'meetings') iconHtml = '<i class="fa-solid fa-handshake"></i>';
        else if (key === 'messages') iconHtml = '<i class="fa-solid fa-key"></i>';
        else if (key === 'calendar') iconHtml = '<i class="fa-solid fa-calendar-days"></i>';
        else if (key === 'goals') iconHtml = '<i class="fa-solid fa-bullseye"></i>';
        else if (key === 'skills') iconHtml = '<i class="fa-solid fa-brain"></i>';
        else if (key === 'procedures') iconHtml = '<i class="fa-solid fa-scroll"></i>';
        else if (key === 'glossary') iconHtml = '<i class="fa-solid fa-spell-check"></i>';

        span.innerHTML = `${iconHtml} ${name} <i class="fa-solid fa-times-circle close-tab-icon" style="margin-left: 8px; opacity:0.7;" onclick="event.stopPropagation(); showDashboard();"></i>`;
        span.onclick = () => loadModule(key, name);
        listContainer.appendChild(span);
    });
}

function updateDockSelection(folderName) {
    const buttons = document.querySelectorAll('.dock-item');
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${folderName}'`)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

// Bind logo click to returning to dashboard
document.querySelector('.logo').addEventListener('click', showDashboard);

document.addEventListener('DOMContentLoaded', () => {
    setDynamicGreeting();
    loadDashboardStats();
});
