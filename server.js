// Backend proxy server for RSS feeds (avoids CORS issues)
import dotenv from 'dotenv';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { setDefaultResultOrder } from 'node:dns';
import dns from 'node:dns/promises';
import net from 'node:net';
import iconv from 'iconv-lite';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import crypto from 'node:crypto';
import {
  fetchHtmlSnippetBounded,
  MAX_HTML_LOGO_SNIPPET_BYTES,
  MAX_HTML_YOUTUBE_RESOLVE_BYTES,
} from './lib/fetchHtmlBounded.js';
import { extractArticleWithCache } from './lib/articleExtract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Load .env from the directory containing this file (reliable when cwd ≠ project root).
dotenv.config({ path: join(__dirname, '.env') });
// Prefer IPv4 when resolving hostnames — some CDNs (incl. YouTube) behave differently on IPv6 vs IPv4.
setDefaultResultOrder('ipv4first');
if (process.env.NODE_ENV === 'development') {
  const ytOk = Boolean(process.env.YOUTUBE_DATA_API_KEY?.trim());
  console.log(
    `[actufeed] API .env: ${join(__dirname, '.env')} | YOUTUBE_DATA_API_KEY ${ytOk ? 'loaded (channel search + YouTube resolve without Atom fetch when possible)' : 'missing (channel search 503; YouTube resolve needs Atom probe)'}`
  );
  console.log(
    '[actufeed] YouTube search logs: prefix [YouTube channel-search]. If the UI shows HTML/JSON errors but no "request" line when you search, traffic is not reaching this API (Vite proxy / BACKEND_PROXY_TARGET / port).'
  );
}

const app = express();
// Ports: set VITE_PORT / BACKEND_PORT / PORT in .env (see .env.example)
const VITE_PORT = Number(process.env.VITE_PORT || 3072);
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 3073);
// In dev mode, backend runs on BACKEND_PORT (proxied by Vite). In production, serves API + static on PORT.
const PORT =
  process.env.NODE_ENV === 'development'
    ? BACKEND_PORT
    : Number(process.env.PORT || 3072);

// Middleware
app.use(express.json());

// Trust proxy (important when behind reverse proxy like nginx)
// This ensures helmet gets correct client IP and protocol
app.set('trust proxy', 1);

// Security headers middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"], // Vite bundles are from same origin
      styleSrc: ["'self'", "'unsafe-inline'"], // Vite may inline styles, RSS feeds may have inline styles
      imgSrc: ["'self'", "data:", "https:", "http:"], // Allow all external images (RSS thumbnails, SVGs, etc.)
      connectSrc: ["'self'"], // API calls to same origin
      fontSrc: ["'self'", "data:", "https:"], // Fonts may be data URLs or external
      objectSrc: ["'none'"], // Block plugins
      mediaSrc: ["'self'", "https:"], // Allow external media
      frameSrc: ["'none'"], // Block iframes
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true' ? [] : null,
    },
  },
  // Other security headers
  xFrameOptions: { action: 'deny' }, // Prevent clickjacking
  xContentTypeOptions: true, // Prevent MIME sniffing
  strictTransportSecurity: process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true' ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  } : false, // Only in production with HTTPS
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS headers for API endpoints
// Get allowed origins from environment variable
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'development') {
    return [
      `http://127.0.0.1:${VITE_PORT}`,
      `http://127.0.0.1:${BACKEND_PORT}`,
      `http://localhost:${VITE_PORT}`,
      `http://localhost:${BACKEND_PORT}`,
    ];
  }
  
  // Production: Use environment variable
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
  }
  
  // Fallback: Use HOST if set
  if (process.env.HOST) {
    const protocol = process.env.HTTPS === 'true' ? 'https' : 'http';
    return [`${protocol}://${process.env.HOST}`];
  }
  
  // Last resort: Allow all (not recommended, but better than breaking)
  console.warn('[CORS] No ALLOWED_ORIGINS or HOST set, allowing all origins (not recommended for production)');
  return ['*'];
};

/**
 * Dev: allow browser Origin when using LAN IP (e.g. http://10.0.0.53:3072) with Vite or API port.
 * Simple same-origin GETs often omit Origin; POST + JSON (e.g. batch-complete) sends Origin and
 * would otherwise 403 while /api/proxy/rss GET still works — confusing in dev.
 */
function isDevelopmentLanOriginAllowed(origin) {
  if (process.env.NODE_ENV !== 'development') return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    const devPorts = new Set([String(VITE_PORT), String(BACKEND_PORT)]);
    if (!devPorts.has(port)) return false;
    const { hostname } = u;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return false; // already in getAllowedOrigins()
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (!m) return false;
    const oct = m.slice(1).map((x) => Number(x));
    if (oct.some((n) => n > 255)) return false;
    const [a, b] = oct;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  } catch {
    return false;
  }
}

/** True if Origin matches configured web CORS allowlist (not cryptographic proof of a browser). */
function isBrowserOriginTrustedForProxy(origin) {
  if (!origin || typeof origin !== 'string') return false;
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.includes('*')) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (isDevelopmentLanOriginAllowed(origin)) return true;
  return false;
}

/** Same-origin fetches often omit Origin; Referer still points at the SPA (spoofable like Origin). */
function refererMatchesAllowedOrigin(referer) {
  if (!referer || typeof referer !== 'string') return false;
  try {
    const r = new URL(referer);
    const base = `${r.protocol}//${r.host}`;
    return isBrowserOriginTrustedForProxy(base);
  } catch {
    return false;
  }
}

/**
 * Optional shared secret(s) for RSS/HTML/YouTube proxy routes. Comma-separated in ACTUFEED_PROXY_CLIENT_KEYS.
 * When non-empty: require header X-Actufeed-Client-Key to match (timing-safe), OR trusted browser Origin.
 * Mobile / RN should send the key (no Origin). Web can rely on Origin without the key.
 * Note: keys are extractable from app bundles; Origin can be spoofed by non-browsers — this is abuse friction, not proof of app identity.
 */
function parseProxyClientKeys() {
  const raw = process.env.ACTUFEED_PROXY_CLIENT_KEYS;
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((k) => k.length > 0);
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const PROXY_GATED_PATHS = new Set([
  '/api/proxy/rss',
  '/api/proxy/batch-complete',
  '/api/proxy/html',
  '/api/proxy/asset/check',
  '/api/article/extract',
  '/api/youtube/resolve',
  '/api/youtube/channel-search',
]);

const CORS_ALLOW_HEADERS = 'Content-Type, X-Actufeed-Client-Key';

app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  
  // Same-origin requests typically don't send Origin header
  // If no origin, allow (same-origin request)
  if (!origin) {
    // Same-origin request - allow
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    return next();
  }
  
  // Cross-origin request - check if allowed
  if (
    allowedOrigins.includes('*') ||
    allowedOrigins.includes(origin) ||
    isDevelopmentLanOriginAllowed(origin)
  ) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    return next();
  }
  
  // Origin not allowed
  console.warn(`[CORS] Blocked request from origin: ${origin}`);
  return res.status(403).json({ error: 'Origin not allowed' });
});

app.use((req, res, next) => {
  if (!PROXY_GATED_PATHS.has(req.path)) {
    return next();
  }
  const keys = parseProxyClientKeys();
  if (keys.length === 0) {
    return next();
  }
  const sent = req.headers['x-actufeed-client-key'];
  if (typeof sent === 'string' && keys.some((k) => timingSafeEqualStr(sent, k))) {
    return next();
  }
  if (isBrowserOriginTrustedForProxy(req.headers.origin)) {
    return next();
  }
  if (refererMatchesAllowedOrigin(req.headers.referer)) {
    return next();
  }
  // Vite dev proxy → API sometimes reaches here without Origin/Referer; keys would block the settings UI.
  if (
    process.env.NODE_ENV === 'development' &&
    (req.path === '/api/youtube/channel-search' || req.path === '/api/youtube/resolve')
  ) {
    return next();
  }
  console.warn(`[Proxy gate] Blocked ${req.method} ${req.path} (no valid client key, untrusted origin)`);
  return res.status(403).json({ error: 'Proxy access denied' });
});

// Rate limiting for RSS proxy endpoint
// Increased limit (500/15min) to handle parallel fetching of multiple RSS feeds
// Frontend batching helps prevent hitting this limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 minutes (increased from 100 to handle parallel fetching)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req) =>
    req.path === '/api/health' ||
    // One tiny POST per refresh; must not consume the same budget as N /api/proxy/rss calls
    // or a full reload hits 429 here and the handler never runs (no batch-complete log).
    (req.method === 'POST' && req.path === '/api/proxy/batch-complete'),
});

/** UUID (RFC 4122) from the news fetch batch; used to correlate many /api/proxy/rss calls. */
const RSS_BATCH_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidRssBatchId(id) {
  return typeof id === 'string' && id.length <= 64 && RSS_BATCH_ID_RE.test(id);
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  if (req.ip) {
    return req.ip;
  }
  return req.socket?.remoteAddress || 'unknown';
}

/** Apache-style UTC timestamp for logs, e.g. [07/Apr/2026:16:00:48 +0000] */
function logTimestampUTC(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    date.getUTCMonth()
  ];
  const y = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `[${day}/${mon}/${y}:${hh}:${mm}:${ss} +0000]`;
}

