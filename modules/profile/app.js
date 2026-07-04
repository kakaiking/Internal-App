// modules/profile/app.js

let allProfiles = [];
let currentUser = null;

// Initialize
async function init() {
    // Get session
    const sessionStr = localStorage.getItem('sessionUser');
    if (!sessionStr) {
        window.location.href = '/login.html';
        return;
    }
    currentUser = JSON.parse(sessionStr);

    await loadProfiles();
}

// Fetch profiles from server db
async function loadProfiles() {
    try {
        const response = await fetch('/api/profile');
        if (!response.ok) throw new Error('Failed to load profiles');
        allProfiles = await response.json();
        if (!Array.isArray(allProfiles)) {
            allProfiles = [];
        }
    } catch (err) {
        console.warn('Could not load profiles from database, falling back to local storage session state', err);
        allProfiles = [];
    }

    // Ensure current user exists in the profiles list
    let myProfile = allProfiles.find(p => p.email && p.email.toLowerCase() === currentUser.email.toLowerCase());

    if (!myProfile) {
        // Automatically create and insert new profile for current user
        myProfile = {
            email: currentUser.email,
            name: currentUser.name,
            avatar: currentUser.avatar && currentUser.avatar.startsWith('http') ? currentUser.avatar : '',
            role: 'Software Engineer',
            department: 'Development',
            bio: 'Hi, I am new to the portal! Excited to collaborate with the team.'
        };
        allProfiles.push(myProfile);
        await saveProfilesToServer();
    } else if (currentUser.avatar && currentUser.avatar.startsWith('http') && myProfile.avatar !== currentUser.avatar) {
        myProfile.avatar = currentUser.avatar;
        await saveProfilesToServer();
    }

    renderMyProfile(myProfile);
    renderTeammates();
}

// Save profiles back to modules/profile/db.json
async function saveProfilesToServer() {
    try {
        const response = await fetch('/api/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(allProfiles)
        });
        if (!response.ok) throw new Error('Save failed');

        // Notify parent dashboard stats to refresh user's dynamic display card
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (err) {
        console.error('Error saving profiles to database:', err);
    }
}

// Display logged in user's profile card and update header avatar button
function renderMyProfile(profile) {
    const avatarEl = document.getElementById('myAvatar');
    const nameEl = document.getElementById('myName');
    const emailEl = document.getElementById('myEmail');
    const roleEl = document.getElementById('myRole');
    const deptEl = document.getElementById('myDept');
    const bioEl = document.getElementById('myBio');
    const myProfileButton = document.getElementById('myProfileButton');

    if (profile) {
        // Render image if URL, otherwise initials
        const hasAvatar = profile.avatar && (profile.avatar.startsWith('http://') || profile.avatar.startsWith('https://'));
        if (hasAvatar) {
            avatarEl.textContent = '';
            avatarEl.style.backgroundImage = `url('${profile.avatar}')`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';

            if (myProfileButton) {
                myProfileButton.textContent = '';
                myProfileButton.style.backgroundImage = `url('${profile.avatar}')`;
                myProfileButton.style.backgroundSize = 'cover';
                myProfileButton.style.backgroundPosition = 'center';
            }
        } else {
            const initials = profile.name ? profile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U';
            avatarEl.textContent = initials;
            avatarEl.style.backgroundImage = 'none';

            if (myProfileButton) {
                myProfileButton.textContent = initials;
                myProfileButton.style.backgroundImage = 'none';
                myProfileButton.style.fontSize = '14px';
                myProfileButton.style.fontWeight = 'bold';
            }
        }

        nameEl.textContent = profile.name;
        emailEl.textContent = profile.email;
        roleEl.textContent = profile.role || 'Not specified';
        deptEl.textContent = profile.department || 'Not specified';
        bioEl.textContent = profile.bio || 'No bio provided.';
    }
}

