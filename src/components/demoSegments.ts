import type { SubtitlePart, SubtitleSegment } from './types'

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

/**
 * 将 `ja_ruby_html`（片段 HTML，含 `<ruby>汉字<rt>かな</rt></ruby>`）解析为 `SubtitlePart[]`。
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

  const pushText = (raw: string) => {
    const t = raw.replace(/\u00a0/g, ' ')
    if (t) parts.push({ text: t })
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as HTMLElement
    if (el.tagName === 'RUBY') {
      const rt = el.querySelector('rt')?.textContent?.trim() ?? ''
      const clone = el.cloneNode(true) as HTMLElement
      clone.querySelectorAll('rt, rp').forEach((n) => n.remove())
      const base = clone.textContent ?? ''
      const surface = base || (el.textContent ?? '')
      parts.push(rt ? { text: surface, ruby: rt } : { text: surface })
      return
    }

    el.childNodes.forEach(walk)
  }

  root.childNodes.forEach(walk)
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
