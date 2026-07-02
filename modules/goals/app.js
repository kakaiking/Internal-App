const API_URL = '/api/goals';

async function getGoals() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API issue');
        return await response.json();
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
        await render();
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
    
    const record = {
        id: Date.now(),
        user,
        goals: goalsArray.map(g => ({ text: g, done: false })),
        weekId: getWeekIdentifier(new Date())
    };

    currentDB.push(record);
    await saveGoals(currentDB);
    
    inputs.forEach(i => i.value = '');
}

async function toggleGoal(recordId, goalIndex) {
    const data = await getGoals();
    const item = data.find(r => r.id === recordId);
    if (item) {
        item.goals[goalIndex].done = !item.goals[goalIndex].done;
        await saveGoals(data);
    }
}

async function deleteRecord(recordId) {
    if (!confirm('Are you sure you want to delete this weekly goals commitment card?')) return;
    const data = await getGoals();
    const filtered = data.filter(r => r.id !== recordId);
    await saveGoals(filtered);
}

function getWeekIdentifier(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${weekNo}`;
}

async function render() {
    const container = document.getElementById('goalsHistory');
    const leaderboardContainer = document.getElementById('leaderboard');
    if (!container || !leaderboardContainer) return;

    container.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem; color:#fb7185;"></i></div>';
    leaderboardContainer.innerHTML = '<div style="text-align:center; padding:10px;"><i class="fa-solid fa-circle-notch fa-spin" style="color:#fb7185;"></i></div>';

    const data = await getGoals();
    container.innerHTML = '';
    leaderboardContainer.innerHTML = '';

    // Render History
    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-clipboard-list"></i>
                <p>No goals logged yet. Add your weekly commitments on the left.</p>
            </div>
        `;
        leaderboardContainer.innerHTML = `<p style="font-size:0.9rem; color:#6b7280; font-style:italic; margin:0; text-align:center;">No data logged</p>`;
        return;
    }

    // Sort newest commitments first
    const sortedData = [...data].sort((a, b) => b.id - a.id);

    sortedData.forEach(record => {
        const completedCount = record.goals.filter(g => g.done).length;
        const pct = Math.round((completedCount / 5) * 100);
        
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                <strong>
                    <span style="color:#fb7185;"><i class="fa-solid fa-calendar-week"></i> ${record.weekId}</span> 
                    <span style="color:white; margin-left:8px;"><i class="fa-solid fa-user"></i> ${record.user}</span>
                </strong>
                <button class="secondary-btn" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="deleteRecord(${record.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            
            <div class="infographics-bar">
                <div class="infographics-fill" style="width: ${pct}%"></div>
            </div>
            <p style="font-size:0.85rem; color:#9ca3af; margin:0 0 12px 0; font-weight:500;">
                <i class="fa-solid fa-circle-check" style="color:#10b981; margin-right:4px;"></i> ${completedCount} of 5 completed (${pct}%)
            </p>
            
            <div style="display:flex; flex-direction:column; gap:4px;">
                ${record.goals.map((g, idx) => `
                    <div class="goal-item-row">
                        <input type="checkbox" class="goal-checkbox" ${g.done ? 'checked' : ''} onchange="toggleGoal(${record.id}, ${idx})">
                        <span style="font-size:0.9rem; transition:all 0.2s; text-decoration: ${g.done ? 'line-through' : 'none'}; color: ${g.done ? '#6b7280' : '#d1d5db'}">
                            ${g.text}
                        </span>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(card);
    });

    // Compute Leaderboard
    const userStats = {};
    data.forEach(r => {
        if (!userStats[r.user]) userStats[r.user] = { attempted: 0, completed: 0 };
        userStats[r.user].attempted += 5;
        userStats[r.user].completed += r.goals.filter(g => g.done).length;
    });

    const sortedUsers = Object.entries(userStats).sort((a,b) => b[1].completed - a[1].completed);
    
    sortedUsers.forEach(([username, stats], idx) => {
        const pct = Math.round((stats.completed / stats.attempted) * 100 || 0);
        let rankBadge = '';
        
        if (idx === 0) {
            rankBadge = '<i class="fa-solid fa-trophy" style="color:#fbbf24; font-size:1.1rem;" title="1st Place"></i>';
        } else if (idx === 1) {
            rankBadge = '<i class="fa-solid fa-trophy" style="color:#94a3b8; font-size:1rem;" title="2nd Place"></i>';
        } else if (idx === 2) {
            rankBadge = '<i class="fa-solid fa-trophy" style="color:#b45309; font-size:0.9rem;" title="3rd Place"></i>';
        } else {
            rankBadge = `<span style="color:#6b7280; font-weight:bold; font-size:0.9rem; width:16px; text-align:center; display:inline-block;">${idx + 1}</span>`;
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
}

document.addEventListener('DOMContentLoaded', render);