// Display teammate directory cards list
function renderTeammates() {
    const listContainer = document.getElementById('teammatesList');
    const searchQuery = document.getElementById('searchTeammates').value.trim().toLowerCase();

    if (!listContainer) return;
    listContainer.innerHTML = '';

    // Include all teammates (including current user)
    const teammates = allProfiles;

    const filtered = teammates.filter(p => {
        const name = (p.name || '').toLowerCase();
        const role = (p.role || '').toLowerCase();
        const dept = (p.department || '').toLowerCase();
        const bio = (p.bio || '').toLowerCase();

        return name.includes(searchQuery) ||
            role.includes(searchQuery) ||
            dept.includes(searchQuery) ||
            bio.includes(searchQuery);
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                
                <p>No teammate profiles found matching your search.</p>
            </div>
        `;
        return;
    }

    filtered.forEach(member => {
        const hasAvatar = member.avatar && (member.avatar.startsWith('http://') || member.avatar.startsWith('https://'));
        const avatarStyle = hasAvatar ? `background-image: url('${member.avatar}'); background-size: cover; background-position: center; color: transparent;` : '';
        const initials = hasAvatar ? '' : (member.name ? member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U');

        const isMe = member.email && member.email.toLowerCase() === currentUser.email.toLowerCase();
        const meTag = isMe ? ' <span class="badge" style="font-size: 0.7rem; padding: 2px 6px; margin-left: 6px; background: rgba(255, 122, 0, 0.15); color: #ff7a00; border-color: rgba(255, 122, 0, 0.3);">You</span>' : '';

        const card = document.createElement('div');
        card.className = 'member-card';
        card.innerHTML = `
            <div class="member-card-header">
                <div class="member-avatar" style="${avatarStyle}">${initials}</div>
                <div class="member-info">
                    <h4 style="display: flex; align-items: center; gap: 4px;">${member.name}${meTag}</h4>
                    <p>${member.role || 'Teammate'}</p>
                </div>
            </div>
            <p class="member-bio">${member.bio || 'No bio provided.'}</p>
            <div class="member-footer">
                <span class="member-dept">${member.department || 'General'}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);"> ${member.email}</span>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

// My Profile Modal controls
function openMyProfileModal() {
    const modal = document.getElementById('myProfileModal');
    if (!modal) return;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeMyProfileModal() {
    const modal = document.getElementById('myProfileModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

// Edit modal controls
function openEditProfileModal() {
    const myProfile = allProfiles.find(p => p.email && p.email.toLowerCase() === currentUser.email.toLowerCase());
    if (!myProfile) return;

    document.getElementById('editName').value = myProfile.name;
    document.getElementById('editEmail').value = myProfile.email;
    document.getElementById('editRole').value = myProfile.role || '';
    document.getElementById('editDept').value = myProfile.department || '';
    document.getElementById('editBio').value = myProfile.bio || '';

    // Close my profile modal first
    closeMyProfileModal();

    const modal = document.getElementById('editProfileModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        openMyProfileModal(); // Reopen my profile modal
    }, 300);
}

// Save modal changes
async function saveProfileEdit(e) {
    e.preventDefault();

    const name = document.getElementById('editName').value.trim();
    const role = document.getElementById('editRole').value.trim();
    const dept = document.getElementById('editDept').value.trim();
    const bio = document.getElementById('editBio').value.trim();

    if (!name) return;

    // Find and update current user's profile entry
    const myProfileIdx = allProfiles.findIndex(p => p.email && p.email.toLowerCase() === currentUser.email.toLowerCase());

    if (myProfileIdx !== -1) {
        allProfiles[myProfileIdx].name = name;
        allProfiles[myProfileIdx].role = role;
        allProfiles[myProfileIdx].department = dept;
        allProfiles[myProfileIdx].bio = bio;
    }

    // Update active local session name
    currentUser.name = name;
    localStorage.setItem('sessionUser', JSON.stringify(currentUser));

    // Save and close
    await saveProfilesToServer();
    renderMyProfile(allProfiles[myProfileIdx]);
    renderTeammates();
    
    const modal = document.getElementById('editProfileModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        openMyProfileModal(); // Reopen my profile modal
    }, 300);
}

// Reset Session / Logout
function handleLogout() {
    if (confirm('Are you sure you want to log out of your session?')) {
        localStorage.removeItem('sessionUser');
        if (window.self !== window.top) {
            window.top.location.href = '/login.html';
        } else {
            window.location.href = '/login.html';
        }
    }
}

// Start
init();
