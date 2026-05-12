import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { demoSegments } from './demoSegments'
import type { SubtitlePart, SubtitleSegment } from './types'
import './SubtitleLearningPlayer.css'

const VIDEO_SRC = '/v.mp4'

const SPEEDS = [0.75, 1, 1.25, 1.5] as const

function pickActiveSegment(
  segments: SubtitleSegment[],
  t: number,
): SubtitleSegment | null {
  return segments.find((s) => t >= s.start && t < s.end) ?? null
}

function renderPart(part: SubtitlePart, index: number) {
  const cls = part.mark ? `jlp-mark jlp-mark--${part.mark}` : undefined
  if (part.ruby) {
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
  segments?: SubtitleSegment[]
  videoSrc?: string
}

export function SubtitleLearningPlayer({
  segments = demoSegments,
  videoSrc = VIDEO_SRC,
}: SubtitleLearningPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const activeRowRef = useRef<HTMLButtonElement | null>(null)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(true)
  const [speedIdx, setSpeedIdx] = useState(1)

  const active = useMemo(
    () => pickActiveSegment(segments, currentTime),
    [segments, currentTime],
  )

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
        <div className="jlp-video-wrap">
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
        </div>

        <div className="jlp-controls">
          <div
            className="jlp-progress"
            onPointerDown={(e) => {
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
                onClick={togglePlay}
                aria-label={paused ? '播放' : '暂停'}
              >
                {paused ? '▶' : '❚❚'}
              </button>
              <button
                type="button"
                className="jlp-icon-btn"
                onClick={cycleSpeed}
                title="播放速度"
              >
                {SPEEDS[speedIdx]}×
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside className="jlp-side" aria-label="字幕列表">
        <header className="jlp-side-head">字幕</header>
        <div ref={listRef} className="jlp-list">
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
                <div className="jlp-jp">{seg.parts.map(renderPart)}</div>
                <div className="jlp-romaji">{seg.romaji}</div>
                <div className="jlp-zh">{seg.translationZh}</div>
              </button>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
