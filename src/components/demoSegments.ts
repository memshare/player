import type { SubtitleMark, SubtitlePart, SubtitleSegment } from './types'

/** 与 public/transcript_segments.json 对齐 */
export const TRANSCRIPT_SEGMENTS_URL = '/transcript_segments.json'

export type TranscriptJsonRow = {
  start: number
  end: number
  ja: string
  ja_ruby_html?: string | null
  zh: string
  romaji?: string | null
}

/** 从元素 class / data-jlp-mark 读取高亮类型（可与 JSON 里 HTML 混用） */
function readMarkFromElement(el: Element): SubtitleMark | undefined {
  const data = el.getAttribute('data-jlp-mark')?.trim()
  if (
    data === 'marker' ||
    data === 'underline-yellow' ||
    data === 'underline-blue'
  ) {
    return data
  }
  const cls = el.getAttribute('class') || ''
  if (/\bjlp-mark--marker\b|\bmarker\b/.test(cls)) return 'marker'
  if (/\bjlp-mark--underline-yellow\b|\bunderline-yellow\b/.test(cls)) {
    return 'underline-yellow'
  }
  if (/\bjlp-mark--underline-blue\b|\bunderline-blue\b/.test(cls)) {
    return 'underline-blue'
  }
  return undefined
}

function pickMark(
  own: SubtitleMark | undefined,
  inherited: SubtitleMark | undefined,
): SubtitleMark | undefined {
  return own ?? inherited
}

/**
 * 将 `ja_ruby_html`（片段 HTML，含 `<ruby>汉字<rt>かな</rt></ruby>`）解析为 `SubtitlePart[]`。
 * 支持在标签上加高亮：`class="jlp-mark--marker"` 或 `data-jlp-mark="underline-yellow"` 等。
 * 仅在浏览器环境调用（依赖 DOMParser）。
 */
export function parseJaRubyHtml(html: string): SubtitlePart[] {
  const trimmed = html?.trim()
  if (!trimmed) return []

  if (typeof DOMParser === 'undefined') {
    return [{ text: trimmed }]
  }

  const doc = new DOMParser().parseFromString(
    `<div id="jlp-ruby-root">${trimmed}</div>`,
    'text/html',
  )
  const root = doc.getElementById('jlp-ruby-root')
  if (!root) return [{ text: trimmed }]

  const parts: SubtitlePart[] = []

  const pushText = (raw: string, mark?: SubtitleMark) => {
    const t = raw.replace(/\u00a0/g, ' ')
    if (!t) return
    const p: SubtitlePart = mark ? { text: t, mark } : { text: t }
    parts.push(p)
  }

  const walk = (node: Node, inherited?: SubtitleMark) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? '', inherited)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as HTMLElement
    const tag = el.tagName.toUpperCase()
    if (tag === 'SCRIPT' || tag === 'STYLE') return

    if (tag === 'RUBY') {
      const rt = el.querySelector('rt')?.textContent?.trim() ?? ''
      const clone = el.cloneNode(true) as HTMLElement
      clone.querySelectorAll('rt, rp').forEach((n) => n.remove())
      const base = clone.textContent ?? ''
      const surface = base || (el.textContent ?? '')
      const mark = pickMark(readMarkFromElement(el), inherited)
      const piece: SubtitlePart = rt
        ? mark
          ? { text: surface, ruby: rt, mark }
          : { text: surface, ruby: rt }
        : mark
          ? { text: surface, mark }
          : { text: surface }
      parts.push(piece)
      return
    }

    const next = pickMark(readMarkFromElement(el), inherited)
    el.childNodes.forEach((ch) => walk(ch, next))
  }

  root.childNodes.forEach((n) => walk(n, undefined))
  return parts.length > 0 ? parts : [{ text: trimmed }]
}

export function mapTranscriptRows(rows: TranscriptJsonRow[]): SubtitleSegment[] {
  return rows.map((row, i) => {
    const html = row.ja_ruby_html
    const parts: SubtitlePart[] =
      html != null && String(html).trim()
        ? parseJaRubyHtml(String(html))
        : row.ja
          ? [{ text: row.ja }]
          : []

    return {
      id: String(i + 1),
      start: row.start,
      end: row.end,
      parts: parts.length > 0 ? parts : row.ja ? [{ text: row.ja }] : [{ text: '' }],
      romaji: typeof row.romaji === 'string' ? row.romaji : '',
      translationZh: row.zh,
    }
  })
}

export async function fetchTranscriptSegments(
  url: string = TRANSCRIPT_SEGMENTS_URL,
): Promise<SubtitleSegment[]> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`字幕请求失败 ${res.status}`)
  }
  const data: unknown = await res.json()
  if (!Array.isArray(data)) {
    throw new Error('字幕 JSON 须为数组')
  }
  return mapTranscriptRows(data as TranscriptJsonRow[])
}