/** Response-body size as sent to the client (JSON), for transfer accounting. */
function jsonUtf8ByteLength(obj) {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

/**
 * Human-readable byte total: thousands separators + KB / MB / GB (1024-based).
 * Example: "5,322.41 MB" or "1,024 KB"
 */
function formatTransferredHumanReadable(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes.toLocaleString('en-US')} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toLocaleString('en-US', { maximumFractionDigits: 2 })} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toLocaleString('en-US', { maximumFractionDigits: 2 })} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toLocaleString('en-US', { maximumFractionDigits: 2 })} GB`;
}

const rssBatchStats = new Map();
const RSS_BATCH_STALE_MS = 2 * 60 * 60 * 1000;

function recordRssBatchTransfer(batchId, clientIp, byteCount) {
  if (!batchId || !byteCount || byteCount < 1) return;
  let entry = rssBatchStats.get(batchId);
  if (!entry) {
    entry = { ip: clientIp, bytes: 0, requests: 0, createdAt: Date.now() };
    rssBatchStats.set(batchId, entry);
  }
  entry.bytes += byteCount;
  entry.requests += 1;
}

function pruneStaleRssBatchStats() {
  const now = Date.now();
  for (const [id, entry] of rssBatchStats) {
    if (now - entry.createdAt > RSS_BATCH_STALE_MS) {
      rssBatchStats.delete(id);
      console.warn(
        `[RSS Proxy] Dropped stale batch stats (no batch-complete) batch=${id} client=${entry.ip} had ${entry.requests} req, ${formatTransferredHumanReadable(entry.bytes)}`
      );
    }
  }
}

setInterval(pruneStaleRssBatchStats, 15 * 60 * 1000).unref?.();

function parseRssBatchQueryParam(req) {
  const raw = req.query.batch;
  const s = Array.isArray(raw) ? raw[0] : raw;
  return typeof s === 'string' && isValidRssBatchId(s) ? s : null;
}

/** True if buffer likely contains a full RSS/Atom/RDF document (stop streaming early). */
function bufferLooksLikeCompleteXmlFeed(buf) {
  if (!buf?.length) return false;
  let s;
  try {
    s = buf.toString('utf8');
  } catch {
    return false;
  }
  return (
    /<\/feed\s*>/i.test(s) ||
    /<\/rss\s*>/i.test(s) ||
    /<\/rdf:RDF\s*>/i.test(s) ||
    /<\/RDF\s*>/i.test(s)
  );
}

/** Stop validation probe early on HTML error pages (avoid reading MB of markup). */
function bufferLooksLikeHtmlDocument(buf) {
  if (!buf || buf.length < 12) return false;
  const head = buf.toString('utf8', 0, Math.min(buf.length, 14000)).trimStart();
  return head.startsWith('<!DOCTYPE') || head.startsWith('<html');
}

/**
 * Read response body with optional byte cap and/or early stop (e.g. full XML feed).
 * @returns {Promise<{ buffer: Buffer, contentLengthHdr: string | null, truncated: boolean }>}
 */
async function readHttpResponseBodyBounded(response, options = {}) {
  const maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;
  const stopWhen = typeof options.stopWhen === 'function' ? options.stopWhen : null;
  const contentLengthHdr = response.headers.get('content-length');

  if (!response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    const lim = Math.min(buf.length, maxBytes);
    const out = buf.slice(0, lim);
    return {
      buffer: out,
      contentLengthHdr,
      truncated: lim < buf.length,
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;

      let chunk = Buffer.from(value);
      const room = maxBytes - total;
      if (chunk.length > room) {
        chunk = chunk.slice(0, room);
        chunks.push(chunk);
        total += chunk.length;
        const combined = Buffer.concat(chunks);
        if (stopWhen?.(combined)) {
          return { buffer: combined, contentLengthHdr, truncated: false };
        }
        return { buffer: combined, contentLengthHdr, truncated: true };
      }

      chunks.push(chunk);
      total += chunk.length;

      if (stopWhen) {
        const combined = Buffer.concat(chunks);
        if (stopWhen(combined)) {
          return { buffer: combined, contentLengthHdr, truncated: false };
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }

  const buffer = Buffer.concat(chunks);
  return {
    buffer,
    contentLengthHdr,
    truncated: Number.isFinite(maxBytes) && total >= maxBytes,
  };
}

function isYoutubeFeedsVideosXmlUrl(feedUrl) {
  try {
    const u = new URL(feedUrl);
    const h = u.hostname.replace(/^www\./i, '').toLowerCase();
    return h === 'youtube.com' && u.pathname.replace(/\/+$/, '') === '/feeds/videos.xml';
  } catch {
    return false;
  }
}

/** `feeds/videos.xml?channel_id=UC…` only (after normalization away from playlist_id). */
function extractYoutubeChannelIdFromFeedsVideosUrl(feedUrlString) {
  try {
    if (!isYoutubeFeedsVideosXmlUrl(feedUrlString)) return null;
    const u = new URL(feedUrlString);
    const id = u.searchParams.get('channel_id');
    if (id && /^UC[a-zA-Z0-9_-]{10,}$/i.test(id.trim())) return id.trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * YouTube’s feed origin often returns 404/500 for some client fingerprints while browsers (or another UA) get 200.
 * Try several realistic clients in order; do not random-pick a single Chrome UA for these URLs.
 */
const YOUTUBE_ATOM_FEED_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

const MAX_FORWARDED_CLIENT_UA_LENGTH = 512;

/** Strip CR/LF/NUL and cap length so the inbound UA cannot inject extra headers. */
function sanitizeForwardedUserAgent(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const s = raw.trim().replace(/[\r\n\x00]/g, '');
  return s.length <= MAX_FORWARDED_CLIENT_UA_LENGTH ? s : s.slice(0, MAX_FORWARDED_CLIENT_UA_LENGTH);
}

/**
 * Prefer the browser’s User-Agent (from the request to our API) for YouTube Atom fetches so behavior
 * matches “open this feed URL in my browser”; fall back to built-ins if YouTube still rejects.
 */
function buildYoutubeAtomFeedUserAgentList(clientUa) {
  const cleaned = sanitizeForwardedUserAgent(clientUa);
  if (!cleaned) return [...YOUTUBE_ATOM_FEED_USER_AGENTS];
  const rest = YOUTUBE_ATOM_FEED_USER_AGENTS.filter((ua) => ua !== cleaned);
  return [cleaned, ...rest];
}

// Helper function to fetch with retries (generic, no feed-specific logic)
async function fetchWithRetry(feedUrl, retries = 2, fetchOptions = {}) {
  const maxAttempts = retries + 1;
  let lastError = null;
  
  // Try the URL with retries
  for (let attempt = 0; attempt <= retries; attempt++) {
    const attemptNumber = attempt + 1;
    try {
      console.log(`[RSS Proxy] Attempt ${attemptNumber}/${maxAttempts} for ${feedUrl}`);
      
      // Add small delay between retries to avoid rate limiting
      if (attempt > 0) {
        const delay = 1000 * attempt;
        console.log(`[RSS Proxy] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const tryYoutube = isYoutubeFeedsVideosXmlUrl(feedUrl);
      const genericPool = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      ];
      const uaList = tryYoutube
        ? buildYoutubeAtomFeedUserAgentList(fetchOptions.clientUserAgent)
        : [genericPool[Math.floor(Math.random() * genericPool.length)]];

      let response = null;
      for (let uaIdx = 0; uaIdx < uaList.length; uaIdx++) {
        const userAgent = uaList[uaIdx];
        const headers = tryYoutube
          ? {
              'User-Agent': userAgent,
              Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
              'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
              'Accept-Encoding': 'gzip, deflate, br',
            }
          : {
              'User-Agent': userAgent,
              Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
              'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,fr-CA;q=0.7',
              'Accept-Encoding': 'gzip, deflate, br',
              Referer: `${new URL(feedUrl).origin}/`,
              'Cache-Control': 'no-cache',
              DNT: '1',
              Connection: 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
            };

        response = await fetch(feedUrl, {
          signal: controller.signal,
          headers,
          redirect: 'follow',
        });

        if (response.ok) {
          if (tryYoutube && uaIdx > 0) {
            console.log(
              `[RSS Proxy] YouTube feed OK after alternate User-Agent (${uaIdx + 1}/${uaList.length})`
            );
          } else if (tryYoutube && uaIdx === 0 && sanitizeForwardedUserAgent(fetchOptions.clientUserAgent)) {
            console.log('[RSS Proxy] YouTube feed OK using forwarded client User-Agent');
          }
          break;
        }

        const st = response.status;
        if (
          tryYoutube &&
          (st === 404 || st === 500 || st === 503) &&
          uaIdx < uaList.length - 1
        ) {
          console.log(
            `[RSS Proxy] YouTube feed HTTP ${st} (UA ${uaIdx + 1}/${uaList.length}), trying next fingerprint…`
          );
        } else {
          break;
        }
      }

      clearTimeout(timeoutId);
      
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const readBodyOpts = fetchOptions.minimalCompleteXml
          ? {
              maxBytes: fetchOptions.maxFeedReadBytes ?? 2 * 1024 * 1024,
              stopWhen: (buf) =>
                bufferLooksLikeCompleteXmlFeed(buf) || bufferLooksLikeHtmlDocument(buf),
            }
          : { maxBytes: Number.POSITIVE_INFINITY };

        const { buffer: rawBuffer, contentLengthHdr, truncated } =
          await readHttpResponseBodyBounded(response, readBodyOpts);

        console.log(
          `[Feed Fetch] RSS/Atom body ${rawBuffer.length} bytes` +
            (truncated ? ' (hit byte cap)' : '') +
            (fetchOptions.minimalCompleteXml ? ' [validation probe]' : '') +
            (contentLengthHdr ? ` (Content-Length hdr: ${contentLengthHdr})` : ' (no Content-Length / chunked)') +
            ` ← ${feedUrl}`
        );

        // First, try to detect encoding from Content-Type header
        let detectedEncoding = 'utf8';
        const charsetMatch = contentType.match(/charset=([^;]+)/i);
        if (charsetMatch) {
          detectedEncoding = charsetMatch[1].toLowerCase().trim();
          // Normalize common encoding names
          if (detectedEncoding === 'iso-8859-1' || detectedEncoding === 'latin1') {
            detectedEncoding = 'latin1';
          } else if (detectedEncoding === 'windows-1252' || detectedEncoding === 'cp1252') {
            detectedEncoding = 'win1252';
          } else if (detectedEncoding === 'utf-8' || detectedEncoding === 'utf8') {
            detectedEncoding = 'utf8';
          }
        }
        
        // Read the first part to check XML declaration for encoding
        // Try UTF-8 first to read the XML declaration
        const firstBytes = rawBuffer.slice(0, Math.min(500, rawBuffer.length));
        let firstText = '';
        try {
          firstText = firstBytes.toString('utf8');
        } catch (e) {
          // If UTF-8 fails, try latin1
          firstText = firstBytes.toString('latin1');
        }
        
        const xmlEncodingMatch = firstText.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i);
        if (xmlEncodingMatch) {
          const xmlEncoding = xmlEncodingMatch[1].toLowerCase().trim();
          // Use encoding from XML declaration if present
          if (xmlEncoding === 'iso-8859-1' || xmlEncoding === 'latin1') {
            detectedEncoding = 'latin1';
          } else if (xmlEncoding === 'windows-1252' || xmlEncoding === 'cp1252') {
            detectedEncoding = 'win1252';
          } else if (xmlEncoding === 'utf-8' || xmlEncoding === 'utf8') {
            detectedEncoding = 'utf8';
          }
        } else {
          // No encoding in XML declaration - check if content looks like UTF-8
          // If we can successfully decode as UTF-8 and it contains valid UTF-8 characters,
          // assume it's UTF-8 (many feeds don't declare encoding but are UTF-8)
          try {
            const testText = rawBuffer.toString('utf8');
            // Check if it contains valid UTF-8 sequences (Portuguese chars, etc.)
            // If the text decodes cleanly as UTF-8 and contains non-ASCII, it's likely UTF-8
            if (testText.includes('<?xml') && /[\u00C0-\u00FF]/.test(testText)) {
              // Contains Portuguese/Latin characters and decodes as UTF-8 - likely UTF-8
              detectedEncoding = 'utf8';
            }
          } catch (e) {
            // UTF-8 decode failed, keep detected encoding
          }
        }
        
        // Convert buffer to string using detected encoding, then to UTF-8
        // Use iconv-lite for proper encoding conversion
        let text;
        
        // First, always try UTF-8 to see if it decodes cleanly
        // Many feeds are UTF-8 but don't declare it, or incorrectly declare ISO-8859-1
        const utf8Test = rawBuffer.toString('utf8');
        // Check if UTF-8 decodes cleanly and contains Portuguese/Latin characters
        const looksLikeUtf8 = utf8Test.includes('<?xml') && 
                              /[^\x00-\x7F]/.test(utf8Test) && // Contains non-ASCII characters
                              /[\u00C0-\u00FF\u0100-\u017F\u0180-\u024F]/.test(utf8Test); // Contains Portuguese/Latin chars
        
        if (detectedEncoding === 'latin1' || detectedEncoding === 'iso-8859-1') {
          // Only use Latin1 if explicitly declared
          // But first, check if it might actually be UTF-8 (common misdeclaration)
          if (looksLikeUtf8) {
            // Looks like valid UTF-8 with Portuguese characters - use UTF-8 instead
            text = utf8Test;
            console.log(`[RSS Proxy] Feed declared ${detectedEncoding} but appears to be UTF-8, using UTF-8`);
          } else {
            // Convert from ISO-8859-1/Latin1 to UTF-8 using iconv-lite
            text = iconv.decode(rawBuffer, 'iso-8859-1');
          }
        } else if (detectedEncoding === 'win1252' || detectedEncoding === 'cp1252' || detectedEncoding === 'windows-1252') {
          // Windows-1252 - try UTF-8 first, fallback to Windows-1252
          if (looksLikeUtf8) {
            text = utf8Test;
          } else {
            // Use iconv-lite for proper Windows-1252 conversion
            text = iconv.decode(rawBuffer, 'windows-1252');
          }
        } else {
          // Default to UTF-8 (most common)
          text = utf8Test;
        }
        
        // Check if response is HTML (error page) instead of XML
        const trimmedText = text.trim();
        if (trimmedText.startsWith('<!DOCTYPE') || trimmedText.startsWith('<html')) {
          // Got HTML instead of XML - this is likely a 404 page or error
          const error = new Error('Response is HTML (likely error page), not RSS/XML');
          console.log(`[RSS Proxy] Attempt ${attemptNumber} failed: ${error.message}`);
          lastError = error;
          if (attempt < retries) continue;
          throw error;
        }
        
        // Validate it's XML/RSS
        if (trimmedText.includes('<rss') || 
            trimmedText.includes('<feed') || 
            trimmedText.includes('<?xml') ||
            trimmedText.includes('<RDF')) {
          
          // Normalize XML declaration to ensure UTF-8 encoding
          // This is critical for proper character encoding of accented characters
          let normalizedText = text;
          if (trimmedText.startsWith('<?xml')) {
            // Replace or add encoding="UTF-8" in XML declaration
            normalizedText = text.replace(
              /<\?xml\s+version=["']([^"']+)["'](\s+encoding=["'][^"']+["'])?/i,
              '<?xml version="$1" encoding="UTF-8"'
            );
            // If no XML declaration exists, add one (shouldn't happen, but safety check)
            if (!normalizedText.includes('<?xml')) {
              normalizedText = '<?xml version="1.0" encoding="UTF-8"?>\n' + normalizedText;
            }
          } else if (!trimmedText.includes('<?xml')) {
            // No XML declaration, add one with UTF-8
            normalizedText = '<?xml version="1.0" encoding="UTF-8"?>\n' + text;
          }
          
          console.log(
            `[RSS Proxy] ✓ Success on attempt ${attemptNumber}/${maxAttempts} for ${feedUrl} (encoding: ${detectedEncoding}, ${rawBuffer.length} bytes)`
          );
          return { text: normalizedText, contentType, url: feedUrl };
        } else {
          const error = new Error('Response is not valid RSS/XML feed');
          console.log(`[RSS Proxy] Attempt ${attemptNumber} failed: ${error.message}`);
          lastError = error;
          if (attempt < retries) continue;
          throw error;
        }
      } else {
        // Non-200 response
        const status = response.status;
        const error = new Error(`HTTP ${status} ${response.statusText}`);
        console.log(`[RSS Proxy] Attempt ${attemptNumber} failed: ${error.message}`);
        lastError = error;

        if (status === 403) {
          console.log(`[RSS Proxy] Permanent failure (403), not retrying`);
          throw error;
        }
        // Non-YouTube 404: permanent. YouTube feeds: 404/500/503 often flip between edges — retry.
        if (status === 404 && !tryYoutube) {
          console.log(`[RSS Proxy] Permanent failure (404), not retrying`);
          throw error;
        }
        if (
          tryYoutube &&
          (status === 404 || status === 500 || status === 503) &&
          attempt < retries
        ) {
          console.log(`[RSS Proxy] YouTube HTTP ${status}, backing off and retrying attempt…`);
          continue;
        }

        if (attempt < retries) {
          continue;
        }
        throw error;
      }
      
    } catch (error) {
      lastError = error;
      
      if (error.name === 'AbortError') {
        console.log(`[RSS Proxy] Attempt ${attemptNumber} failed: Request timeout`);
        // Timeout - retry if attempts remain
        if (attempt < retries) {
          continue;
        }
        const timeoutError = new Error('Request timeout after all retries');
        console.log(`[RSS Proxy] ✗ All ${maxAttempts} attempts exhausted for ${feedUrl}: ${timeoutError.message}`);
        throw timeoutError;
      }
      
      if (error.message.includes('HTTP 403')) {
        console.log(`[RSS Proxy] ✗ Permanent failure on attempt ${attemptNumber}, not retrying: ${error.message}`);
        throw error;
      }
      if (error.message.includes('HTTP 404') && !isYoutubeFeedsVideosXmlUrl(feedUrl)) {
        console.log(`[RSS Proxy] ✗ Permanent failure on attempt ${attemptNumber}, not retrying: ${error.message}`);
        throw error;
      }
      
      // Network errors or other issues - retry if attempts remain
      if (attempt < retries) {
        console.log(`[RSS Proxy] Attempt ${attemptNumber} failed: ${error.message}, will retry...`);
        continue;
      }
      
      // Last attempt failed
      console.log(`[RSS Proxy] ✗ All ${maxAttempts} attempts exhausted for ${feedUrl}: ${error.message}`);
      throw error;
    }
  }
  
  // Should never reach here, but just in case
  console.log(`[RSS Proxy] ✗ All ${maxAttempts} attempts exhausted for ${feedUrl}: ${lastError?.message || 'Unknown error'}`);
  throw lastError || new Error('Failed after all retries');
}

