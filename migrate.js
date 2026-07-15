const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

function processHtmlFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Determine path to firebase-init.js based on depth
    const relativePath = path.relative(path.dirname(filePath), rootDir);
    const firebasePath = relativePath === '' ? 'firebase-init.js' : path.join(relativePath, 'firebase-init.js');
    const posixPath = firebasePath.replace(/\\/g, '/'); // ensure posix slashes

    const scriptTag = `<script type="module" src="${posixPath}"></script>`;
    
    if (content.includes('firebase-init.js')) return; // already injected
    
    // Inject before session-check.js or first script
    if (content.includes('<script src="session-check.js"></script>')) {
        content = content.replace('<script src="session-check.js"></script>', `${scriptTag}\n    <script src="session-check.js"></script>`);
    } else if (content.includes('<script src="../../session-check.js"></script>')) {
        content = content.replace('<script src="../../session-check.js"></script>', `${scriptTag}\n    <script src="../../session-check.js"></script>`);
    } else if (content.includes('<script src="app.js"></script>')) {
        content = content.replace('<script src="app.js"></script>', `${scriptTag}\n    <script src="app.js"></script>`);
    } else {
        content = content.replace('</head>', `    ${scriptTag}\n</head>`);
    }

    fs.writeFileSync(filePath, content, 'utf8');
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git') continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.html')) {
            processHtmlFile(fullPath);
        }
    }
}

// 1. Inject firebase script into all HTML files
walkDir(rootDir);

