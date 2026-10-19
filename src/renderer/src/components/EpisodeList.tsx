import type { Category, Episode } from '@shared/types'
import { progressRatio } from '@shared/portable/playback'
import {
  cleanEpisodeTitle,
  coverUrl,
  formatDate,
  formatDuration,
  formatDurationLong,
  smallThumb
} from '@/utils/format'
import { FolderIcon, HeartIcon, LinkIcon, PlayIcon, TrashIcon } from './icons'

interface EpisodeListProps {
  episodes: Episode[]
  categories: Category[]
  currentId: string | null
  playing: boolean
  hasQuery: boolean
  onPlay: (episode: Episode, queue?: Episode[]) => void
  onToggleFavorite: (id: string) => void
  onRemove: (episode: Episode) => void
  onReveal: (id: string) => void
  onSetCategory: (id: string, category: string) => void
  onOpenSource: (episode: Episode) => void
}

export function EpisodeList({
  episodes,
  categories,
  currentId,
  playing,
  hasQuery,
  onPlay,
  onToggleFavorite,
  onRemove,
  onReveal,
  onSetCategory,
  onOpenSource
}: EpisodeListProps) {
  if (!episodes.length) {
    return (
      <div className="empty">
        <strong>{hasQuery ? '没有匹配的单集' : '缓存还是空的'}</strong>
        <div className="empty-hint">
          {hasQuery ? '换个关键词，或切换分类看看。' : '缓存的单集会出现在这里，点击封面即可播放。'}
        </div>
      </div>
    )
  }

  return (
    <div className="row-list">
      {episodes.map((episode) => {
        const isCurrent = episode.id === currentId
        const ratio = progressRatio(episode.duration, episode.progress)
        // 优先用本地缓存的封面：断网也在、也不用再解码一遍网络图
        const cover = coverUrl(episode.coverName, smallThumb(episode.thumbnail))
        return (
          <article
            className="row row-track"
            key={episode.id}
            data-current={isCurrent}
            onDoubleClick={() => onPlay(episode)}
          >
            <button
              className="row-cover row-cover-btn"
              onClick={() => onPlay(episode)}
              style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
              title="播放"
            >
              <span className="row-cover-mask">
                {isCurrent && playing ? (
                  <span className="equalizer">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <PlayIcon size={17} />
                )}
              </span>
              {ratio > 0.01 && !episode.completed ? (
                <span className="cover-progress" style={{ width: `${Math.round(ratio * 100)}%` }} />
              ) : null}
            </button>

            <div className="row-main" onClick={() => onPlay(episode)}>
              <div className="row-title">
                {cleanEpisodeTitle(episode.title)}
                {episode.completed ? <span className="row-topic">已听完</span> : null}
              </div>
              <div className="row-sub">
                <span className="row-artist">{episode.channel}</span>
                <span className="row-dot">·</span>
                <span className="row-time" title={formatDurationLong(episode.duration)}>
                  {formatDuration(episode.duration)}
                </span>
                {episode.publishedAt ? (
                  <>
                    <span className="row-dot">·</span>
                    <span>{formatDate(episode.publishedAt)}</span>
                  </>
                ) : null}
                {episode.progress > 0 && !episode.completed ? (
                  <>
                    <span className="row-dot">·</span>
                    <span className="row-progress">已听 {formatDuration(episode.progress)}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="row-actions">
              <select
                className="select select-mini"
                value={episode.category}
                onChange={(event) => onSetCategory(episode.id, event.target.value)}
                title="移动到分类"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button
                className="icon-btn"
                data-active={episode.favorite}
                onClick={() => onToggleFavorite(episode.id)}
                title={episode.favorite ? '取消收藏' : '收藏'}
              >
                <HeartIcon size={15} filled={episode.favorite} />
              </button>
              <button className="icon-btn" onClick={() => onOpenSource(episode)} title="打开原始链接">
                <LinkIcon size={15} />
              </button>
              <button className="icon-btn" onClick={() => onReveal(episode.id)} title="在文件夹中显示">
                <FolderIcon size={15} />
              </button>
              <button className="icon-btn" onClick={() => onRemove(episode)} title="从缓存中删除">
                <TrashIcon size={15} />
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