/** Unwrap undici/node `fetch` errors — `error.message` is often only "fetch failed". */
function describeFetchFailure(error) {
  if (!error || typeof error !== 'object') return String(error);
  const parts = [error.message || String(error)];
  let c = error.cause;
  for (let i = 0; i < 6 && c; i++) {
    if (c instanceof Error) {
      parts.push(c.message);
      c = c.cause;
    } else {
      parts.push(String(c));
      break;
    }
  }
  return parts.filter(Boolean).join(' → ');
}

async function fetchHtmlSnippetForLogo(pageUrl) {
  return fetchHtmlSnippetBounded(pageUrl, MAX_HTML_LOGO_SNIPPET_BYTES);
}

/** Scan stride while streaming; canonical / og:url for @handle often appears around ~600KB. */
const YOUTUBE_HTML_CHANNEL_ID_CHECK_STRIDE = 40 * 1024;

/** Fetch YouTube browse HTML but stop reading once a channel id can be parsed from the buffer. */
async function fetchYoutubeBrowseHtmlUntilChannelId(pageUrl) {
  const maxBytes = MAX_HTML_YOUTUBE_RESOLVE_BYTES;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];
  const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

  const response = await fetch(pageUrl, {
    signal: controller.signal,
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,fr-CA;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      Referer: new URL(pageUrl).origin + '/',
      'Cache-Control': 'no-cache',
      DNT: '1',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    const buf = Buffer.from(await response.arrayBuffer()).slice(0, maxBytes);
    console.log(
      `[Feed Fetch] HTML body ${buf.length} bytes (read cap ${maxBytes}, no stream) ← ${pageUrl}`
    );
    return buf.toString('utf8');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let lastCheckedAt = 0;

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) {
        chunks.push(Buffer.from(value));
        total += value.length;
      }
      if (total - lastCheckedAt >= YOUTUBE_HTML_CHANNEL_ID_CHECK_STRIDE || done) {
        const combined = Buffer.concat(chunks).slice(0, maxBytes);
        const html = combined.toString('utf8');
        if (extractYoutubeChannelIdFromHtml(html)) {
          console.log(
            `[Feed Fetch] HTML body ${combined.length} bytes (early stop after channel id, cap ${maxBytes}) ← ${pageUrl}`
          );
          return html;
        }
        lastCheckedAt = total;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }

  const buf = Buffer.concat(chunks).slice(0, maxBytes);
  console.log(`[Feed Fetch] HTML body ${buf.length} bytes (read cap ${maxBytes}) ← ${pageUrl}`);
  return buf.toString('utf8');
}

// SSRF Protection: Validate URL is safe to fetch
const isPrivateIP = (hostname) => {
  // Check for localhost variants
  if (hostname === 'localhost' || 
      hostname === '127.0.0.1' || 
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('::ffff:127.')) {
    return true;
  }
  
  // Check for private IP ranges
  const privateIPPatterns = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^169\.254\./,              // 169.254.0.0/16 (link-local)
    /^fc00:/i,                  // IPv6 private
    /^fe80:/i,                  // IPv6 link-local
  ];
  
  return privateIPPatterns.some(pattern => pattern.test(hostname));
};

// --- Resolved-address SSRF guard (production): hostname literals can still resolve to private/metadata IPs ---

