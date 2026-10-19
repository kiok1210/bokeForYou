import { spawn, type ChildProcess } from 'node:child_process'
import type { ContentMode, EpisodeMeta } from '@shared/types'
import { DEFAULT_MODE, inDurationRange, modeSpec } from '@shared/modes'
import { ToolError, getYtDlpRunner } from './tools'

export interface RunResult {
  stdout: string
  stderr: string
  code: number
  timedOut: boolean
}

export interface RunOptions {
  onLine?: (line: string) => void
  onSpawn?: (child: ChildProcess) => void
  timeoutMs?: number
}

/** 元数据请求的硬超时：连不上就尽快反馈，不让界面空转 */
const SEARCH_TIMEOUT = 12_000
const RESOLVE_TIMEOUT = 10_000
const CHANNEL_TIMEOUT = 25_000

/** socket 层 5 秒无响应即断，且不重试 */
const METADATA_ARGS = ['--socket-timeout', '5', '--retries', '0', '--extractor-retries', '0']

const NETWORK_PATTERN =
  /(failed to resolve|getaddrinfo|name or service not known|temporary failure in name resolution|network is unreachable|no route to host|connection refused|connection reset|connection timed out|unable to connect|unable to download webpage|read timed out|http error 5\d\d|failed to establish|ssl|certificate)/i

const SIGN_IN_PATTERN = /(sign in to confirm|login required|private video|members-only|age-restricted)/i

/** 把 yt-dlp 的英文报错翻译成可执行的中文提示 */
export function friendlyMessage(raw: string): string {
  const text = raw.trim()
  if (!text) return '未知错误'
  if (NETWORK_PATTERN.test(text)) {
    return '无法连接 YouTube。请检查网络，或在「设置」中填写代理地址（例如 http://127.0.0.1:7890）。'
  }
  if (SIGN_IN_PATTERN.test(text)) {
    return '该单集需要登录验证。可在「设置」中指定 cookies.txt 文件后重试。'
  }
  if (/video unavailable|has been removed|does not exist/i.test(text)) {
    return '单集不可用或已被删除。'
  }
  return text.replace(/^ERROR:\s*/i, '').slice(0, 220)
}

/** 按行切分子进程输出，避免一条日志被拆到两个 chunk */
function makeLineSplitter(emit: (line: string) => void): (chunk: string) => void {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '')
      buffer = buffer.slice(index + 1)
      if (line.trim()) emit(line)
      index = buffer.indexOf('\n')
    }
  }
}

export async function spawnYtDlp(args: string[], options: RunOptions = {}): Promise<RunResult> {
  const runner = await getYtDlpRunner()
  if (!runner) {
    throw new ToolError('YTDLP_MISSING', '未找到下载核心，请先在右上角初始化组件')
  }
  return new Promise((resolve, reject) => {
    const child = spawn(runner.command, [...runner.prefix, ...args], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ...runner.env }
    })
    options.onSpawn?.(child)

    let stdout = ''
    let stderr = ''
    let timedOut = false
    const splitOut = makeLineSplitter((line) => options.onLine?.(line))
    const splitErr = makeLineSplitter((line) => options.onLine?.(line))

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill()
        }, options.timeoutMs)
      : null

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
      splitOut(chunk)
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      splitErr(chunk)
    })
    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(new ToolError('YTDLP_SPAWN_FAILED', err.message))
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr, code: code ?? -1, timedOut })
    })
  })
}

interface RawEntry {
  id?: string
  title?: string
  duration?: number
  uploader?: string
  channel?: string
  creator?: string
  playlist_uploader?: string
  webpage_url?: string
  url?: string
  thumbnail?: string
  thumbnails?: { url?: string; width?: number; height?: number }[]
  timestamp?: number | null
  release_timestamp?: number | null
  upload_date?: string | null
  view_count?: number | null
  entries?: RawEntry[]
}

