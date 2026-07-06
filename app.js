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

        span.innerHTML = `${iconHtml} <span class="tab-text">${name}</span> <i class="fa-solid fa-circle-info info-trigger" title="Module Information"></i>`;
        span.onclick = () => loadModule(key, name);
        
        const infoIcon = span.querySelector('.info-trigger');
        if (infoIcon) {
            infoIcon.onclick = (e) => {
                e.stopPropagation();
                window.openModuleInfoModal(key);
            };
        }

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

// Module Information Data mapping
const moduleDescriptions = {
    apps: {
        name: "Apps Registry",
        desc: "A centralized directory of internal suite tools and custom applications built for the HackstreetBoys team. It lists all active systems, their purposes, and links.",
        actions: [
            "Search for registered internal applications by name or description.",
            "Register a new application with detailed text description and optional GitHub repository.",
            "Edit an app's details, description, or update its GitHub repository links.",
            "Quickly launch application pages or delete outdated items."
        ]
    },
    meetings: {
        name: "Meetings Manager",
        desc: "A management tool to log syncs, record discussions, schedule follow-ups, and track meeting minutes and team action items.",
        actions: [
            "Schedule upcoming standups, retrospective reviews, or team syncs.",
            "Record detailed agendas, set meeting timelines, and list participants.",
            "Assign and track action items, ensuring accountability.",
            "Search historical meeting transcripts, summaries, and outcomes."
        ]
    },
    messages: {
        name: "Secure Messages",
        desc: "An encrypted inbox for secure announcements, team notifications, and credential/confidential data transmissions.",
        actions: [
            "Compose and send encrypted messages and broadcasts to other team members.",
            "Filter or search your inbox to locate security updates.",
            "Read decrypted messages and manage conversation threads.",
            "Permanently delete sensitive threads once read."
        ]
    },
    calendar: {
        name: "Event Calendar",
        desc: "A team planner scheduling company releases, milestones, project deadlines, and general group calendars.",
        actions: [
            "Add events specifying dates, times, event descriptions, and tags.",
            "Filter calendar items by category: releases, milestones, or holidays.",
            "Search events to coordinate schedules and manage upcoming projects.",
            "Delete scheduled event items."
        ]
    },
    goals: {
        name: "Weekly Goals",
        desc: "A weekly objectives planner designed to align team performance, focus priorities, and track execution progress transparently.",
        actions: [
            "Set exactly 5 weekly goals at the beginning of the week.",
            "Check off completed goals to track progress and update the performance bar.",
            "Search and review team commitments and archives by week or teammate name.",
            "View the completion leaderboard to see top performing team members."
        ]
    },
    skills: {
        name: "Skills Repository",
        desc: "A collaborative skill matrix mapping engineering, business, and domain expertise across our team members.",
        actions: [
            "Add new technical or professional skills to the database.",
            "Update skill mastery levels and proficiency details.",
            "Search and filter skills by developer or technology category.",
            "Track technical resource distributions and skill categories."
        ]
    },
    procedures: {
        name: "Procedural Guides",
        desc: "A standard operating procedures (SOP) documentation bank defining key operational workflows and technical checklists.",
        actions: [
            "Browse and search technical procedures and step-by-step guides.",
            "Create new procedures detailing standard workflow tasks.",
            "Track guide usage and completion to verify checklist accuracy.",
            "View the documentation leaderboard mapping contributing authors."
        ]
    },
    glossary: {
        name: "Glossary Terms",
        desc: "An internal dictionary defining business acronyms, terminology, technical jargon, and team codenames.",
        actions: [
            "Look up terminology definitions and acronym expansions.",
            "Search terms or filter them alphabetically.",
            "Add new glossary cards specifying category and description.",
            "Edit or delete entries to keep the dictionary updated."
        ]
    },
    profile: {
        name: "User Profile & Directory",
        desc: "A profile dashboard managing your personal avatar, role, and professional biography, alongside the active team directory.",
        actions: [
            "View the full employee/team directory and search by role, department, or biography.",
            "View your own profile details by clicking your user avatar card.",
            "Edit your name, designated role, department, and professional bio.",
            "Access configuration details or trigger a secure session logout."
        ]
    }
};

// Module Info Modal Open/Close handlers
window.openModuleInfoModal = function(key) {
    const modal = document.getElementById('moduleInfoModal');
    const nameEl = document.getElementById('infoModuleName');
    const descEl = document.getElementById('infoModuleDesc');
    const actionsEl = document.getElementById('infoModuleActions');

    if (!modal || !nameEl || !descEl || !actionsEl) return;

    const info = moduleDescriptions[key];
    if (!info) return;

    nameEl.innerHTML = `<i class="fa-solid fa-circle-info" style="color: var(--accent);"></i> ${info.name}`;
    descEl.textContent = info.desc;
    
    actionsEl.innerHTML = '';
    info.actions.forEach(action => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'flex-start';
        li.style.gap = '8px';
        li.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--accent); font-size: 0.95rem; margin-top: 4px; flex-shrink: 0;"></i> <span>${action}</span>`;
        actionsEl.appendChild(li);
    });

    modal.style.display = 'flex';
    modal.offsetHeight; // trigger reflow
    modal.classList.add('show');
};

window.closeModuleInfoModal = function() {
    const modal = document.getElementById('moduleInfoModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// Close modal when clicking outside of it
window.addEventListener('click', (event) => {
    const modal = document.getElementById('moduleInfoModal');
    if (event.target === modal) {
        window.closeModuleInfoModal();
    }
});

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