function ipv4ToUint32(ip) {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map((x) => parseInt(x, 10));
  if (parts.some((n) => n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedResolvedIPv4(ip) {
  const n = ipv4ToUint32(ip);
  if (n === null) return true;
  const b0 = n >>> 24;
  const b1 = (n >>> 16) & 0xff;
  if (b0 === 0) return true; // 0.0.0.0/8
  if (b0 === 10) return true; // 10.0.0.0/8
  if (b0 === 127) return true; // 127.0.0.0/8
  if (b0 === 169 && b1 === 254) return true; // 169.254.0.0/16 (link-local, cloud metadata)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16.0.0/12
  if (b0 === 192 && b1 === 168) return true; // 192.168.0.0/16
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (b0 >= 224) return true; // 224.0.0.0/4 multicast + reserved
  return false;
}

/** @returns {{ mappedV4?: string, parts?: number[] } | null} */
function expandIPv6Parts(address) {
  const addr = address.split('%')[0].toLowerCase();
  const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return { mappedV4: mapped[1] };
  if (addr.includes('::')) {
    const [head, tail] = addr.split('::', 2);
    const left = head ? head.split(':').filter((x) => x.length) : [];
    const right = tail ? tail.split(':').filter((x) => x.length) : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    const parts = [...left, ...Array(missing).fill('0'), ...right];
    if (parts.length !== 8) return null;
    return { parts: parts.map((p) => parseInt(p, 16)) };
  }
  const parts = addr.split(':');
  if (parts.length !== 8) return null;
  return { parts: parts.map((p) => parseInt(p, 16)) };
}

function isBlockedResolvedIPv6(ip) {
  const v = ip.split('%')[0];
  const m = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (m) return isBlockedResolvedIPv4(m[1]);
  const expanded = expandIPv6Parts(v);
  if (!expanded) return true;
  if (expanded.mappedV4) return isBlockedResolvedIPv4(expanded.mappedV4);
  const p = expanded.parts;
  if (p.every((x) => x === 0)) return true; // ::
  if (p.every((x, i) => (i === 7 ? x === 1 : x === 0))) return true; // ::1
  if (p[0] >= 0xfe80 && p[0] <= 0xfebf) return true; // fe80::/10
  if (p[0] >= 0xfc00 && p[0] <= 0xfdff) return true; // fc00::/7 ULA
  if (p[0] >= 0xff00) return true; // ff00::/8 multicast
  return false;
}

function isBlockedResolvedAddress(ip) {
  if (net.isIPv4(ip)) return isBlockedResolvedIPv4(ip);
  if (net.isIPv6(ip)) return isBlockedResolvedIPv6(ip);
  return true;
}

/**
 * Ensures the URL's host does not resolve (or parse) to a non-public address.
 * Skipped in development so local / private feed URLs keep working.
 * Fetch still uses the original URL string so TLS SNI and cert validation are unchanged.
 */
async function assertSafeFetchTarget(url) {
  if (process.env.NODE_ENV === 'development') {
    return { ok: true };
  }

  const host = url.hostname;
  if (net.isIPv4(host) || net.isIPv6(host)) {
    return isBlockedResolvedAddress(host)
      ? { ok: false, error: 'Target address is not allowed' }
      : { ok: true };
  }

  let results;
  try {
    results = await dns.lookup(host, { all: true, verbatim: true });
  } catch (e) {
    const code = e && e.code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_NODATA') {
      return { ok: false, error: 'Host could not be resolved' };
    }
    console.warn(`[RSS Proxy] DNS lookup failed for ${host}:`, e.message);
    return { ok: false, error: 'Host could not be resolved' };
  }

  if (!results.length) {
    return { ok: false, error: 'Host could not be resolved' };
  }

  for (const { address } of results) {
    if (isBlockedResolvedAddress(address)) {
      return { ok: false, error: 'Resolved address is not allowed' };
    }
  }

  return { ok: true };
}

const validateFeedUrl = (feedUrl) => {
  let url;
  
  // Parse URL
  try {
    url = new URL(feedUrl);
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
  
  // Protocol whitelist (only HTTP and HTTPS)
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
  }
  
  // Block private IPs in production (allow in development for testing)
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (!isDevelopment) {
    const hostname = url.hostname.toLowerCase();
    
    // Check hostname directly
    if (isPrivateIP(hostname)) {
      return { valid: false, error: 'Private IP addresses are not allowed' };
    }
  }
  
  // URL length limit
  if (feedUrl.length > 2048) {
    return { valid: false, error: 'URL too long (max 2048 characters)' };
  }
  
  return { valid: true };
};

// --- YouTube: resolve channel page / @handle / ?channel_id → Atom feed URL ---

function isYoutubeHost(hostname) {
  const h = String(hostname || '')
    .replace(/^www\./i, '')
    .toLowerCase();
  return h === 'youtube.com' || h === 'm.youtube.com';
}

/**
 * Data API `relatedPlaylists.uploads` is a playlist id `UU…` (same suffix as `UC…` channel id).
 * YouTube often returns HTTP 404 for `feeds/videos.xml?playlist_id=UU…` when fetched from a server,
 * while `feeds/videos.xml?channel_id=UC…` still serves the same upload feed.
 */
function normalizeYoutubeVideosFeedUrlToChannelForm(urlString) {
  let u;
  try {
    u = new URL(String(urlString).trim());
  } catch {
    return urlString;
  }
  if (!isYoutubeHost(u.hostname)) return urlString;
  const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
  if (path !== '/feeds/videos.xml') return urlString;
  const playlistId = u.searchParams.get('playlist_id');
  if (!playlistId || !/^UU[a-zA-Z0-9_-]{10,}$/i.test(playlistId.trim())) {
    return urlString;
  }
  const channelId = `UC${playlistId.trim().slice(2)}`;
  u.protocol = 'https:';
  u.hostname = 'www.youtube.com';
  u.searchParams.delete('playlist_id');
  u.searchParams.set('channel_id', channelId);
  return u.toString();
}

function normalizeYoutubeBrowseUrl(inputUrl) {
  let u;
  try {
    u = new URL(String(inputUrl).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!isYoutubeHost(u.hostname)) return null;
  u.protocol = 'https:';
  u.hostname = 'www.youtube.com';
  u.hash = '';
  return u.toString();
}

/** UC… channel id from URL without fetching (feed URL, /channel/UC…, or ?channel_id=). */
function syncExtractYoutubeChannelId(inputUrl) {
  let u;
  try {
    u = new URL(String(inputUrl).trim());
  } catch {
    return null;
  }
  if (!isYoutubeHost(u.hostname)) return null;

  const path = u.pathname || '/';
  const feedsPath = path.replace(/\/+$/, '') || '/';
  if (feedsPath === '/feeds/videos.xml') {
    const id = u.searchParams.get('channel_id');
    if (id && /^UC[a-zA-Z0-9_-]{10,}$/i.test(id.trim())) return id.trim();
    const pl = u.searchParams.get('playlist_id');
    if (pl && /^UU[a-zA-Z0-9_-]{10,}$/i.test(pl.trim())) {
      return `UC${pl.trim().slice(2)}`;
    }
    return null;
  }

  const pm = path.match(/^\/channel\/(UC[a-zA-Z0-9_-]{10,})/i);
  if (pm) return pm[1];

  const qid = u.searchParams.get('channel_id');
  if (qid && /^UC[a-zA-Z0-9_-]{10,}$/i.test(qid.trim())) return qid.trim();

  return null;
}

function youtubePathNeedsBrowseFetch(pathname) {
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  if (p === '/' || p === '') return false;
  if (p.startsWith('/@')) return true;
  if (p.startsWith('/c/')) return true;
  if (p.startsWith('/user/')) return true;
  return false;
}

function extractYoutubeChannelIdFromHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const UC = 'UC[a-zA-Z0-9_-]{10,}';
  // Prefer page identity (@handle HTML embeds many unrelated "channelId" strings for recommendations).
  const canonicalFirst = [
    new RegExp(
      `<link[^>]+rel=["']canonical["'][^>]+href=["']https?:\\/\\/www\\.youtube\\.com\\/channel\\/(${UC})`,
      'i'
    ),
    new RegExp(
      `<link[^>]+href=["']https?:\\/\\/www\\.youtube\\.com\\/channel\\/(${UC})["'][^>]+rel=["']canonical["']`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+property=["']og:url["'][^>]+content=["']https?:\\/\\/www\\.youtube\\.com\\/channel\\/(${UC})`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']https?:\\/\\/www\\.youtube\\.com\\/channel\\/(${UC})["'][^>]+property=["']og:url["']`,
      'i'
    ),
  ];
  for (const re of canonicalFirst) {
    const m = html.match(re);
    if (m?.[1]?.startsWith('UC')) return m[1];
  }

  const external = html.match(new RegExp(`"externalId":"(${UC})"`, 'i'));
  if (external?.[1]?.startsWith('UC')) return external[1];

  const browse = html.match(/"browseId":"(UC[a-zA-Z0-9_-]{10,})"/i);
  if (browse?.[1]) return browse[1];

  const fallback = [
    new RegExp(`"channelId":"(${UC})"`, 'i'),
    new RegExp(`\\\\"channelId\\\\":\\\\"(${UC})\\\\"`, 'i'),
    new RegExp(`href=["']https?:\\/\\/www\\.youtube\\.com\\/channel\\/(${UC})`, 'i'),
    new RegExp(`\\/channel\\/(${UC})`, 'i'),
  ];
  for (const re of fallback) {
    const m = html.match(re);
    if (m?.[1]?.startsWith('UC')) return m[1];
  }
  return null;
}

/** Decode entities in meta tag `content` (OG fields are literal attribute text, not DOM text nodes). */
function decodeHtmlEntitiesPlain(str) {
  if (!str || typeof str !== 'string') return '';
  let s = str;
  s = s.replace(/&#x([0-9a-f]{1,6});/gi, (entity, h) => {
    const c = parseInt(h, 16);
    return Number.isFinite(c) && c >= 0 && c < 0x110000 ? String.fromCodePoint(c) : entity;
  });
  s = s.replace(/&#(\d{1,7});/g, (entity, d) => {
    const c = parseInt(d, 10);
    return Number.isFinite(c) && c >= 0 && c < 0x110000 ? String.fromCodePoint(c) : entity;
  });
  s = s.replace(/&nbsp;/gi, '\u00a0');
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&apos;/gi, "'");
  s = s.replace(/&lt;/gi, '<');
  s = s.replace(/&gt;/gi, '>');
  s = s.replace(/&amp;/gi, '&');
  return s;
}