function pickThumbnail(entry: RawEntry, id: string): string {
  if (Array.isArray(entry.thumbnails) && entry.thumbnails.length) {
    const best = [...entry.thumbnails]
      .filter((t) => Boolean(t.url))
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
    if (best?.url) return best.url
  }
  if (typeof entry.thumbnail === 'string' && entry.thumbnail) return entry.thumbnail
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : ''
}

/** 优先用 timestamp，其次 release_timestamp，最后解析 upload_date(YYYYMMDD) */
function pickPublishedAt(entry: RawEntry): number | null {
  const stamp = entry.timestamp ?? entry.release_timestamp
  if (typeof stamp === 'number' && stamp > 0) return stamp * 1000
  const date = entry.upload_date
  if (typeof date === 'string' && /^\d{8}$/.test(date)) {
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00`
    const parsed = Date.parse(iso)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toMeta(entry: RawEntry, mode: ContentMode, fallbackChannel = ''): EpisodeMeta {
  const id = String(entry.id ?? '')
  const channel =
    entry.channel ??
    entry.uploader ??
    entry.playlist_uploader ??
    entry.creator ??
    (fallbackChannel || '未知节目')
  return {
    id,
    title: String(entry.title ?? '未知单集'),
    channel: String(channel).replace(/\s*-\s*Topic$/i, '').trim() || '未知节目',
    duration: Number(entry.duration ?? 0) || 0,
    thumbnail: pickThumbnail(entry, id),
    url: String(entry.webpage_url ?? entry.url ?? `https://www.youtube.com/watch?v=${id}`),
    publishedAt: pickPublishedAt(entry),
    viewCount: typeof entry.view_count === 'number' && entry.view_count >= 0 ? entry.view_count : null,
    mode,
    kind: modeSpec(mode).kind
  }
}

function lastError(stderr: string, stdout: string): string {
  const source = `${stderr}\n${stdout}`
  const lines = source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('ERROR:') || /^WARNING:.*(unable|failed)/i.test(l))
  if (lines.length) return lines[lines.length - 1]
  const tail = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop()
  return tail ?? ''
}

function parseEntries(stdout: string): RawEntry[] {
  const raw = JSON.parse(stdout) as RawEntry
  if (Array.isArray(raw.entries)) return raw.entries
  // 频道 / 播放列表有时会包一层 playlist，也可能直接是单个条目
  if (raw.id && raw.title) return [raw]
  return []
}

/**
 * 关键词搜索单集（走 ytsearch，扁平解析，速度快）。
 *
 * 模式带时长约束时（长视频 / 短视频）先多取几倍结果，再按时长筛选；
 * 筛完不够条数就放宽补齐，避免严格过滤后界面一片空白。
 */
export async function searchEpisodes(
  query: string,
  limit: number,
  extra: string[] = [],
  mode: ContentMode = DEFAULT_MODE
): Promise<EpisodeMeta[]> {
  const spec = modeSpec(mode)
  const bounded = spec.minSeconds !== null || spec.maxSeconds !== null
  const requestSize = bounded ? Math.min(Math.max(limit * 3, 24), 60) : limit
  const args = [
    `ytsearch${requestSize}:${query}`,
    '--dump-single-json',
    '--flat-playlist',
    '--skip-download',
    '--no-warnings',
    '--ignore-errors',
    ...METADATA_ARGS,
    ...extra
  ]
  const { stdout, stderr, timedOut } = await spawnYtDlp(args, { timeoutMs: SEARCH_TIMEOUT })
  if (timedOut) {
    throw new ToolError('YT_TIMEOUT', '无法连接 YouTube，请检查网络或在「设置」中配置代理。')
  }
  if (!stdout.trim()) {
    throw new ToolError('YT_SEARCH_FAILED', friendlyMessage(lastError(stderr, stdout)))
  }
  let entries: RawEntry[]
  try {
    entries = parseEntries(stdout)
  } catch {
    throw new ToolError('YT_SEARCH_FAILED', '返回数据解析失败，请重试')
  }
  const metas = entries.filter((entry) => entry && entry.id).map((entry) => toMeta(entry, mode))
  if (!metas.length) throw new ToolError('YT_SEARCH_EMPTY', '没有找到匹配的单集')
  if (!bounded) return metas.slice(0, limit)

  const within = metas.filter((meta) => inDurationRange(meta.duration, spec))
  if (within.length >= Math.min(limit, 6)) return within.slice(0, limit)
  const picked = new Set(within)
  return [...within, ...metas.filter((meta) => !picked.has(meta))].slice(0, limit)
}

