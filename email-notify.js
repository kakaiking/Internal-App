/**
 * email-notify.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared team-notification utility for HackstreetBoys Internal Portal.
 *
 * Whenever a team member performs a CREATE / EDIT / DELETE operation in any
 * module, this helper:
 *   1. Pulls every known team-member email from /api/profile (Firestore).
 *   2. Sends a branded notification email to each address via EmailJS.
 *
 * HOW TO SET UP EMAILJS (one-time, free):
 *   1. Go to https://www.emailjs.com and create a free account.
 *   2. Add an Email Service (e.g., Gmail).
 *   3. Create an Email Template with these variables:
 *        {{to_email}}   — recipient address
 *        {{actor_name}} — who performed the action
 *        {{action}}     — "added" | "edited" | "deleted"
 *        {{item_name}}  — the record's name / title
 *        {{module}}     — module name (Apps, Skills, Goals …)
 *        {{timestamp}}  — human-readable local time
 *        {{portal_url}} — link back to the portal
 *   4. Fill in your real IDs below (SERVICE_ID, TEMPLATE_ID, PUBLIC_KEY).
 * ─────────────────────────────────────────────────────────────────────────────
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
    } catch (e) {}
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
 * We call the REST endpoint so we don't need to bundle a library.
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
 * Main broadcast function — call this from any module after a successful
 * CREATE, EDIT, or DELETE.
 *
 * @param {Object} opts
 * @param {'added'|'edited'|'deleted'} opts.action   The CUD verb.
 * @param {string}  opts.actorName    Full name of the person who acted.
 * @param {string}  opts.itemName     Friendly name of the record touched.
 * @param {string}  opts.module       Human-readable module name.
 * @param {string}  [opts.excludeEmail] Optionally exclude the actor's own email.
 */
async function _isEmailNotificationsPaused() {
    try {
        const res = await fetch('/api/settings');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                const globalSettings = data.find(s => s.id === 'global');
                if (globalSettings) {
                    localStorage.setItem('emailNotificationsPaused', globalSettings.emailNotificationsPaused ? 'true' : 'false');
                    return globalSettings.emailNotificationsPaused === true;
                }
            }
        }
    } catch (e) {
        console.warn('[EmailNotify] Failed to fetch global settings, falling back to localStorage:', e);
    }
    return localStorage.getItem('emailNotificationsPaused') === 'true';
}

window.notifyTeam = async function ({ action, actorName, itemName, module, excludeEmail = '' }) {
    const isPaused = await _isEmailNotificationsPaused();
    if (isPaused) {
        console.log('[EmailNotify] Email notifications are paused globally — skipping notification.');
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
        added: 'added a new',
        edited: 'edited the',
        deleted: 'deleted the'
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
        // Convenience field for email subject / body
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
 * Returns { name, email } or { name: 'A Team Member', email: '' } as fallback.
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