function extractOgFromHtml(html) {
  const get = (prop) => {
    const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let m = html.match(
      new RegExp(`<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"']*)["']`, 'i')
    );
    if (m) return m[1];
    m = html.match(
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${esc}["']`, 'i')
    );
    return m ? m[1] : '';
  };
  return {
    title: decodeHtmlEntitiesPlain(get('og:title')),
    description: decodeHtmlEntitiesPlain(get('og:description')),
    image: decodeHtmlEntitiesPlain(get('og:image')),
  };
}

function parseYoutubeAtomFeedMeta(xml) {
  const titleM = xml.match(/<feed[^>]*>[\s\S]*?<title(?:\s[^>]*)?>([^<]*)<\/title>/i);
  const title = titleM ? decodeHtmlEntitiesPlain(titleM[1].trim()) : '';
  let link = '';
  const linkRe =
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const lm = xml.match(linkRe) || xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']alternate["']/i);
  if (lm) link = lm[1];
  const entries = (xml.match(/<entry>/gi) || []).length;
  return { title, link, entryCount: entries };
}

const YOUTUBE_OEMBED_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function tryYoutubeOembedChannelId(pageUrl) {
  try {
    const oembed = new URL('https://www.youtube.com/oembed');
    oembed.searchParams.set('url', pageUrl);
    oembed.searchParams.set('format', 'json');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(oembed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': YOUTUBE_OEMBED_UA,
        Accept: 'application/json',
      },
    });
    clearTimeout(tid);
    if (!r.ok) {
      console.log(`[YouTube] oEmbed HTTP ${r.status} for ${pageUrl}`);
      return null;
    }
    const j = await r.json();
    const authorUrl = j.author_url || '';
    const m = authorUrl.match(/\/channel\/(UC[a-zA-Z0-9_-]{10,})/i);
    return m ? m[1] : null;
  } catch (e) {
    console.warn('[YouTube] oEmbed failed:', e.message);
    return null;
  }
}

/**
 * channelId (UC…) → cached channels.list snapshot (feed URL + metadata). Reduces Data API calls on refresh.
 */
const youtubePlaylistAtomCache = new Map();
const YOUTUBE_PLAYLIST_ATOM_CACHE_MS = 6 * 60 * 60 * 1000;

function normalizeYoutubeApiLanguage(code) {
  if (!code || typeof code !== 'string') return 'en';
  const c = code.trim().toLowerCase();
  const two = c.slice(0, 2);
  if (/^[a-z]{2}$/.test(two)) return two;
  return 'en';
}

/**
 * One `channels.list` (snippet + contentDetails + statistics): metadata + canonical `feeds/videos.xml?channel_id=…`
 * URL (not `playlist_id=` — uploads id often 404s from server fetches). Used for /api/youtube/resolve without Atom/HTML.
 */
async function fetchYoutubeChannelSnapshotFromDataApi(channelId, fallbackFeedUrl) {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey || !channelId || !/^UC[a-zA-Z0-9_-]{10,}$/i.test(channelId)) {
    return null;
  }

  const cacheKey = channelId.trim();
  const hit = youtubePlaylistAtomCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return {
      atomFeedUrl: normalizeYoutubeVideosFeedUrlToChannelForm(hit.feedUrl),
      title: hit.title,
      description: hit.description,
      defaultLanguage: hit.defaultLanguage,
      videoCount: hit.videoCount,
      thumbnailUrl: hit.thumbnailUrl,
    };
  }

  try {
    const apiUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
    apiUrl.searchParams.set('part', 'snippet,contentDetails,statistics');
    apiUrl.searchParams.set('id', channelId);
    apiUrl.searchParams.set('key', apiKey);

    const r = await fetch(apiUrl.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const bodyText = await r.text();
    let json = {};
    try {
      json = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return null;
    }
    if (!r.ok) {
      const msg = json?.error?.message || r.statusText;
      console.warn(`[YouTube Data API] channels.list HTTP ${r.status} for ${channelId}: ${msg}`);
      return null;
    }
    const item = json.items?.[0];
    if (!item) return null;

    // Always use ?channel_id=UC… for the public Atom URL (see normalizeYoutubeVideosFeedUrlToChannelForm).
    const atomFeedUrl = fallbackFeedUrl;

    const sn = item.snippet || {};
    const st = item.statistics || {};
    const rawLang = sn.defaultLanguage || sn.defaultAudioLanguage || 'en';
    const vcRaw = st.videoCount;
    let videoCount = null;
    if (vcRaw !== undefined && vcRaw !== null && String(vcRaw).length > 0) {
      const n = parseInt(String(vcRaw), 10);
      if (Number.isFinite(n) && n >= 0) videoCount = n;
    }

    const thumbnailUrl =
      sn.thumbnails?.high?.url ||
      sn.thumbnails?.medium?.url ||
      sn.thumbnails?.default?.url ||
      '';

    const snap = {
      atomFeedUrl,
      title: typeof sn.title === 'string' ? sn.title : '',
      description: typeof sn.description === 'string' ? sn.description : '',
      defaultLanguage: normalizeYoutubeApiLanguage(rawLang),
      videoCount,
      thumbnailUrl,
    };

    youtubePlaylistAtomCache.set(cacheKey, {
      feedUrl: snap.atomFeedUrl,
      expiresAt: Date.now() + YOUTUBE_PLAYLIST_ATOM_CACHE_MS,
      title: snap.title,
      description: snap.description,
      defaultLanguage: snap.defaultLanguage,
      videoCount: snap.videoCount,
      thumbnailUrl: snap.thumbnailUrl,
    });

    console.log(`[YouTube Data API] channels.list snapshot for ${channelId.slice(0, 12)}… (Atom + metadata)`);
    return snap;
  } catch (e) {
    console.warn(`[YouTube Data API] channels.list failed: ${e.message}`);
    return null;
  }
}

/**
 * @returns {Promise<{
 *   feedUrl: string | null,
 *   channelId: string | null,
 *   channelPageUrl: string | null,
 *   browseHtml: string | null,
 *   error: string | null,
 *   dataApiChannel: null | {
 *     title: string,
 *     description: string,
 *     defaultLanguage: string,
 *     videoCount: number | null,
 *     thumbnailUrl: string,
 *   },
 * }>}
 */
async function resolveYoutubeInputToFeedUrl(inputUrl) {
  const shortHost = (() => {
    try {
      return new URL(String(inputUrl).trim()).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return '';
    }
  })();
  if (shortHost === 'youtu.be') {
    return {
      feedUrl: null,
      channelId: null,
      channelPageUrl: null,
      browseHtml: null,
      error:
        'youtu.be links point to a single video. Open the channel on youtube.com and paste /channel/UC…, /@handle, or feeds/videos.xml?channel_id=…',
    };
  }
  if (shortHost.includes('music.youtube')) {
    return {
      feedUrl: null,
      channelId: null,
      channelPageUrl: null,
      browseHtml: null,
      error: 'music.youtube.com channel URLs are not supported. Use www.youtube.com channel links.',
    };
  }

  const normalizedPage = normalizeYoutubeBrowseUrl(inputUrl);
  if (!normalizedPage) {
    return {
      feedUrl: null,
      channelId: null,
      channelPageUrl: null,
      browseHtml: null,
      error: 'Invalid or unsupported YouTube URL.',
    };
  }

  const pageObj = new URL(normalizedPage);
  const pathClean = (pageObj.pathname || '/').replace(/\/+$/, '') || '/';

  const syncId = syncExtractYoutubeChannelId(normalizedPage);
  if (syncId) {
    const fallbackFeed = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(syncId)}`;
    const snap = await fetchYoutubeChannelSnapshotFromDataApi(syncId, fallbackFeed);
    const feedUrl = snap?.atomFeedUrl || fallbackFeed;
    const dataApiChannel = snap?.title
      ? {
          title: snap.title,
          description: snap.description,
          defaultLanguage: snap.defaultLanguage,
          videoCount: snap.videoCount,
          thumbnailUrl: snap.thumbnailUrl,
        }
      : null;
    console.log(
      `[YouTube] resolved via URL (no HTML fetch) channel_id=${syncId}${dataApiChannel ? ' + Data API metadata' : ''}`
    );
    return {
      feedUrl,
      channelId: syncId,
      channelPageUrl: `https://www.youtube.com/channel/${syncId}`,
      browseHtml: null,
      error: null,
      dataApiChannel,
    };
  }

  if (pathClean === '/feeds/videos.xml') {
    return {
      feedUrl: null,
      channelId: null,
      channelPageUrl: null,
      browseHtml: null,
      error:
        'Missing or invalid channel_id. Use: https://www.youtube.com/feeds/videos.xml?channel_id=UC…',
    };
  }

  if (!youtubePathNeedsBrowseFetch(pageObj.pathname)) {
    return {
      feedUrl: null,
      channelId: null,
      channelPageUrl: null,
      browseHtml: null,
      error:
        'Could not find a channel ID in this URL. Try the channel page (/@handle, /channel/UC…, or /c/…), or feeds/videos.xml?channel_id=UC…',
    };
  }

  console.log(`[YouTube] fetching browse page (${pageObj.pathname}) → ${normalizedPage}`);
  let html;
  try {
    html = await fetchYoutubeBrowseHtmlUntilChannelId(normalizedPage);
  } catch (e) {
    console.warn('[YouTube] browse page fetch failed:', e.message);
    return {
      feedUrl: null,
      channelId: null,
      channelPageUrl: normalizedPage,
      browseHtml: null,
      error: `Could not load YouTube channel page: ${e.message}`,
    };
  }

  let channelId = extractYoutubeChannelIdFromHtml(html);
  if (!channelId) {
    console.log('[YouTube] channelId not in HTML snippet; trying oEmbed');
    channelId = await tryYoutubeOembedChannelId(normalizedPage);
  }

  if (!channelId) {
    console.warn(
      `[YouTube] could not extract channel_id (HTML ${html.length} chars) for ${normalizedPage}`
    );
    return {
      feedUrl: null,
      channelId: null,
      channelPageUrl: normalizedPage,
      browseHtml: html,
      error:
        'Could not resolve this channel (no channel ID found). The handle may be wrong, or YouTube blocked the request.',
    };
  }

  const fallbackFeed = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const snap = await fetchYoutubeChannelSnapshotFromDataApi(channelId, fallbackFeed);
  const feedUrl = snap?.atomFeedUrl || fallbackFeed;
  const dataApiChannel = snap?.title
    ? {
        title: snap.title,
        description: snap.description,
        defaultLanguage: snap.defaultLanguage,
        videoCount: snap.videoCount,
        thumbnailUrl: snap.thumbnailUrl,
      }
    : null;
  console.log(
    `[YouTube] resolved browse URL → channel_id=${channelId}${dataApiChannel ? ' + Data API metadata' : ''}`
  );
  return {
    feedUrl,
    channelId,
    channelPageUrl: `https://www.youtube.com/channel/${channelId}`,
    browseHtml: html,
    error: null,
    dataApiChannel,
  };
}