/** 解析单个视频的信息 */
export async function resolveEpisode(
  url: string,
  extra: string[] = [],
  mode: ContentMode = DEFAULT_MODE
): Promise<EpisodeMeta> {
  const args = [
    url,
    '--dump-single-json',
    '--no-playlist',
    '--skip-download',
    '--no-warnings',
    ...METADATA_ARGS,
    ...extra
  ]
  const { stdout, stderr, timedOut } = await spawnYtDlp(args, { timeoutMs: RESOLVE_TIMEOUT })
  if (timedOut) {
    throw new ToolError('YT_TIMEOUT', '无法连接 YouTube，请检查网络或在「设置」中配置代理。')
  }
  if (!stdout.trim()) {
    throw new ToolError('YT_RESOLVE_FAILED', friendlyMessage(lastError(stderr, stdout)))
  }
  try {
    return toMeta(JSON.parse(stdout) as RawEntry, mode)
  } catch {
    throw new ToolError('YT_RESOLVE_FAILED', '返回数据解析失败，请重试')
  }
}

/**
 * 把一个频道 / 播放列表展开成「最近 N 条单集」。
 * 这是播客场景的关键一步：用户粘一个节目主页，就能批量看到更新。
 */
export async function resolveChannel(
  url: string,
  limit: number,
  extra: string[] = [],
  mode: ContentMode = DEFAULT_MODE
): Promise<EpisodeMeta[]> {
  const args = [
    url,
    '--dump-single-json',
    '--flat-playlist',
    '--skip-download',
    '--playlist-end',
    String(Math.min(Math.max(limit, 1), 60)),
    '--no-warnings',
    '--ignore-errors',
    ...METADATA_ARGS,
    ...extra
  ]
  const { stdout, stderr, timedOut } = await spawnYtDlp(args, { timeoutMs: CHANNEL_TIMEOUT })
  if (timedOut) {
    throw new ToolError('YT_TIMEOUT', '展开节目列表超时，请检查网络后重试。')
  }
  if (!stdout.trim()) {
    throw new ToolError('YT_CHANNEL_FAILED', friendlyMessage(lastError(stderr, stdout)))
  }
  let raw: RawEntry
  try {
    raw = JSON.parse(stdout) as RawEntry
  } catch {
    throw new ToolError('YT_CHANNEL_FAILED', '返回数据解析失败，请重试')
  }
  const channelName = String(raw.channel ?? raw.uploader ?? raw.playlist_uploader ?? '').trim()
  const entries = Array.isArray(raw.entries) ? raw.entries : []
  const metas = entries
    .filter((entry) => entry && entry.id)
    .map((entry) => toMeta(entry, mode, channelName))
  if (!metas.length) {
    // 有些链接其实是单集，退化为单条解析
    return [await resolveEpisode(url, extra, mode)]
  }
  return metas
}

/** 判断输入是链接还是搜索词 */
export function looksLikeUrl(input: string): boolean {
  return /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(
    input.trim()
  )
}

/** 判断链接指向的是「节目主页 / 播放列表」而不是单个视频 */
export function looksLikeChannel(input: string): boolean {
  const text = input.trim()
  if (!looksLikeUrl(text)) return false
  if (/[?&]list=/i.test(text)) return true
  if (/\/playlist|\/channel\/|\/c\/|\/user\/|\/podcast/i.test(text)) return true
  if (/youtube\.com\/@[^/?#]+/i.test(text)) return true
  return false
}
