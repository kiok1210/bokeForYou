import type { CustomSource } from '@shared/types'
import { GridIcon, HeadphonesIcon } from './icons'

export interface RailItem {
  key: string
  name: string
  count: number
  accent: string
}

interface CategoryRailProps {
  items: RailItem[]
  total: number
  active: string
  onSelect: (key: string) => void
  sources: CustomSource[]
  activeSource: string | null
  onSelectSource: (source: CustomSource) => void
  onAddSource: () => void
  onRemoveSource: (id: string) => void
}

export function CategoryRail({
  items,
  total,
  active,
  onSelect,
  sources,
  activeSource,
  onSelectSource,
  onAddSource,
  onRemoveSource
}: CategoryRailProps) {
  return (
    <aside className="category-rail">
      <div className="rail-head">
        <GridIcon size={14} />
        分类
      </div>

      <button className="rail-item" data-active={active === 'all'} onClick={() => onSelect('all')}>
        <span className="rail-item-dot" style={{ background: 'var(--gold)' }} />
        <span className="rail-item-name">全部单集</span>
        <span className="rail-item-count">{total}</span>
      </button>

      <div className="rail-list">
        {items.map((item) => (
          <button
            className="rail-item"
            key={item.key}
            data-active={active === item.key}
            onClick={() => onSelect(item.key)}
          >
            <span className="rail-item-dot" style={{ background: item.accent }} />
            <span className="rail-item-name">{item.name}</span>
            <span className="rail-item-count">{item.count}</span>
          </button>
        ))}
      </div>

      <div className="rail-divider" />

      {/* 我的源：用户自建的频道 / 关键词入口 */}
      <div className="rail-head rail-head-row">
        <span>我的源</span>
        <button className="rail-add" onClick={onAddSource} title="添加搜索源">
          ＋
        </button>
      </div>

      <div className="rail-sources">
        {sources.length === 0 ? (
          <div className="rail-empty">
            还没有自定义源
            <br />
            点右上角「＋」把自己常听的节目钉在这里
          </div>
        ) : (
          sources.map((source) => (
            <div
              className="rail-source"
              key={source.id}
              data-active={activeSource === source.id}
            >
              <button className="rail-source-main" onClick={() => onSelectSource(source)}>
                <span className="rail-item-dot" style={{ background: 'var(--ok)' }} />
                <span className="rail-item-name">{source.name}</span>
                <span className="rail-kind">{source.kind === 'link' ? '频道' : '关键词'}</span>
              </button>
              <button
                className="rail-remove"
                onClick={() => onRemoveSource(source.id)}
                title="删除这个源"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="rail-foot">
        <HeadphonesIcon size={13} />
        <span>
          离线可听
          <br />
          缓存自动归类
        </span>
      </div>
    </aside>
  )
}
