// server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Set this in your environment before starting the server, e.g.:
//   GITHUB_TOKEN=ghp_xxxxxxxxxxxx node server.js
// Required for private repos, strongly recommended for public ones too
// (unauthenticated GitHub API calls are capped at 60 requests/hour per IP,
// shared across every user hitting this server; authenticated is 5000/hour).
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Handles GET /api/github-commits?repo=owner/repo
// Proxies to the GitHub API server-side so the token never reaches the
// browser, and so private repos work the same way as public ones.
async function handleGithubCommits(req, res, parsedUrl) {
    if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    const repo = parsedUrl.searchParams.get('repo');
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid repo format. Use owner/repo.' }));
        return;
    }

    try {
        const headers = {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'company-portal-server'
        };
        if (GITHUB_TOKEN) {
            headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
        }

        const ghRes = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=15`, { headers });

        if (ghRes.status === 404) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Repo not found or not accessible with current credentials.' }));
            return;
        }
        if (ghRes.status === 401 || ghRes.status === 403) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Access denied. Check GITHUB_TOKEN permissions or rate limits.' }));
            return;
        }
        if (!ghRes.ok) {
            res.writeHead(ghRes.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'GitHub API error.' }));
            return;
        }

        const commits = await ghRes.json();
        const simplified = commits.map(c => ({
            sha: c.sha.substring(0, 7),
            message: c.commit.message.split('\n')[0],
            author: c.commit.author?.name || 'Unknown',
            date: c.commit.author?.date,
            url: c.html_url
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(simplified));
    } catch (err) {
        console.error('GitHub commits fetch failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch commits.' }));
    }
}

const server = http.createServer(async (req, res) => {
    // CORS configuration
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // GitHub commits proxy — handled before the generic /api/ module logic
    // below, since "github-commits" is not a data module.
    if (pathname === '/api/github-commits') {
        await handleGithubCommits(req, res, parsedUrl);
        return;
    }

    // API endpoints handling read/write to the module's db.json
    if (pathname.startsWith('/api/')) {
        const moduleName = pathname.substring(5);

        // Basic validation for security
        if (!/^[a-zA-Z0-9_-]+$/.test(moduleName)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid module name' }));
            return;
        }

        const dbPath = path.join(__dirname, 'modules', moduleName, 'db.json');

        if (req.method === 'GET') {
            try {
                if (fs.existsSync(dbPath)) {
                    const data = await fs.promises.readFile(dbPath, 'utf8');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(data);
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify([]));
                }
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to read database', details: err.message }));
            }
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', async () => {
                try {
                    // Try parsing body to confirm it is valid JSON
                    const jsonData = JSON.parse(body);

                    // Create directory if not exists
                    const dirPath = path.dirname(dbPath);
                    if (!fs.existsSync(dirPath)) {
                        await fs.promises.mkdir(dirPath, { recursive: true });
                    }

                    await fs.promises.writeFile(dbPath, JSON.stringify(jsonData, null, 2), 'utf8');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, count: jsonData.length }));
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON or write error', details: err.message }));
                }
            });
            return;
        }
    }

    // Static files serving
    let safePath = pathname === '/' ? '/index.html' : pathname;
    let filePath = path.join(__dirname, safePath);

    // Prevent directory traversal attacks
    const relative = path.relative(__dirname, filePath);
    const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    if (!isSafe && safePath !== '/index.html') {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    try {
        let stats = await fs.promises.stat(filePath);
        if (stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const fileContent = await fs.promises.readFile(filePath);

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(fileContent);
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1><p>The requested file does not exist.</p>');
        } else {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>500 Internal Server Error</h1><p>${err.message}</p>`);
        }
    }
});

let currentPort = PORT;

function startServer(port) {
    server.listen(port);
}

server.on('listening', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Company Portal Server started successfully!`);
    console.log(`🌐 Open in your browser: http://localhost:${currentPort}`);
    console.log(`📁 Physical JSON databases are active in module folders`);
    if (!GITHUB_TOKEN) {
        console.log(`⚠️  GITHUB_TOKEN not set — private repos and higher rate limits won't work.`);
    }
    console.log(`======================================================\n`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`⚠️  Port ${currentPort} is already in use.`);
        currentPort++;
        console.log(`🔄 Retrying server startup on port ${currentPort}...`);
        startServer(currentPort);
    } else {
        console.error('Server error:', err);
    }
});

startServer(currentPort);