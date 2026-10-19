import { promises as fsp, createReadStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { BrowserWindow, app, ipcMain, protocol, session, shell } from 'electron'
import {
  ANONYMOUS_ACCOUNT,
  type Category,
  type ContentMode,
  type EpisodeMeta,
  type IpcResult,
  type ProxyMode,
  type QrPollResult,
  type QrTicket,
  type SearchOutcome,
  type SourceAccount,
  type SourceInput
} from '@shared/types'
import { isContentMode, modeSpec } from '@shared/modes'
import { allCategoriesOf, discoverQuery, inferCategoryId } from './catalog'
import { EpisodeStore } from './library'
import { DownloadManager } from './downloader'
import { fetchTranscript, translateTranscript } from './transcripts'
import { filterSafe } from '@shared/moderation'
import { getTrending } from './trending'
import { SourceStore } from './sources'
import { BilibiliSession } from './bilibili'
import { SiteSession, expandShortLink } from './site-session'
import { resolveDouyinClip } from './douyin'
import { allPlatforms, platformById, platformForUrl } from './platforms'
import { isDouyinNote, parsePastedInput } from '@shared/portable/platforms'
import { handleStreamRequest, resetStreamCache, resolveAudioStream } from './stream'
import {
  destroyTray,
  restoreNormal,
  setAlwaysOnTop,
  setMini,
  setupTray,
  windowState
} from './window'
import {
  ToolError,
  getFfmpegPath,
  getYtDlpRunner,
  installToolchain,
  probeYouTube,
  resetSystemProxyCache
} from './tools'
import {
  looksLikeChannel,
  resolveChannel,
  resolveEpisode,
  searchEpisodes
} from './ytdlp'

const MIME: Record<string, string> = {
  '.m4a': 'audio/mp4',
  // 播客模式产出 m4a/mp3，mp4 只可能来自视频模式，因此直接按视频回传
  '.mp4': 'video/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.webm': 'audio/webm',
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true
    }
  },
  {
    // 边听边缓存：把远端音频流转发给播放器
    scheme: 'stream',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true
    }
  }
])

const store = new EpisodeStore()
const sources = new SourceStore(store)

/**
 * 平台会话：B站（访客指纹 + 扫码登录）、抖音与小红书（匿名凭证）。
 * 凭证发放完全由平台自己的声明驱动（platforms.ts 里的 fingerprint / auth），
 * 这里只负责把实现登记进下面两张表。
 */
const biliSession = new BilibiliSession(store.root, store)

/** 抖音：详情接口要一份新鲜的反爬凭证，ttwid 只由页面脚本写入浏览器 */
const douyinSession = new SiteSession(store, store.root, {
  id: 'douyin',
  pages: ['https://www.douyin.com/'],
  cookieDomain: '.douyin.com',
  referer: 'https://www.douyin.com/',
  required: ['ttwid']
})

/** 小红书：没有非拿不可的 cookie，带上只是更稳 */
const xhsSession = new SiteSession(store, store.root, {
  id: 'xiaohongshu',
  urls: ['https://www.xiaohongshu.com/'],
  cookieDomain: '.xiaohongshu.com',
  referer: 'https://www.xiaohongshu.com/'
})

/**
 * 支持应用内扫码登录的平台实现。
 * 新增一个要登录的平台：实现这个接口、在这里登记，并在 platforms.ts 声明 auth: 'qrcode'。
 */
interface SourceAuth {
  account(): SourceAccount
  refresh(): Promise<SourceAccount>
  startLogin(): Promise<QrTicket>
  pollLogin(key: string): Promise<QrPollResult>
  logout(): Promise<SourceAccount>
}

const AUTH_PROVIDERS: Record<string, SourceAuth> = {
  bilibili: biliSession
}

/** 访客指纹领取器：各站发指纹的方式没有共性，只能逐个实现 */
const FINGERPRINT_PROVIDERS: Record<string, () => Promise<string[]>> = {
  bilibili: async () => ((await biliSession.ensure()) ? biliSession.args() : []),
  douyin: async () => ((await douyinSession.ensure()) ? douyinSession.args() : []),
  xiaohongshu: async () => ((await xhsSession.ensure()) ? xhsSession.args() : [])
}

