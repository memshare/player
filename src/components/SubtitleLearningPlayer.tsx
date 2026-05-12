import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  TRANSCRIPT_SEGMENTS_URL,
  fetchTranscriptSegments,
} from './demoSegments'
import type { SubtitlePart, SubtitleSegment } from './types'
import './SubtitleLearningPlayer.css'

const VIDEO_SRC = '/v.mp4'

const SPEEDS = [0.75, 1, 1.25, 1.5] as const

const SETTINGS_STORAGE_KEY = 'jlp-display-settings'

function loadDisplaySettings(): {
  showRomaji: boolean
  showFurigana: boolean
} {
  if (typeof localStorage === 'undefined') {
    return { showRomaji: true, showFurigana: true }
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { showRomaji: true, showFurigana: true }
    const o = JSON.parse(raw) as Record<string, unknown>
    return {
      showRomaji: o.showRomaji !== false,
      showFurigana: o.showFurigana !== false,
    }
  } catch {
    return { showRomaji: true, showFurigana: true }
  }
}

function renderPart(
  part: SubtitlePart,
  index: number,
  showFurigana: boolean,
) {
  const cls = part.mark ? `jlp-mark jlp-mark--${part.mark}` : undefined
  if (showFurigana && part.ruby) {
    return (
      <ruby key={index} className={cls}>
        {part.text}
        <rt>{part.ruby}</rt>
      </ruby>
    )
  }
  return (
    <span key={index} className={cls}>
      {part.text}
    </span>
  )
}

function pickActiveSegment(
  segments: SubtitleSegment[],
  t: number,
): SubtitleSegment | null {
  return segments.find((s) => t >= s.start && t < s.end) ?? null
}

function formatClock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** 字幕列表用：带十分位，与分段数据里的小数秒对齐 */
function formatSegmentTc(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  const rounded = Math.round(s * 10) / 10
  const intPart = Math.floor(rounded + 1e-6)
  const frac = Math.round((rounded - intPart) * 10)
  if (frac === 0) return `${m}:${String(intPart).padStart(2, '0')}`
  return `${m}:${String(intPart).padStart(2, '0')}.${frac}`
}

function formatSegmentRange(start: number, end: number) {
  return `${formatSegmentTc(start)} – ${formatSegmentTc(end)}`
}

export type SubtitleLearningPlayerProps = {
  /** 若传入则不再请求 transcript */
  segments?: SubtitleSegment[]
  /** 默认 `/transcript_segments.json`（public 目录） */
  transcriptUrl?: string
  videoSrc?: string
}

