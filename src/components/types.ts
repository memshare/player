export type SubtitleMark = 'marker' | 'underline-yellow' | 'underline-blue'

export type SubtitlePart = {
  text: string
  ruby?: string
  mark?: SubtitleMark
}

export type SubtitleSegment = {
  id: string
  /** 开始时间（秒） */
  start: number
  /** 结束时间（秒） */
  end: number
  parts: SubtitlePart[]
  romaji: string
  translationZh: string
}
