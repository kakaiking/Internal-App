// modules/profile/app.js

let allProfiles = [];
let allowedEmails = [];
let currentUser = null;

// Initialize — called only after window.FirebaseDB is ready (see bottom of file)
async function init() {
    // Get session
    currentUser = window.top ? window.top.sessionUser : null;
    if (!currentUser) {
        window.location.href = '../../login.html';
        return;
    }

    await loadProfiles();
}

// Fetch ALL profiles from Firebase (via the intercepted fetch)
async function loadProfiles() {
    const loader = document.getElementById('profileLoader');
    const content = document.getElementById('profileContent');
    if (loader && content) {
        loader.style.display = 'flex';
        content.style.display = 'none';
    }
    try {
    try {
        const response = await fetch('/api/profile');
        if (!response.ok) throw new Error('Failed to load profiles');
        allProfiles = await response.json();
        if (!Array.isArray(allProfiles)) {
            allProfiles = [];
        }

        try {
            const raRes = await fetch('/api/role_access');
            if (raRes.ok) {
                const raData = await raRes.json();
                const allowedRec = raData.find(r => r.id === 'allowed');
                allowedEmails = allowedRec ? allowedRec.emails || [] : [];
            }
        } catch (err) {
            console.warn('Failed to load role access allowed list in admin profile:', err);
            allowedEmails = [];
        }
    } catch (err) {
        console.warn('Could not load profiles from Firebase, starting fresh for this session.', err);
        allProfiles = [];
    }

    // Find (or create) current user's profile entry
    let myProfile = allProfiles.find(p => p.email && p.email.toLowerCase() === currentUser.email.toLowerCase());

    if (!myProfile) {
        // New user — add them and do a safe merge-save
        myProfile = {
            email: currentUser.email,
            name: currentUser.name,
            avatar: currentUser.avatar && currentUser.avatar.startsWith('http') ? currentUser.avatar : '',
            role: 'Software Engineer',
            department: 'Development',
            bio: 'Hi, I am new to the portal! Excited to collaborate with the team.'
        };
        allProfiles.push(myProfile);
        await upsertMyProfile(myProfile);
    } else if (currentUser.avatar && currentUser.avatar.startsWith('http') && myProfile.avatar !== currentUser.avatar) {
        // Avatar changed — update only this field via safe merge-save
        myProfile.avatar = currentUser.avatar;
        await upsertMyProfile(myProfile);
    }

    renderMyProfile(myProfile);
    renderTeammates();

    } finally {
        if (loader && content) {
            loader.style.display = 'none';
            content.style.display = '';
        }
    }
}

// Safe merge-upsert: re-fetch the latest list from Firestore, update only
// the current user's record, then save the merged result back.
// This prevents two concurrent logins from overwriting each other.
async function upsertMyProfile(updatedProfile) {
    try {
        // 1. Get the freshest copy from Firestore
        let latestRes;
        try {
            latestRes = await fetch('/api/profile');
        } catch (_) { latestRes = null; }

        let latestProfiles = [];
        if (latestRes && latestRes.ok) {
            try { latestProfiles = await latestRes.json(); } catch (_) {}
        }
        if (!Array.isArray(latestProfiles)) latestProfiles = [];

        // 2. Upsert only the current user's record into the freshest copy
        const idx = latestProfiles.findIndex(p => p.email && p.email.toLowerCase() === updatedProfile.email.toLowerCase());
        if (idx === -1) {
            latestProfiles.push(updatedProfile);
        } else {
            // Preserve fields the user edited (role, dept, bio) but update avatar/name from session
            latestProfiles[idx] = { ...latestProfiles[idx], ...updatedProfile };
        }

        // 3. Save the merged list
        const response = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(latestProfiles)
        });
        if (!response.ok) throw new Error('Save failed');

        // Keep local copy in sync with what we just saved
        allProfiles = latestProfiles;

        // Notify parent dashboard to refresh
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (err) {
        console.error('Error upserting profile to database:', err);
    }
}

