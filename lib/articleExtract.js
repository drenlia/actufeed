/**
 * Server-side article text extraction (Mozilla Readability) + paywall heuristics + in-memory cache.
 */
import crypto from 'node:crypto';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import {
  fetchHtmlSnippetBounded,
  MAX_HTML_ARTICLE_BYTES,
} from './fetchHtmlBounded.js';

const PURIFY_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'span',
  'figure',
  'figcaption',
  'cite',
  'code',
  'pre',
];

const CACHE_MAX_ENTRIES = 250;
const CACHE_TTL_OK_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_FAIL_MS = 5 * 60 * 1000;

/** @type {Map<string, { expiresAt: number; payload: object }>} */
const extractCache = new Map();

function cacheKey(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of extractCache) {
    if (v.expiresAt <= now) extractCache.delete(k);
  }
  while (extractCache.size > CACHE_MAX_ENTRIES) {
    const first = extractCache.keys().next().value;
    if (first === undefined) break;
    extractCache.delete(first);
  }
}

/**
 * Best-effort paywall / subscription gate detection (HTML + extracted length).
 * False positives/negatives are expected; UI explains users may need the original page.
 */
export function detectPaywallLikely(rawHtml, extractedText, extractedTitle) {
  const h = (rawHtml || '').toLowerCase();
  const t = (extractedText || '').trim();
  const title = (extractedTitle || '').toLowerCase();

  const needlePatterns = [
    'subscribe to read',
    'subscriber exclusive',
    'subscriber-only',
    'subscription required',
    'subscribers only',
    'this article is for subscribers',
    'become a subscriber',
    'you have reached your',
    'free article limit',
    'articles remaining',
    'paywall',
    'subscribe to continue',
    'already a subscriber',
    'sign in to read',
    'connexion pour lire',
    'abonnement requis',
    'réservé aux abonnés',
    'réservée aux abonnés',
  ];
  if (needlePatterns.some((p) => h.includes(p))) return true;

  const head = h.slice(0, 120000);
  if (
    t.length > 0 &&
    t.length < 420 &&
    /subscribe|sign in|log in|membership|paywall|abonnement|connexion/i.test(head)
  ) {
    return true;
  }

  if (
    t.length > 0 &&
    t.length < 280 &&
    /subscriber|subscription|paywall|abonnement/i.test(title)
  ) {
    return true;
  }

  return false;
}

function plainTextFromSanitizedHtml(htmlFragment, pageUrl) {
  const wrap = new JSDOM(`<div id="root">${htmlFragment}</div>`, { url: pageUrl });
  const el = wrap.window.document.getElementById('root');
  return (el?.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+\n/g, '\n').trim();
}

/**
 * Many news templates append recirc / promo blocks into the article body. Readability often
 * keeps them; we cut from the first line that looks like a section heading for those modules.
 * Heuristic — not site-specific parsers.
 */
const RECIRC_LINE_START = [
  /^Editor'?s picks?\b/i,
  /^Videos you may enjoy\b/i,
  /^You may also like\b/i,
  /^Related stories?\b/i,
  /^More from\b/i,
  /^Recommended for you\b/i,
  /^Trending now\b/i,
  /^Continue reading\b/i,
  /^À lire aussi\b/i,
  /^Sur le même sujet\b/i,
  /^Vidéos (que vous aimerez|à voir)\b/i,
];

export function stripRecircTailFromText(text) {
  if (!text || typeof text !== 'string') return '';
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    for (const re of RECIRC_LINE_START) {
      if (re.test(line)) {
        return lines.slice(0, i).join('\n').trim();
      }
    }
  }
  return text.trim();
}

/** Append http(s) URLs from <a href> so the client can show tappable links (plain text loses anchors). */
function appendMissingAnchorUrls(html, baseUrl, text, max = 10) {
  if (!html || !text) return text;
  let dom;
  try {
    dom = new JSDOM(html, { url: baseUrl });
  } catch {
    return text;
  }
  const doc = dom.window.document;
  const added = [];
  const seen = new Set();
  for (const a of doc.querySelectorAll('a[href]')) {
    if (added.length >= max) break;
    let href = a.getAttribute('href');
    if (!href) continue;
    try {
      href = new URL(href, baseUrl).href.split('#')[0];
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    if (text.includes(href)) continue;
    added.push(href);
  }
  if (added.length === 0) return text;
  return `${text}\n\n${added.join('\n\n')}`;
}

/**
 * @param {string} pageUrl
 * @returns {Promise<{ ok: boolean, title?: string, text?: string, byline?: string, paywallLikely?: boolean, error?: string }>}
 */
export async function extractArticleFromUrl(pageUrl) {
  let html;
  try {
    html = await fetchHtmlSnippetBounded(
      pageUrl,
      MAX_HTML_ARTICLE_BYTES,
      true,
      20000
    );
  } catch {
    return { ok: false, error: 'Could not fetch article page' };
  }

  const trimmed = html.trim();
  const looksLikeHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<!--') ||
    /<html[\s>]/i.test(trimmed.slice(0, 5000));

  if (!looksLikeHtml) {
    return { ok: false, error: 'Response does not appear to be HTML' };
  }

  let article;
  try {
    const dom = new JSDOM(html, { url: pageUrl });
    const reader = new Readability(dom.window.document);
    article = reader.parse();
  } catch {
    return { ok: false, error: 'Could not extract readable article content' };
  }

  if (!article || !article.content) {
    return { ok: false, error: 'Could not extract readable article content' };
  }

  let cleanHtml;
  let text;
  try {
    const purifyWindow = new JSDOM('').window;
    const DOMPurify = createDOMPurify(purifyWindow);
    cleanHtml = DOMPurify.sanitize(article.content, {
      ALLOWED_TAGS: PURIFY_ALLOWED_TAGS,
      ALLOWED_ATTR: ['href', 'title', 'rel', 'src', 'alt', 'loading'],
    });
    text = plainTextFromSanitizedHtml(cleanHtml, pageUrl);
    text = stripRecircTailFromText(text);
    text = appendMissingAnchorUrls(cleanHtml, pageUrl, text);
  } catch {
    return { ok: false, error: 'Could not sanitize extracted content' };
  }

  if (!text || text.length < 40) {
    return { ok: false, error: 'Extracted content was too short' };
  }

  const title = (article.title || '').trim();
  const byline = (article.byline || '').trim();
  const paywallLikely = detectPaywallLikely(html, text, title);

  return {
    ok: true,
    title: title || undefined,
    byline: byline || undefined,
    text,
    paywallLikely,
  };
}

/**
 * @param {string} pageUrl
 * @returns {Promise<object>}
 */
export async function extractArticleWithCache(pageUrl) {
  pruneCache();
  const k = cacheKey(pageUrl);
  const now = Date.now();
  const hit = extractCache.get(k);
  if (hit && hit.expiresAt > now) {
    return { ...hit.payload, cached: true };
  }

  let result;
  try {
    result = await extractArticleFromUrl(pageUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAbort = e instanceof Error && e.name === 'AbortError';
    result = {
      ok: false,
      error: isAbort ? 'Request timeout' : 'Extraction failed',
    };
    if (!isAbort) {
      console.warn(`[Article extract] ${pageUrl} — ${msg}`);
    }
  }

  const ttl = result.ok ? CACHE_TTL_OK_MS : CACHE_TTL_FAIL_MS;
  extractCache.set(k, { expiresAt: now + ttl, payload: result });
  pruneCache();

  return { ...result, cached: false };
}
