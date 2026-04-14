import { useMemo } from 'react'

/** Server extract emits [label](https://...) for inline anchors. */
const MD_LINK_RE = /\[([^\]]+)]\((https?:\/\/[^)]+)\)/g

const URL_RE = /(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi

function normalizeUrlForOpen(raw) {
  const u = raw.replace(/[.,;:!?)\]}>]+$/g, '')
  const withScheme = u.startsWith('www.') ? `https://${u}` : u
  try {
    const parsed = new URL(withScheme)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return withScheme
  } catch {
    return null
  }
}

function splitIntoParagraphs(text) {
  const t = text.trim()
  if (!t) return []
  const double = t
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (double.length > 1) return double
  const single = t
    .split(/\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (single.length > 1) return single
  return [t]
}

function splitBareUrlsInFragment(fragment) {
  const parts = []
  let last = 0
  const re = new RegExp(URL_RE.source, URL_RE.flags)
  let m
  while ((m = re.exec(fragment)) !== null) {
    if (m.index > last) {
      parts.push({ kind: 'text', value: fragment.slice(last, m.index) })
    }
    parts.push({ kind: 'url', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < fragment.length) {
    parts.push({ kind: 'text', value: fragment.slice(last) })
  }
  return parts.length ? parts : [{ kind: 'text', value: fragment }]
}

function splitParagraphWithUrls(paragraph) {
  const parts = []
  let last = 0
  const mdRe = new RegExp(MD_LINK_RE.source, MD_LINK_RE.flags)
  let md
  while ((md = mdRe.exec(paragraph)) !== null) {
    if (md.index > last) {
      parts.push(...splitBareUrlsInFragment(paragraph.slice(last, md.index)))
    }
    parts.push({ kind: 'mdlink', label: md[1], href: md[2] })
    last = md.index + md[0].length
  }
  if (last < paragraph.length) {
    parts.push(...splitBareUrlsInFragment(paragraph.slice(last)))
  }
  return parts.length ? parts : [{ kind: 'text', value: paragraph }]
}

function Segment({ seg }) {
  if (seg.kind === 'text') {
    return <span>{seg.value}</span>
  }
  if (seg.kind === 'mdlink') {
    const href = normalizeUrlForOpen(seg.href)
    if (!href) return <span>{seg.label}</span>
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="article-extract-body__link"
      >
        {seg.label}
      </a>
    )
  }
  const href = normalizeUrlForOpen(seg.value)
  if (!href) return <span>{seg.value}</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="article-extract-body__link">
      {seg.value}
    </a>
  )
}

/**
 * Renders Readability extract `text`: paragraphs plus markdown links and bare URLs.
 */
export function ArticleExtractBody({ text }) {
  const paragraphs = useMemo(() => splitIntoParagraphs(text), [text])
  const segmented = useMemo(
    () => paragraphs.map((p) => splitParagraphWithUrls(p)),
    [paragraphs]
  )

  return (
    <div className="article-extract-body">
      {segmented.map((segs, pi) => (
        <p key={pi} className="article-extract-body__p">
          {segs.map((seg, si) => (
            <Segment key={`${pi}-${si}`} seg={seg} />
          ))}
        </p>
      ))}
    </div>
  )
}
