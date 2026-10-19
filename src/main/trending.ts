import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { ContentMode, EpisodeMeta, TrendingBoard } from '@shared/types'
import { DEFAULT_MODE } from '@shared/modes'
import { trendingQueries } from './catalog'
import { filterSafe } from '@shared/moderation'
import { ToolError } from './tools'
import type { EpisodeStore } from './library'
import { searchEpisodes } from './ytdlp'

/**
 * 热门榜：自动抓取播放量较高的单集，每种内容模式各有一张榜。
 *
 * 抓取词只从该模式里「已审定的安全分类」取，再叠加内容合规过滤，
 * 因此不会去追时事、政治、战争这类高风险话题的热度。
 * 视频模式还额外受模式自身的时长区间约束（长视频只收 20 分钟以上）。
 */

const CACHE_TTL = 6 * 60 * 60 * 1000
const PER_QUERY = 12
const MAX_ITEMS = 36
/** 同一个节目最多上榜几条，避免整榜被单一频道占满 */
const PER_CHANNEL_LIMIT = 3
/** 并发抓取数：每个 yt-dlp 进程都要占几十 MB，压到 3 个控制内存峰值 */
const CONCURRENCY = 3

interface TrendingCache {
  fetchedAt: number
  blocked: number
  items: EpisodeMeta[]
}

function cacheFile(store: EpisodeStore, mode: ContentMode): string {
  return path.join(store.root, `trending-${mode}.json`)
}

async function readCache(store: EpisodeStore, mode: ContentMode): Promise<TrendingCache | null> {
  try {
    const raw = await fsp.readFile(cacheFile(store, mode), 'utf8')
    const parsed = JSON.parse(raw) as TrendingCache
    return Array.isArray(parsed.items) ? parsed : null
  } catch {
    return null
  }
}

async function writeCache(
  store: EpisodeStore,
  mode: ContentMode,
  data: TrendingCache
): Promise<void> {
  await fsp
    .writeFile(cacheFile(store, mode), JSON.stringify(data, null, 2), 'utf8')
    .catch(() => undefined)
}

/** 分批并发执行，单条失败不影响整体 */
async function runBatched<A, R>(
  items: A[],
  size: number,
  task: (item: A) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let index = 0; index < items.length; index += size) {
    const slice = items.slice(index, index + size)
    const settled = await Promise.allSettled(slice.map(task))
    for (const entry of settled) {
      if (entry.status === 'fulfilled') results.push(entry.value)
    }
  }
  return results
}

function dedupe(items: EpisodeMeta[]): EpisodeMeta[] {
  const seen = new Set<string>()
  const out: EpisodeMeta[] = []
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/** 播放量高的在前；拿不到播放量时保持检索顺序（约等于 YouTube 的相关性排序） */
function sortByHeat(items: EpisodeMeta[]): EpisodeMeta[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff = (b.item.viewCount ?? 0) - (a.item.viewCount ?? 0)
      return diff !== 0 ? diff : a.index - b.index
    })
    .map((entry) => entry.item)
}

function diversify(items: EpisodeMeta[], perChannel: number, limit: number): EpisodeMeta[] {
  const counts = new Map<string, number>()
  const out: EpisodeMeta[] = []
  for (const item of items) {
    const key = item.channel || '未知节目'
    const used = counts.get(key) ?? 0
    if (used >= perChannel) continue
    counts.set(key, used + 1)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

export async function getTrending(
  store: EpisodeStore,
  extras: string[],
  mode: ContentMode = DEFAULT_MODE,
  force = false
): Promise<TrendingBoard> {
  const cached = await readCache(store, mode)
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return { items: cached.items, fetchedAt: cached.fetchedAt, blocked: cached.blocked, source: 'cache' }
  }

  const queries = trendingQueries(mode)
  const batches = await runBatched(queries, CONCURRENCY, (query) =>
    searchEpisodes(query, PER_QUERY, extras, mode)
  )
  const merged = dedupe(batches.flat())

  const safeMode = store.getSettings().safeMode
  const safe = safeMode
    ? filterSafe(merged, (item) => `${item.title} ${item.channel}`)
    : { safe: merged, blocked: 0 }

  if (!safe.safe.length) {
    if (cached) return { ...cached, source: 'cache' }
    throw new ToolError('TRENDING_EMPTY', '暂时拿不到热门榜，请检查网络后重试')
  }

  const items = diversify(sortByHeat(safe.safe), PER_CHANNEL_LIMIT, MAX_ITEMS)
  const board: TrendingBoard = {
    items,
    fetchedAt: Date.now(),
    blocked: safe.blocked,
    source: 'live'
  }
  await writeCache(store, mode, {
    fetchedAt: board.fetchedAt,
    blocked: board.blocked,
    items: board.items
  })
  return board
}
