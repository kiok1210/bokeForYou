import { useState } from 'react'
import type { SubtitleSize, Transcript } from '@shared/types'
import type { PlayerApi } from '@/hooks/usePlayer'
import { usePlayerTime } from '@/hooks/usePlayerTime'
import { SLEEP_PRESETS, formatClock, formatRate } from '@shared/portable/playback'
import { cleanEpisodeTitle, coverUrl, formatDuration, formatDurationLong } from '@/utils/format'
import { TranscriptView, useActiveLineIndex } from './TranscriptView'
import {
  ClockIcon,
  CollapseIcon,
  ExpandIcon,
  HeadphonesIcon,
  MuteIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  SpeedIcon,
  TranscriptIcon,
  VolumeIcon
} from './icons'

interface PodcastPlayerProps {
  player: PlayerApi
  transcript: Transcript | null
  transcriptLoading: boolean
  showTranscript: boolean
  /** 字幕总开关：关掉之后不显示任何文本，纯练听力 */
  subtitlesEnabled: boolean
  subtitleSize: SubtitleSize
  onToggleTranscript: () => void
  onToggleSubtitles: () => void
  onSubtitleSize: (size: SubtitleSize) => void
  onReloadTranscript: () => void
  /** 播客主体是否已放大占满内容区 */
  focus: boolean
  /** 在窗口内放大 / 收起播客主体（窗口本身尺寸不变） */
  onToggleFocus: () => void
}