const downloads = new DownloadManager(store, sourceExtraArgs)
let mainWindow: BrowserWindow | null = null
let installing = false

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): IpcResult<never> {
  return { ok: false, code, message }
}

async function guard<T>(fn: () => Promise<T> | T): Promise<IpcResult<T>> {
  try {
    return ok(await fn())
  } catch (err) {
    if (err instanceof ToolError) return fail(err.code, err.message)
    const message = err instanceof Error ? err.message : String(err)
    return fail('UNKNOWN', message)
  }
}

function requestExtras(): Promise<string[]> {
  return store.requestArgs()
}

/**
 * 只放行网页链接。
 * 私有协议（snssdk1128://、bitbrowser:// 这类）一开就会弹系统的
 * 「需要使用新应用以打开此链接」对话框，用户完全摸不着头脑。
 */
function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 按平台返回附加的 yt-dlp 参数。
 * 判据全部来自平台自己的声明（MediaSource.extraArgs / fingerprint），
 * 不在这里写死站点名——新增一个需要凭证的平台，只要在数据里声明即可。
 */
async function sourceExtraArgs(sourceId?: string): Promise<string[]> {
  const platform = platformById(String(sourceId ?? ''))
  if (!platform) return []
  const extras: string[] = [...(platform.extraArgs ?? [])]
  // 需要访客指纹的平台：领取指纹，并带上与指纹绑定的 UA（两者必须成对出现）
  if (platform.fingerprint) {
    const provider = FINGERPRINT_PROVIDERS[platform.id]
    if (provider) extras.push(...(await provider()))
  }
  return extras
}

/**
 * 组装 yt-dlp 附加参数：通用代理与 cookies 文件，再叠加该平台声明的凭证。
 * 平台的特例处理一律由 sourceExtraArgs 按数据分发，这里不认具体站点。
 */
async function withSourceExtras(input: { sourceId?: string; url?: string }): Promise<string[]> {
  const extras = await requestExtras()
  const id = input.url ? platformForUrl(input.url)?.id : input.sourceId
  return [...extras, ...(await sourceExtraArgs(id))]
}

/** 渲染层传来的模式参数：非法或缺失时回落到设置里记住的模式 */
function resolveMode(value: unknown): ContentMode {
  if (isContentMode(value)) return value
  return modeSpec(store.getSettings().mode).id
}

/**
 * 所有对外检索结果都要过一遍合规过滤，
 * 避免政治、战争、恐怖、色情等内容进入界面与本地缓存。
 */
function applySafety(items: EpisodeMeta[]): SearchOutcome {
  if (!store.getSettings().safeMode) return { items, blocked: 0 }
  const { safe, blocked } = filterSafe(items, (item) => `${item.title} ${item.channel}`)
  return { items: safe, blocked }
}

/**
 * 启动后归集遗留文件，并异步补齐缺失的单集元数据（标题 / 节目名 / 时长）。
 * 网络不通时立刻停止，不阻塞界面。
 */