/** Short TTL: many parallel /api/proxy/rss calls per refresh; playlistItems.list costs 1 unit per page. */
const youtubePlaylistItemsFeedXmlCache = new Map();
const YOUTUBE_PLAYLIST_ITEMS_FEED_XML_TTL_MS = 120_000;

function escapeXmlText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchYoutubePlaylistItemsPage(apiKey, playlistId, pageToken, isRetry = false) {
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('key', apiKey);
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  try {
    const r = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    const bodyText = await r.text();
    let json = {};
    try {
      json = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return { ok: false, items: [], error: 'Invalid JSON from YouTube API', nextPageToken: null };
    }

    if ((r.status === 429 || r.status === 503) && !isRetry) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return fetchYoutubePlaylistItemsPage(apiKey, playlistId, pageToken, true);
    }

    if (!r.ok) {
      const msg = json?.error?.message || r.statusText || String(r.status);
      return { ok: false, items: [], error: msg, nextPageToken: null, status: r.status };
    }

    return {
      ok: true,
      items: Array.isArray(json.items) ? json.items : [],
      nextPageToken: json.nextPageToken || null,
    };
  } catch (e) {
    return { ok: false, items: [], error: e.message || 'network error', nextPageToken: null };
  }
}

async function fetchYoutubeChannelSnippetTitleOnly(apiKey, channelId) {
  try {
    const apiUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
    apiUrl.searchParams.set('part', 'snippet');
    apiUrl.searchParams.set('id', channelId);
    apiUrl.searchParams.set('key', apiKey);
    const r = await fetch(apiUrl.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const bodyText = await r.text();
    let json = {};
    try {
      json = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return null;
    }
    if (!r.ok) return null;
    const t = json.items?.[0]?.snippet?.title;
    return typeof t === 'string' ? t : null;
  } catch {
    return null;
  }
}

function buildYoutubePlaylistItemAtomEntry(it, defaultChannelTitle) {
  const vid = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
  if (!vid || typeof vid !== 'string') return '';
  const sn = it.snippet || {};
  const title = sn.title || '';
  const desc = sn.description || '';
  const published = sn.publishedAt || '';
  const thumb =
    sn.thumbnails?.high?.url ||
    sn.thumbnails?.medium?.url ||
    sn.thumbnails?.default?.url ||
    '';
  const authorName = sn.channelTitle || defaultChannelTitle || 'YouTube';
  const watchUrl = `https://www.youtube.com/watch?v=${vid}`;

  const thumbLine = thumb
    ? `      <media:thumbnail url="${escapeXmlText(thumb)}" width="480" height="360"/>\n`
    : '';

  return (
    `  <entry>\n` +
    `    <id>yt:video:${escapeXmlText(vid)}</id>\n` +
    `    <yt:videoId>${escapeXmlText(vid)}</yt:videoId>\n` +
    `    <title>${escapeXmlText(title)}</title>\n` +
    `    <link rel="alternate" href="${escapeXmlText(watchUrl)}"/>\n` +
    `    <author><name>${escapeXmlText(authorName)}</name></author>\n` +
    `    <published>${escapeXmlText(published)}</published>\n` +
    `    <updated>${escapeXmlText(published)}</updated>\n` +
    `    <media:group>\n` +
    thumbLine +
    `      <media:description>${escapeXmlText(desc)}</media:description>\n` +
    `    </media:group>\n` +
    `    <content type="text">${escapeXmlText(desc)}</content>\n` +
    `  </entry>\n`
  );
}

/**
 * Official Data API playlistItems.list (1 unit/page) → Atom XML compatible with the web/app RSS parser.
 * Avoids flaky youtube.com/feeds/videos.xml when YOUTUBE_DATA_API_KEY is set.
 */
async function buildYoutubeAtomFeedXmlFromPlaylistItems(channelId) {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) return null;

  const cid = String(channelId || '').trim();
  if (!/^UC[a-zA-Z0-9_-]{10,}$/i.test(cid)) return null;

  const uploadsPlaylistId = `UU${cid.slice(2)}`;
  const now = Date.now();
  const cached = youtubePlaylistItemsFeedXmlCache.get(uploadsPlaylistId);
  if (cached && cached.expiresAt > now) {
    return cached.xml;
  }

  let allItems = [];
  let pageToken = null;
  let gotSuccessfulPage = false;
  let lastError = null;

  for (let page = 0; page < 2; page++) {
    const batch = await fetchYoutubePlaylistItemsPage(apiKey, uploadsPlaylistId, pageToken);
    if (!batch.ok) {
      lastError = batch.error;
      break;
    }
    gotSuccessfulPage = true;
    allItems = allItems.concat(batch.items);
    pageToken = batch.nextPageToken;
    if (!pageToken) break;
  }

  if (!gotSuccessfulPage) {
    console.warn(
      `[YouTube Data API] playlistItems failed for ${uploadsPlaylistId}: ${lastError || 'unknown'}`
    );
    return null;
  }

  let channelTitle =
    allItems[0]?.snippet?.channelTitle ||
    (await fetchYoutubeChannelSnippetTitleOnly(apiKey, cid)) ||
    'YouTube';

  let entriesXml = '';
  for (const it of allItems) {
    entriesXml += buildYoutubePlaylistItemAtomEntry(it, channelTitle);
  }

  const selfHref = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(cid)}`;
  const feedUpdated = allItems[0]?.snippet?.publishedAt || new Date().toISOString();

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:yt="http://www.youtube.com/xml/schemas/v/2015">\n` +
    `  <title>${escapeXmlText(channelTitle)}</title>\n` +
    `  <link rel="self" href="${escapeXmlText(selfHref)}"/>\n` +
    `  <updated>${escapeXmlText(feedUpdated)}</updated>\n` +
    entriesXml +
    `</feed>\n`;

  youtubePlaylistItemsFeedXmlCache.set(uploadsPlaylistId, {
    xml,
    expiresAt: now + YOUTUBE_PLAYLIST_ITEMS_FEED_XML_TTL_MS,
  });

  console.log(
    `[RSS Proxy] YouTube Atom synthesized via playlistItems channel=${cid.slice(0, 12)}… items=${allItems.length}`
  );
  return xml;
}

// RSS Feed Proxy Endpoint
// Apply rate limiting to prevent abuse while allowing legitimate parallel fetching
app.get('/api/proxy/rss', apiLimiter, async (req, res) => {
  const clientIp = getClientIp(req);
  const batchId = parseRssBatchQueryParam(req);
  const feedUrl = normalizeYoutubeVideosFeedUrlToChannelForm(req.query.url);

  if (!feedUrl) {
    const body = { error: 'Missing url parameter' };
    if (batchId) recordRssBatchTransfer(batchId, clientIp, jsonUtf8ByteLength(body));
    return res.status(400).json(body);
  }

  // SSRF Protection: Validate URL
  const validation = validateFeedUrl(feedUrl);
  if (!validation.valid) {
    const body = { error: validation.error };
    if (batchId) recordRssBatchTransfer(batchId, clientIp, jsonUtf8ByteLength(body));
    return res.status(400).json(body);
  }

  const feedUrlObj = new URL(feedUrl);
  const resolvedOk = await assertSafeFetchTarget(feedUrlObj);
  if (!resolvedOk.ok) {
    const body = { error: resolvedOk.error };
    if (batchId) recordRssBatchTransfer(batchId, clientIp, jsonUtf8ByteLength(body));
    return res.status(400).json(body);
  }

  let resolvedFeedUrl = feedUrl;
  if (isYoutubeHost(feedUrlObj.hostname)) {
    const yt = await resolveYoutubeInputToFeedUrl(feedUrl);
    if (yt.feedUrl) {
      resolvedFeedUrl = yt.feedUrl;
      const v2 = validateFeedUrl(resolvedFeedUrl);
      if (!v2.valid) {
        const body = { error: v2.error };
        if (batchId) recordRssBatchTransfer(batchId, clientIp, jsonUtf8ByteLength(body));
        return res.status(400).json(body);
      }
      if (resolvedFeedUrl !== feedUrl) {
        console.log(`[RSS Proxy] Resolved YouTube → ${resolvedFeedUrl}`);
      }
    }
  }

  try {
    const forwardUa = req.get('user-agent') || '';

    let text = null;
    let contentType = 'application/atom+xml';

    const ytCh = extractYoutubeChannelIdFromFeedsVideosUrl(resolvedFeedUrl);
    if (ytCh && process.env.YOUTUBE_DATA_API_KEY?.trim()) {
      text = await buildYoutubeAtomFeedXmlFromPlaylistItems(ytCh);
    }

    if (!text) {
      const got = await fetchWithRetry(resolvedFeedUrl, 2, {
        clientUserAgent: forwardUa,
      });
      text = got.text;
      contentType = got.contentType || 'application/xml';
    }

    // Ensure UTF-8 encoding is specified in Content-Type
    // This is critical for proper character encoding (especially for non-ASCII characters like Portuguese)
    let finalContentType = contentType || 'application/xml';
    if (!finalContentType.includes('charset=')) {
      finalContentType += '; charset=utf-8';
    } else if (!finalContentType.includes('charset=utf-8') && !finalContentType.includes('charset=UTF-8')) {
      // Replace any existing charset with UTF-8 to ensure consistency
      finalContentType = finalContentType.replace(/charset=[^;]+/i, 'charset=utf-8');
    }

    const bodyBuf = Buffer.from(text, 'utf8');
    if (batchId) {
      recordRssBatchTransfer(batchId, clientIp, bodyBuf.length);
    }

    // Return the feed with appropriate content type and UTF-8 encoding
    res.setHeader('Content-Type', finalContentType);
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.send(bodyBuf);
  } catch (error) {
    const statusCode = error.message.includes('HTTP 403')
      ? 403
      : error.message.includes('HTTP 404')
        ? 404
        : error.message.includes('timeout')
          ? 504
          : 500;

    console.error(
      `[RSS Proxy] Error fetching feed ${resolvedFeedUrl}${resolvedFeedUrl !== feedUrl ? ` (from ${feedUrl})` : ''}: ${error.message}`
    );

    if (statusCode === 504) {
      const body = { error: 'Request timeout' };
      if (batchId) recordRssBatchTransfer(batchId, clientIp, jsonUtf8ByteLength(body));
      return res.status(504).json(body);
    }

    const body = {
      error: `Failed to fetch feed: ${error.message}`,
      url: resolvedFeedUrl !== feedUrl ? resolvedFeedUrl : feedUrl,
    };
    if (batchId) recordRssBatchTransfer(batchId, clientIp, jsonUtf8ByteLength(body));
    res.status(statusCode).json(body);
  }
});

