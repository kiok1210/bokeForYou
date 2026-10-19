import { promises as fsp, existsSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type CacheStats,
  type CategoryBucket,
  type ContentMode,
  type Episode,
  type MediaKind
} from '@shared/types'
import { isFinished } from '@shared/portable/playback'
import { isContentMode } from '@shared/modes'
import { allCategoriesOf, categoryById, inferCategoryId } from './catalog'
import { resolveProxyArgs } from './tools'

/** 能当媒体播放的扩展名：音频播客下音频，视频模式会额外落 mp4 */
const MEDIA_EXT = new Set(['.m4a', '.mp3', '.webm', '.opus', '.ogg', '.mp4', '.aac', '.wav', '.flac'])
/** 视频容器：用来判断归集进来的文件属于哪个模式 */
const VIDEO_EXT = new Set(['.mp4'])
const COVER_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])

/**
 * 本地播客库：索引 + 设置 + 缓存目录。
 * 与 musicForYou 的 CacheStore 同源，新增了「分类」「播放进度」两件事。
 */
export class EpisodeStore {
  readonly root: string
  readonly mediaDir: string
  readonly coverDir: string
  readonly transcriptsDir: string
  readonly subsDir: string
  private readonly libraryFile: string
  private readonly settingsFile: string
  private readonly pendingFile: string
  private library: Episode[] = []
  private settings: AppSettings = { ...DEFAULT_SETTINGS }
  /** 还没缓存完就先听到的进度（边听边缓存），入库时补写 */
  private pendingProgress: Record<string, number> = {}
  private writeQueue: Promise<void> = Promise.resolve()

  constructor() {
    this.root = app.getPath('userData')
    this.mediaDir = path.join(this.root, 'media')
    this.coverDir = path.join(this.root, 'covers')
    this.transcriptsDir = path.join(this.root, 'transcripts')
    this.subsDir = path.join(this.root, 'subs')
    this.libraryFile = path.join(this.root, 'library.json')
    this.settingsFile = path.join(this.root, 'settings.json')
    this.pendingFile = path.join(this.root, 'progress.json')
  }

