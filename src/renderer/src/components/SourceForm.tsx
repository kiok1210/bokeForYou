import { useEffect, useState } from 'react'
import type { Category, CustomSource, SourceInput } from '@shared/types'
import { CloseIcon } from './icons'

interface SourceFormProps {
  categories: Category[]
  /** 传入表示编辑，null 表示新增 */
  editing: CustomSource | null
  onSave: (input: SourceInput) => void
  onClose: () => void
}

/** 自定义搜索源表单：频道 / 播放列表链接 或 关键词 */
export function SourceForm({ categories, editing, onSave, onClose }: SourceFormProps) {
  const [name, setName] = useState(editing?.name ?? '')
  const [query, setQuery] = useState(editing?.query ?? '')
  const [kind, setKind] = useState<'link' | 'keyword'>(editing?.kind ?? 'link')
  const [category, setCategory] = useState(editing?.category ?? 'other')

  // 输入里出现链接就自动切到「频道 / 列表」，省得用户再选一次
  useEffect(() => {
    if (/(https?:\/\/|www\.)|youtube\.com|youtu\.be/i.test(query)) setKind('link')
  }, [query])

  const valid = name.trim().length > 0 && query.trim().length > 0

  const submit = (): void => {
    if (!valid) return
    onSave({
      id: editing?.id,
      name: name.trim(),
      query: query.trim(),
      kind,
      category
    })
  }

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <section className="source-form">
        <header className="settings-head">
          <h3>{editing ? '编辑搜索源' : '添加搜索源'}</h3>
          <button className="icon-btn" onClick={onClose} title="关闭">
            <CloseIcon size={15} />
          </button>
        </header>

        <div className="settings-group">
          <label className="settings-label">名称</label>
          <input
            className="field"
            style={{ width: '100%', height: 34 }}
            placeholder="例如：Lex Fridman 播客"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="settings-group">
          <label className="settings-label">频道链接 / 播放列表 / 关键词</label>
          <input
            className="field"
            style={{ width: '100%', height: 34 }}
            placeholder="https://www.youtube.com/@lexfridman 或 english listening practice"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
          />
          <div className="settings-note">
            {kind === 'link'
              ? '链接模式：每次点击都拉取该频道 / 播放列表的最新单集。'
              : '关键词模式：每次点击都用这句话去检索，适合「英语听力」「AI 访谈」这类主题。'}
          </div>
        </div>

        <div className="settings-group">
          <label className="settings-label">类型</label>
          <div className="segmented">
            <button
              className="segment"
              data-active={kind === 'link'}
              onClick={() => setKind('link')}
            >
              频道 / 列表
            </button>
            <button
              className="segment"
              data-active={kind === 'keyword'}
              onClick={() => setKind('keyword')}
            >
              关键词
            </button>
          </div>
        </div>

        <div className="settings-group">
          <label className="settings-label">归到分类</label>
          <select
            className="select"
            style={{ width: '100%' }}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="other">不归类</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={submit} disabled={!valid}>
            {editing ? '保存' : '添加'}
          </button>
          <button className="btn btn-sm" onClick={onClose}>
            取消
          </button>
        </div>
      </section>
    </>
  )
}