// End-of-batch hook: client calls this after a full multi-fetch refresh so we log one summary line.
app.post('/api/proxy/batch-complete', apiLimiter, (req, res) => {
  const clientIp = getClientIp(req);
  const id = req.body?.batchId;
  if (!isValidRssBatchId(id)) {
    console.warn(
      `[RSS Proxy] batch-complete rejected client=${clientIp} reason=invalid_batchId body=${typeof id === 'string' ? id.slice(0, 36) : String(id)}`
    );
    return res.status(400).json({ ok: false, error: 'Invalid batchId' });
  }
  const entry = rssBatchStats.get(id);
  rssBatchStats.delete(id);
  if (!entry) {
    console.log(
      `${logTimestampUTC()} - [RSS Proxy] Batch complete client=${clientIp} batch=${id} requests=0 transferred=0 B (no recorded /api/proxy/rss responses for this batch)`
    );
    return res.json({ ok: true });
  }
  const bytesStr = entry.bytes.toLocaleString('en-US');
  const human = formatTransferredHumanReadable(entry.bytes);
  console.log(
    `${logTimestampUTC()} - [RSS Proxy] Batch complete client=${entry.ip} batch=${id} requests=${entry.requests} transferred=${human} (${bytesStr} bytes)`
  );
  res.json({ ok: true });
});

/**
 * YouTube Data API v3 channel search (server-side key). Mobile app calls this so the key is not in the client binary.
 * Also used to resolve official uploads playlist Atom URLs (more reliable than channel_id= alone).
 * Not tamper-proof: anyone who can call your API can use it — use rate limits + optional ACTUFEED_PROXY_CLIENT_KEYS.
 */
app.get('/api/youtube/channel-search', apiLimiter, async (req, res) => {
  const clientIp = getClientIp(req);
  const qForLog =
    typeof req.query.q === 'string'
      ? req.query.q.trim().slice(0, 120)
      : req.query.q != null
        ? String(req.query.q).slice(0, 120)
        : '';
  const refHead = (req.headers.referer || '').slice(0, 160).replace(/\s+/g, ' ');
  console.log(
    `[YouTube channel-search] request client=${clientIp} origin=${req.headers.origin || '(none)'} referer=${refHead || '(none)'} q=${JSON.stringify(qForLog)}`
  );

  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      `[YouTube channel-search] client=${clientIp} error=503 YOUTUBE_DATA_API_KEY missing (channel search disabled)`
    );
    return res.status(503).json({
      error: 'YouTube channel search is not configured',
      code: 'YOUTUBE_SEARCH_DISABLED',
    });
  }

  const rawQ = req.query.q;
  if (!rawQ || typeof rawQ !== 'string') {
    console.error(`[YouTube channel-search] client=${clientIp} error=400 missing_or_invalid_q`);
    return res.status(400).json({ error: 'Missing q parameter' });
  }
  const q = rawQ.trim().slice(0, 200);
  if (q.length < 2) {
    console.error(`[YouTube channel-search] client=${clientIp} error=400 query_too_short len=${q.length}`);
    return res.status(400).json({ error: 'Query too short' });
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'channel');
  url.searchParams.set('maxResults', '15');
  url.searchParams.set('q', q);
  url.searchParams.set('key', apiKey);

  try {
    const r = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    const bodyText = await r.text();
    const trimmed = bodyText.trim();
    let json = {};
    if (trimmed) {
      try {
        json = JSON.parse(trimmed);
      } catch (parseErr) {
        const snip = trimmed.slice(0, 400).replace(/\s+/g, ' ');
        console.error(
          `[YouTube channel-search] client=${clientIp} error=502 YouTube response not JSON http=${r.status} parse=${parseErr.message} body_snip=${snip}${trimmed.length > 400 ? '…' : ''}`
        );
        return res.status(502).json({ error: 'YouTube API returned non-JSON' });
      }
    }
    if (!r.ok) {
      const msg = json?.error?.message || `YouTube API HTTP ${r.status}`;
      console.error(
        `[YouTube channel-search] client=${clientIp} error=502 upstream_http=${r.status} message=${msg}`
      );
      return res.status(502).json({ error: msg });
    }
    if (json.error && !Array.isArray(json.items)) {
      const msg = json.error.message || 'YouTube API returned an error object';
      console.error(`[YouTube channel-search] client=${clientIp} error=502 youtube_error_object message=${msg}`);
      return res.status(502).json({ error: msg });
    }
    const rawItems = Array.isArray(json.items) ? json.items : [];
    if (rawItems.length === 0) {
      const totalResults =
        json.pageInfo != null && typeof json.pageInfo.totalResults === 'number'
          ? json.pageInfo.totalResults
          : null;
      console.warn(
        `[YouTube channel-search] client=${clientIp} q=${JSON.stringify(q)} rows=0 pageInfo.totalResults=${String(totalResults)}`
      );
      if (totalResults != null && totalResults > 0) {
        console.error(
          `[YouTube channel-search] client=${clientIp} error=502 youtube_totalResults_gt_0_but_no_items totalResults=${totalResults}`
        );
        return res.status(502).json({
          error:
            'YouTube reported matches but returned no rows. Check API key restrictions and that YouTube Data API v3 is enabled for this key.',
        });
      }
      res.setHeader('Cache-Control', 'private, max-age=120');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      console.log(`[YouTube channel-search] client=${clientIp} ok items=0 (empty result set)`);
      return res.json({ items: [] });
    }
    const items = [];
    for (const it of rawItems) {
      const idObj = it?.id;
      const sn = it.snippet || {};
      const fromId =
        typeof idObj === 'object' && idObj !== null && idObj.channelId != null
          ? String(idObj.channelId).trim()
          : '';
      const fromSn =
        typeof sn.channelId === 'string' ? sn.channelId.trim() : '';
      const channelId = fromId || fromSn || null;
      if (!channelId) continue;
      const thumbs = sn.thumbnails || {};
      items.push({
        channelId,
        title: (sn.title && String(sn.title).trim()) || channelId,
        description: (sn.description && String(sn.description).trim()) || '',
        thumbnailUrl: thumbs.medium?.url || thumbs.default?.url || null,
      });
    }
    if (rawItems.length > 0 && items.length === 0) {
      const sample = JSON.stringify(rawItems[0]).slice(0, 500);
      console.error(
        `[YouTube channel-search] client=${clientIp} error=502 no_usable_channel_id rawRows=${rawItems.length} sample=${sample}`
      );
      return res.status(502).json({
        error:
          'YouTube returned search results in an unexpected format (no channel id). Check server logs or update the parser.',
      });
    }
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    console.log(`[YouTube channel-search] client=${clientIp} ok items=${items.length} rawRows=${rawItems.length}`);
    return res.json({ items });
  } catch (e) {
    console.error(
      `[YouTube channel-search] client=${clientIp} error=502 exception name=${e?.name || '?'} message=${e?.message || e}`
    );
    return res.status(502).json({ error: 'YouTube search request failed' });
  }
});

// YouTube: resolve channel URL → Atom feed + metadata (manual add / validation)
app.get('/api/youtube/resolve', apiLimiter, async (req, res) => {
  const inputUrl = req.query.url;
  if (!inputUrl) {
    return res.status(400).json({ valid: false, errors: ['Missing url parameter'] });
  }

  const validation = validateFeedUrl(inputUrl);
  if (!validation.valid) {
    return res.status(400).json({ valid: false, errors: [validation.error] });
  }

  let u;
  try {
    u = new URL(inputUrl);
  } catch {
    return res.status(400).json({ valid: false, errors: ['Invalid URL format'] });
  }

  if (u.protocol !== 'https:') {
    return res.status(400).json({
      valid: false,
      errors: ['Only https:// YouTube URLs are supported.'],
    });
  }

  if (!isYoutubeHost(u.hostname)) {
    return res.status(400).json({
      valid: false,
      errors: [
        'Only youtube.com channel URLs are supported (e.g. https://www.youtube.com/@handle or /channel/UC…).',
      ],
    });
  }

  const resolvedOk = await assertSafeFetchTarget(u);
  if (!resolvedOk.ok) {
    return res.status(400).json({ valid: false, errors: [resolvedOk.error] });
  }

  console.log(`[YouTube Resolve API] input=${inputUrl}`);

  const yt = await resolveYoutubeInputToFeedUrl(inputUrl);
  if (!yt.feedUrl || yt.error) {
    console.warn(`[YouTube Resolve API] resolve failed: ${yt.error || 'no feedUrl'}`);
    return res.status(400).json({
      valid: false,
      errors: [yt.error || 'Could not resolve YouTube channel'],
      channelPageUrl: yt.channelPageUrl || null,
    });
  }

  const dApi = yt.dataApiChannel;
  if (dApi?.title) {
    const itemCount = Number.isFinite(dApi.videoCount) ? dApi.videoCount : 0;
    console.log(
      `[YouTube Resolve API] OK via Data API only (no Atom fetch) channel_id=${yt.channelId} title=${JSON.stringify(dApi.title).slice(0, 100)} videoCount=${dApi.videoCount ?? 'n/a'}`
    );
    return res.json({
      valid: true,
      resolvedFeedUrl: yt.feedUrl,
      channelId: yt.channelId,
      channelPageUrl: yt.channelPageUrl,
      inputUrl,
      feedFormat: 'atom',
      validatedViaYoutubeDataApi: true,
      channel: {
        title: dApi.title,
        description: dApi.description || '',
        link: yt.channelPageUrl || yt.feedUrl,
        language: dApi.defaultLanguage || 'en',
        itemCount,
        imageUrl: (dApi.thumbnailUrl || '').trim(),
      },
      errors: [],
      warnings: [],
    });
  }

  let text;
  try {
    const forwardUa = req.get('user-agent') || '';
    const got = await fetchWithRetry(yt.feedUrl, 2, {
      minimalCompleteXml: true,
      clientUserAgent: forwardUa,
    });
    text = got.text;
  } catch (e) {
    console.error(`[YouTube Resolve API] Atom feed fetch failed: ${e.message}`);
    const msg = String(e.message || '');
    const errors = [`Resolved feed URL but could not load it: ${msg}`];
    // YouTube often returns 404 for feeds/videos.xml even when /channel/UC… still exists — upstream policy, not Actufeed.
    if (/\b404\b/.test(msg)) {
      errors.push(
        'YouTube returned 404 for the public Atom feed. Some channels no longer expose feeds/videos.xml, or the channel ID no longer has a public upload feed on YouTube’s side. Try another channel or confirm the channel still publishes videos.'
      );
    }
    // 422 = we understood the URL but the feed document is unavailable (vs 502 = proxy/API down).
    return res.status(422).json({
      valid: false,
      errors,
      resolvedFeedUrl: yt.feedUrl,
      channelId: yt.channelId,
    });
  }

  let browseHtml = yt.browseHtml;
  if (!browseHtml && yt.channelPageUrl) {
    try {
      browseHtml = await fetchHtmlSnippetBounded(yt.channelPageUrl, MAX_HTML_LOGO_SNIPPET_BYTES, true);
      console.log(
        `[YouTube Resolve API] fetched channel page for OG (${browseHtml.length} chars)`
      );
    } catch (e) {
      console.warn('[YouTube Resolve API] optional OG page fetch failed:', e.message);
    }
  }

  const meta = parseYoutubeAtomFeedMeta(text);
  const og = browseHtml ? extractOgFromHtml(browseHtml) : { title: '', description: '', image: '' };

  const channelTitle = meta.title || og.title || 'YouTube channel';
  const channelDescription = og.description || '';
  const imageUrl = (og.image || '').trim();

  console.log(
    `[YouTube Resolve API] OK channel_id=${yt.channelId} entries=${meta.entryCount} title=${JSON.stringify(channelTitle).slice(0, 100)}`
  );

  const warnings = [];
  if (meta.entryCount === 0) warnings.push('Feed has no video entries yet');

  res.json({
    valid: true,
    resolvedFeedUrl: yt.feedUrl,
    channelId: yt.channelId,
    channelPageUrl: yt.channelPageUrl,
    inputUrl,
    feedFormat: 'atom',
    channel: {
      title: channelTitle,
      description: channelDescription,
      link: meta.link || yt.channelPageUrl || yt.feedUrl,
      language: 'en',
      itemCount: meta.entryCount,
      imageUrl,
    },
    errors: [],
    warnings,
  });
});

