// modules/messages/app.js
const API_URL = '/api/messages';

function encrypt(text, key) {
    let result = "";
    for (let i = 0, j = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        const k = key.charCodeAt(j % key.length);
        result += String.fromCharCode(c ^ k);
        j++;
    }
    return btoa(result);
}

function decrypt(cipherText, key) {
    try {
        const decoded = atob(cipherText);
        let result = "";
        for (let i = 0, j = 0; i < decoded.length; i++) {
            const c = decoded.charCodeAt(i);
            const k = key.charCodeAt(j % key.length);
            result += String.fromCharCode(c ^ k);
            j++;
        }
        // Verify output matches ASCII readable characters to catch wrong key decryptions
        if (/[\x00-\x08\x0E-\x1F\x7F]/.test(result)) {
            return "[Decryption Key Mismatch]";
        }
        return result;
    } catch (e) {
        return "[Invalid Cipher Block]";
    }
}

async function getMessages() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('API issue');
        return await response.json();
    } catch (e) {
        console.error('Error fetching messages:', e);
        return [];
    }
}

async function saveMessages(msgs) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msgs)
        });
        if (!response.ok) throw new Error('API issue');
        await renderMessages();
        if (window.parent && typeof window.parent.loadDashboardStats === 'function') {
            window.parent.loadDashboardStats();
        }
    } catch (e) {
        console.error('Error saving messages:', e);
        alert('Failed to transmit message data to server.');
    }
}

async function sendMessage() {
    const key = document.getElementById('sharedKey').value.trim();
    const rawText = document.getElementById('plainMsg').value.trim();

    if (!key || !rawText) return alert('Secret key and plaintext message content are required');

    const encryptedData = encrypt(rawText, key);
    const msgs = await getMessages();
    
    msgs.push({
        id: Date.now(),
        cipher: encryptedData,
        timestamp: new Date().toLocaleTimeString()
    });

    await saveMessages(msgs);
    document.getElementById('plainMsg').value = '';
}

async function deleteMessage(id) {
    if (!confirm('Permanently delete this message from physical server storage?')) return;
    const msgs = await getMessages();
    const filtered = msgs.filter(m => m.id !== id);
    await saveMessages(filtered);
}

async function clearAllMessages() {
    if (!confirm('DANGER: Delete ALL encrypted messages from physical database? This cannot be undone.')) return;
    await saveMessages([]);
}

function onDecryptKeyInput() {
    const dKey = document.getElementById('decryptKey').value.trim();
    const statusBadge = document.getElementById('decryptionStatus');
    
    if (dKey) {
        statusBadge.className = 'badge success';
        statusBadge.innerHTML = '<i class="fa-solid fa-lock-open"></i> Decrypting';
    } else {
        statusBadge.className = 'badge danger';
        statusBadge.innerHTML = '<i class="fa-solid fa-lock"></i> Locked';
    }
    
    renderMessages();
}

async function renderMessages() {
    const container = document.getElementById('msgStream');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fa-solid fa-circle-notch fa-spin" style="color:#34d399;"></i></div>';

    const msgs = await getMessages();
    container.innerHTML = '';

    const dKey = document.getElementById('decryptKey').value.trim();

    if (msgs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-shield-halved"></i>
                <p>Cipher stream empty. Encrypt and transmit a message to see it here.</p>
            </div>
        `;
        return;
    }

    // Newest messages first
    msgs.sort((a, b) => b.id - a.id);

    msgs.forEach(m => {
        let decrypted = "[ENCRYPTED CIPHERTEXT]";
        let isDecrypted = false;
        let isError = false;

        if (dKey) {
            const decResult = decrypt(m.cipher, dKey);
            if (decResult === "[Decryption Key Mismatch]" || decResult === "[Invalid Cipher Block]") {
                decrypted = decResult;
                isError = true;
            } else {
                decrypted = decResult;
                isDecrypted = true;
            }
        }

        const card = document.createElement('div');
        card.className = 'card';
        card.style.position = 'relative';
        card.style.borderLeft = isDecrypted ? '4px solid #10b981' : (isError ? '4px solid #ef4444' : '4px solid #475569');

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.75rem; color:#6b7280; font-weight:600;">
                    <i class="fa-solid fa-clock"></i> Transmitted: ${m.timestamp}
                </span>
                <button class="secondary-btn" style="padding:4px 8px; font-size:0.75rem; width:auto; border-radius:6px; background:rgba(239,68,68,0.1); color:#ef4444; margin-bottom:0;" onclick="deleteMessage(${m.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            
            <div style="margin: 10px 0; font-family: monospace; font-size: 0.82rem; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.03); word-break:break-all;">
                <span style="color:#6b7280; font-weight:bold;">RAW DATA:</span> <span style="color:#a78bfa;">${m.cipher}</span>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px; font-size:0.95rem; margin-top:8px;">
                <span style="color:${isDecrypted ? '#10b981' : (isError ? '#ef4444' : '#6b7280')};">
                    <i class="fa-solid ${isDecrypted ? 'fa-envelope-open' : (isError ? 'fa-circle-xmark' : 'fa-envelope')}"></i>
                </span>
                <span style="font-weight: 500; word-break: break-word; color: ${isDecrypted ? '#f3f4f6' : (isError ? '#ef4444' : '#6b7280')}; font-style: ${isDecrypted ? 'normal' : 'italic'};">
                    ${decrypted}
                </span>
            </div>
        `;
        container.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', renderMessages);