  async init(): Promise<void> {
    await fsp.mkdir(this.mediaDir, { recursive: true })
    await fsp.mkdir(this.coverDir, { recursive: true })
    await fsp.mkdir(this.transcriptsDir, { recursive: true })
    await fsp.mkdir(this.subsDir, { recursive: true })
    // 兼容早期没有这些字段的索引文件：升级前的缓存都是英文播客音频
    this.library = (await this.readJson<Partial<Episode>[]>(this.libraryFile, [])).map((entry) => {
      const mode: ContentMode = isContentMode(entry.mode) ? entry.mode : 'podcast-en'
      const ext = path.extname(entry.fileName ?? '').toLowerCase()
      const kind: MediaKind = entry.kind ?? (VIDEO_EXT.has(ext) ? 'video' : 'audio')
      return {
        ...entry,
        mode,
        kind,
        progress: entry.progress ?? 0,
        completed: entry.completed ?? false,
        publishedAt: entry.publishedAt ?? null,
        viewCount: entry.viewCount ?? null,
        category:
          entry.category || inferCategoryId(`${entry.title ?? ''} ${entry.channel ?? ''}`, mode)
      }
    }) as Episode[]
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.readJson<Partial<AppSettings>>(this.settingsFile, {}))
    }
    this.pendingProgress = await this.readJson<Record<string, number>>(this.pendingFile, {})
    await this.pruneMissing()
  }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      const raw = await fsp.readFile(file, 'utf8')
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  private persist(file: string, value: unknown): void {
    const payload = JSON.stringify(value, null, 2)
    this.writeQueue = this.writeQueue
      .then(() => fsp.writeFile(file, payload, 'utf8'))
      .catch(() => undefined)
  }

  /** 清理索引中已被用户手动删除的文件 */
  private async pruneMissing(): Promise<void> {
    const before = this.library.length
    this.library = this.library.filter((entry) => existsSync(path.join(this.mediaDir, entry.fileName)))
    if (this.library.length !== before) this.persist(this.libraryFile, this.library)
  }

  /**
   * 归集媒体目录里尚未入索引的音频（外部放入、或上次中断遗留）。
   * 标题先以视频 ID 占位，稍后由 hydrate 补齐。
   */
  async reconcile(): Promise<boolean> {
    let entries: string[]
    try {
      entries = await fsp.readdir(this.mediaDir)
    } catch {
      return false
    }
    const knownFiles = new Set(this.library.map((entry) => entry.fileName))
    const knownIds = new Set(this.library.map((entry) => entry.id))
    let changed = false

    for (const name of entries) {
      if (knownFiles.has(name)) continue
      if (name.includes('.part') || name.endsWith('.ytdl') || name.endsWith('.downloading')) continue
      const parsed = path.parse(name)
      const ext = parsed.ext.toLowerCase()
      if (!MEDIA_EXT.has(ext)) continue
      if (knownIds.has(parsed.name)) continue

      const full = path.join(this.mediaDir, name)
      const stat = await fsp.stat(full).catch(() => null)
      if (!stat || stat.size < 8 * 1024) continue

      let coverName: string | null = null
      const coverFile = entries.find(
        (candidate) =>
          path.parse(candidate).name === parsed.name && COVER_EXT.has(path.extname(candidate).toLowerCase())
      )
      if (coverFile) {
        coverName = coverFile
        await fsp
          .rename(path.join(this.mediaDir, coverFile), path.join(this.coverDir, coverFile))
          .catch(() => undefined)
      }

      // 归集过来的文件：mp4 当视频，其余当音频播客
      const kind: MediaKind = VIDEO_EXT.has(ext) ? 'video' : 'audio'
      this.library.push({
        id: parsed.name,
        title: parsed.name,
        channel: '未知节目',
        duration: 0,
        thumbnail: '',
        url: `https://www.youtube.com/watch?v=${parsed.name}`,
        publishedAt: null,
        viewCount: null,
        mode: kind === 'video' ? 'video-long' : 'podcast-en',
        kind,
        fileName: name,
        coverName,
        size: stat.size,
        format: ext.replace('.', ''),
        downloadedAt: stat.mtimeMs || Date.now(),
        favorite: false,
        playCount: 0,
        lastPlayedAt: null,
        category: 'other',
        progress: 0,
        completed: false
      })
      knownIds.add(parsed.name)
      changed = true
    }

    if (changed) this.persist(this.libraryFile, this.library)
    return changed
  }

  /** 标题仍是视频 ID 的条目代表元数据缺失 */
  pendingMetadata(): Episode[] {
    return this.library.filter((entry) => entry.title === entry.id)
  }

  getSettings(): AppSettings {
    return { ...this.settings }
  }

  async saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = { ...this.settings, ...patch }
    this.persist(this.settingsFile, this.settings)
    return this.getSettings()
  }

  /** 传模式时只返回该模式的内容：中文播客与短视频不会混在同一个列表里 */
  listTracks(mode?: ContentMode): Episode[] {
    const scoped = mode ? this.library.filter((entry) => entry.mode === mode) : this.library
    return [...scoped].sort((a, b) => b.downloadedAt - a.downloadedAt)
  }

  findTrack(id: string): Episode | undefined {
    return this.library.find((entry) => entry.id === id)
  }

  hasTrack(id: string): boolean {
    return this.library.some((entry) => entry.id === id)
  }

  /** 按分类聚合缓存内容，空分类不返回（除了「未归类」始终垫底） */
  listBuckets(mode?: ContentMode): CategoryBucket[] {
    const active: ContentMode = mode ?? 'podcast-en'
    const scoped = mode ? this.library.filter((entry) => entry.mode === mode) : this.library
    const buckets = new Map<string, Episode[]>()
    for (const episode of scoped) {
      const list = buckets.get(episode.category) ?? []
      list.push(episode)
      buckets.set(episode.category, list)
    }

    const order = allCategoriesOf(active).map((category) => category.id)
    return [...buckets.entries()]
      .map(([id, episodes]) => ({
        category: categoryById(active, id),
        episodes: [...episodes].sort(
          (a, b) => (b.publishedAt ?? b.downloadedAt) - (a.publishedAt ?? a.downloadedAt)
        ),
        totalDuration: episodes.reduce((sum, episode) => sum + (episode.duration || 0), 0)
      }))
      .sort(
        (a, b) =>
          order.indexOf(categoryById(active, a.category.id).id) -
          order.indexOf(categoryById(active, b.category.id).id)
      )
  }

  /** 扫描下载产物，取出音频文件与封面文件 */
  async inspectArtifacts(
    id: string
  ): Promise<{ fileName: string; coverName: string | null; size: number } | null> {
    let entries: string[]
    try {
      entries = await fsp.readdir(this.mediaDir)
    } catch {
      return null
    }
    let audio: string | null = null
    let cover: string | null = null
    for (const name of entries) {
      if (name.includes('.part') || name.includes('.downloading') || name.endsWith('.ytdl')) continue
      const parsed = path.parse(name)
      if (parsed.name !== id) continue
      const ext = parsed.ext.toLowerCase()
      if (MEDIA_EXT.has(ext)) audio = name
      else if (COVER_EXT.has(ext)) cover = name
    }
    if (!audio) return null
    const stat = await fsp.stat(path.join(this.mediaDir, audio))
    let coverName: string | null = null
    if (cover) {
      coverName = path.basename(cover)
      // 统一搬到 covers 目录，避免媒体目录混杂图片
      try {
        await fsp.rename(path.join(this.mediaDir, cover), path.join(this.coverDir, cover))
      } catch {
        /* 保留原位也可正常工作 */
      }
    }
    return { fileName: audio, coverName, size: stat.size }
  }

  async addTrack(episode: Episode): Promise<Episode[]> {
    // 边听边缓存：下载完成前听到的进度，入库时补上
    const pending = this.pendingProgress[episode.id]
    const merged: Episode =
      pending !== undefined
        ? { ...episode, progress: pending, completed: isFinished(episode.duration, pending) }
        : episode

    const existing = this.library.findIndex((entry) => entry.id === merged.id)
    if (existing >= 0) this.library[existing] = { ...this.library[existing], ...merged }
    else this.library.push(merged)

    if (pending !== undefined) {
      delete this.pendingProgress[merged.id]
      this.persist(this.pendingFile, this.pendingProgress)
    }
    this.persist(this.libraryFile, this.library)
    return this.listTracks()
  }

  async updateTrack(id: string, patch: Partial<Episode>): Promise<Episode | null> {
    const index = this.library.findIndex((entry) => entry.id === id)
    if (index < 0) return null
    this.library[index] = { ...this.library[index], ...patch }
    this.persist(this.libraryFile, this.library)
    return this.library[index]
  }

  /** 记录播放进度：播客的灵魂功能，切走再回来能接着听 */
  async saveProgress(id: string, seconds: number): Promise<Episode | null> {
    const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
    const episode = this.findTrack(id)
    if (!episode) {
      // 边听边缓存：这一集还没入库，先把进度暂存，下载完成后自动补上
      this.pendingProgress[id] = safe
      this.persist(this.pendingFile, this.pendingProgress)
      return null
    }
    return this.updateTrack(id, {
      progress: safe,
      completed: isFinished(episode.duration, safe)
    })
  }

  async markPlayed(id: string, seconds?: number): Promise<Episode | null> {
    const episode = this.findTrack(id)
    if (!episode) return null
    const patch: Partial<Episode> = {
      playCount: episode.playCount + 1,
      lastPlayedAt: Date.now()
    }
    if (typeof seconds === 'number') {
      patch.progress = Math.max(0, Math.floor(seconds))
      patch.completed = isFinished(episode.duration, seconds)
    }
    return this.updateTrack(id, patch)
  }

  async removeTrack(id: string, deleteFile = true): Promise<Episode[]> {
    const index = this.library.findIndex((entry) => entry.id === id)
    if (index >= 0) {
      const [episode] = this.library.splice(index, 1)
      if (deleteFile) {
        await fsp.rm(path.join(this.mediaDir, episode.fileName), { force: true })
        if (episode.coverName) {
          await fsp.rm(path.join(this.coverDir, episode.coverName), { force: true })
          await fsp.rm(path.join(this.mediaDir, episode.coverName), { force: true })
        }
      }
      this.persist(this.libraryFile, this.library)
    }
    return this.listTracks()
  }

  async clearAll(): Promise<Episode[]> {
    const episodes = [...this.library]
    this.library = []
    this.persist(this.libraryFile, this.library)
    for (const episode of episodes) {
      await fsp.rm(path.join(this.mediaDir, episode.fileName), { force: true })
    }
    await fsp.rm(this.coverDir, { recursive: true, force: true })
    await fsp.mkdir(this.coverDir, { recursive: true })
    // 目录里可能残留中断的半成品
    const leftovers = await fsp.readdir(this.mediaDir).catch(() => [] as string[])
    for (const name of leftovers) {
      await fsp.rm(path.join(this.mediaDir, name), { force: true, recursive: true })
    }
    return []
  }

  async stats(): Promise<CacheStats> {
    return {
      count: this.library.length,
      bytes: this.library.reduce((sum, episode) => sum + (episode.size || 0), 0),
      mediaDir: this.mediaDir,
      categories: new Set(this.library.map((episode) => episode.category)).size
    }
  }

  /** 请求参数：按代理模式解析 + cookies */
  async requestArgs(): Promise<string[]> {
    const { args } = await resolveProxyArgs(this.settings.proxyMode, this.settings.proxy)
    const cookie = this.settings.cookieFile.trim()
    if (cookie && existsSync(cookie)) args.push('--cookies', cookie)
    return args
  }
}
