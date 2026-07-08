import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithPopup, signInWithCredential, signInWithRedirect, getRedirectResult, onAuthStateChanged, GithubAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Load environment variables dynamically from /.env
let env = {};
try {
    const res = await fetch('/.env');
    if (res.ok) {
        const text = await res.text();
        text.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const idx = trimmed.indexOf('=');
            if (idx === -1) return;
            const key = trimmed.slice(0, idx).trim();
            let val = trimmed.slice(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            env[key] = val;
        });
    }
} catch (e) {
    console.warn("Could not load .env file, using default values:", e);
}

// Expose env globally so non-module scripts (like email-notify.js) can read it
window.ENV = env;

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
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data().data || [];
                localStorage.setItem('firebase_db_' + moduleName, JSON.stringify(data));
                return data;
            } else {
                const fallbackData = getLocalFallback();
                try {
                    const docRefWrite = doc(db, "modules", moduleName);
                    await setDoc(docRefWrite, { data: fallbackData });
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
            await setDoc(docRef, { data: data });
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

    if (typeof url === 'string' && url.startsWith('/api/')) {
        let path = url.split('/api/')[1];
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

    return originalFetch.apply(this, args);
};
