import type { Category, ShowRef } from '@shared/types'
import { HeadphonesIcon, SearchIcon, SparkIcon } from './icons'

interface CategorySpotlightProps {
  category: Category
  cachedCount: number
  cachedDuration: string
  onDiscover: () => void
  onSearchShow: (show: ShowRef) => void
  onPlayCached: () => void
}

/**
 * 分类聚焦区：进到某个分类后，先给用户「不知道听什么」的解法——
 * 一键搜热门 + 一批精选节目。
 */
export function CategorySpotlight({
  category,
  cachedCount,
  cachedDuration,
  onDiscover,
  onSearchShow,
  onPlayCached
}: CategorySpotlightProps) {
  return (
    <section className="spotlight">
      <div className="spotlight-head">
        <span className="spotlight-accent" style={{ background: category.accent }} />
        <div className="spotlight-title-wrap">
          <div className="spotlight-title">{category.name}</div>
          <div className="spotlight-blurb">
            {category.blurb}
            <span className="row-dot">·</span>
            {cachedCount > 0 ? `已缓存 ${cachedCount} 集 · ${cachedDuration}` : '还没有缓存'}
          </div>
        </div>
        <div className="spotlight-actions">
          {cachedCount > 0 ? (
            <button className="btn btn-sm" onClick={onPlayCached}>
              <HeadphonesIcon size={13} />
              播放已缓存
            </button>
          ) : null}
          <button className="btn btn-primary" onClick={onDiscover}>
            <SparkIcon size={14} />
            搜索「{category.name}」热门
          </button>
        </div>
      </div>

      <div className="spotlight-section-title">
        精选节目
        <span className="spotlight-hint">点节目名，拉取它的最新单集</span>
      </div>

      <div className="show-grid">
        {category.shows.map((show) => (
          <button className="show-card" key={show.id} onClick={() => onSearchShow(show)}>
            <span className="show-go">
              <SearchIcon size={13} />
            </span>
            <span className="show-name">{show.name}</span>
            <span className="show-blurb">{show.blurb}</span>
          </button>
        ))}
      </div>

      {category.shows.length === 0 ? (
        <div className="spotlight-empty">这个分类还没有精选节目，点「搜索热门」试试。</div>
      ) : null}
    </section>
  )
}