// Full replace — only used when the user explicitly edits their profile fields
async function saveProfilesToServer() {
    // Re-use the safe upsert with the current user's latest data from allProfiles
    const myProfile = allProfiles.find(p => p.email && p.email.toLowerCase() === currentUser.email.toLowerCase());
    if (myProfile) {
        await upsertMyProfile(myProfile);
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
        const hasAvatar = profile.avatar && (profile.avatar.startsWith('http://') || profile.avatar.startsWith('https://'));
        if (hasAvatar) {
            avatarEl.innerHTML = `<img src="${profile.avatar}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
            avatarEl.style.backgroundImage = 'none';

            if (myProfileButton) {
                myProfileButton.innerHTML = `<img src="${profile.avatar}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
                myProfileButton.style.backgroundImage = 'none';
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
        
        let avatarContent = '';
        if (hasAvatar) {
            avatarContent = `<img src="${member.avatar}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
        } else {
            avatarContent = member.name ? member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U';
        }

        const isMe = member.email && member.email.toLowerCase() === currentUser.email.toLowerCase();
        const meTag = isMe ? ' <span class="badge" style="font-size: 0.7rem; padding: 2px 6px; margin-left: 6px; background: rgba(255, 122, 0, 0.15); color: #ff7a00; border-color: rgba(255, 122, 0, 0.3);">You</span>' : '';

        const normalizedAllowed = allowedEmails.map(e => e.trim().toLowerCase());
        const isAllowed = member.email && normalizedAllowed.includes(member.email.trim().toLowerCase());

        let approvalActionsHtml = '';
        if (!isAllowed) {
            const isRejected = member.approvedStatus === 'rejected';
            const statusLabel = isRejected ? 'Access Rejected' : 'Pending Approval';
            const badgeColor = isRejected ? 'rgba(244, 63, 94, 0.15)' : 'rgba(251, 191, 36, 0.15)';
            const textColor = isRejected ? '#f43f5e' : '#fbbf24';
            const borderColor = isRejected ? 'rgba(244, 63, 94, 0.3)' : 'rgba(251, 191, 36, 0.3)';

            approvalActionsHtml = `
                <div class="approval-actions" style="margin-top: 14px; display: flex; gap: 8px; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
                    <span class="badge" style="background: ${badgeColor}; color: ${textColor}; border: 1px solid ${borderColor}; padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">
                        ${statusLabel}
                    </span>
                    <div style="display: flex; gap: 6px;">
                        <button onclick="approveUser('${escapeJs(member.email)}', '${escapeJs(member.name)}')" class="btn-approve" style="background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 6px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(16, 185, 129, 0.25)'; this.style.transform='scale(1.05)';" onmouseout="this.style.background='rgba(16, 185, 129, 0.12)'; this.style.transform='scale(1)';">
                            <i class="fa-solid fa-check"></i> Approve
                        </button>
                        <button onclick="rejectUser('${escapeJs(member.email)}')" class="btn-reject" style="background: rgba(244, 63, 94, 0.12); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.25); border-radius: 8px; padding: 6px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(244, 63, 94, 0.25)'; this.style.transform='scale(1.05)';" onmouseout="this.style.background='rgba(244, 63, 94, 0.12)'; this.style.transform='scale(1)';">
                            <i class="fa-solid fa-ban"></i> Reject
                        </button>
                    </div>
                </div>
            `;
        } else {
            approvalActionsHtml = `
                <div class="approval-actions" style="margin-top: 14px; display: flex; gap: 8px; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
                    <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">
                        Approved
                    </span>
                </div>
            `;
        }

        const card = document.createElement('div');
        card.className = 'member-card';
        card.innerHTML = `
            <div class="member-card-header">
                <div class="member-avatar">${avatarContent}</div>
                <div class="member-info">
                    <h4 style="display: flex; align-items: center; gap: 4px;">${member.name}${meTag}</h4>
                    <p>${member.role || 'Teammate'}</p>
                </div>
            </div>
            <p class="member-bio">${member.bio || 'No bio provided.'}</p>
            <div class="member-footer" style="padding-bottom: 0;">
                <span class="member-dept">${member.department || 'General'}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);"> ${member.email}</span>
            </div>
            ${approvalActionsHtml}
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
    if (window.top) window.top.sessionUser = currentUser;

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
        if (window.top) window.top.sessionUser = null;
        if (window.self !== window.top) {
            window.top.location.href = '../../login.html';
        } else {
            window.location.href = '../../login.html';
        }
    }
}

// Wait for firebase-init.js (a <script type="module">) to finish loading and
// override window.fetch before we call init(). Without this wait, app.js
// (a regular synchronous script) runs first, hits the real /api/profile URL
// which 404s on GitHub Pages, falls back to [], then saves that empty list
// back to Firestore — wiping every other user's profile.
function waitForFirebaseAndStart() {
    if (window.FirebaseDB) {
        init();
    } else {
        setTimeout(waitForFirebaseAndStart, 50);
    }
}
waitForFirebaseAndStart();

// Approval/Rejection Handlers and Helpers
window.approveUser = async function(email, name) {
    if (!confirm(`Are you sure you want to approve access for ${name} (${email})?`)) return;
    
    try {
        // 1. Get role access config
        const raRes = await fetch('/api/role_access');
        if (!raRes.ok) throw new Error('Failed to fetch role access');
        const raData = await raRes.json();
        
        let allowedRec = raData.find(r => r.id === 'allowed');
        if (!allowedRec) {
            allowedRec = { id: 'allowed', emails: [] };
            raData.push(allowedRec);
        }
        if (!allowedRec.emails) allowedRec.emails = [];
        
        // Add email if not already there
        const normalizedEmail = email.trim().toLowerCase();
        if (!allowedRec.emails.map(e => e.toLowerCase()).includes(normalizedEmail)) {
            allowedRec.emails.push(email);
        }
        
        // Save role access
        await fetch('/api/role_access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(raData)
        });
        
        // 2. Update profile record status
        const myProfileIdx = allProfiles.findIndex(p => p.email && p.email.toLowerCase() === email.toLowerCase());
        if (myProfileIdx !== -1) {
            allProfiles[myProfileIdx].approvedStatus = 'approved';
            
            // Save profiles
            await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(allProfiles)
            });
        }
        
        // 3. Send approval email to user
        if (window.sendApprovalEmailToUser) {
            await window.sendApprovalEmailToUser(email, name);
        } else {
            console.warn('sendApprovalEmailToUser function not found on window.');
        }
        
        // 4. Reload page data
        await loadProfiles();
        
        alert(`Access for ${email} approved successfully.`);
    } catch (e) {
        console.error('Error approving user:', e);
        alert('An error occurred during approval: ' + e.message);
    }
};

