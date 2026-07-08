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

// Only initialize if we have a real config, otherwise we might throw errors, but let's initialize anyway.
// It will throw network errors if invalid, which is expected until the user fills it out.
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

window.FirebaseDB = {
    getCollection: async (moduleName) => {
        const getLocalFallback = () => {
            const localData = localStorage.getItem('firebase_db_' + moduleName);
            if (localData) {
                try {
                    return JSON.parse(localData);
                } catch(e) {}
            }
            return [];
        };

        if (!db) {
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
            return getLocalFallback();
        }
    },
    saveCollection: async (moduleName, data) => {
        // Always save to localStorage first
        localStorage.setItem('firebase_db_' + moduleName, JSON.stringify(data));

        if (!db) return false;
        try {
            const docRef = doc(db, "modules", moduleName);
            await withTimeout(setDoc(docRef, { data: data }), 2500);
            return true;
        } catch (e) {
            console.error("Error writing document to Firebase:", e);
            // Let the write succeed locally
            return false;
        }
    }
};

// Intercept fetch API calls to replace the Node.js server
const collections = ['skills', 'procedures', 'goals', 'calendar', 'meetings', 'messages', 'apps', 'profile', 'auth', 'glossary'];
const originalFetch = window.fetch;

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

            // Handle generic module data (db.json replacement)
            if (collections.includes(path)) {
                if (!options || options.method === 'GET' || !options.method) {
                    const data = await window.FirebaseDB.getCollection(path);
                    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
                }
                if (options && options.method === 'POST') {
                    const body = JSON.parse(options.body);

                    // Central Security Check: Enforce row-level ownership on entire collection saves
                    if (['skills', 'procedures', 'goals', 'calendar', 'meetings', 'messages', 'apps', 'glossary'].includes(path)) {
                        const actor = window.getSessionActor ? window.getSessionActor() : { name: 'A Team Member', email: '' };
                        const oldCollection = await window.FirebaseDB.getCollection(path);

                        const isUnauthorized = oldCollection.some(oldItem => {
                            const author = oldItem.author || oldItem.user; // check both standard owner fields
                            if (!author) return false; // allow fallback for legacy records without author

                            const isNotOwner = author.toLowerCase() !== actor.name.toLowerCase();
                            if (isNotOwner) {
                                // Find the matching item in the new collection
                                const newItem = body.find(n => n.id === oldItem.id);
                                if (!newItem) {
                                    // Deletion attempted!
                                    console.warn(`Access Denied: Attempted unauthorized deletion of item ${oldItem.id} by ${actor.name}`);
                                    return true;
                                }
                                // Modification check
                                const keys = new Set([...Object.keys(oldItem), ...Object.keys(newItem)]);
                                for (const key of keys) {
                                    if (key === 'tickets') {
                                        // Special handling for app tickets: toggling status is restricted to ticket author
                                        const oldTickets = oldItem.tickets || [];
                                        const newTickets = newItem.tickets || [];

                                        const ticketDeleted = oldTickets.some(ot => !newTickets.some(nt => nt.id === ot.id));
                                        if (ticketDeleted) return true;

                                        const unauthorizedTicketEdit = oldTickets.some(ot => {
                                            const ticketAuthor = ot.author;
                                            if (!ticketAuthor) return false;
                                            if (ticketAuthor.toLowerCase() !== actor.name.toLowerCase()) {
                                                const nt = newTickets.find(x => x.id === ot.id);
                                                if (!nt || JSON.stringify(nt) !== JSON.stringify(ot)) {
                                                    return true;
                                                }
                                            }
                                            return false;
                                        });
                                        if (unauthorizedTicketEdit) return true;
                                    } else {
                                        const oldVal = oldItem[key];
                                        const newVal = newItem[key];
                                        if (typeof oldVal === 'object' || typeof newVal === 'object') {
                                            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) return true;
                                        } else if (oldVal !== newVal) {
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

                    await window.FirebaseDB.saveCollection(path, body);
                    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                }
            }

            // Handle GitHub OAuth Status mock
            if (path === 'github-oauth/status') {
                const hasPat = !!localStorage.getItem('github_pat');
                return new Response(JSON.stringify({
                    configured: hasPat,
                    connected: hasPat,
                    clientId: 'static-pat-mode',
                    expiry: null // Never expires locally
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            // Handle GitHub Commits mock (bypassing the server proxy)
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