export function PodcastPlayer({
  player,
  transcript,
  transcriptLoading,
  showTranscript,
  subtitlesEnabled,
  subtitleSize,
  onToggleTranscript,
  onToggleSubtitles,
  onSubtitleSize,
  onReloadTranscript,
  focus,
  onToggleFocus
}: PodcastPlayerProps) {
  const [sleepOpen, setSleepOpen] = useState(false)
  // 只在这里订阅进度：应用其它部分不会因为播放而重渲染
  const currentTime = usePlayerTime(player)

  const episode = player.current
  const cover = episode ? coverUrl(episode.coverName, episode.thumbnail) : null
  // 视频内容渲染画面，播客内容渲染封面
  const isVideo = episode?.kind === 'video'
  const frame = episode?.frame ?? 'square'
  const duration = player.duration || episode?.duration || 0
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const volumeValue = player.muted ? 0 : player.volume

  const activeIndex = useActiveLineIndex(transcript, currentTime)
  const activeLine = activeIndex >= 0 ? transcript?.lines[activeIndex] : undefined
  const RepeatGlyph = player.repeat === 'one' ? RepeatOneIcon : RepeatIcon

  // 字幕关掉时，面板与预览一并收起
  const transcriptOpen = showTranscript && subtitlesEnabled

  return (
    <aside className="player-column">
      {focus ? (
        <button className="focus-exit" onClick={onToggleFocus} title="收起播客主体，回到列表">
          <CollapseIcon size={14} />
          收起
        </button>
      ) : null}

      <div className="stage-slot">
        {/*
          播放内核唯一的媒体元素：音频播客只出声（不放画面），
          视频模式连画面一起显示。它必须一直挂在 DOM 上，
          切封面/逐字稿时只是隐藏，否则换视图会把播放打断。
        */}
        <video
          ref={player.mediaRef}
          className="stage-video"
          data-frame={frame}
          data-visible={Boolean(isVideo) && !transcriptOpen}
          preload="auto"
          playsInline
          onDoubleClick={onToggleFocus}
          title="双击：放大 / 收起播客主体"
        />

        {transcriptOpen ? (
          <TranscriptView
            transcript={transcript}
            loading={transcriptLoading}
            currentTime={currentTime}
            subtitleSize={subtitleSize}
            onSubtitleSize={onSubtitleSize}
            onReload={onReloadTranscript}
            onSeek={player.seek}
            onToggleView={onToggleTranscript}
          />
        ) : isVideo ? (
          <button
            className="stage-toggle"
            onClick={onToggleTranscript}
            title={
              subtitlesEnabled
                ? transcript?.lines.length
                  ? '查看逐字稿'
                  : '播放后可查看逐字稿'
                : '先打开字幕'
            }
            disabled={!subtitlesEnabled || !transcript?.lines.length}
          >
            <TranscriptIcon size={15} />
          </button>
        ) : (
          <>
            <div
              className="cover-stage"
              data-playing={player.playing}
              onDoubleClick={onToggleFocus}
              title="双击封面：放大 / 收起播客主体"
            >
              {cover ? (
                <img className="cover-art" src={cover} alt="" draggable={false} />
              ) : (
                <div className="cover-art cover-art-empty">
                  <HeadphonesIcon size={44} />
                </div>
              )}
              {player.playing ? <span className="cover-pulse" /> : null}
            </div>
            <button
              className="stage-toggle"
              onClick={onToggleTranscript}
              title={
                subtitlesEnabled
                  ? transcript?.lines.length
                    ? '查看逐字稿'
                    : '播放后可查看逐字稿'
                  : '先打开字幕'
              }
              disabled={!subtitlesEnabled || !transcript?.lines.length}
            >
              <TranscriptIcon size={15} />
            </button>
          </>
        )}

        {/* 放大入口直接长在播放器上：比藏在标题栏的一排图标里好找得多 */}
        <button
          className="stage-expand"
          onClick={onToggleFocus}
          title={focus ? '收起播客主体，回到列表' : '放大播客主体（在窗口内铺满）'}
        >
          {focus ? <CollapseIcon size={15} /> : <ExpandIcon size={15} />}
        </button>
      </div>

      <div className={`now-playing${episode ? '' : ' now-playing-empty'}`}>
        <div className="now-playing-title">
          {episode ? cleanEpisodeTitle(episode.title) : '还没有选择单集'}
        </div>
        <div className="now-playing-artist">
          {episode
            ? `${episode.channel} · ${episode.cached ? '本地缓存' : '边听边缓存中'}`
            : '搜索或从分类里挑一集，开始今天的听力'}
        </div>
      </div>

      {!transcriptOpen ? (
        <button
          className="lyric-preview"
          onClick={subtitlesEnabled ? onToggleTranscript : onToggleSubtitles}
          disabled={subtitlesEnabled && !transcript?.lines.length}
          title={
            subtitlesEnabled
              ? transcript?.lines.length
                ? '展开完整逐字稿'
                : '暂无逐字稿'
              : '点击打开字幕'
          }
        >
          {!subtitlesEnabled ? (
            <span className="lyric-preview-empty">字幕已关闭 · 点击开启（纯听力模式）</span>
          ) : transcriptLoading ? (
            <span className="lyric-preview-empty">正在获取逐字稿…</span>
          ) : activeLine ? (
            <>
              <span className="lyric-preview-text">{activeLine.text}</span>
              {activeLine.translation ? (
                <span className="lyric-preview-trans">{activeLine.translation}</span>
              ) : null}
            </>
          ) : (
            <span className="lyric-preview-empty">
              {transcript?.lines.length ? '♪ 正在播放' : '暂无逐字稿'}
            </span>
          )}
        </button>
      ) : null}

      <div className="transport">
        <input
          className="slider"
          type="range"
          min={0}
          max={duration || 1}
          step={1}
          value={Math.min(currentTime, duration || 1)}
          style={{ ['--fill' as string]: `${progressPercent}%` }}
          onChange={(event) => player.seek(Number(event.target.value))}
          disabled={!episode}
          aria-label="播放进度"
        />
        <div className="transport-time">
          <span>{formatDuration(currentTime)}</span>
          <span className="speed-tag" data-playing={player.playing}>
            <span className="chip-dot" />
            {player.playing ? `${formatRate(player.rate)} 播放中` : '已暂停'}
          </span>
          <span title={formatDurationLong(duration)}>{formatDuration(duration)}</span>
        </div>

        <div className="transport-controls">
          <button
            className="icon-btn"
            data-active={player.repeat !== 'off'}
            onClick={player.cycleRepeat}
            title={
              player.repeat === 'off'
                ? '循环：关闭'
                : player.repeat === 'all'
                  ? '循环：列表'
                  : '循环：单集'
            }
          >
            <RepeatGlyph size={17} />
          </button>
          <button
            className="skip-btn"
            onClick={() => player.seek(Math.max(0, currentTime - 15))}
            disabled={!episode}
            title="后退 15 秒"
          >
            15
          </button>
          <button
            className="play-button"
            onClick={player.toggle}
            disabled={!episode}
            title={player.playing ? '暂停' : '播放'}
          >
            {player.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <button
            className="skip-btn"
            onClick={() => player.seek(currentTime + 30)}
            disabled={!episode}
            title="前进 30 秒"
          >
            30
          </button>
          <button
            className="icon-btn"
            onClick={() => player.setRate(player.rate >= 2.5 ? 0.75 : player.rate + 0.25)}
            title="切换倍速"
          >
            <SpeedIcon size={17} />
          </button>
        </div>

        <div className="transport-extra">
          {/* 字幕总开关：一键切换到纯听力模式 */}
          <button
            className="pill-btn"
            data-active={subtitlesEnabled}
            onClick={onToggleSubtitles}
            title={subtitlesEnabled ? '关闭字幕，纯听力练习' : '打开字幕'}
          >
            <TranscriptIcon size={14} />
            {subtitlesEnabled ? '字幕开' : '字幕关'}
          </button>

          <button
            className="pill-btn"
            data-active={player.sleepRemaining > 0}
            onClick={() => setSleepOpen((prev) => !prev)}
            title="睡眠定时"
          >
            <ClockIcon size={14} />
            {player.sleepRemaining > 0 ? formatClock(player.sleepRemaining) : '睡眠定时'}
          </button>

          <button
            className="pill-btn"
            onClick={() => player.bumpRate(-0.25)}
            disabled={player.rate <= 0.75}
            title="减速"
          >
            −
          </button>
          <span className="pill-value">{formatRate(player.rate)}</span>
          <button
            className="pill-btn"
            onClick={() => player.bumpRate(0.25)}
            disabled={player.rate >= 2.5}
            title="加速"
          >
            +
          </button>

          {sleepOpen ? (
            <div className="sleep-menu">
              <div className="sleep-menu-title">播放结束后自动暂停</div>
              {SLEEP_PRESETS.map((minutes) => (
                <button
                  key={minutes}
                  className="sleep-option"
                  onClick={() => {
                    player.startSleep(minutes)
                    setSleepOpen(false)
                  }}
                >
                  {minutes} 分钟后
                </button>
              ))}
              <button
                className="sleep-option"
                onClick={() => {
                  player.cancelSleep()
                  setSleepOpen(false)
                }}
              >
                关闭定时
              </button>
            </div>
          ) : null}
        </div>

        <div className="volume-row">
          <button
            className="icon-btn"
            onClick={player.toggleMute}
            title={player.muted ? '取消静音' : '静音'}
          >
            {player.muted ? <MuteIcon size={16} /> : <VolumeIcon size={16} />}
          </button>
          <input
            className="slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volumeValue}
            style={{ ['--fill' as string]: `${volumeValue * 100}%` }}
            onChange={(event) => player.setVolume(Number(event.target.value))}
            aria-label="音量"
          />
          <span className="transport-time" style={{ margin: 0, minWidth: 30 }}>
            {Math.round(volumeValue * 100)}
          </span>
          <button className="icon-btn" onClick={player.next} disabled={!episode} title="下一集">
            <NextIcon size={16} />
          </button>
          <button className="icon-btn" onClick={player.prev} disabled={!episode} title="上一集">
            <PrevIcon size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
