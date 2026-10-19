/** 主进程与渲染进程共享的数据结构 */

export type AudioFormat = 'm4a' | 'mp3'

/** 媒介形态：音频播客还是视频 */
export type MediaKind = 'audio' | 'video'

/**
 * 内容模式：一次切换同时决定「语言 / 时长区间 / 媒介形态 / 分类目录」。
 * 具体规格见 shared/modes.ts。
 */
export type ContentMode = 'podcast-zh' | 'podcast-en' | 'video-long' | 'video-short'

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'processing'
  | 'done'
  | 'error'
  | 'canceled'

/** 从 YouTube 解析出的单集元信息 */
export interface EpisodeMeta {
  id: string
  title: string
  /** 节目 / 频道名，播客里比「艺术家」更贴切 */
  channel: string
  duration: number
  thumbnail: string
  url: string
  /** 发布时间（毫秒时间戳），解析不到则为 null */
  publishedAt: number | null
  /** 播放量，用于「热门」排序；拿不到则为 null */
  viewCount: number | null
  /** 检索时所属的内容模式 */
  mode: ContentMode
  /** 音频播客还是视频：决定下载格式与播放方式 */
  kind: MediaKind
  /** 结果来自哪个平台（MediaSource.id）；缺省时按 URL 认源 */
  sourceId?: string
  /** 取流与下载时要带的来源头；抖音的 CDN 就要求它 */
  referer?: string
}

/**
 * 内容平台：一个可搜索 / 可粘贴链接的站点。
 *
 * 与 CustomSource（用户自建的「我的源」）是两回事：这里是平台注册表，
 * 决定「这个域名属于哪站、要不要带凭证、能不能站内搜索」。
 */
export interface MediaSource {
  id: string
  name: string
  /** 站点域名，用于粘贴链接时认出内容来自哪里 */
  hosts: string[]
  /** yt-dlp 站内搜索前缀，如 ytsearch / bilisearch；空串表示不支持搜索 */
  searchKey: string
  home: string
  accent: string
  /** 一句话说明 */
  note: string
  /** 用户自建的平台可删除，内置只读 */
  custom: boolean
  /** 搜索 / 取流 / 下载时额外附加的 yt-dlp 参数（如 --referer） */
  extraArgs?: string[]
  /** 该站要求携带访客指纹（如 B站的 buvid3/buvid4、抖音的 ttwid） */
  fingerprint?: boolean
  /** 登录方式：qrcode 支持应用内扫码，cookie 需要用户自备 cookies.txt */
  auth?: 'qrcode' | 'cookie'
}

/** 自建平台的输入 */
export interface PlatformInput {
  name: string
  hosts: string[]
  searchKey: string
  home: string
}

/**
 * 站点账号状态。
 * 匿名也能搜（B站靠应用自己领取的访客指纹），但会员曲目、需要登录的清晰度
 * 必须有登录态。
 */
export interface SourceAccount {
  loggedIn: boolean
  /** 站点侧的账号 id，字符串化以便各站格式不一 */
  uid: string
  uname: string
  /** 头像地址 */
  avatar: string
  /** 凭证到期时间（毫秒时间戳），0 表示未知 */
  expires: number
}

export const ANONYMOUS_ACCOUNT: SourceAccount = {
  loggedIn: false,
  uid: '',
  uname: '',
  avatar: '',
  expires: 0
}

/** 一张待扫的登录二维码 */
export interface QrTicket {
  /** 轮询用的凭证 */
  key: string
  /** 二维码内容，同时也是手机要打开的授权地址 */
  url: string
  /** 现成的二维码 SVG，UI 直接渲染 */
  svg: string
}

export type QrState = 'waiting' | 'scanned' | 'success' | 'expired'

export interface QrPollResult {
  state: QrState
  account: SourceAccount | null
}

/** 已缓存在本地的单集 */
export interface Episode extends EpisodeMeta {
  fileName: string
  coverName: string | null
  size: number
  format: string
  downloadedAt: number
  favorite: boolean
  playCount: number
  lastPlayedAt: number | null
  /** 所属分类（可手动调整） */
  category: string
  /** 已听到的秒数——播客断点续听 */
  progress: number
  /** 是否已听完 */
  completed: boolean
}

export interface DownloadTask {
  id: string
  meta: EpisodeMeta
  status: DownloadStatus
  /** 0 ~ 1 */
  progress: number
  speed: string
  eta: string
  stage: string
  error?: string
}

/** 用户自定义的搜索源：自己的频道、播放列表或关键词 */
export interface CustomSource {
  id: string
  name: string
  /** 频道 / 播放列表链接，或搜索关键词 */
  query: string
  /** link：按链接展开最新单集；keyword：按关键词搜索 */
  kind: 'link' | 'keyword'
  /** 展示在哪个分类下；'other' 表示不归类 */
  category: string
  createdAt: number
}

/** 新增 / 编辑自定义源的入参 */
export interface SourceInput {
  /** 为空表示新增 */
  id?: string
  name: string
  query: string
  kind: 'link' | 'keyword'
  category: string
}

/** 播放器接受的最小单元：既可以来自本地缓存，也可以是网络流 */
export interface PlayTarget {
  id: string
  title: string
  channel: string
  duration: number
  thumbnail: string
  /** 本地封面文件名（未缓存时为 null） */
  coverName: string | null
  /** media://…（本地文件）或 stream://audio/<id>（边听边缓存） */
  src: string
  /** 是否来自本地缓存，决定进度是否落库 */
  cached: boolean
  /** 视频内容要在播放器里渲染画面而不是封面 */
  kind: MediaKind
  /** 画幅：短视频是竖屏，长视频是横屏，播客是方图 */
  frame: 'square' | 'portrait' | 'landscape'
}

