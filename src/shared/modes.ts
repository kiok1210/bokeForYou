import type { ContentMode, MediaKind } from './types'

/**
 * 内容模式：产品的第一层导航。
 *
 * 一次切换同时决定四件事，用户不需要分别去调：
 * 1. 语言     —— 界面文案、搜索词、字幕语言倾向
 * 2. 时长区间 —— 检索时按单集时长筛选（长视频要 20 分钟以上，短视频要 3 分钟以内）
 * 3. 媒介形态 —— 音频播客（只下音频）还是视频（下视频并渲染画面）
 * 4. 分类目录 —— 见 main/catalog.ts 里按模式组织的那一套
 */

export type FrameShape = 'square' | 'portrait' | 'landscape'

export interface ModeSpec {
  id: ContentMode
  /** 切换器上的完整名称 */
  label: string
  /** 空间紧张时的短名 */
  short: string
  blurb: string
  locale: 'zh' | 'en' | 'mixed'
  kind: MediaKind
  frame: FrameShape
  /** 时长下限（秒），null 表示不限 */
  minSeconds: number | null
  /** 时长上限（秒），null 表示不限 */
  maxSeconds: number | null
  /** 视频清晰度上限，避免短视频模式拉回 4K 撑爆磁盘 */
  maxHeight: number
  accent: string
  /** 搜索框提示语：不同模式该搜什么差别很大 */
  searchPlaceholder: string
  /** 该模式下的内容说明，用在空态与工具栏 */
  hint: string
}

export const MODES: ModeSpec[] = [
  {
    id: 'podcast-zh',
    label: '中文播客',
    short: '中文',
    blurb: '中文长节目 · 商业、科技、人文与生活',
    locale: 'zh',
    kind: 'audio',
    frame: 'square',
    // 5 分钟以下多是碎片，过滤掉能让「我的单集」保持干净
    minSeconds: 300,
    maxSeconds: null,
    maxHeight: 720,
    accent: '#e0705f',
    searchPlaceholder: '搜索中文节目名、嘉宾或话题，也可直接粘贴节目链接',
    hint: '中文播客以口播访谈为主，适合通勤与做家务时听'
  },
  {
    id: 'podcast-en',
    label: '英文播客',
    short: '英文',
    blurb: '英语长节目 · 听力练习与知识输入',
    locale: 'en',
    kind: 'audio',
    frame: 'square',
    minSeconds: 300,
    maxSeconds: null,
    maxHeight: 720,
    accent: '#6ea8fe',
    searchPlaceholder: 'Search English shows, guests or topics — or paste a show link',
    hint: '英文播客默认带逐字稿与中文翻译，适合精听'
  },
  {
    id: 'video-long',
    label: '长视频模式',
    short: '长视频',
    // 时长区间由 durationRangeLabel 统一给出，这里不再重复
    blurb: '讲座、纪录片与深度长访谈',
    locale: 'mixed',
    kind: 'video',
    frame: 'landscape',
    // 20 分钟起步，把讲解类短片和带货内容挡在外面
    minSeconds: 1200,
    maxSeconds: null,
    maxHeight: 1080,
    accent: '#c58cf0',
    searchPlaceholder: '搜索讲座、纪录片或长访谈（20 分钟以上）',
    hint: '长视频会连画面一起缓存，下载体积明显更大，建议先看时长再入队'
  },
  {
    id: 'video-short',
    label: '短视频模式',
    short: '短视频',
    blurb: '知识碎片与口语跟练',
    locale: 'mixed',
    kind: 'video',
    frame: 'portrait',
    // 只收 3 分钟以内；时长拿不到的条目一律不收，避免混进长片
    minSeconds: null,
    maxSeconds: 180,
    maxHeight: 1080,
    accent: '#4fd1c5',
    searchPlaceholder: '搜索 3 分钟以内的短视频，例如口语跟练、知识碎片',
    hint: '短视频按竖屏渲染，适合用「放大播客主体」当成刷片窗口'
  }
]

export const DEFAULT_MODE: ContentMode = 'podcast-en'

const MODE_MAP = new Map<string, ModeSpec>(MODES.map((mode) => [mode.id, mode]))

export function isContentMode(value: unknown): value is ContentMode {
  return typeof value === 'string' && MODE_MAP.has(value)
}

/** 取模式规格；未知或缺失时回落到默认模式，保证老数据也能打开 */
export function modeSpec(id: string | null | undefined): ModeSpec {
  const found = id ? MODE_MAP.get(id) : undefined
  return found ?? MODE_MAP.get(DEFAULT_MODE)!
}

/** 时长是否落在模式的区间内 */
export function inDurationRange(duration: number, spec: ModeSpec): boolean {
  const seconds = Number(duration) || 0
  // 时长未知时：短视频模式一律不收（无法确认是短片），其余模式放行
  if (seconds <= 0) return spec.maxSeconds === null
  if (spec.minSeconds !== null && seconds < spec.minSeconds) return false
  if (spec.maxSeconds !== null && seconds > spec.maxSeconds) return false
  return true
}

/** 时长区间的中文描述，界面上用来解释「为什么这条没出现」 */
export function durationRangeLabel(spec: ModeSpec): string {
  if (spec.minSeconds !== null && spec.maxSeconds !== null) {
    return `${Math.round(spec.minSeconds / 60)}~${Math.round(spec.maxSeconds / 60)} 分钟`
  }
  if (spec.minSeconds !== null) return `${Math.round(spec.minSeconds / 60)} 分钟以上`
  if (spec.maxSeconds !== null) return `${Math.round(spec.maxSeconds / 60)} 分钟以内`
  return '不限时长'
}