// 2. Modify github-connect.html to ask for PAT instead of OAuth
const githubConnectPath = path.join(rootDir, 'github-connect.html');
if (fs.existsSync(githubConnectPath)) {
    let html = fs.readFileSync(githubConnectPath, 'utf8');
    
    const oldForm = `
        <div class="oauth-setup-section" id="setupSection" style="display:none; text-align: left; margin-bottom: 20px;">
            <p style="font-size: 0.85rem; color: #9ca3af; margin-bottom: 15px; line-height: 1.5;">
                To enable GitHub integrations safely, please create a GitHub OAuth App and provide its credentials. 
                <br><br>
                <strong>Authorization callback URL:</strong><br>
                <code style="display:inline-block; margin-top:5px; padding:4px 8px; background:rgba(255,255,255,0.1); border-radius:4px; user-select:all;">http://localhost:3000/github-oauth-callback.html</code>
            </p>
            
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.75rem; color: #9ca3af; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;">Client ID</label>
                <input type="text" id="clientIdInput" placeholder="Enter your GitHub OAuth Client ID" style="width: 100%; padding: 10px; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.1); color: white; border-radius: 6px; box-sizing: border-box; font-family: monospace;">
            </div>
            
            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; font-size: 0.75rem; color: #9ca3af; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;">Client Secret</label>
                <input type="password" id="clientSecretInput" placeholder="Enter your GitHub OAuth Client Secret" style="width: 100%; padding: 10px; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.1); color: white; border-radius: 6px; box-sizing: border-box; font-family: monospace;">
            </div>
            
            <button class="primary-btn" onclick="saveOAuthConfig()" style="width: 100%;">
                <i class="fa-solid fa-save"></i> Save Configuration
            </button>
        </div>
`;

    const newForm = `
        <div class="oauth-setup-section" id="setupSection" style="display:none; text-align: left; margin-bottom: 20px;">
            <p style="font-size: 0.85rem; color: #9ca3af; margin-bottom: 15px; line-height: 1.5;">
                For a static frontend, you need a Personal Access Token (PAT) with \`repo\` scope to read commits.
            </p>
            
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.75rem; color: #9ca3af; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;">Personal Access Token</label>
                <input type="password" id="patInput" placeholder="ghp_..." style="width: 100%; padding: 10px; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.1); color: white; border-radius: 6px; box-sizing: border-box; font-family: monospace;">
            </div>
            
            <button class="primary-btn" onclick="savePAT()" style="width: 100%;">
                <i class="fa-solid fa-save"></i> Save Configuration
            </button>
        </div>
`;

    // Replace HTML
    html = html.replace(/<div class="oauth-setup-section"[\s\S]*?<\/div>\s*<\/div>\s*<div id="connectionStatus"/, newForm + '\n        <div id="connectionStatus"');

    // Replace JS
    const oldJs = `
        async function checkStatus() {
            try {
                const res = await fetch('/api/github-oauth/status');
                const data = await res.json();
                
                if (!data.configured) {
                    document.getElementById('setupSection').style.display = 'block';
                    document.getElementById('connectionStatus').style.display = 'none';
                    return;
                }
                
                document.getElementById('setupSection').style.display = 'none';
                document.getElementById('connectionStatus').style.display = 'block';

                const statusBox = document.getElementById('statusBox');
                const statusIcon = document.getElementById('statusIcon');
                const statusText = document.getElementById('statusText');
                const statusSubtext = document.getElementById('statusSubtext');
                const actionBtn = document.getElementById('actionBtn');

                if (data.connected && data.expiry) {
                    // Connected
                    statusBox.style.background = 'rgba(16, 185, 129, 0.1)';
                    statusBox.style.borderColor = 'rgba(16, 185, 129, 0.2)';
                    statusIcon.innerHTML = '<i class="fa-brands fa-github" style="font-size: 24px; color: #10b981;"></i>';
                    statusText.innerText = 'Connected to GitHub';
                    statusText.style.color = '#10b981';
                    
                    const timeStr = new Date(data.expiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    statusSubtext.innerHTML = \`Session active via OAuth.\u003cbr\u003eExpires at \${timeStr}\`;

                    actionBtn.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> Disconnect';
                    actionBtn.onclick = handleDisconnect;
                } else {
                    // Configured but not connected (or expired)
                    statusBox.style.background = 'rgba(251, 191, 36, 0.1)';
                    statusBox.style.borderColor = 'rgba(251, 191, 36, 0.2)';
                    statusIcon.innerHTML = '<i class="fa-brands fa-github" style="font-size: 24px; color: #fbbf24;"></i>';
                    
                    if (data.expired) {
                        statusText.innerText = 'Session Expired';
                        statusText.style.color = '#ef4444';
                        statusBox.style.background = 'rgba(239, 68, 68, 0.1)';
                        statusBox.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                    } else {
                        statusText.innerText = 'Ready to Connect';
                        statusText.style.color = '#fbbf24';
                    }
                    
                    statusSubtext.innerText = 'Click connect to authorize via OAuth.';

                    actionBtn.innerHTML = '<i class="fa-solid fa-plug"></i> Connect GitHub';
                    actionBtn.onclick = handleConnect;
                }

            } catch (e) {
                console.error("Status check failed", e);
            }
        }

        async function saveOAuthConfig() {
            const clientId = document.getElementById('clientIdInput').value.trim();
            const clientSecret = document.getElementById('clientSecretInput').value.trim();
            
            if (!clientId || !clientSecret) return alert('Both ID and Secret are required');

            try {
                const res = await fetch('/api/github-oauth/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId, clientSecret })
                });
                
                if (res.ok) {
                    alert('OAuth App configured successfully!');
                    checkStatus();
                } else {
                    alert('Failed to save configuration');
                }
            } catch (e) {
                console.error(e);
                alert('Error saving configuration');
            }
        }

        async function handleConnect() {
            try {
                const res = await fetch('/api/github-oauth/setup');
                const data = await res.json();
                if (!data.clientId) return alert('No client ID configured');
                
                const redirectUri = encodeURIComponent('http://localhost:3000/github-oauth-callback.html');
                const scope = encodeURIComponent('repo');
                const authUrl = \`https://github.com/login/oauth/authorize?client_id=\${data.clientId}&redirect_uri=\${redirectUri}&scope=\${scope}\`;
                
                window.location.href = authUrl;
            } catch (e) {
                console.error(e);
                alert('Failed to start OAuth flow');
            }
        }

        async function handleDisconnect() {
            if(!confirm('Are you sure you want to disconnect your GitHub session?')) return;
            try {
                await fetch('/api/github-oauth/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId: null, clientSecret: null }) // Hack to clear for now or needs proper logout route
                });
            } catch(e) {} // ignore
            
            // Just force a reload which will show disconnected if we cleared it properly (requires server logic update, but for now we just reload)
            window.location.reload();
        }
`;

    const newJs = `
        async function checkStatus() {
            const hasPat = !!(window.top && window.top.github_pat);
            
            if (!hasPat) {
                document.getElementById('setupSection').style.display = 'block';
                document.getElementById('connectionStatus').style.display = 'none';
                return;
            }
            
            document.getElementById('setupSection').style.display = 'none';
            document.getElementById('connectionStatus').style.display = 'block';

            const statusBox = document.getElementById('statusBox');
            const statusIcon = document.getElementById('statusIcon');
            const statusText = document.getElementById('statusText');
            const statusSubtext = document.getElementById('statusSubtext');
            const actionBtn = document.getElementById('actionBtn');

            statusBox.style.background = 'rgba(16, 185, 129, 0.1)';
            statusBox.style.borderColor = 'rgba(16, 185, 129, 0.2)';
            statusIcon.innerHTML = '<i class="fa-brands fa-github" style="font-size: 24px; color: #10b981;"></i>';
            statusText.innerText = 'Connected to GitHub';
            statusText.style.color = '#10b981';
            
            statusSubtext.innerHTML = \`Session active via PAT.\`;

            actionBtn.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> Disconnect';
            actionBtn.onclick = handleDisconnect;
        }

        function savePAT() {
            const pat = document.getElementById('patInput').value.trim();
            if (!pat) return alert('PAT is required');
            if (window.top) window.top.github_pat = pat;
            alert('PAT saved locally!');
            checkStatus();
        }

        function handleDisconnect() {
            if(!confirm('Are you sure you want to disconnect?')) return;
            if (window.top) delete window.top.github_pat;
            checkStatus();
        }
`;
    // Rough replace, if it doesn't match perfectly, we can do it manually, but let's try
    html = html.replace(oldJs, newJs);
    
    // In case the oldJs exact string matching fails due to spaces, let's use a simpler replace
    if (html.includes('saveOAuthConfig')) {
        html = html.replace(/async function checkStatus\(\) \{[\s\S]*?async function handleDisconnect\(\) \{[\s\S]*?\n\s*\}/, newJs);
    }

    fs.writeFileSync(githubConnectPath, html, 'utf8');
}

// 3. Delete server-side files
const filesToDelete = [
    'server.js',
    '.env',
    'start.sh',
    'push.sh',
    'github-oauth-callback.html'
];

for (const f of filesToDelete) {
    const full = path.join(rootDir, f);
    if (fs.existsSync(full)) fs.unlinkSync(full);
}

// 4. Delete db.json files
const modsDir = path.join(rootDir, 'modules');
if (fs.existsSync(modsDir)) {
    const modules = fs.readdirSync(modsDir);
    for (const m of modules) {
        const dbPath = path.join(modsDir, m, 'db.json');
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
}
console.log('Migration complete.');