/** 内置的推荐节目（知名英语播客），点一下即可拉取它的最新单集 */
export interface ShowRef {
  id: string
  /** 展示名 */
  name: string
  /** 检索用的频道名 / 关键词 */
  channel: string
  /** 一句话介绍，帮助用户决定听什么 */
  blurb: string
}

/** 内置分类：既是内容组织方式，也是「一键发现」的搜索入口 */
export interface Category {
  id: string
  name: string
  /** 英文描述，作为 UI 副标题 */
  blurb: string
  /** 点击分类时用于搜索 YouTube 的关键词 */
  keywords: string[]
  /** 归类时的特征词（命中标题/频道即归入） */
  markers: string[]
  /** 主题色，用于分类卡与标签 */
  accent: string
  /** 该分类下的精选节目，开箱即有内容可听 */
  shows: ShowRef[]
}

/** 分类 + 其中的单集，供渲染进程直接渲染 */
export interface CategoryBucket {
  category: Category
  episodes: Episode[]
  /** 该分类下已缓存的时长总和（秒） */
  totalDuration: number
}

export interface TranscriptLine {
  /** 起始时间（秒）；-1 表示该行没有时间轴 */
  time: number
  text: string
  /** 中文翻译，无则为 null */
  translation: string | null
}

/** 单集的字幕 / 逐字稿，供听力辅助使用 */
export interface Transcript {
  source: 'youtube' | 'none'
  synced: boolean
  language: string | null
  lines: TranscriptLine[]
  translated: boolean
  note?: string
  fetchedAt: number
}

export interface ToolStatus {
  ytDlpReady: boolean
  ytDlpLabel: string
  ffmpegReady: boolean
  installing: boolean
}

export interface InstallProgress {
  step: string
  ratio: number
}

export interface CacheStats {
  count: number
  bytes: number
  mediaDir: string
  categories: number
}

/** 自动抓取的热门榜 */
export interface TrendingBoard {
  items: EpisodeMeta[]
  fetchedAt: number
  /** 被内容合规过滤掉的条数 */
  blocked: number
  /** live 表示本次联网抓取，cache 表示命中本地缓存 */
  source: 'live' | 'cache'
}

/** 一次检索的结果（含合规过滤统计） */
export interface SearchOutcome {
  items: EpisodeMeta[]
  /** 因命中合规词被剔除的条数 */
  blocked: number
}

/**
 * 代理模式：
 * - auto   跟随系统（含 PAC 自动配置脚本、系统 HTTP/SOCKS 代理）
 * - manual 手动指定地址（http:// / socks5://）
 * - off    强制直连，不经过任何代理
 */
export type ProxyMode = 'auto' | 'manual' | 'off'

/** 界面风格：只影响配色与圆角，不影响布局 */
export type ThemeId = 'vinyl' | 'midnight' | 'forest' | 'sunset'

/** 字幕字号档位 */
export type SubtitleSize = 'sm' | 'md' | 'lg' | 'xl'

export const SUBTITLE_SIZES: SubtitleSize[] = ['sm', 'md', 'lg', 'xl']

export const SUBTITLE_SIZE_LABEL: Record<SubtitleSize, string> = {
  sm: '小',
  md: '中',
  lg: '大',
  xl: '特大'
}

export interface AppSettings {
  /** 界面风格 */
  theme: ThemeId
  /** 当前内容模式：中文播客 / 英文播客 / 长视频 / 短视频 */
  mode: ContentMode
  audioFormat: AudioFormat
  searchLimit: number
  proxyMode: ProxyMode
  proxy: string
  cookieFile: string
  /** 非英语字幕自动附带中文翻译 */
  autoTranslate: boolean
  /** 字幕总开关：关掉之后不显示任何文本，适合纯听力练习 */
  subtitlesEnabled: boolean
  /** 字幕字号 */
  subtitleSize: SubtitleSize
  /** 默认播放速度 */
  playbackRate: number
  /** 跳过片头秒数 */
  skipIntro: number
  /** 记住每个单集的播放进度 */
  resumePlayback: boolean
  /** 下载时按标题/频道自动归类 */
  autoCategorize: boolean
  /**
   * 内容合规过滤：剔除政治、战争、恐怖、色情、赌博、毒品、仇恨与极端等主题。
   * 默认开启，建议保持开启。
   */
  safeMode: boolean
}

/** YouTube 连通性探测结果 */
export interface ProbeResult {
  reachable: boolean
  proxy: string | null
}

export interface AppInfo {
  version: string
  platform: string
  userData: string
}

/** 窗口形态：渲染层据此切换布局（迷你模式只留播放器） */
export interface WindowState {
  fullscreen: boolean
  maximized: boolean
  mini: boolean
  alwaysOnTop: boolean
}

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string }

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'vinyl',
  mode: 'podcast-en',
  audioFormat: 'm4a',
  searchLimit: 18,
  proxyMode: 'auto',
  proxy: '',
  cookieFile: '',
  autoTranslate: true,
  subtitlesEnabled: true,
  subtitleSize: 'md',
  playbackRate: 1,
  skipIntro: 0,
  resumePlayback: true,
  autoCategorize: true,
  safeMode: true
}
