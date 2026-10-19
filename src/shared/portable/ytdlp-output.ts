/**
 * 可移植模块 · yt-dlp 输出解析
 *
 * 把子进程输出转成结构化进度，把英文报错转成用户能照做的中文提示。
 * 任何用 yt-dlp 做下载的项目都会需要这两件事，不依赖 electron / react / node。
 */

export interface DownloadProgress {
  /** 0 ~ 1；无该字段表示这一行不是进度行 */
  percent?: number
  speed?: string
  eta?: string
}

const PERCENT = /\[download\]\s+([\d.]+)%/
const SPEED = /\bat\s+(.+?\/s)/
const ETA = /ETA\s+([\d:]+)/

/** 解析 yt-dlp 的 `--newline` 进度行，非进度行返回空对象 */
export function parseDownloadProgress(line: string): DownloadProgress {
  if (!line.startsWith('[download]')) return {}
  const info: DownloadProgress = {}
  const percent = PERCENT.exec(line)
  if (percent) info.percent = Number(percent[1]) / 100
  const speed = SPEED.exec(line)
  if (speed) info.speed = speed[1].trim()
  const eta = ETA.exec(line)
  if (eta) info.eta = eta[1]
  return info
}

/** 后处理阶段的标志行：用来把「下载中」切成「转码中 / 写元数据」 */
export function stageOfLine(line: string): 'transcode' | 'metadata' | 'merge' | null {
  if (line.startsWith('[ExtractAudio]')) return 'transcode'
  if (line.startsWith('[Merger]')) return 'merge'
  if (line.startsWith('[Metadata]') || line.startsWith('[EmbedThumbnail]')) return 'metadata'
  return null
}

const RATE_LIMIT = /(\b429\b|too many requests)/i
const NETWORK_ERROR =
  /(failed to resolve|getaddrinfo|name or service not known|temporary failure in name resolution|network is unreachable|no route to host|connection refused|connection reset|connection timed out|unable to connect|unable to download webpage|read timed out|http error 5\d\d|failed to establish|ssl error|certificate)/i
const AUTH_ERROR = /(sign in to confirm|login required|private video|members-only|age-restricted)/i
const GONE_ERROR = /(video unavailable|has been removed|does not exist|not available in your country)/i

/**
 * 把 yt-dlp 的英文报错翻译成可执行的中文提示。
 * 这不是翻译，而是「告诉用户下一步该做什么」。
 */
export function friendlyYtDlpError(raw: string): string {
  const text = raw.trim()
  if (!text) return '未知错误'
  if (RATE_LIMIT.test(text)) return '请求过于频繁（HTTP 429），稍后再试'
  if (NETWORK_ERROR.test(text)) {
    return '无法连接 YouTube。请检查网络，或在「设置」中填写代理地址（例如 http://127.0.0.1:7890）。'
  }
  if (AUTH_ERROR.test(text)) return '该内容需要登录验证。可在「设置」中指定 cookies.txt 后重试。'
  if (GONE_ERROR.test(text)) return '内容不可用或已被删除。'
  return text.replace(/^ERROR:\s*/i, '').slice(0, 220)
}

/** 从多行输出里取出最后一条 ERROR（yt-dlp 会把关键错误放在末尾） */
export function lastErrorLine(output: string): string {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('ERROR:'))
  return lines.length ? lines[lines.length - 1] : ''
}

/** 是否属于「重试可能有效」的临时故障，用于决定要不要写缓存 */
export function isTransientFailure(raw: string): boolean {
  return RATE_LIMIT.test(raw) || /(read timed out|connection reset|connection timed out)/i.test(raw)
}

/** 判断输入是链接还是搜索词 */
export function looksLikeUrl(input: string): boolean {
  return /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(
    input.trim()
  )
}

/** 判断是否是频道 / 播放列表链接（这类链接要展开成多条） */
export function looksLikeCollection(input: string): boolean {
  return /[?&]list=|\/playlist|[?&]channel=|\/channel\/|\/@|\/c\/|\/user\//i.test(input)
}

/** 人类可读的体积，用于「已缓存 · 12.3 MB」这类文案 */
export function humanBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
