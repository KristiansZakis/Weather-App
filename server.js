const http = require('http');
const fs = require('fs');
const path = require('path');

try {
    process.loadEnvFile(path.join(__dirname, '.env'));
} catch {}

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;
const PUBLIC_DIR = path.join(__dirname, 'public');
const OWM_API = 'https://api.openweathermap.org/data/2.5';
const OWM_TILES = 'https://tile.openweathermap.org/map';
const TILE_LAYERS = new Set(['clouds_new', 'precipitation_new', 'temp_new', 'wind_new', 'pressure_new']);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const cache = new Map();

function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}

function parseCoords(params) {
    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    if (!params.get('lat') || !params.get('lon')) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
}

async function cachedFetch(key, url, ttlMs) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

    const upstream = await fetch(url);
    const body = Buffer.from(await upstream.arrayBuffer());
    const value = {
        status: upstream.status,
        type: upstream.headers.get('content-type') || 'application/octet-stream',
        body
    };

    if (upstream.ok) {
        cache.set(key, { value, expires: Date.now() + ttlMs });
        if (cache.size > 2000) cache.delete(cache.keys().next().value);
    }
    return value;
}

async function handleWeather(res, params, endpoint) {
    const coords = parseCoords(params);
    if (!coords) return sendJson(res, 400, { error: 'Invalid or missing lat/lon' });

    const lat = coords.lat.toFixed(3);
    const lon = coords.lon.toFixed(3);
    const url = `${OWM_API}/${endpoint}?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;
    const result = await cachedFetch(`${endpoint}:${lat}:${lon}`, url, 10 * 60 * 1000);

    res.writeHead(result.status, { 'Content-Type': result.type });
    res.end(result.body);
}

async function handleTile(res, pathname) {
    const match = pathname.match(/^\/api\/tiles\/([a-z_]+)\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.png$/);
    if (!match || !TILE_LAYERS.has(match[1])) return sendJson(res, 404, { error: 'Unknown tile' });

    const [, layer, z, x, y] = match;
    const url = `${OWM_TILES}/${layer}/${z}/${x}/${y}.png?appid=${API_KEY}`;
    const result = await cachedFetch(`tile:${layer}:${z}:${x}:${y}`, url, 10 * 60 * 1000);

    res.writeHead(result.status, {
        'Content-Type': result.type,
        'Cache-Control': 'public, max-age=600'
    });
    res.end(result.body);
}

function serveStatic(req, res, pathname) {
    let relative;
    try {
        relative = decodeURIComponent(pathname);
    } catch {
        res.writeHead(400);
        return res.end('Bad request');
    }

    if (relative.endsWith('/')) relative += 'index.html';

    const filePath = path.join(PUBLIC_DIR, relative);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Not found');
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Content-Length': stats.size,
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        });

        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(filePath).pipe(res);
    });
}

const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        return res.end('Method not allowed');
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    try {
        if (url.pathname.startsWith('/api/')) {
            if (!API_KEY) return sendJson(res, 500, { error: 'OPENWEATHER_API_KEY is not configured' });
            if (url.pathname === '/api/weather') return await handleWeather(res, url.searchParams, 'weather');
            if (url.pathname === '/api/forecast') return await handleWeather(res, url.searchParams, 'forecast');
            if (url.pathname.startsWith('/api/tiles/')) return await handleTile(res, url.pathname);
            return sendJson(res, 404, { error: 'Not found' });
        }

        serveStatic(req, res, url.pathname);
    } catch (err) {
        console.error(err);
        if (!res.headersSent) sendJson(res, 502, { error: 'Upstream request failed' });
        else res.end();
    }
});

server.listen(PORT, () => {
    console.log(`Weather app running at http://localhost:${PORT}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