// HTML snippet proxy (homepage / marketing page) — logo discovery only
app.get('/api/proxy/html', apiLimiter, async (req, res) => {
  const pageUrl = req.query.url;

  if (!pageUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const validation = validateFeedUrl(pageUrl);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  let pageUrlObj;
  try {
    pageUrlObj = new URL(pageUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const resolvedOk = await assertSafeFetchTarget(pageUrlObj);
  if (!resolvedOk.ok) {
    return res.status(400).json({ error: resolvedOk.error });
  }

  try {
    const html = await fetchHtmlSnippetForLogo(pageUrl);
    const trimmed = html.trim();
    const looksLikeHtml =
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<!--') ||
      /<html[\s>]/i.test(trimmed.slice(0, 5000));

    if (!looksLikeHtml) {
      return res.status(400).json({ error: 'Response does not appear to be HTML' });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(html, 'utf8'));
  } catch (error) {
    const statusCode = error.name === 'AbortError' ? 504 : 500;
    const detail = describeFetchFailure(error);
    console.warn(
      `[HTML Proxy] No homepage HTML for logo discovery (non-fatal; favicon/other fallbacks apply) — ${pageUrl} — ${detail}`
    );
    if (statusCode === 504) {
      return res.status(504).json({ error: 'Request timeout' });
    }
    res.status(statusCode).json({
      error: `Failed to fetch page: ${error.message}`,
      url: pageUrl,
    });
  }
});

// Article text extraction (Mozilla Readability) — same trust model as /api/proxy/html
app.get('/api/article/extract', apiLimiter, async (req, res) => {
  const pageUrl = req.query.url;

  if (!pageUrl) {
    return res.status(400).json({ ok: false, error: 'Missing url parameter' });
  }

  const validation = validateFeedUrl(pageUrl);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: validation.error });
  }

  let pageUrlObj;
  try {
    pageUrlObj = new URL(pageUrl);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid URL format' });
  }

  const resolvedOk = await assertSafeFetchTarget(pageUrlObj);
  if (!resolvedOk.ok) {
    return res.status(400).json({ ok: false, error: resolvedOk.error });
  }

  try {
    const result = await extractArticleWithCache(pageUrl);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json(result);
  } catch (error) {
    const statusCode = error.name === 'AbortError' ? 504 : 500;
    const detail = describeFetchFailure(error);
    console.warn(`[Article extract] ${pageUrl} — ${detail}`);
    if (statusCode === 504) {
      return res.status(504).json({ ok: false, error: 'Request timeout' });
    }
    res.status(500).json({ ok: false, error: 'Extraction failed' });
  }
});

/** Detect image format from first bytes (favicon.ico often has wrong Content-Type). */
function looksLikeImageMagic(buf) {
  if (!buf || buf.length < 4) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0 && buf[1] === 0 && (buf[2] === 1 || buf[2] === 2) && buf[3] === 0) return true;
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) return true;
  return false;
}

// Lightweight image URL check for favicon / logo discovery (HEAD then ranged GET)
app.get('/api/proxy/asset/check', apiLimiter, async (req, res) => {
  const assetUrl = req.query.url;

  if (!assetUrl) {
    return res.status(400).json({ ok: false, error: 'Missing url parameter' });
  }

  const validation = validateFeedUrl(assetUrl);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: validation.error });
  }

  let urlObj;
  try {
    urlObj = new URL(assetUrl);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid URL format' });
  }

  const resolvedOk = await assertSafeFetchTarget(urlObj);
  if (!resolvedOk.ok) {
    return res.status(400).json({ ok: false, error: resolvedOk.error });
  }

  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const probe = async (method) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(assetUrl, {
        method,
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: 'image/*,*/*;q=0.5',
          ...(method === 'GET' ? { Range: 'bytes=0-2047' } : {}),
        },
        redirect: 'follow',
      });

      if (!response.ok) return false;

      const ct = (response.headers.get('content-type') || '').toLowerCase();
      const looksImageType =
        ct.includes('image/') ||
        ct.includes('x-icon') ||
        ct.includes('microsoft.icon');

      if (method === 'HEAD') {
        return looksImageType;
      }

      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length === 0) return false;
      if (looksImageType) return true;
      return looksLikeImageMagic(buf);
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    let ok = await probe('HEAD');
    if (!ok) ok = await probe('GET');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.json({ ok });
  } catch {
    return res.json({ ok: false });
  }
});

// Wikimedia Commons — logo lookup by outlet name (follows https://meta.wikimedia.org/wiki/User-Agent_policy)
const WIKIMEDIA_USER_AGENT =
  'Actufeed/1.0 (news aggregator; +https://github.com/drenlia/actufeed)';

const validateSourceNameForWikimedia = (s) => {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < 2 || t.length > 120) return false;
  if (/[\r\n<>{}]/.test(t)) return false;
  return true;
};

async function wikimediaCommonsApi(searchParamsObj) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries(searchParamsObj)) {
    u.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  const response = await fetch(u.toString(), {
    signal: controller.signal,
    headers: {
      'User-Agent': WIKIMEDIA_USER_AGENT,
      Accept: 'application/json',
    },
  });
  clearTimeout(timeoutId);
  if (!response.ok) {
    throw new Error(`Commons API HTTP ${response.status}`);
  }
  return response.json();
}

function scoreCommonsFileTitle(fileTitle, sourceName) {
  const t = fileTitle.toLowerCase();
  let score = 0;
  if (/logo/i.test(t)) score += 28;
  if (t.includes('.svg')) score += 14;
  else if (/\.png/i.test(t)) score += 9;
  else if (/\.webp/i.test(t)) score += 7;
  // Deprioritize unrelated Commons files
  if (
    /flag of|map of|coat of arms|emblem of|seal of|locator map|icon-|favicon|button|arrow/i.test(
      t
    )
  ) {
    score -= 45;
  }
  const words = sourceName
    .toLowerCase()
    .split(/[^a-z0-9àâäéèêëïîôùûüçœæ]+/i)
    .filter((w) => w.length > 2 && w !== 'the' && w !== 'les' && w !== 'des');
  for (const w of words) {
    if (t.includes(w)) score += 7;
  }
  return score;
}

async function commonsDirectFileUrl(fileTitle) {
  const data = await wikimediaCommonsApi({
    action: 'query',
    titles: fileTitle,
    prop: 'imageinfo',
    iiprop: 'url',
    format: 'json',
  });
  const pages = data.query?.pages;
  if (!pages) return '';
  const page = Object.values(pages)[0];
  if (!page || page.missing) return '';
  const url = page.imageinfo?.[0]?.url;
  if (typeof url === 'string' && url.startsWith('https://upload.wikimedia.org/')) {
    return url;
  }
  return '';
}

app.get('/api/wikimedia/logo', apiLimiter, async (req, res) => {
  const source = req.query.source;
  if (!source || typeof source !== 'string') {
    return res.status(400).json({ error: 'Missing source parameter', url: null });
  }
  const trimmed = source.trim();
  if (!validateSourceNameForWikimedia(trimmed)) {
    return res.status(400).json({ error: 'Invalid source name', url: null });
  }

  try {
    const data = await wikimediaCommonsApi({
      action: 'query',
      list: 'search',
      srsearch: `${trimmed} logo`,
      srnamespace: 6,
      srlimit: 20,
      format: 'json',
    });

    const hits = data.query?.search || [];
    let bestTitle = '';
    let bestScore = -Infinity;

    for (const hit of hits) {
      const title = hit.title;
      if (!title || !title.startsWith('File:')) continue;
      const sc = scoreCommonsFileTitle(title, trimmed);
      if (sc > bestScore) {
        bestScore = sc;
        bestTitle = title;
      }
    }

    const MIN_SCORE = 20;
    if (!bestTitle || bestScore < MIN_SCORE) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.json({ url: null });
    }

    const url = await commonsDirectFileUrl(bestTitle);
    if (!url) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.json({ url: null });
    }

    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.json({ url });
  } catch (error) {
    console.error(`[Wikimedia] Logo lookup failed for "${trimmed}":`, error.message);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(500).json({ error: error.message || 'Commons lookup failed', url: null });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'rss-proxy' });
});

// Serve static files from Vite build (in production only)
// In development, Vite dev server handles static files
if (process.env.NODE_ENV === 'production') {
  // Disable caching for index.html to ensure fresh JavaScript bundles
  app.use(express.static(join(__dirname, 'dist'), {
    maxAge: '1y', // Cache static assets for 1 year
    etag: true,
    lastModified: true
  }));
  
  // Fallback to index.html for SPA routing (no cache for HTML)
  app.get('*', (req, res) => {
    // Don't cache index.html to ensure users get the latest version
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
}

// Create HTTP server
const server = createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[RSS Proxy] Server running on port ${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`[RSS Proxy] Serving static files from dist/`);
  } else {
    console.log(`[RSS Proxy] Development mode - Vite dev server handles static files`);
  }
});
