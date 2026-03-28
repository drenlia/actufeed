import DOMPurify from 'dompurify';

const escHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Common abbreviations so sentence-splitting does not break on “p.m.”, “Dr.”, etc. */
const ABBREV_FOR_SPLIT = /\b(?:[ap]\.m\.|e\.g\.|i\.e\.|etc\.|vs\.|Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Jr\.|Sr\.|St\.|Sept\.|Oct\.|Nov\.|Dec\.|Jan\.|Feb\.|Mar\.|Apr\.|Jun\.|Jul\.|Aug\.)\b/gi;

const PLACEHOLDER = '\uE000';

function protectAbbrevs(text) {
  const reps = [];
  const out = text.replace(ABBREV_FOR_SPLIT, (m) => {
    reps.push(m);
    return `${PLACEHOLDER}${reps.length - 1}${PLACEHOLDER}`;
  });
  return { out, reps };
}

function restoreAbbrevs(segment, reps) {
  return segment.replace(new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'), (_, i) => reps[Number(i)] ?? '');
}

/** Split a long plain block into sentences (after protecting abbreviations). */
function splitPlainIntoSentences(block) {
  const { out, reps } = protectAbbrevs(block);
  const parts = out
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ÿ«"“'(0-9])/u)
    .map((p) => restoreAbbrevs(p.trim(), reps))
    .filter(Boolean);
  return parts.length ? parts : [block];
}

/** Group sentences into ~targetLen character paragraphs for readability. */
function groupSentencesForReadability(sentences, targetLen = 420, minPara = 2) {
  if (sentences.length < minPara) return [sentences.join(' ')];
  const paras = [];
  let buf = [];
  let len = 0;
  for (const sent of sentences) {
    buf.push(sent);
    len += sent.length + 1;
    if (len >= targetLen && buf.length >= 2) {
      paras.push(buf.join(' '));
      buf = [];
      len = 0;
    }
  }
  if (buf.length) paras.push(buf.join(' '));
  return paras.length >= 2 ? paras : [sentences.join(' ')];
}

/** When one line has no \n breaks (common Postmedia single-<p> HTML), fake paragraph rhythm. */
function expandVeryLongPlainBlock(block) {
  const minChars = 420;
  if (block.length < minChars) return [block];
  const sents = splitPlainIntoSentences(block);
  if (sents.length < 3) return [block];
  return groupSentencesForReadability(sents);
}

/**
 * Turn feed plain text into <p> blocks before sanitization.
 * - Splits on any newline run (<br> and soft wraps from stripping become paragraph boundaries).
 * - Splits very long single blocks into sentence-grouped paragraphs (Gazette-style blobs).
 */
export const plainTextToArticleHtml = (plain) => {
  if (plain == null || typeof plain !== 'string') return '';
  const t = plain.trim();
  if (!t) return '';
  const blocks = t
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap(expandVeryLongPlainBlock);
  return blocks.map((para) => `<p>${escHtml(para).replace(/\n/g, '<br />')}</p>`).join('');
};

/**
 * Heuristic: RSS/cache sometimes still holds real HTML; plain text should not hit this.
 * Avoids false positives like "2 < 3" (requires a tag name after <).
 */
export const looksLikeRssMarkup = (s) => {
  if (!s || typeof s !== 'string') return false;
  return /<(p|br|div|span|a|img|strong|em|b|i|u|ol|ul|li|h[1-6]|blockquote|figure|table)\b/i.test(s);
};

/** Strip tags to a single plain line (collapsed teaser when description is HTML). */
export const htmlToPlainOneLine = (html) => {
  if (!html || typeof html !== 'string') return '';
  try {
    const cleaned = String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    const doc = new DOMParser().parseFromString(cleaned, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
};

/**
 * Sanitize HTML content from RSS feeds to prevent XSS attacks
 * Allows safe formatting tags while blocking dangerous content
 * 
 * @param {string} html - HTML content to sanitize
 * @returns {string} - Sanitized HTML safe for rendering
 */
export const sanitizeRssHtml = (html) => {
  if (!html) return '';
  
  // Remove all style-related content before sanitization to prevent browser
  // from trying to load external resources (CSS, SVG sprites, etc.)
  // This reduces (but may not completely eliminate) CORS errors when React renders the HTML
  html = html
    .replace(/<style[^>]*>.*?<\/style>/gi, '') // Remove style tags
    .replace(/\s+style\s*=\s*["'][^"']*["']/gi, '') // Remove style attributes with quotes
    .replace(/\s+style\s*=\s*[^>\s]+/gi, '') // Remove style attributes without quotes
    .replace(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi, '') // Remove stylesheet links
    .replace(/<link[^>]*type\s*=\s*["']text\/css["'][^>]*>/gi, '') // Remove CSS links
    .replace(/\s+class\s*=\s*["'][^"']*["']/gi, '') // Remove ALL class attributes (prevent sprite/icon references)
    .replace(/url\s*\(\s*[^)]*spritemap[^)]*\)/gi, '') // Remove CSS url() references to spritemap
    .replace(/url\s*\(\s*[^)]*\.svg[^)]*\)/gi, '') // Remove CSS url() references to SVG files
    .replace(/background[^:]*:\s*[^;]*url[^;]*;/gi, '') // Remove background-image CSS
    .replace(/background-image[^:]*:\s*[^;]*;/gi, '') // Remove background-image specifically
  
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'target', 'rel'], // No 'class' to prevent sprite/icon references
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    // Ensure links are safe (no javascript: URLs)
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    // Add rel="noopener noreferrer" to external links automatically
    ADD_ATTR: ['target'],
  });
};