export function SubtitleLearningPlayer({
  segments: segmentsProp,
  transcriptUrl = TRANSCRIPT_SEGMENTS_URL,
  videoSrc = VIDEO_SRC,
}: SubtitleLearningPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const activeRowRef = useRef<HTMLButtonElement | null>(null)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(true)
  const [speedIdx, setSpeedIdx] = useState(1)
  const [showRomaji, setShowRomaji] = useState(
    () => loadDisplaySettings().showRomaji,
  )
  const [showFurigana, setShowFurigana] = useState(
    () => loadDisplaySettings().showFurigana,
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsWrapRef = useRef<HTMLDivElement>(null)
  const uiHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [forceUi, setForceUi] = useState(false)

  const [fetchedSegments, setFetchedSegments] = useState<SubtitleSegment[]>([])
  const [transcriptState, setTranscriptState] = useState<
    'loading' | 'ok' | 'err'
  >(() => (segmentsProp !== undefined ? 'ok' : 'loading'))
  const [transcriptError, setTranscriptError] = useState<string | null>(null)

  const segments = segmentsProp ?? fetchedSegments

  const bumpTouchUi = useCallback(() => {
    setForceUi(true)
    if (uiHideTimerRef.current) clearTimeout(uiHideTimerRef.current)
    uiHideTimerRef.current = setTimeout(() => {
      setForceUi(false)
      uiHideTimerRef.current = null
    }, 3200)
  }, [])

  const onVideoWrapPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') return
      bumpTouchUi()
    },
    [bumpTouchUi],
  )

  useEffect(() => {
    if (settingsOpen) {
      if (uiHideTimerRef.current) {
        clearTimeout(uiHideTimerRef.current)
        uiHideTimerRef.current = null
      }
      setForceUi(true)
      return
    }
    if (uiHideTimerRef.current) clearTimeout(uiHideTimerRef.current)
    uiHideTimerRef.current = setTimeout(() => {
      setForceUi(false)
      uiHideTimerRef.current = null
    }, 2200)
  }, [settingsOpen])

  useEffect(() => {
    return () => {
      if (uiHideTimerRef.current) clearTimeout(uiHideTimerRef.current)
    }
  }, [])

  const active = useMemo(
    () => pickActiveSegment(segments, currentTime),
    [segments, currentTime],
  )

  useEffect(() => {
    if (segmentsProp !== undefined) {
      setTranscriptState('ok')
      setTranscriptError(null)
      return
    }
    let cancelled = false
    setTranscriptState('loading')
    setTranscriptError(null)
    fetchTranscriptSegments(transcriptUrl)
      .then((rows) => {
        if (!cancelled) {
          setFetchedSegments(rows)
          setTranscriptState('ok')
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setFetchedSegments([])
          setTranscriptError(
            e instanceof Error ? e.message : String(e ?? '加载失败'),
          )
          setTranscriptState('err')
        }
      })
    return () => {
      cancelled = true
    }
  }, [segmentsProp, transcriptUrl])

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime)
  }, [])

  const onLoadedMeta = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration || 0)
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = SPEEDS[speedIdx]
  }, [speedIdx])

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ showRomaji, showFurigana }),
      )
    } catch {
      /* ignore */
    }
  }, [showRomaji, showFurigana])

  useEffect(() => {
    if (!settingsOpen) return
    const close = (e: MouseEvent) => {
      const el = settingsWrapRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [settingsOpen])

  useEffect(() => {
    const id = active?.id
    if (!id || !activeRowRef.current || !listRef.current) return
    activeRowRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  }, [active?.id])

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current
    if (!v) return
    const next = Math.max(0, Math.min(t, v.duration || t))
    v.currentTime = next
    setCurrentTime(next)
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }, [])

  const cycleSpeed = useCallback(() => {
    setSpeedIdx((i) => (i + 1) % SPEEDS.length)
  }, [])

  const onProgressPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const v = videoRef.current
      if (!v || !duration) return
      const bar = e.currentTarget
      const rect = bar.getBoundingClientRect()
      const ratio = Math.min(
        1,
        Math.max(0, (e.clientX - rect.left) / rect.width),
      )
      seekTo(ratio * duration)
    },
    [duration, seekTo],
  )

  const progress = duration ? Math.min(1, currentTime / duration) : 0

  return (
    <div className="jlp">
      <div className="jlp-main">
        <div
          className={`jlp-video-wrap${forceUi ? ' jlp-video-wrap--force-ui' : ''}`}
          onPointerDown={onVideoWrapPointerDown}
        >
          <video
            ref={videoRef}
            className="jlp-video"
            src={videoSrc}
            playsInline
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMeta}
            onDurationChange={onLoadedMeta}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
          />

          <div className="jlp-controls">
            <div
              className="jlp-progress"
              onPointerDown={(e) => {
                bumpTouchUi()
                ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
                onProgressPointer(e)
              }}
              onPointerMove={(e) => {
                if (e.buttons !== 1) return
                onProgressPointer(e)
              }}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label="播放进度"
            >
              <div className="jlp-progress-track" />
              <div
                className="jlp-progress-fill"
                style={{ width: `${progress * 100}%` }}
              />
              <div
                className="jlp-progress-thumb"
                style={{ left: `${progress * 100}%` }}
              />
            </div>

            <div className="jlp-controls-row">
              <span className="jlp-time">
                {formatClock(currentTime)} / {formatClock(duration)}
              </span>
              <div className="jlp-actions">
                <button
                  type="button"
                  className="jlp-icon-btn"
                  onClick={() => {
                    bumpTouchUi()
                    togglePlay()
                  }}
                  aria-label={paused ? '播放' : '暂停'}
                >
                  {paused ? '▶' : '❚❚'}
                </button>
                <button
                  type="button"
                  className="jlp-icon-btn"
                  onClick={() => {
                    bumpTouchUi()
                    cycleSpeed()
                  }}
                  title="播放速度"
                >
                  {SPEEDS[speedIdx]}×
                </button>
                <div className="jlp-settings-wrap" ref={settingsWrapRef}>
                  <button
                    type="button"
                    className="jlp-icon-btn"
                    aria-expanded={settingsOpen}
                    aria-haspopup="dialog"
                    aria-controls="jlp-settings-panel"
                    onClick={() => {
                      bumpTouchUi()
                      setSettingsOpen((o) => !o)
                    }}
                  >
                    设置
                  </button>
                  {settingsOpen ? (
                    <div
                      id="jlp-settings-panel"
                      className="jlp-settings-panel"
                      role="dialog"
                      aria-label="字幕显示设置"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="jlp-settings-title">字幕显示</div>
                      <label className="jlp-setting-row">
                        <span className="jlp-setting-label">罗马音标注</span>
                        <input
                          type="checkbox"
                          className="jlp-setting-toggle"
                          checked={showRomaji}
                          onChange={(e) => setShowRomaji(e.target.checked)}
                        />
                      </label>
                      <label className="jlp-setting-row">
                        <span className="jlp-setting-label">汉字假名标注</span>
                        <input
                          type="checkbox"
                          className="jlp-setting-toggle"
                          checked={showFurigana}
                          onChange={(e) => setShowFurigana(e.target.checked)}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="jlp-side" aria-label="字幕列表">
        <header className="jlp-side-head">字幕</header>
        <div ref={listRef} className="jlp-list">
          {transcriptState === 'loading' ? (
            <p className="jlp-list-status">加载字幕中…</p>
          ) : null}
          {transcriptState === 'err' && transcriptError ? (
            <p className="jlp-list-status jlp-list-status--err">{transcriptError}</p>
          ) : null}
          {segments.map((seg) => {
            const isActive = active?.id === seg.id
            return (
              <button
                key={seg.id}
                type="button"
                ref={isActive ? activeRowRef : undefined}
                className={`jlp-row${isActive ? ' jlp-row--active' : ''}`}
                onClick={() => seekTo(seg.start)}
              >
                <div className="jlp-ts" aria-label="本段起止时间">
                  {formatSegmentRange(seg.start, seg.end)}
                </div>
                <div className="jlp-jp">
                  {seg.parts.map((p, i) => renderPart(p, i, showFurigana))}
                </div>
                {showRomaji && seg.romaji?.trim() ? (
                  <div className="jlp-romaji">{seg.romaji}</div>
                ) : null}
                <div className="jlp-zh">{seg.translationZh}</div>
              </button>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
