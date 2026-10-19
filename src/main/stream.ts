import { net } from 'electron'
import { ToolError } from './tools'
import { friendlyMessage, spawnYtDlp } from './ytdlp'
import type { EpisodeStore } from './library'

/**
 * 边听边缓存
 *
 * 用 yt-dlp 只解析出音频直链（`-g`，不下载），由 `stream://` 协议把数据转发给
 * 播放器；同时应用照常把这一集缓存到本地，下次播放就走本地文件。
 */

/** 直链有时效，缓存一小段时间，避免频繁解析 */
const URL_TTL = 30 * 60 * 1000
const urlCache = new Map<string, { url: string; expiresAt: number }>()

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'

export function resetStreamCache(): void {
  urlCache.clear()
}

/** 解析音频直链（不落盘） */
export async function resolveAudioStream(
  videoId: string,
  extras: string[],
  source: { page?: string; referer?: string } = {}
): Promise<string> {
  const hit = urlCache.get(videoId)
  if (hit && Date.now() < hit.expiresAt) return hit.url

  // 用曲目的原始页面地址：换了平台之后拼 YouTube 链接是取不到东西的
  const page = source.page || `https://www.youtube.com/watch?v=${videoId}`
  const { stdout, stderr } = await spawnYtDlp(
    [
      page,
      '-f',
      'bestaudio[ext=m4a]/bestaudio/best',
      '-g',
      '--no-playlist',
      '--no-warnings',
      ...extras
    ],
    { timeoutMs: 25_000 }
  )

  const url = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('http'))
  if (!url) {
    throw new ToolError('STREAM_RESOLVE_FAILED', friendlyMessage(stderr) || '无法解析音频直链')
  }

  urlCache.set(videoId, { url, expiresAt: Date.now() + URL_TTL })
  return url
}

/** stream://audio/<videoId> 的转发实现：透传 Range，边收边喂给播放器 */
export async function handleStreamRequest(
  request: Request,
  extras: string[],
  store: EpisodeStore,
  sourceArgs?: (sourceId?: string) => Promise<string[]>
): Promise<Response> {
  const parsed = new URL(request.url)
  const videoId = decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
  if (!videoId) return new Response('Bad Request', { status: 400 })

  // 播放器带来的来源与页面地址优先（搜索结果还没落库，本地查不到）
  const known = store.findTrack(videoId)
  const sourceId = parsed.searchParams.get('src') ?? known?.sourceId ?? ''
  const page = parsed.searchParams.get('page') ?? known?.url ?? ''
  const referer = parsed.searchParams.get('ref') ?? known?.referer ?? ''
  const allExtras = [...extras, ...((await sourceArgs?.(sourceId)) ?? [])]
  if (referer) allExtras.push('--referer', referer)

  let target: string
  try {
    target = await resolveAudioStream(videoId, allExtras, { page, referer })
  } catch {
    // 地址失效（直链过期）时清掉缓存，让下一次请求重新解析
    urlCache.delete(videoId)
    return new Response('Stream unavailable', { status: 502 })
  }

  const headers: Record<string, string> = { 'User-Agent': UA }
  // 来源头跟着平台走：B站与抖音的 CDN 都只认自家的 Referer
  if (referer) headers['Referer'] = referer
  const range = request.headers.get('Range')
  if (range) headers['Range'] = range

  try {
    const upstream = await net.fetch(target, { headers })
    // 直链被上游拒绝（大多已过期）：清掉缓存，让下一次请求重新解析，
    // 否则播放器会反复拿到同一个失效地址，表现为「点了没反应」。
    if (upstream.status >= 400) {
      urlCache.delete(videoId)
      return new Response('Stream rejected', { status: upstream.status })
    }
    const out = new Headers({
      'Content-Type': upstream.headers.get('content-type') ?? 'audio/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    })
    for (const key of ['content-length', 'content-range']) {
      const value = upstream.headers.get(key)
      if (value) out.set(key, value)
    }
    return new Response(upstream.body, { status: upstream.status, headers: out })
  } catch {
    urlCache.delete(videoId)
    return new Response('Stream failed', { status: 502 })
  }
}
