const API_URL = '/api/skills';

async function getSkills() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API request failed');
        return await response.json();
    } catch (e) {
        console.error('Error fetching skills:', e);
        return [];
    }
}

async function saveSkills(list) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(list)
        });
        if (!response.ok) throw new Error('API request failed');
        await render();
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving skills:', e);
        alert('Failed to save skill entry to database.');
    }
}

async function addSkill() {
    const author = document.getElementById('contribName').value.trim();
    const title = document.getElementById('skillTitle').value.trim();
    const body = document.getElementById('skillDesc').value.trim();

    if (!author || !title || !body) return alert('Fill in all sections of the form');

    const list = await getSkills();
    list.push({ 
        id: Date.now(), 
        author, 
        title, 
        body,
        upvotes: 0 // Initialize upvotes count
    });
    
    await saveSkills(list);

    document.getElementById('skillTitle').value = '';
    document.getElementById('skillDesc').value = '';
}

async function deleteSkill(id) {
    if (!confirm('Are you sure you want to delete this standard article?')) return;
    const list = await getSkills();
    const filtered = list.filter(s => s.id !== id);
    await saveSkills(filtered);
}

async function upvoteSkill(id) {
    const list = await getSkills();
    const item = list.find(s => s.id === id);
    if (item) {
        item.upvotes = (item.upvotes || 0) + 1;
        await saveSkills(list);
    }
}

async function render() {
    const container = document.getElementById('skillsContainer');
    const board = document.getElementById('skillsLeaderboard');
    if (!container || !board) return;
    
    container.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem; color:#fbbf24;"></i></div>';
    board.innerHTML = '<div style="text-align:center; padding:10px;"><i class="fa-solid fa-circle-notch fa-spin" style="color:#fbbf24;"></i></div>';

    const skills = await getSkills();
    container.innerHTML = '';
    board.innerHTML = '';

    // Render Contributor Leaderboard
    const counts = {};
    skills.forEach(s => counts[s.author] = (counts[s.author] || 0) + 1);
    const ranking = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    
    if (ranking.length === 0) {
        board.innerHTML = '<p style="font-size:0.85rem; color:#6b7280; font-style:italic; margin:0; text-align:center; width:100%;">No contributor publications logged yet.</p>';
    } else {
        ranking.forEach(([user, val]) => {
            const pill = document.createElement('div');
            pill.className = 'badge';
            pill.style.cssText = "padding:6px 12px; font-size:0.8rem; border-radius:30px; display:inline-flex; align-items:center; gap:6px; background:rgba(251,191,36,0.1); color:#fbbf24; border-color:rgba(251,191,36,0.2);";
            pill.innerHTML = `<i class="fa-solid fa-award"></i> <strong>${user}</strong>: ${val} standard${val > 1 ? 's':''}`;
            board.appendChild(pill);
        });
    }

    // Search and Filter logic
    const searchQuery = document.getElementById('searchSkills').value.toLowerCase();
    const filteredSkills = skills.filter(s => 
        s.title.toLowerCase().includes(searchQuery) ||
        s.body.toLowerCase().includes(searchQuery) ||
        s.author.toLowerCase().includes(searchQuery)
    );

    if (filteredSkills.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-brain"></i>
                <p>No standards matching your search query.</p>
            </div>
        `;
        return;
    }

    // Sort by upvotes desc, then by date desc
    filteredSkills.sort((a, b) => {
        const upA = a.upvotes || 0;
        const upB = b.upvotes || 0;
        if (upA !== upB) return upB - upA;
        return b.id - a.id;
    });

    filteredSkills.forEach(s => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <h4 style="margin:0; font-size:1.1rem; color:white;">
                    <i class="fa-solid fa-book-bookmark" style="color:#fbbf24; margin-right:8px;"></i>
                    ${s.title}
                </h4>
                <button class="secondary-btn" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="deleteSkill(${s.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            
            <p style="white-space: pre-line; margin:12px 0 16px 0; color:#e5e7eb; line-height:1.5;">${s.body}</p>
            
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px;">
                <span class="badge">
                    <i class="fa-regular fa-circle-user"></i> Contributor: <strong>${s.author}</strong>
                </span>
                
                <button class="secondary-btn" style="padding:6px 12px; font-size:0.8rem; width:auto; border-radius:8px; display:inline-flex; align-items:center; gap:6px; color:#fbbf24; background:rgba(251, 191, 36, 0.1); border-color:rgba(251,191,36,0.15);" onclick="upvoteSkill(${s.id})">
                    <i class="fa-solid fa-thumbs-up"></i> Upvote (${s.upvotes || 0})
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', render);
