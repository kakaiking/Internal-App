import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithPopup, signInWithCredential, signInWithRedirect, getRedirectResult, onAuthStateChanged, GithubAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Read env vars injected by env-config.js <script> tag (loaded before this module)
const env = window.ENV || {};

const firebaseConfig = {
    apiKey: env.FIREBASE_API_KEY || "",
    authDomain: env.FIREBASE_AUTH_DOMAIN || "",
    projectId: env.FIREBASE_PROJECT_ID || "",
    storageBucket: env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: env.FIREBASE_APP_ID || ""
};

let db;
let auth;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (e) {
    console.warn("Firebase not properly configured yet.", e);
}

window.FirebaseAuth = {
    auth,
    signInWithPopup,
    signInWithCredential,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    GithubAuthProvider,
    signOut
};

const withTimeout = (promise, ms = 2500) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
    ]);
};

const isFirebaseOffline = () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return true;
    }
    try {
        return sessionStorage.getItem('firebase_offline') === 'true';
    } catch (e) {
        return false;
    }
};

window.FirebaseDB = {
    getCollection: async (moduleName) => {
        const getLocalFallback = () => {
            const localData = localStorage.getItem('firebase_db_' + moduleName);
            if (localData) {
                try {
                    return JSON.parse(localData);
                } catch (e) { }
            }
            return [];
        };

        if (!db || isFirebaseOffline()) {
            return getLocalFallback();
        }
        try {
            const docRef = doc(db, "modules", moduleName);
            const docSnap = await withTimeout(getDoc(docRef), 2500);
            if (docSnap.exists()) {
                const data = docSnap.data().data || [];
                localStorage.setItem('firebase_db_' + moduleName, JSON.stringify(data));
                return data;
            } else {
                const fallbackData = getLocalFallback();
                try {
                    const docRefWrite = doc(db, "modules", moduleName);
                    await withTimeout(setDoc(docRefWrite, { data: fallbackData }), 2500);
                } catch (e) {
                    console.warn("Could not save initial fallback to Firestore:", e);
                }
                return fallbackData;
            }
        } catch (e) {
            console.error("Error getting document from Firebase, falling back to local storage:", e);
            try {
                sessionStorage.setItem('firebase_offline', 'true');
                console.warn("[Firebase] Flagging Firebase as offline for this session to prevent future blocking timeout delays.");
            } catch (se) {}
            return getLocalFallback();
        }
    },
    saveCollection: async (moduleName, data) => {
        localStorage.setItem('firebase_db_' + moduleName, JSON.stringify(data));

        if (!db || isFirebaseOffline()) return false;
        try {
            const docRef = doc(db, "modules", moduleName);
            await withTimeout(setDoc(docRef, { data: data }), 2500);
            return true;
        } catch (e) {
            console.error("Error writing document to Firebase:", e);
            try {
                sessionStorage.setItem('firebase_offline', 'true');
                console.warn("[Firebase] Flagging Firebase as offline for this session to prevent future blocking timeout delays.");
            } catch (se) {}
            return false;
        }
    }
};

// Intercept fetch API calls to replace the Node.js server
const collections = ['skills', 'procedures', 'goals', 'calendar', 'meetings', 'messages', 'apps', 'profile', 'auth', 'glossary', 'settings', 'pending_skills', 'pending_procedures', 'pending_goals', 'pending_calendar', 'pending_meetings', 'pending_messages', 'pending_apps', 'pending_profile', 'pending_glossary'];
const originalFetch = window.fetch;

function safeEquals(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == b) {
        if ((typeof a === 'string' || typeof a === 'number') && (typeof b === 'string' || typeof b === 'number')) {
            return String(a) === String(b);
        }
    }
    if (typeof a !== typeof b) return false;
    if (a && typeof a === 'object' && b && typeof b === 'object') {
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!safeEquals(a[i], b[i])) return false;
            }
            return true;
        }
        if (Array.isArray(a) || Array.isArray(b)) return false;

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const k of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
            if (!safeEquals(a[k], b[k])) return false;
        }
        return true;
    }
    return false;
}

