/**
 * Bounded HTML fetch for logo discovery, article extraction, and similar use cases.
 * Caller must validate URLs (e.g. validateFeedUrl + assertSafeFetchTarget) before calling.
 */
import { Buffer } from 'node:buffer';

/** Fetch start of HTML document for logo discovery (bounded size). */
export const MAX_HTML_LOGO_SNIPPET_BYTES = 450 * 1024;
/** @handle /c/ pages put canonical around ~600KB+; logo cap is too small for that path. */
export const MAX_HTML_YOUTUBE_RESOLVE_BYTES = 1024 * 1024;
/** Full article Readability: allow larger HTML (still capped for memory / abuse). */
export const MAX_HTML_ARTICLE_BYTES = 2 * 1024 * 1024;

/**
 * @param {string} pageUrl
 * @param {number} [maxBytes]
 * @param {boolean} [logBytes] Log downloaded size (always on when maxBytes exceeds logo snippet cap)
 * @param {number} [timeoutMs]
 */
export async function fetchHtmlSnippetBounded(
  pageUrl,
  maxBytes = MAX_HTML_LOGO_SNIPPET_BYTES,
  logBytes = false,
  timeoutMs = 10000
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

  const shouldLogHtml = logBytes || maxBytes > MAX_HTML_LOGO_SNIPPET_BYTES;

  if (!response.body) {
    const buf = Buffer.from(await response.arrayBuffer()).slice(0, maxBytes);
    if (shouldLogHtml) {
      console.log(
        `[Feed Fetch] HTML body ${buf.length} bytes (read cap ${maxBytes}, no stream) ← ${pageUrl}`
      );
    }
    return buf.toString('utf8');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) {
      chunks.push(Buffer.from(value));
      total += value.length;
    }
  }
  try {
    await reader.cancel();
  } catch {
    // ignore
  }

  const buf = Buffer.concat(chunks).slice(0, maxBytes);
  if (shouldLogHtml) {
    console.log(`[Feed Fetch] HTML body ${buf.length} bytes (read cap ${maxBytes}) ← ${pageUrl}`);
  }
  return buf.toString('utf8');
}
