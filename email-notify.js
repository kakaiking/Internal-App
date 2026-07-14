/**
 * /email-notify.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared team-notification utility for HackstreetBoys Internal Portal.
 */

// ─── ✏️  CONFIGURE YOUR EMAILJS CREDENTIALS HERE ────────────────────────────
let EMAILJS_SERVICE_ID = '';
let EMAILJS_TEMPLATE_ID = '';
let EMAILJS_PUBLIC_KEY = '';
let PORTAL_URL = '';
// ─────────────────────────────────────────────────────────────────────────────

let envLoaded = false;
async function _ensureEnv() {
    if (envLoaded) return;
    if (window.ENV) {
        if (window.ENV.EMAILJS_SERVICE_ID) EMAILJS_SERVICE_ID = window.ENV.EMAILJS_SERVICE_ID;
        if (window.ENV.EMAILJS_TEMPLATE_ID) EMAILJS_TEMPLATE_ID = window.ENV.EMAILJS_TEMPLATE_ID;
        if (window.ENV.EMAILJS_PUBLIC_KEY) EMAILJS_PUBLIC_KEY = window.ENV.EMAILJS_PUBLIC_KEY;
        if (window.ENV.PORTAL_URL) PORTAL_URL = window.ENV.PORTAL_URL;
        envLoaded = true;
        return;
    }
    try {
        console.warn('[EmailNotify] window.ENV not available — credentials may not be loaded yet.');
    } catch (e) { }
    envLoaded = true;
}

/**
 * Collects all team member emails from the profile store.
 * Returns an array of email strings (never null/undefined).
 */
async function _getAllTeamEmails() {
    try {
        const res = await fetch('/api/profile');
        if (!res.ok) return [];
        const profiles = await res.json();
        if (!Array.isArray(profiles)) return [];
        return profiles
            .map(p => (p.email || '').trim().toLowerCase())
            .filter(e => e.includes('@'));
    } catch (e) {
        console.warn('[EmailNotify] Could not load team profiles:', e);
        return [];
    }
}

/**
 * Sends a single email via EmailJS REST API (no SDK needed).
 */
async function _sendOneEmail(toEmail, templateParams) {
    const payload = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
            ...templateParams,
            to_email: toEmail
        }
    };

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`EmailJS responded ${res.status}: ${body}`);
    }
}

/**
 * Check if notifications are globally paused on the server, fallback to local configuration.
 */
async function _isEmailNotificationsPaused() {
    console.log('[EmailNotify] Checking notification pause status...');
    try {
        const res = await fetch('/api/settings');
        if (res.ok) {
            const data = await res.json();
            console.log('[EmailNotify] Settings fetched:', data);

            let globalPaused = null;
            if (Array.isArray(data)) {
                const globalSettings = data.find(s => s.id === 'global');
                if (globalSettings) {
                    globalPaused = globalSettings.emailNotificationsPaused === true;
                }
            } else if (data && typeof data === 'object') {
                globalPaused = data.emailNotificationsPaused === true;
            }

            if (globalPaused !== null) {
                console.log('[EmailNotify] Syncing notification status from server settings:', globalPaused);
                localStorage.setItem('emailNotificationsPaused', globalPaused ? 'true' : 'false');
                return globalPaused;
            }
        } else {
            console.log('[EmailNotify] Settings API offline (Static Mode). Falling back to local storage.');
        }
    } catch (e) {
        console.log('[EmailNotify] Failed to fetch settings, falling back to local storage.');
    }

    const localState = localStorage.getItem('emailNotificationsPaused') === 'true';
    console.log('[EmailNotify] Using local configuration state:', localState);
    return localState;
}

window.notifyTeam = async function ({ action, actorName, itemName, module, excludeEmail = '' }) {
    const isPaused = await _isEmailNotificationsPaused();
    if (isPaused) {
        console.log('[EmailNotify] Email notifications are paused — skipping notification.');
        return;
    }
    await _ensureEnv();
    if (
        !EMAILJS_SERVICE_ID ||
        !EMAILJS_TEMPLATE_ID ||
        !EMAILJS_PUBLIC_KEY ||
        EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID' ||
        EMAILJS_TEMPLATE_ID === 'YOUR_TEMPLATE_ID' ||
        EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY'
    ) {
        console.warn('[EmailNotify] EmailJS credentials not configured — skipping notification.');
        return;
    }

    // Fetch recipient list
    const emails = await _getAllTeamEmails();
    if (emails.length === 0) {
        console.warn('[EmailNotify] No team emails found — skipping notification.');
        return;
    }

    const actionVerb = {
        added: 'added',
        edited: 'edited',
        deleted: 'deleted'
    }[action] || action;

    const timestamp = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const templateParams = {
        actor_name: actorName,
        action: actionVerb,
        item_name: itemName,
        module,
        timestamp,
        portal_url: PORTAL_URL,
        subject: `[Portal] ${actorName} ${actionVerb} ${module} entry`
    };

    // Fan out — fire all sends concurrently; failures are non-fatal
    const sendPromises = emails
        .filter(e => e.toLowerCase() !== excludeEmail.toLowerCase())
        .map(email =>
            _sendOneEmail(email, templateParams).catch(err => {
                console.warn(`[EmailNotify] Failed to send to ${email}:`, err.message);
            })
        );

    await Promise.allSettled(sendPromises);
    console.log(`[EmailNotify] Broadcast complete: "${actorName} ${actionVerb} ${module} — ${itemName}" → ${sendPromises.length} recipient(s).`);
};

/**
 * Convenience helper: get the logged-in user's name and email from session.
 */
window.getSessionActor = function () {
    try {
        const session = JSON.parse(localStorage.getItem('sessionUser') || 'null');
        if (session && session.name) {
            return { name: session.name, email: session.email || '' };
        }
    } catch (_) { }
    return { name: 'A Team Member', email: '' };
};