window.fetch = async function (...args) {
    const url = args[0];
    const options = args[1];

    let urlString = "";
    if (typeof url === 'string') {
        urlString = url;
    } else if (url && typeof url === 'object' && url.url) {
        urlString = url.url;
    }

    if (urlString) {
        let isApiCall = false;
        let path = "";

        if (urlString.startsWith('/api/')) {
            isApiCall = true;
            path = urlString.split('/api/')[1];
        } else if (urlString.includes('/api/')) {
            isApiCall = true;
            path = urlString.split('/api/')[1];
        }

        if (isApiCall) {
            let queryStr = '';
            if (path.includes('?')) {
                const parts = path.split('?');
                path = parts[0];
                queryStr = parts[1];
            }

            if (path.endsWith('/approve') || path.endsWith('/reject')) {
                const parts = path.split('/');
                const collectionName = parts[0];
                const action = parts[1];

                const body = JSON.parse(options.body);
                const pendingCol = 'pending_' + collectionName;

                const pending = await window.FirebaseDB.getCollection(pendingCol);
                const recordIdx = pending.findIndex(r => String(r.id) === String(body.id));
                if (recordIdx === -1) {
                    return new Response(JSON.stringify({ error: 'Record not found in pending queue' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
                }

                const record = pending[recordIdx];

                if (action === 'approve') {
                    const main = await window.FirebaseDB.getCollection(collectionName);
                    if (record.type === 'create') {
                        main.push(record.data);
                    } else if (record.type === 'edit') {
                        const mainIdx = main.findIndex(m => String(m.id) === String(record.data.id));
                        if (mainIdx !== -1) {
                            main[mainIdx] = record.data;
                        } else {
                            main.push(record.data);
                        }
                    }
                    await window.FirebaseDB.saveCollection(collectionName, main);
                }

                pending.splice(recordIdx, 1);
                await window.FirebaseDB.saveCollection(pendingCol, pending);

                return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            if (collections.includes(path)) {
                const isAdminModule = window.location.pathname.includes('/admin_modules/');

                if (!options || options.method === 'GET' || !options.method) {
                    if (isAdminModule) {
                        const pending = await window.FirebaseDB.getCollection('pending_' + path);
                        const formatted = pending.map(item => {
                            return {
                                ...item.data,
                                pendingId: item.id,
                                pendingType: item.type,
                                pendingAuthor: item.author
                            };
                        });
                        const active = await window.FirebaseDB.getCollection(path);
                        const combined = [...formatted, ...active];
                        return new Response(JSON.stringify(combined), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    } else {
                        const data = await window.FirebaseDB.getCollection(path);
                        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }
                }
                if (options && options.method === 'POST') {
                    const body = JSON.parse(options.body);

                    if (['skills', 'procedures', 'goals', 'calendar', 'meetings', 'messages', 'apps', 'glossary'].includes(path)) {
                        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
                        const oldCollection = await window.FirebaseDB.getCollection(path);

                        const isUnauthorized = oldCollection.some(oldItem => {
                            const author = oldItem.author || oldItem.user;
                            if (!author) return false;

                            const isNotOwner = author.toLowerCase() !== actor.name.toLowerCase();
                            if (isNotOwner) {
                                const newItem = body.find(n => String(n.id) === String(oldItem.id));
                                if (!newItem) {
                                    console.warn(`Access Denied: Attempted unauthorized deletion of item ${oldItem.id} by ${actor.name}`);
                                    return true;
                                }
                                const keys = new Set([...Object.keys(oldItem), ...Object.keys(newItem)]);
                                for (const key of keys) {
                                    if (key === 'tickets') {
                                        const oldTickets = oldItem.tickets || [];
                                        const newTickets = newItem.tickets || [];

                                        const ticketDeleted = oldTickets.some(ot => !newTickets.some(nt => String(nt.id) === String(ot.id)));
                                        if (ticketDeleted) return true;

                                        const unauthorizedTicketEdit = oldTickets.some(ot => {
                                            const ticketAuthor = ot.author;
                                            if (!ticketAuthor) return false;
                                            if (ticketAuthor.toLowerCase() !== actor.name.toLowerCase()) {
                                                const nt = newTickets.find(x => String(x.id) === String(ot.id));
                                                if (!nt || !safeEquals(nt, ot)) {
                                                    return true;
                                                }
                                            }
                                            return false;
                                        });
                                        if (unauthorizedTicketEdit) return true;
                                    } else {
                                        const oldVal = oldItem[key];
                                        const newVal = newItem[key];
                                        if (!safeEquals(oldVal, newVal)) {
                                            return true;
                                        }
                                    }
                                }
                            }
                            return false;
                        });

                        if (isUnauthorized) {
                            return new Response(JSON.stringify({ error: 'Permission Denied: Unauthorized modification or deletion of records owned by another user.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
                        }
                    }

                    const oldCollection = await window.FirebaseDB.getCollection(path);
                    const oldMap = new Map(oldCollection.map(item => [String(item.id), item]));
                    const newMap = new Map(body.map(item => [String(item.id), item]));

                    if (path === 'goals') {
                        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
                        const pending = await window.FirebaseDB.getCollection('pending_goals');
                        let finishedLastGoal = false;

                        for (const newItem of body) {
                            const oldItem = oldMap.get(String(newItem.id));
                            if (oldItem) {
                                const oldCompleted = oldItem.goals.filter(g => g.done).length;
                                const newCompleted = newItem.goals.filter(g => g.done).length;
                                if (oldCompleted < 5 && newCompleted === 5) {
                                    pending.push({
                                        id: newItem.id,
                                        type: 'goals_completed',
                                        author: newItem.user || actor.name,
                                        data: newItem
                                    });
                                    finishedLastGoal = true;
                                }
                            }
                        }
                        if (finishedLastGoal) {
                            await window.FirebaseDB.saveCollection('pending_goals', pending);
                            alert('Congratulations on finishing all 5 goals! A review record has been sent to the Admin.');
                        }
                        await window.FirebaseDB.saveCollection(path, body);
                        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }

                    const created = [];
                    const edited = [];
                    for (const newItem of body) {
                        const oldItem = oldMap.get(String(newItem.id));
                        if (!oldItem) {
                            created.push(newItem);
                        } else if (!safeEquals(oldItem, newItem)) {
                            edited.push(newItem);
                        }
                    }

                    // Specify modules that must undergo admin review
                    const requiresApproval = ['skills', 'procedures', 'calendar', 'meetings', 'messages', 'apps', 'glossary'];

                    if (requiresApproval.includes(path) && (created.length > 0 || edited.length > 0)) {
                        const pendingCol = 'pending_' + path;
                        const pending = await window.FirebaseDB.getCollection(pendingCol);
                        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };

                        for (const item of created) {
                            pending.push({
                                id: item.id || Date.now(),
                                type: 'create',
                                author: item.author || item.user || actor.name,
                                data: item
                            });
                        }

                        for (const item of edited) {
                            const idx = pending.findIndex(p => String(p.id) === String(item.id) && p.type === 'edit');
                            if (idx !== -1) {
                                pending[idx].data = item;
                            } else {
                                pending.push({
                                    id: item.id,
                                    type: 'edit',
                                    author: item.author || item.user || actor.name,
                                    data: item
                                });
                            }
                        }

                        await window.FirebaseDB.saveCollection(pendingCol, pending);
                        alert('Your changes have been submitted to the Admin for approval.');

                        const listToSave = [];
                        for (const oldItem of oldCollection) {
                            if (newMap.has(String(oldItem.id))) {
                                listToSave.push(oldItem);
                            }
                        }
                        await window.FirebaseDB.saveCollection(path, listToSave);
                        return new Response(JSON.stringify({ success: true, pending: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }

                    // Directly save properties that do not require administrative approval (e.g. settings)
                    await window.FirebaseDB.saveCollection(path, body);
                    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                }
            }

            if (path === 'github-oauth/status') {
                const hasPat = !!localStorage.getItem('github_pat');
                return new Response(JSON.stringify({
                    configured: hasPat,
                    connected: hasPat,
                    clientId: 'static-pat-mode',
                    expiry: null
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            if (path === 'github-commits') {
                const repo = new URLSearchParams(queryStr).get('repo');
                const token = localStorage.getItem('github_pat');

                if (!token) {
                    return new Response(JSON.stringify({ error: 'GitHub session expired. Please reconnect.', expired: true }), { status: 401, headers: { 'Content-Type': 'application/json' } });
                }

                try {
                    const ghRes = await originalFetch(`https://api.github.com/repos/${repo}/commits?per_page=15`, {
                        headers: {
                            'Accept': 'application/vnd.github+json',
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (!ghRes.ok) {
                        if (ghRes.status === 401 || ghRes.status === 403) {
                            localStorage.removeItem('github_pat');
                            return new Response(JSON.stringify({ error: 'GitHub access denied. Please reconnect.', expired: true }), { status: 401, headers: { 'Content-Type': 'application/json' } });
                        }
                        return new Response(JSON.stringify({ error: 'GitHub API error.' }), { status: ghRes.status, headers: { 'Content-Type': 'application/json' } });
                    }

                    const commits = await ghRes.json();
                    const simplified = commits.map(c => ({
                        sha: c.sha.substring(0, 7),
                        message: c.commit.message.split('\n')[0],
                        author: c.commit.author?.name || 'Unknown',
                        date: c.commit.author?.date,
                        url: c.html_url
                    }));

                    return new Response(JSON.stringify(simplified), { status: 200, headers: { 'Content-Type': 'application/json' } });
                } catch (err) {
                    return new Response(JSON.stringify({ error: 'Failed to fetch commits.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
                }
            }
        }
    }

    return originalFetch.apply(this, args);
};