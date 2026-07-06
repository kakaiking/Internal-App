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
    greetingEl.innerHTML = `${text}`;
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
        { key: 'glossary', elementId: 'statGlossary' },
        { key: 'profile', elementId: 'statProfile' }
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
            } else if (mod.key === 'profile') {
                const sessionStr = localStorage.getItem('sessionUser');
                if (sessionStr) {
                    const session = JSON.parse(sessionStr);
                    el.textContent = session.name ? session.name.split(' ')[0] : 'Profile';
                } else {
                    el.textContent = 'View';
                }
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
    
    // Auto scroll content viewport to top when module loads (helpful on mobile)
    const viewport = document.querySelector('.content-viewport');
    if (viewport) viewport.scrollTop = 0;
}

// Function to go back to welcome screen dashboard
function showDashboard() {
    const iframe = document.getElementById('moduleFrame');
    const welcomeScreen = document.getElementById('welcomeScreen');
    
    iframe.style.display = 'none';
    iframe.src = '';
    welcomeScreen.style.display = 'block';
    
    activeModules.clear();
    updateActiveBar(null);
    updateDockSelection(null);
    loadDashboardStats(); // Refresh stats when returning
}

function updateActiveBar(activeKey) {
    const listContainer = document.getElementById('activeList');
    listContainer.innerHTML = '';

    if (activeModules.size === 0) {
        return;
    }

    activeModules.forEach((name, key) => {
        const span = document.createElement('span');
        span.className = `active-tab ${key === activeKey ? 'active' : ''}`;
        
        let iconHtml = '';
        if (key === 'apps') iconHtml = '';
        else if (key === 'meetings') iconHtml = '';
        else if (key === 'messages') iconHtml = '';
        else if (key === 'calendar') iconHtml = '';
        else if (key === 'goals') iconHtml = '';
        else if (key === 'skills') iconHtml = '';
        else if (key === 'procedures') iconHtml = '';
        else if (key === 'glossary') iconHtml = '';
        else if (key === 'profile') iconHtml = '';

        span.innerHTML = `${iconHtml} <span class="tab-text">${name}</span> `;
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
            // Ensure the active item is visible inside the scrolling mobile dock
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
            btn.classList.remove('selected');
        }
    });
}

// Bind logo click to returning to dashboard
document.querySelector('.logo').addEventListener('click', showDashboard);

// Reset Session / Logout
function handleLogout() {
    if (confirm('Are you sure you want to log out of your session?')) {
        localStorage.removeItem('sessionUser');
        const rootPath = window.location.pathname.toLowerCase().startsWith('/internal-app') ? '/Internal-App' : '';
        window.location.href = rootPath + '/login.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setDynamicGreeting();
    loadDashboardStats();
});