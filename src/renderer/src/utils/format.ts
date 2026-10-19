import type { Episode, EpisodeMeta, PlayTarget } from '@shared/types'
import { modeSpec } from '@shared/modes'

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 播客时长偏爱「1 小时 12 分」这种口语说法 */
export function formatDurationLong(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.round((total % 3600) / 60)
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
  return `${Math.max(1, m)} 分钟`
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatRelative(timestamp: number | null): string {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

export function formatDate(timestamp: number | null): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

export function mediaUrl(fileName: string): string {
  return `media://local/${encodeURIComponent(fileName)}`
}

export function coverUrl(coverName: string | null, fallback: string): string {
  return coverName ? `media://cover/${encodeURIComponent(coverName)}` : fallback
}

/**
 * 列表用的缩略图降到 320×180。
 * yt-dlp 给的常是 1280×720 的大图，几十条列表一起解码会白占十几 MB 内存。
 */
export function smallThumb(url: string): string {
  if (!url) return url
  const matched = /^https:\/\/i\.ytimg\.com\/vi\/([\w-]+)\//.exec(url)
  return matched ? `https://i.ytimg.com/vi/${matched[1]}/mqdefault.jpg` : url
}

/* ── 播放目标 ─────────────────────────────────────────── */

/** 本地缓存单集 → 播放目标 */
export function toPlayTarget(episode: Episode): PlayTarget {
  const spec = modeSpec(episode.mode)
  return {
    id: episode.id,
    title: episode.title,
    channel: episode.channel,
    duration: episode.duration,
    thumbnail: episode.thumbnail,
    coverName: episode.coverName,
    src: mediaUrl(episode.fileName),
    cached: true,
    kind: episode.kind ?? spec.kind,
    frame: spec.frame
  }
}

/** 尚未缓存的单集 → 播放目标（边走流边缓存） */
export function toStreamTarget(meta: EpisodeMeta): PlayTarget {
  const spec = modeSpec(meta.mode)
  // 来源、页面地址与来源头一并带上：主进程才知道用哪个平台的参数去解析直链
  const params = new URLSearchParams()
  if (meta.sourceId) params.set('src', meta.sourceId)
  if (meta.url) params.set('page', meta.url)
  if (meta.referer) params.set('ref', meta.referer)
  const query = params.toString()
  return {
    id: meta.id,
    title: meta.title,
    channel: meta.channel,
    duration: meta.duration,
    thumbnail: meta.thumbnail,
    coverName: null,
    src: `stream://audio/${meta.id}${query ? `?${query}` : ''}`,
    cached: false,
    kind: spec.kind,
    frame: spec.frame
  }
}

/** 去掉播客标题里常见的包装噪声，让单集标题更干净 */
export function cleanEpisodeTitle(raw: string): string {
  return raw
    .replace(/\((?:official\s*)?(?:full\s*)?(?:episode|video|audio|podcast|interview)\)/gi, '')
    .replace(/\[(?:official\s*)?(?:full\s*)?(?:episode|video|audio|podcast|interview)\]/gi, '')
    .replace(/【[^】]{0,20}】/g, '')
    .replace(/\s*[-–|]\s*(?:official\s*)?(?:audio|video|podcast)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