async function hydrateLibrary(): Promise<void> {
  const adopted = await store.reconcile()
  if (adopted) mainWindow?.webContents.send('library:changed', store.listTracks())

  const pending = store.pendingMetadata()
  if (!pending.length) return

  const extras = await requestExtras()
  const settings = store.getSettings()
  let updated = false

  // 每批 2 个：比串行快一倍，又不会同时开一堆 yt-dlp 进程
  const HYDRATE_CONCURRENCY = 2
  for (let index = 0; index < pending.length; index += HYDRATE_CONCURRENCY) {
    const slice = pending.slice(index, index + HYDRATE_CONCURRENCY)
    const results = await Promise.all(
      slice.map(async (episode) => {
        try {
          const meta = await resolveEpisode(
            `https://www.youtube.com/watch?v=${episode.id}`,
            extras,
            episode.mode
          )
          const current = store.findTrack(episode.id)
          await store.updateTrack(episode.id, {
            title: meta.title,
            channel: meta.channel,
            duration: meta.duration,
            thumbnail: meta.thumbnail,
            url: meta.url || episode.url,
            publishedAt: meta.publishedAt,
            viewCount: meta.viewCount,
            category: settings.autoCategorize
              ? inferCategoryId(`${meta.title} ${meta.channel}`, episode.mode)
              : episode.category
          })
          // 补齐后如果用户已经手动改过播放统计，保留原值
          if (current?.playCount) await store.updateTrack(episode.id, { playCount: current.playCount })
          return true
        } catch {
          return false
        }
      })
    )
    if (results.some(Boolean)) updated = true
    // 整批都失败通常意味着网络不通，别再耗下去
    if (results.every((ok) => !ok)) break
  }
  if (updated) mainWindow?.webContents.send('library:changed', store.listTracks())
}

/** 让 Electron 自身与 yt-dlp 使用同一套代理策略，保证探测结果可信 */
async function applyProxy(mode: ProxyMode, proxy: string): Promise<void> {
  if (mode === 'off') {
    await session.defaultSession.setProxy({ mode: 'direct' })
    return
  }
  const target = mode === 'manual' ? (proxy ?? '').trim() : ''
  if (target) {
    await session.defaultSession.setProxy({ proxyRules: target, proxyBypassRules: '<local>' })
  } else {
    // auto：交给 Chromium 读取系统设置与 PAC 脚本
    await session.defaultSession.setProxy({ mode: 'system' })
  }
}

/**
 * 以流的方式回传文件内容。
 * 之前的实现会把整个音频读进内存（一期播客几十 MB，切几次就吃满），
 * 现在只在需要时读对应区间，内存占用与文件大小无关。
 */
function streamFile(filePath: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  const options = start === undefined ? undefined : { start, end }
  return Readable.toWeb(createReadStream(filePath, options)) as ReadableStream<Uint8Array>
}

