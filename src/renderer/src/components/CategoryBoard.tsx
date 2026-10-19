import type { Category, CategoryBucket, Episode, ShowRef } from '@shared/types'
import { progressRatio } from '@shared/portable/playback'
import {
  cleanEpisodeTitle,
  coverUrl,
  formatDuration,
  formatDurationLong,
  smallThumb
} from '@/utils/format'
import { ChevronRightIcon, PlayIcon, SparkIcon } from './icons'

interface CategoryBoardProps {
  catalog: Category[]
  buckets: CategoryBucket[]
  currentId: string | null
  playing: boolean
  onPlay: (episode: Episode, queue: Episode[]) => void
  onDiscover: (categoryId: string) => void
  onOpenCategory: (categoryId: string) => void
  onSearchShow: (show: ShowRef) => void
}

const PREVIEW_LIMIT = 4

export function CategoryBoard({
  catalog,
  buckets,
  currentId,
  playing,
  onPlay,
  onDiscover,
  onOpenCategory,
  onSearchShow
}: CategoryBoardProps) {
  const byId = new Map(buckets.map((bucket) => [bucket.category.id, bucket]))
  // 有内容的分类排前面，空的排后面，保持「我的库」优先
  const ordered = [...catalog].sort((a, b) => {
    const countA = byId.get(a.id)?.episodes.length ?? 0
    const countB = byId.get(b.id)?.episodes.length ?? 0
    return countB - countA
  })

  return (
    <div className="board">
      {ordered.map((category) => {
        const bucket = byId.get(category.id)
        const episodes = bucket?.episodes ?? []
        const preview = episodes.slice(0, PREVIEW_LIMIT)
        return (
          <section className="board-card" key={category.id}>
            <header className="board-card-head">
              <span className="board-accent" style={{ background: category.accent }} />
              <div className="board-title-wrap">
                <div className="board-title">{category.name}</div>
                <div className="board-meta">
                  {category.blurb}
                  <span className="row-dot">·</span>
                  {episodes.length > 0
                    ? `${episodes.length} 集 · ${formatDurationLong(bucket?.totalDuration ?? 0)}`
                    : '还没有缓存'}
                </div>
              </div>
              <div className="board-actions">
                {episodes.length > 0 ? (
                  <button
                    className="btn btn-sm"
                    onClick={() => onPlay(episodes[0], episodes)}
                    title="从头播放这个分类"
                  >
                    <PlayIcon size={13} />
                    播放全部
                  </button>
                ) : null}
                <button
                  className="btn btn-sm"
                  onClick={() => onDiscover(category.id)}
                  title={`搜索：${category.keywords[0]}`}
                >
                  <SparkIcon size={13} />
                  发现更多
                </button>
              </div>
            </header>

            {preview.length ? (
              <div className="board-list">
                {preview.map((episode) => {
                  const isCurrent = episode.id === currentId
                  const ratio = progressRatio(episode.duration, episode.progress)
                  const cover = coverUrl(episode.coverName, smallThumb(episode.thumbnail))
                  return (
                    <button
                      className="board-row"
                      key={episode.id}
                      data-current={isCurrent}
                      onClick={() => onPlay(episode, episodes)}
                    >
                      <span
                        className="board-row-cover"
                        style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
                      >
                        {isCurrent && playing ? (
                          <span className="equalizer">
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : null}
                        {ratio > 0.01 && !episode.completed ? (
                          <span
                            className="cover-progress"
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        ) : null}
                      </span>
                      <span className="board-row-main">
                        <span className="board-row-title">{cleanEpisodeTitle(episode.title)}</span>
                        <span className="board-row-sub">
                          {episode.channel}
                          <span className="row-dot">·</span>
                          {formatDuration(episode.duration)}
                          {episode.completed ? (
                            <>
                              <span className="row-dot">·</span>
                              已听完
                            </>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  )
                })}
                {episodes.length > PREVIEW_LIMIT ? (
                  <button className="board-more" onClick={() => onOpenCategory(category.id)}>
                    查看全部 {episodes.length} 集
                    <ChevronRightIcon size={13} />
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="board-empty-block">
                <button className="board-empty" onClick={() => onDiscover(category.id)}>
                  还没有「{category.name}」的单集，点这里按英文关键词搜一批
                  <ChevronRightIcon size={13} />
                </button>
                {category.shows.length ? (
                  <div className="board-shows">
                    <span className="board-shows-label">或直接进入精选节目：</span>
                    {category.shows.slice(0, 4).map((show) => (
                      <button
                        className="show-chip"
                        key={show.id}
                        onClick={() => onSearchShow(show)}
                        title={show.blurb}
                      >
                        {show.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
