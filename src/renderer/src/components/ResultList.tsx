import type { EpisodeMeta } from '@shared/types'
import {
  cleanEpisodeTitle,
  formatDate,
  formatDuration,
  formatDurationLong,
  smallThumb
} from '@/utils/format'
import { DownloadIcon, HeadphonesIcon, LinkIcon, PlayIcon, RefreshIcon } from './icons'

interface ResultListProps {
  results: EpisodeMeta[]
  loading: boolean
  cachedIds: Set<string>
  busyIds: Set<string>
  /** 正在解析直链的单集（边听边缓存的准备阶段） */
  streamingIds: Set<string>
  keyword: string
  /** 空态标题：热门榜这类场景不适合用「没有找到 xx」的措辞 */
  emptyTitle?: string
  onDownload: (meta: EpisodeMeta) => void
  /** 边听边缓存：先播流，同时后台缓存 */
  onStream: (meta: EpisodeMeta) => void
  /** 已经缓存过的，直接播本地 */
  onPlay: (id: string) => void
  onOpen: (meta: EpisodeMeta) => void
}

const EMPTY_HINT = (
  <>
    不知道听什么？去左侧「分类」里挑一个主题，里面每个分类都有精选节目。
    <br />
    也可以在这里输入节目名 / 嘉宾 / 话题，或粘贴 YouTube 链接。
    <br />
    粘贴「频道主页」或「播放列表」链接，能一次拉出最近几十集。
  </>
)

export function ResultList({
  results,
  loading,
  cachedIds,
  busyIds,
  streamingIds,
  keyword,
  emptyTitle,
  onDownload,
  onStream,
  onPlay,
  onOpen
}: ResultListProps) {
  if (loading) {
    return (
      <div className="empty">
        <RefreshIcon size={22} className="spin" />
        <strong>正在检索 YouTube…</strong>
      </div>
    )
  }

  if (!results.length) {
    return (
      <div className="empty">
        <HeadphonesIcon size={22} />
        <strong>{emptyTitle ?? (keyword ? `没有找到「${keyword}」相关的单集` : '从一个节目开始')}</strong>
        <div className="empty-hint">
          {emptyTitle
            ? '点击右上角「换一批」，或去分类里手动挑几集。'
            : keyword
              ? '换个说法，或直接粘贴节目链接试试。'
              : EMPTY_HINT}
        </div>
      </div>
    )
  }

  return (
    <div className="row-list">
      {results.map((meta) => {
        const cached = cachedIds.has(meta.id)
        const busy = busyIds.has(meta.id)
        const connecting = streamingIds.has(meta.id)
        return (
          <article className="row" key={meta.id}>
            <div
              className="row-cover"
              style={
                meta.thumbnail
                  ? { backgroundImage: `url("${smallThumb(meta.thumbnail)}")` }
                  : undefined
              }
            />
            <div className="row-main">
              <div className="row-title">{cleanEpisodeTitle(meta.title)}</div>
              <div className="row-sub">
                <span className="row-artist">{meta.channel}</span>
                <span className="row-dot">·</span>
                <span className="row-time" title={formatDurationLong(meta.duration)}>
                  {formatDuration(meta.duration)}
                </span>
                {meta.publishedAt ? (
                  <>
                    <span className="row-dot">·</span>
                    <span>{formatDate(meta.publishedAt)}</span>
                  </>
                ) : null}
                {cached ? <span className="badge">已缓存</span> : null}
              </div>
            </div>
            <div className="row-actions">
              <button className="icon-btn" onClick={() => onOpen(meta)} title="在浏览器中打开">
                <LinkIcon size={15} />
              </button>

              {cached ? (
                <button className="btn btn-sm btn-primary" onClick={() => onPlay(meta.id)}>
                  <PlayIcon size={13} />
                  播放
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onStream(meta)}
                    disabled={busy || connecting}
                    title="立即播放，同时后台缓存到本地"
                  >
                    {connecting ? (
                      <RefreshIcon size={13} className="spin" />
                    ) : (
                      <PlayIcon size={13} />
                    )}
                    {connecting ? '连接中' : '边听边缓存'}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => onDownload(meta)}
                    disabled={busy}
                    title="只缓存，不立即播放"
                  >
                    {busy ? <RefreshIcon size={13} className="spin" /> : <DownloadIcon size={13} />}
                    {busy ? '进行中' : '仅缓存'}
                  </button>
                </>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
