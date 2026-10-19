import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { CustomSource, SourceInput } from '@shared/types'
import { ToolError } from './tools'
import type { EpisodeStore } from './library'

/**
 * 「我的源」落盘存储。
 *
 * 源可以是频道 / 播放列表链接，也可以是一句关键词：
 * 把自己常听的节目钉在侧栏，点一下就能拉到它的最新单集。
 */
export class SourceStore {
  private items: CustomSource[] = []
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly store: EpisodeStore) {}

  private get file(): string {
    return path.join(this.store.root, 'sources.json')
  }

  async init(): Promise<void> {
    try {
      const raw = await fsp.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as CustomSource[]
      this.items = Array.isArray(parsed) ? parsed : []
    } catch {
      this.items = []
    }
  }

  list(): CustomSource[] {
    return [...this.items].sort((a, b) => b.createdAt - a.createdAt)
  }

  private persist(): void {
    const payload = JSON.stringify(this.items, null, 2)
    this.writeQueue = this.writeQueue
      .then(() => fsp.writeFile(this.file, payload, 'utf8'))
      .catch(() => undefined)
  }

  async upsert(input: SourceInput): Promise<CustomSource[]> {
    const name = String(input.name ?? '').trim()
    const query = String(input.query ?? '').trim()
    if (!name) throw new ToolError('SOURCE_NO_NAME', '请给这个源起个名字')
    if (!query) throw new ToolError('SOURCE_NO_QUERY', '请填写频道链接或搜索关键词')

    const kind: CustomSource['kind'] = input.kind === 'keyword' ? 'keyword' : 'link'
    const existing = input.id ? this.items.find((item) => item.id === input.id) : undefined

    if (existing) {
      existing.name = name
      existing.query = query
      existing.kind = kind
      existing.category = input.category || 'other'
    } else {
      this.items.push({
        id: `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        query,
        kind,
        category: input.category || 'other',
        createdAt: Date.now()
      })
    }

    this.persist()
    return this.list()
  }

  async remove(id: string): Promise<CustomSource[]> {
    this.items = this.items.filter((item) => item.id !== id)
    this.persist()
    return this.list()
  }
}
