import type { DownloadTask } from '@shared/types'
import { cleanEpisodeTitle, formatDuration, smallThumb } from '@/utils/format'
import { CloseIcon, DownloadIcon, PlayIcon, RefreshIcon } from './icons'

interface DownloadQueueProps {
  tasks: DownloadTask[]
  /** 已进入本地库、可以直接播放的单集 */
  playableIds: Set<string>
  onPlay: (id: string) => void
  onCancel: (id: string) => void
  onClear: () => void
}

const STATUS_LABEL: Record<DownloadTask['status'], string> = {
  queued: '排队中',
  downloading: '下载中',
  processing: '处理中',
  done: '已完成',
  error: '失败',
  canceled: '已取消'
}

export function DownloadQueue({
  tasks,
  playableIds,
  onPlay,
  onCancel,
  onClear
}: DownloadQueueProps) {
  if (!tasks.length) {
    return (
      <div className="empty">
        <DownloadIcon size={22} />
        <strong>下载队列是空的</strong>
        <div className="empty-hint">
          在搜索结果里点「缓存」，任务会出现在这里；缓存完成后可直接在队列里播放。
        </div>
      </div>
    )
  }

  const active = tasks.filter((t) => t.status === 'downloading' || t.status === 'queued').length
  const finished = tasks.filter((t) => ['done', 'error', 'canceled'].includes(t.status)).length

  return (
    <>
      <div className="list-toolbar">
        <span className="list-toolbar-text">
          {active > 0 ? `${active} 个任务进行中` : '全部任务已结束'}
        </span>
        <button className="btn btn-sm" onClick={onClear} disabled={!finished}>
          清理已结束
        </button>
      </div>

      <div className="row-list">
        {tasks.map((task) => {
          const percent = Math.round(task.progress * 100)
          const running = task.status === 'downloading' || task.status === 'queued'
          const playable = task.status === 'done' && playableIds.has(task.id)
          return (
            <article className="queue-item" key={task.id} data-status={task.status}>
              <button
                className="row-cover row-cover-btn"
                onClick={() => playable && onPlay(task.id)}
                disabled={!playable}
                title={playable ? '播放这一集' : ''}
                style={
                  task.meta.thumbnail
                    ? { backgroundImage: `url("${smallThumb(task.meta.thumbnail)}")` }
                    : undefined
                }
              >
                {playable ? (
                  <span className="row-cover-mask">
                    <PlayIcon size={17} />
                  </span>
                ) : null}
              </button>
              <div className="row-main" onClick={() => playable && onPlay(task.id)}>
                <div className="row-title">{cleanEpisodeTitle(task.meta.title)}</div>
                <div className="row-sub">
                  <span className="row-artist">{task.meta.channel}</span>
                  <span className="row-dot">·</span>
                  <span>{task.error ?? task.stage ?? STATUS_LABEL[task.status]}</span>
                  <span className="row-time">{formatDuration(task.meta.duration)}</span>
                  {task.speed ? <span className="row-speed">{task.speed}</span> : null}
                  {task.eta ? <span className="row-speed">ETA {task.eta}</span> : null}
                </div>
                {running || task.status === 'processing' ? (
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${percent}%` }} />
                  </div>
                ) : null}
              </div>
              <div className="row-actions">
                {running ? (
                  <button className="icon-btn" onClick={() => onCancel(task.id)} title="取消">
                    <CloseIcon size={15} />
                  </button>
                ) : playable ? (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onPlay(task.id)}
                    title="播放这一集"
                  >
                    <PlayIcon size={13} />
                    播放
                  </button>
                ) : task.status === 'done' ? (
                  <span className="queue-status" data-status="done">
                    <RefreshIcon size={12} className="spin" />
                    整理中
                  </span>
                ) : (
                  <span className="queue-status" data-status={task.status}>
                    {STATUS_LABEL[task.status]}
                  </span>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}