window.rejectUser = async function(email) {
    if (!confirm(`Are you sure you want to reject access for ${email}?`)) return;
    
    try {
        // 1. Remove from allowed role access if they were in there
        const raRes = await fetch('/api/role_access');
        if (!raRes.ok) throw new Error('Failed to fetch role access');
        const raData = await raRes.json();
        
        let allowedRec = raData.find(r => r.id === 'allowed');
        if (allowedRec && allowedRec.emails) {
            allowedRec.emails = allowedRec.emails.filter(e => e.trim().toLowerCase() !== email.trim().toLowerCase());
        }
        
        // Save role access
        await fetch('/api/role_access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(raData)
        });
        
        // 2. Update profile status in profiles
        const myProfileIdx = allProfiles.findIndex(p => p.email && p.email.toLowerCase() === email.toLowerCase());
        if (myProfileIdx !== -1) {
            allProfiles[myProfileIdx].approvedStatus = 'rejected';
            
            // Save profiles
            await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(allProfiles)
            });
        }
        
        // 3. Reload data
        await loadProfiles();
        
        alert(`Access for ${email} rejected.`);
    } catch (e) {
        console.error('Error rejecting user:', e);
        alert('An error occurred: ' + e.message);
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function escapeJs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\')
              .replace(/'/g, "\\'")
              .replace(/"/g, '\\"')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r');
}