/** 用 media:// 自定义协议把本地缓存文件喂给播放器，并支持 Range 拖动 */
function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    const url = new URL(request.url)
    const base = url.hostname === 'cover' ? store.coverDir : store.mediaDir
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const resolved = path.resolve(base, relative)
    if (!resolved.startsWith(path.resolve(base))) {
      return new Response('Forbidden', { status: 403 })
    }
    let stat = await fsp.stat(resolved).catch(() => null)
    let filePath = resolved
    if (!stat && url.hostname === 'cover') {
      // 封面兜底：可能仍留在媒体目录里
      const fallback = path.resolve(store.mediaDir, relative)
      stat = await fsp.stat(fallback).catch(() => null)
      filePath = fallback
    }
    if (!stat) return new Response('Not Found', { status: 404 })

    const total = stat.size
    const mime = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const baseHeaders: Record<string, string> = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600'
    }

    const rangeHeader = request.headers.get('Range')
    if (rangeHeader) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
      let start = match?.[1] ? Number(match[1]) : 0
      let end = match?.[2] ? Number(match[2]) : total - 1
      if (!Number.isFinite(start) || start < 0) start = 0
      if (!Number.isFinite(end) || end >= total) end = total - 1
      if (start > end) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } })
      }
      return new Response(streamFile(filePath, start, end), {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${total}`
        }
      })
    }

    return new Response(streamFile(filePath), {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(total) }
    })
  })
}

/** stream:// 把远端音频边收边喂给播放器，实现「边听边缓存」 */
function registerStreamProtocol(): void {
  protocol.handle('stream', async (request) =>
    handleStreamRequest(request, await requestExtras(), store, sourceExtraArgs)
  )
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 860,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#07090c',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 形态变化统一广播，渲染层据此切换「正常 / 迷你」布局
  const pushState = (): void => {
    if (mainWindow) mainWindow.webContents.send('window:state', windowState(mainWindow))
  }
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true)
    pushState()
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false)
    pushState()
  })
  mainWindow.on('enter-full-screen', pushState)
  mainWindow.on('leave-full-screen', pushState)
  mainWindow.on('always-on-top-changed', pushState)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 只放行网页：私有协议一律拦下，别拿去麻烦系统
    if (isWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  setupTray(mainWindow)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void mainWindow.loadURL(devUrl)
  else void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function broadcastList(): void {
  mainWindow?.webContents.send('dl:list', downloads.list())
}

function registerIpc(): void {
  downloads.on('update', (task) => mainWindow?.webContents.send('dl:update', task))
  downloads.on('list', broadcastList)
  downloads.on('done', (episode) => {
    mainWindow?.webContents.send('library:changed', store.listTracks())
    mainWindow?.webContents.send('dl:done', episode)
    // 后台预取字幕，不阻塞下载流程
    void fetchTranscript(episode, store)
      .then((transcript) => mainWindow?.webContents.send('transcript:ready', { id: episode.id, transcript }))
      .catch(() => undefined)
  })

  ipcMain.handle('tools:status', () =>
    guard(async () => {
      const runner = await getYtDlpRunner()
      const ffmpeg = await getFfmpegPath()
      return {
        ytDlpReady: Boolean(runner),
        ytDlpLabel: runner?.label ?? '未安装',
        ffmpegReady: Boolean(ffmpeg),
        installing
      }
    })
  )

  ipcMain.handle('tools:install', () =>
    guard(async () => {
      if (installing) throw new ToolError('INSTALLING', '组件正在安装中，请稍候')
      installing = true
      try {
        await installToolchain((progress) => {
          mainWindow?.webContents.send('tools:install-progress', progress)
        })
        const runner = await getYtDlpRunner()
        return runner?.label ?? 'ready'
      } finally {
        installing = false
      }
    })
  )

  ipcMain.handle('yt:search', (_event, query: string, limit: number, mode?: string) =>
    guard(async () => {
      const active = resolveMode(mode)
      const trimmed = String(query ?? '').trim()
      if (!trimmed) throw new ToolError('EMPTY_QUERY', '请输入关键词或 YouTube 链接')
      const size = Math.min(Math.max(Number(limit) || 18, 1), 40)
      // 粘贴的可能是链接，也可能是一整段分享文案（抖音、小红书都是「文案 + 链接」混排）
      const pasted = parsePastedInput(trimmed)
      if (pasted) {
        // 短链先展开：小红书的 xsec_token 就藏在跳转结果的 query 里，丢了什么都取不到
        const link = await expandShortLink(pasted, store)
        const platform = platformForUrl(link)
        // 抖音的详情接口要签名参数，yt-dlp 取不到，只能开页面自己算（见 douyin.ts）
        if (platform?.id === 'douyin') {
          if (isDouyinNote(link)) {
            throw new ToolError(
              'DOUYIN_NOTE',
              '这是抖音的图文作品（只有图片、没有音视频），缓存不了。换一条视频作品的链接试试。'
            )
          }
          const clip = await resolveDouyinClip(link, douyinSession)
          return applySafety([
            {
              ...clip,
              sourceId: 'douyin',
              mode: active,
              kind: 'video' as const,
              publishedAt: null,
              viewCount: null
            }
          ])
        }
        const episode = await resolveEpisode(link, await withSourceExtras({ url: link }), active)
        // 来源跟着曲目走：之后试听与下载都用它当初的平台
        return applySafety([{ ...episode, sourceId: episode.sourceId ?? platform?.id }])
      }
      const extras = await requestExtras()
      if (looksLikeChannel(trimmed)) {
        return applySafety(await resolveChannel(trimmed, size, extras, active))
      }
      return applySafety(await searchEpisodes(trimmed, size, extras, active))
    })
  )

  /** 分类发现：用当前模式内置的关键词直接搜一批单集回来 */
  ipcMain.handle(
    'yt:discover',
    (_event, categoryId: string, seed: number, limit: number, mode?: string) =>
      guard(async () => {
        const active = resolveMode(mode)
        const size = Math.min(Math.max(Number(limit) || 18, 1), 40)
        const query = discoverQuery(active, String(categoryId ?? ''), Number(seed) || 0)
        const extras = await requestExtras()
        const episodes = await searchEpisodes(query, size, extras, active)
        return { query, ...applySafety(episodes) }
      })
  )

  /** 热门榜：按模式自动抓取高播放量的安全主题单集，各模式独立缓存 6 小时 */
  ipcMain.handle('yt:trending', (_event, mode?: string, force?: boolean) =>
    guard(async () => getTrending(store, await requestExtras(), resolveMode(mode), Boolean(force)))
  )

  /** 边听边缓存：先解析直链，返回可交给播放器的 stream:// 地址 */
  ipcMain.handle('yt:streamUrl', (_event, id: string, mode?: string) =>
    guard(async () => {
      const active = resolveMode(mode)
      const videoId = String(id ?? '').trim()
      if (!videoId) throw new ToolError('EMPTY_ID', '缺少单集标识')
      if (modeSpec(active).kind === 'video') {
        // 视频体积大、码率波动也大，边看边缓存的体验远不如先缓存再播
        throw new ToolError('STREAM_VIDEO_UNSUPPORTED', '视频模式请先加入缓存，下载完成后再播放')
      }
      await resolveAudioStream(videoId, await requestExtras())
      return { src: `stream://audio/${videoId}` }
    })
  )

  /** 我的源：用户自建的频道 / 关键词入口 */
  ipcMain.handle('sources:list', () => ok(sources.list()))
  ipcMain.handle('sources:save', (_event, input: SourceInput) =>
    guard(() => sources.upsert(input ?? { name: '', query: '', kind: 'link', category: 'other' }))
  )
  ipcMain.handle('sources:remove', (_event, id: string) => guard(() => sources.remove(String(id))))

  ipcMain.handle('yt:resolve', (_event, url: string, mode?: string) =>
    guard(async () => {
      const link = String(url).trim()
      // 平台声明的凭证一并带上（B站的指纹、抖音的 ttwid 等）
      const episode = await resolveEpisode(link, await withSourceExtras({ url: link }), resolveMode(mode))
      return { ...episode, sourceId: episode.sourceId ?? platformForUrl(link)?.id }
    })
  )

  /**
   * 平台登录：按平台分发，未登记的一律当匿名。
   * 没登记的源接口照常可用——不需要登录的平台不该被登录逻辑卡住。
   */
  function authOf(sourceId: unknown): SourceAuth | null {
    return AUTH_PROVIDERS[String(sourceId ?? '')] ?? null
  }

  ipcMain.handle('auth:status', (_event, sourceId: string) => {
    const provider = authOf(sourceId)
    return ok(provider ? provider.account() : ANONYMOUS_ACCOUNT)
  })

  /** 联网复核一次：用户在别处退出、或凭证被收回时这里会翻回未登录 */
  ipcMain.handle('auth:refresh', (_event, sourceId: string) => {
    const provider = authOf(sourceId)
    return provider ? guard(() => provider.refresh()) : ok(ANONYMOUS_ACCOUNT)
  })

  /** 支持扫码登录的平台列表：设置面板据此渲染入口 */
  ipcMain.handle('auth:sources', () => ok(allPlatforms().filter((p) => p.auth === 'qrcode')))

  ipcMain.handle('auth:qrcode', (_event, sourceId: string) => {
    const provider = authOf(sourceId)
    if (!provider) return Promise.resolve(fail('AUTH_UNSUPPORTED', '这个平台不支持应用内扫码登录'))
    return guard(() => provider.startLogin())
  })

  ipcMain.handle('auth:poll', async (_event, sourceId: string, key: string) => {
    const provider = authOf(sourceId)
    if (!provider) return fail('AUTH_UNSUPPORTED', '这个平台不支持应用内扫码登录')
    const result = await guard(() => provider.pollLogin(String(key)))
    if (result.ok && result.data.state === 'success' && result.data.account) {
      // 带上平台，UI 才知道刷哪一行账号
      mainWindow?.webContents.send('auth:login-changed', {
        sourceId: String(sourceId),
        account: result.data.account
      })
    }
    return result
  })

  ipcMain.handle('auth:logout', (_event, sourceId: string) => {
    const provider = authOf(sourceId)
    if (!provider) return Promise.resolve(ok(ANONYMOUS_ACCOUNT))
    return guard(async () => {
      const account = await provider.logout()
      mainWindow?.webContents.send('auth:login-changed', { sourceId: String(sourceId), account })
      return account
    })
  })

  ipcMain.handle('net:probe', () =>
    guard(async () => {
      // 每次探测都重新解析，避免 PAC 脚本内容变化后拿到陈旧结果
      resetSystemProxyCache()
      const current = store.getSettings()
      return probeYouTube(current.proxyMode, current.proxy)
    })
  )

  ipcMain.handle('dl:list', () => ok(downloads.list()))
  ipcMain.handle('dl:enqueue', (_event, meta: EpisodeMeta) => guard(() => downloads.enqueue(meta)))
  ipcMain.handle('dl:cancel', (_event, id: string) =>
    guard(() => {
      downloads.cancel(String(id))
      return true
    })
  )
  ipcMain.handle('dl:clear', (_event, scope: 'finished' | 'all') =>
    guard(() => {
      if (scope === 'all') {
        for (const task of downloads.list()) {
          if (task.status === 'downloading' || task.status === 'queued') downloads.cancel(task.id)
        }
      }
      downloads.clearFinished()
      return downloads.list()
    })
  )

  // 列表与分类看板都按当前模式收窄：中文播客与短视频不会互相串场
  ipcMain.handle('library:list', (_event, mode?: string) =>
    ok(store.listTracks(isContentMode(mode) ? mode : undefined))
  )
  ipcMain.handle('library:buckets', (_event, mode?: string) =>
    ok(store.listBuckets(isContentMode(mode) ? mode : undefined))
  )
  ipcMain.handle('catalog:list', (_event, mode?: string) =>
    ok<Category[]>(allCategoriesOf(resolveMode(mode)))
  )
  ipcMain.handle('library:remove', (_event, id: string, deleteFile: boolean) =>
    guard(() => store.removeTrack(String(id), deleteFile !== false))
  )
  ipcMain.handle('library:toggleFavorite', (_event, id: string) =>
    guard(async () => {
      const episode = store.findTrack(String(id))
      if (!episode) throw new ToolError('NOT_FOUND', '单集不存在')
      await store.updateTrack(episode.id, { favorite: !episode.favorite })
      return store.listTracks()
    })
  )
  ipcMain.handle('library:setCategory', (_event, id: string, category: string) =>
    guard(async () => {
      const episode = store.findTrack(String(id))
      if (!episode) throw new ToolError('NOT_FOUND', '单集不存在')
      return store.updateTrack(episode.id, { category: String(category) })
    })
  )
  ipcMain.handle('library:markPlayed', (_event, id: string, seconds?: number) =>
    guard(async () => store.markPlayed(String(id), typeof seconds === 'number' ? seconds : undefined))
  )
  /** 断点续听：播放过程中定时回写进度 */
  ipcMain.handle('library:saveProgress', (_event, id: string, seconds: number) =>
    guard(async () => store.saveProgress(String(id), Number(seconds)))
  )
  ipcMain.handle('library:reveal', (_event, id: string) =>
    guard(async () => {
      const episode = store.findTrack(String(id))
      if (!episode) throw new ToolError('NOT_FOUND', '单集不存在')
      shell.showItemInFolder(path.join(store.mediaDir, episode.fileName))
      return true
    })
  )

  ipcMain.handle('transcript:get', (_event, id: string, force: boolean) =>
    guard(async () => {
      const episode = store.findTrack(String(id))
      if (!episode) throw new ToolError('NOT_FOUND', '单集不存在')

      // 先返回原文（秒开），中文翻译放后台补齐，完成后经 transcript:ready 推送
      const quick = await fetchTranscript(episode, store, Boolean(force), false)
      if (quick.lines.length && !quick.translated) {
        void translateTranscript(episode, store)
          .then((full) => {
            if (full?.translated) {
              mainWindow?.webContents.send('transcript:ready', {
                id: episode.id,
                transcript: full
              })
            }
          })
          .catch(() => undefined)
      }
      return quick
    })
  )

  ipcMain.handle('settings:get', () => ok(store.getSettings()))
  ipcMain.handle('settings:save', (_event, patch) =>
    guard(async () => {
      const next = await store.saveSettings(patch ?? {})
      // 代理相关变更后重新解析并同步给 Electron 自身
      if (patch && ('proxy' in patch || 'proxyMode' in patch)) {
        resetSystemProxyCache()
        resetStreamCache()
        await applyProxy(next.proxyMode, next.proxy)
      }
      return next
    })
  )

  ipcMain.handle('cache:stats', () => guard(() => store.stats()))
  ipcMain.handle('cache:openDir', () =>
    guard(async () => {
      await shell.openPath(store.mediaDir)
      return store.mediaDir
    })
  )
  ipcMain.handle('cache:clear', () => guard(() => store.clearAll()))

  ipcMain.handle('app:openExternal', (_event, url: string) =>
    guard(async () => {
      const target = String(url)
      // 只打开网页：私有协议会弹系统的「打开方式」对话框
      if (!isWebUrl(target)) throw new ToolError('BAD_URL', '只能打开 http / https 链接')
      await shell.openExternal(target)
      return true
    })
  )
  ipcMain.handle('app:info', () =>
    ok({
      version: app.getVersion(),
      platform: process.platform,
      userData: store.root
    })
  )

  /* ── 窗口形态：全屏 / 正常 / 迷你 / 托盘 / 置顶 ─────── */

  ipcMain.handle('window:state', () => ok(windowState(mainWindow)))

  ipcMain.handle('window:setFullscreen', (_event, value: boolean) => {
    mainWindow?.setFullScreen(Boolean(value))
    return ok(windowState(mainWindow))
  })

  ipcMain.handle('window:toggleFullscreen', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
    return ok(windowState(mainWindow))
  })

  ipcMain.handle('window:setMini', (_event, value: boolean) => {
    if (mainWindow) setMini(mainWindow, Boolean(value))
    return ok(windowState(mainWindow))
  })

  ipcMain.handle('window:restoreNormal', () => {
    if (mainWindow) restoreNormal(mainWindow)
    return ok(windowState(mainWindow))
  })

  ipcMain.handle('window:setAlwaysOnTop', (_event, value: boolean) => {
    if (mainWindow) setAlwaysOnTop(mainWindow, Boolean(value))
    return ok(windowState(mainWindow))
  })

  ipcMain.handle('window:hideToTray', () => {
    mainWindow?.hide()
    return ok(true)
  })

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
    return ok(true)
  })
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return ok(false)
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return ok(mainWindow.isMaximized())
  })
  ipcMain.handle('window:close', () => {
    mainWindow?.close()
    return ok(true)
  })
  ipcMain.handle('window:isMaximized', () => ok(mainWindow?.isMaximized() ?? false))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    await store.init()
    await sources.init()
    const initial = store.getSettings()
    await applyProxy(initial.proxyMode, initial.proxy)
    registerMediaProtocol()
    registerStreamProtocol()
    registerIpc()
    createWindow()

    // 窗口先出来，元数据补齐放到后台
    setTimeout(() => void hydrateLibrary(), 1200)

    // 平台会话后台就绪：访客指纹先领，再复核登录态，都不阻塞首屏
    void (async () => {
      const okBili = await biliSession.ensure()
      console.log(okBili ? '[bilibili] fingerprint ready' : '[bilibili] fingerprint unavailable')
      const account = await biliSession.restore()
      if (account.loggedIn) {
        mainWindow?.webContents.send('auth:login-changed', { sourceId: 'bilibili', account })
      }
    })()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => destroyTray())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
