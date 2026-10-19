import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import {
  SUBTITLE_SIZES,
  SUBTITLE_SIZE_LABEL,
  type SubtitleSize,
  type Transcript,
  type TranscriptLine
} from '@shared/types'
import { formatDuration } from '@/utils/format'
import { HeadphonesIcon, RefreshIcon } from './icons'

interface TranscriptViewProps {
  transcript: Transcript | null
  loading: boolean
  currentTime: number
  subtitleSize: SubtitleSize
  onSubtitleSize: (size: SubtitleSize) => void
  onReload: () => void
  /** 点某一行跳转到对应时间——听力跟读的关键交互 */
  onSeek: (time: number) => void
  onToggleView: () => void
}

/**
 * 播放进度 → 当前行。
 * 长播客的逐字稿有两三千行，线性扫描每秒要跑好几遍，这里用二分。
 */
export function useActiveLineIndex(transcript: Transcript | null, currentTime: number): number {
  return useMemo(() => {
    const lines = transcript?.lines ?? []
    if (!transcript?.synced || !lines.length) return -1
    const target = currentTime + 0.2
    let lo = 0
    let hi = lines.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (lines[mid].time <= target) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return found
  }, [transcript, currentTime])
}

interface LinesHandle {
  /** 把某一行设为当前行：只改两个 DOM 节点，不触发 React 重排 */
  focus: (index: number) => void
}

interface TranscriptLinesProps {
  lines: TranscriptLine[]
  onSeek: (time: number) => void
}

/**
 * 行列表与播放进度无关，memo 之后不会随每秒的时间更新而重排；
 * 高亮由父组件命令式调用 focus() 直接操作 DOM。
 * 这样两千多行的逐字稿播放时也不会卡。
 */
const TranscriptLines = memo(
  forwardRef<LinesHandle, TranscriptLinesProps>(function TranscriptLines({ lines, onSeek }, ref) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const rows = useRef<(HTMLDivElement | null)[]>([])
    const activeIndex = useRef(-1)
    const pastUntil = useRef(0)

    useImperativeHandle(ref, () => ({
      focus(index: number) {
        const list = rows.current
        if (index < 0 || index >= list.length || index === activeIndex.current) return

        list[activeIndex.current]?.removeAttribute('data-active')

        // 播过的行渐暗；往回跳时把多余的标记抹掉
        if (index < pastUntil.current) {
          for (let i = index; i < pastUntil.current; i += 1) list[i]?.removeAttribute('data-past')
        } else {
          for (let i = pastUntil.current; i < index; i += 1) list[i]?.setAttribute('data-past', 'true')
        }
        pastUntil.current = index

        const current = list[index]
        if (current) {
          current.setAttribute('data-active', 'true')
          current.removeAttribute('data-past')
          const container = scrollRef.current
          if (container) {
            const top = current.offsetTop - container.clientHeight / 2 + current.clientHeight / 2
            container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
          }
        }
        activeIndex.current = index
      }
    }))

    return (
      <div className="transcript-scroll" ref={scrollRef}>
        <div className="transcript-inner">
          {lines.map((line, index) => (
            <div
              className="transcript-row"
              key={`${index}-${line.time}`}
              ref={(el) => {
                rows.current[index] = el
              }}
              onClick={() => line.time >= 0 && onSeek(line.time)}
              title={line.time >= 0 ? `跳到 ${formatDuration(line.time)}` : undefined}
            >
              <div className="transcript-time">
                {line.time >= 0 ? formatDuration(line.time) : '--:--'}
              </div>
              <div className="transcript-body">
                <div className="transcript-text">{line.text}</div>
                {line.translation ? (
                  <div className="transcript-translation">{line.translation}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  })
)

export function TranscriptView({
  transcript,
  loading,
  currentTime,
  subtitleSize,
  onSubtitleSize,
  onReload,
  onSeek,
  onToggleView
}: TranscriptViewProps) {
  const linesRef = useRef<LinesHandle>(null)
  const activeIndex = useActiveLineIndex(transcript, currentTime)

  useEffect(() => {
    if (activeIndex >= 0) linesRef.current?.focus(activeIndex)
  }, [activeIndex])

  const sourceLabel = transcript?.source === 'youtube' ? 'YouTube 字幕' : ''

  return (
    <div className="transcript-view">
      {loading ? (
        <div className="transcript-placeholder">
          <RefreshIcon size={20} className="spin" />
          <span>正在获取逐字稿…</span>
        </div>
      ) : !transcript || !transcript.lines.length ? (
        <div className="transcript-placeholder">
          <HeadphonesIcon size={20} />
          <span>暂无逐字稿</span>
          <span className="transcript-hint">{transcript?.note ?? '这一集可能没有开启字幕'}</span>
          <button className="btn btn-sm" onClick={onReload}>
            <RefreshIcon size={13} />
            重新获取
          </button>
        </div>
      ) : (
        <>
          {/* key 让换集时整块重建，避免残留上一集的高亮状态 */}
          <TranscriptLines
            key={transcript.fetchedAt}
            ref={linesRef}
            lines={transcript.lines}
            onSeek={onSeek}
          />
          <div className="transcript-footer">
            <span className="transcript-source">
              {sourceLabel}
              {transcript.translated ? ' · 中文翻译' : ''}
              {transcript.language ? ` · ${transcript.language}` : ''}
            </span>

            {/* 就地调字号：四个 A 依次变大 */}
            <div className="transcript-size">
              {SUBTITLE_SIZES.map((size) => (
                <button
                  key={size}
                  className="size-btn"
                  data-size={size}
                  data-active={subtitleSize === size}
                  onClick={() => onSubtitleSize(size)}
                  title={`字幕${SUBTITLE_SIZE_LABEL[size]}`}
                >
                  A
                </button>
              ))}
            </div>

            <button className="icon-btn" onClick={onReload} title="重新获取逐字稿">
              <RefreshIcon size={13} />
            </button>
          </div>
        </>
      )}

      <button className="stage-toggle" onClick={onToggleView} title="返回封面">
        <HeadphonesIcon size={15} />
      </button>
    </div>
  )
}
