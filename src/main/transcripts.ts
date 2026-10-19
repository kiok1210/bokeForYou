import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { session } from 'electron'
import type { Episode, Transcript, TranscriptLine } from '@shared/types'
import type { EpisodeStore } from './library'
import { resolveProxyArgs } from './tools'
import { spawnYtDlp } from './ytdlp'

/**
 * 逐字稿 / 字幕：把 YouTube 自带字幕变成「可跟读、可对照翻译」的听力材料。
 * 与 musicForYou 的 lyrics.ts 同源，去掉了歌词库匹配（播客没有 LRCLIB），
 * 并调整了语言优先级——英语原声优先于中文。
 */

/** 翻译接口对非浏览器 UA 会直接 429，这里统一用常见的浏览器 UA */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'
/** 空结果的缓存有效期：过期后自动重试，避免一次失败被永久记住 */
const EMPTY_CACHE_TTL = 12 * 60 * 60 * 1000
const VTT_TIME = /(\d{2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{1,3})/
/** 单批翻译的字符上限，避免 URL 过长被拒 */
const TRANSLATE_BATCH_CHARS = 900
/** 单次逐字稿的翻译总量上限：免费接口配额有限，长节目只翻前一段 */
const MAX_TRANSLATE_CHARS = 12000
/** 翻译请求的并发批次数量 */
const TRANSLATE_CONCURRENCY = 3
/** 缓存里标记「译文还没补齐」的说明文字 */
const PENDING_NOTE = '正在翻译中文对照…'
/** 下载语言：英语原文 + 中文（YouTube 若提供 zh-Hans 自动翻译轨，可直接当译文用） */
const SUB_LANGS = 'en,en-orig,zh-Hans,zh-CN'

/* ── 解析 ─────────────────────────────────────────────── */

function cleanVttText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

interface RawCue {
  time: number
  /** cue 内的文本行（已去掉逐词时间标记），保持显示顺序 */
  lines: string[]
}

function parseCues(raw: string): RawCue[] {
  const cues: RawCue[] = []
  let pendingTime: number | null = null
  let buffer: string[] = []

  const flush = (): void => {
    if (pendingTime === null) return
    const time = pendingTime
    const lines = buffer.map((line) => cleanVttText(line)).filter(Boolean)
    pendingTime = null
    buffer = []
    if (lines.length) cues.push({ time, lines })
  }

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    const timeMatch = VTT_TIME.exec(line)
    if (timeMatch) {
      flush()
      pendingTime =
        Number(timeMatch[1]) * 3600 +
        Number(timeMatch[2]) * 60 +
        Number(timeMatch[3]) +
        Number(`0.${String(timeMatch[4]).padStart(3, '0').slice(0, 3)}`)
      continue
    }
    if (!line) {
      flush()
      continue
    }
    if (/^(WEBVTT|NOTE|STYLE|Kind:|Language:|X-TIMESTAMP)/i.test(line)) continue
    if (pendingTime === null) continue
    buffer.push(line)
  }
  flush()
  return cues
}

/**
 * 解析 WebVTT 字幕。
 *
 * YouTube 自动字幕的 cue 是「上一句的滚动残影 + 新句」这种两行结构，
 * 逐行拼接会让同一句话重复出现好几次（6 分钟音频能撑出两千多行）。
 * 这里按 cue 判断：当第二行的开头等于上一条 cue 的末行时，说明它是残影，
 * 只保留新句；普通的两行字幕（一句话换行显示）不受影响。
 */
export function parseVtt(raw: string): TranscriptLine[] {
  const out: TranscriptLine[] = []
  let prevLastLine: string | null = null

  for (const cue of parseCues(raw)) {
    const first = cue.lines[0]
    const lastLine = cue.lines[cue.lines.length - 1]
    const rolling =
      cue.lines.length >= 2 &&
      prevLastLine !== null &&
      first.toLowerCase() === prevLastLine.toLowerCase()
    const text = rolling ? lastLine : cue.lines.join(' ')
    prevLastLine = lastLine

    if (!text) continue
    if (out.length && out[out.length - 1].text === text) continue
    out.push({ time: cue.time, text, translation: null })
  }
  return out
}

/** 语言识别：够用即可，不追求学术准确 */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 1200)
  const count = (pattern: RegExp): number => (sample.match(pattern) ?? []).length
  const han = count(/[\u4e00-\u9fff]/g)
  const kana = count(/[\u3040-\u30ff]/g)
  const hangul = count(/[\uac00-\ud7af\u1100-\u11ff]/g)
  const cyrillic = count(/[\u0400-\u04ff]/g)
  const arabic = count(/[\u0600-\u06ff]/g)
  const thai = count(/[\u0e00-\u0e7f]/g)
  const latin = count(/[a-z]/gi)

  if (kana > 2) return 'ja'
  if (hangul > 2) return 'ko'
  if (han > latin && han > 2) return 'zh'
  if (cyrillic > 4) return 'ru'
  if (arabic > 4) return 'ar'
  if (thai > 4) return 'th'
  if (latin > 4) return 'en'
  return 'unknown'
}

/* ── 网络请求 ─────────────────────────────────────────── */

let networkSession: Electron.Session | null = null

async function sessionForProxy(proxy: string | null): Promise<Electron.Session> {
  if (!proxy) return session.defaultSession
  if (!networkSession) networkSession = session.fromPartition('echopod-network')
  await networkSession.setProxy({ proxyRules: proxy, proxyBypassRules: '<local>' })
  return networkSession
}

async function activeProxy(store: EpisodeStore): Promise<string | null> {
  const settings = store.getSettings()
  const { proxy } = await resolveProxyArgs(settings.proxyMode, settings.proxy)
  return proxy
}

interface RequestOptions {
  timeoutMs?: number
  viaProxy?: boolean
  method?: string
  body?: string
  headers?: Record<string, string>
}

async function requestText(
  url: string,
  store: EpisodeStore,
  options: RequestOptions = {}
): Promise<string> {
  const { timeoutMs = 12_000, viaProxy = false, method = 'GET', body, headers } = options
  const proxy = viaProxy ? await activeProxy(store) : null
  const target = await sessionForProxy(proxy)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await target.fetch(url, {
      method,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/json,text/plain,*/*',
        ...(headers ?? {})
      },
      body,
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

/* ── 字幕来源：YouTube ────────────────────────────────── */

interface SubsOutcome {
  transcript: Transcript | null
  note?: string
  /** 临时性失败（限流 / 网络），空结果不应写进缓存 */
  transient: boolean
}

async function downloadSubtitles(
  episode: Episode,
  store: EpisodeStore
): Promise<{ files: string[]; note?: string; transient: boolean }> {
  const args = [
    `https://www.youtube.com/watch?v=${episode.id}`,
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs',
    SUB_LANGS,
    '--sub-format',
    'vtt',
    '--no-warnings',
    ...(await store.requestArgs()),
    '-o',
    path.join(store.subsDir, '%(id)s.%(ext)s')
  ]
  const { stdout, stderr, timedOut } = await spawnYtDlp(args, { timeoutMs: 30_000 })
  const entries = await fsp.readdir(store.subsDir).catch(() => [] as string[])
  const files = entries.filter((name) => name.startsWith(`${episode.id}.`) && name.endsWith('.vtt'))
  if (files.length) return { files, transient: false }

  const log = `${stderr}\n${stdout}`
  if (/429|Too Many Requests/i.test(log)) {
    return {
      files: [],
      transient: true,
      note: 'YouTube 字幕服务暂时限流，稍后点「重新获取」即可重试'
    }
  }
  if (timedOut) {
    return { files: [], transient: true, note: '字幕请求超时，请检查网络后重试' }
  }
  return { files: [], transient: false }
}

function languageOfSubtitleFile(fileName: string, id: string): string {
  const rest = fileName.slice(id.length + 1).replace(/\.vtt$/i, '')
  return rest.split('.').pop() ?? rest
}

/** 按时间就近把译文挂到主行上 */
function mergeTranslation(primary: TranscriptLine[], secondary: TranscriptLine[]): TranscriptLine[] {
  if (!secondary.length) return primary
  return primary.map((line) => {
    let best: TranscriptLine | null = null
    let bestDiff = Number.POSITIVE_INFINITY
    for (const candidate of secondary) {
      const diff = Math.abs(candidate.time - line.time)
      if (diff < bestDiff) {
        bestDiff = diff
        best = candidate
      }
    }
    const matched = best && bestDiff <= 3 ? best : null
    return { ...line, translation: matched ? matched.text : null }
  })
}

async function fromYoutube(episode: Episode, store: EpisodeStore): Promise<SubsOutcome> {
  const { files, note, transient } = await downloadSubtitles(episode, store)
  if (!files.length) return { transcript: null, note, transient }

  const parsed = new Map<string, TranscriptLine[]>()
  for (const file of files) {
    const language = languageOfSubtitleFile(file, episode.id)
    const content = await fsp.readFile(path.join(store.subsDir, file), 'utf8').catch(() => '')
    if (!content) continue
    const lines = parseVtt(content)
    if (lines.length) parsed.set(language, lines)
    // 解析完即清理，避免 subs 目录堆积
    await fsp.rm(path.join(store.subsDir, file), { force: true })
  }
  if (!parsed.size) return { transcript: null, transient: false }

  const chineseKey = [...parsed.keys()].find((key) => /^zh/i.test(key))
  const chinese = chineseKey ? parsed.get(chineseKey)! : null
  // 英语优先，其次任何非中文语言
  const originalKey =
    [...parsed.keys()].find((key) => /^en/i.test(key)) ??
    [...parsed.keys()].find((key) => !/^zh/i.test(key))
  const original = originalKey ? parsed.get(originalKey)! : null

  // 原文 + 中文译文并存时，直接得到双语对照（时间轴天然对齐）
  if (original && chinese) {
    return {
      transient: false,
      transcript: {
        source: 'youtube',
        synced: original.some((line) => line.time >= 0),
        language: detectLanguage(original.map((line) => line.text).join('\n')),
        lines: mergeTranslation(original, chinese),
        translated: true,
        fetchedAt: Date.now()
      }
    }
  }

  const single = original ?? chinese
  if (!single) return { transcript: null, transient: false }
  return {
    transient: false,
    transcript: {
      source: 'youtube',
      synced: single.some((line) => line.time >= 0),
      language: detectLanguage(single.map((line) => line.text).join('\n')),
      lines: single,
      translated: Boolean(chinese && !original),
      fetchedAt: Date.now()
    }
  }
}

/* ── 翻译 ─────────────────────────────────────────────── */

function mapToMyMemoryCode(language: string): string {
  const table: Record<string, string> = {
    zh: 'zh-CN',
    en: 'en-GB',
    ja: 'ja-JP',
    ko: 'ko-KR',
    ru: 'ru-RU',
    ar: 'ar-SA',
    th: 'th-TH'
  }
  return table[language] ?? 'en-GB'
}

/**
 * 中文对照有两条路：
 * 1. 首选 YouTube 自带的 zh-Hans 自动翻译字幕（时间轴天然对齐，不依赖第三方）
 * 2. 拿不到时，才用下面的第三方接口兜底
 */

/** 引擎 1：Google 免密钥接口（需经代理，共享出口 IP 可能被临时限流） */
async function translateWithGoogle(texts: string[], store: EpisodeStore): Promise<string[] | null> {
  const payload = texts.join('\n')
  const endpoints = [
    'https://translate.googleapis.com/translate_a/single',
    'https://translate.google.com/translate_a/single'
  ]
  for (const endpoint of endpoints) {
    try {
      const url = `${endpoint}?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(payload)}`
      const raw = await requestText(url, store, { viaProxy: true, timeoutMs: 15_000 })
      if (raw.trimStart().startsWith('<')) continue
      const data = JSON.parse(raw) as [Array<[string, string]>, ...unknown[]]
      const translated = (data[0] ?? []).map((segment) => segment[0] ?? '').join('')
      if (!translated) continue
      const lines = translated.split('\n')
      // 行数对不上说明换行没被保留，别返回半成品，交给下一个引擎
      if (lines.length === texts.length) return lines
      continue
    } catch {
      /* 尝试下一个端点 */
    }
  }
  return null
}

/** 引擎 3：MyMemory（匿名配额有限，长节目容易耗尽；多行不可靠时逐行重试） */
async function translateWithMyMemory(texts: string[], store: EpisodeStore): Promise<string[] | null> {
  const attempt = async (source: string[]): Promise<string[] | null> => {
    const joined = source.join('\n')
    const pair = `${mapToMyMemoryCode(detectLanguage(joined))}|zh-CN`
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(joined)}&langpair=${encodeURIComponent(pair)}`
    // 本机直连该接口容易被限流（429），有代理时优先走代理；没代理则自动退回直连
    const raw = await requestText(url, store, { timeoutMs: 15_000, viaProxy: true })
    const data = JSON.parse(raw) as { responseData?: { translatedText?: string } }
    const translated = data.responseData?.translatedText ?? ''
    if (!translated) return null
    const lines = translated.split('\n')
    return lines.length === source.length ? lines : null
  }

  const batched = await attempt(texts).catch(() => null)
  if (batched) return batched

  // 多行容易踩到配额或换行丢失，退化成逐行（限制条数避免长时间等待）
  const limit = Math.min(texts.length, 60)
  const result: string[] = []
  for (let index = 0; index < limit; index += 1) {
    const text = texts[index]
    if (!text.trim()) {
      result.push('')
      continue
    }
    const single = await attempt([text]).catch(() => null)
    if (!single || !single[0]) return null
    result.push(single[0])
  }
  return result
}

async function translateBatch(texts: string[], store: EpisodeStore): Promise<string[] | null> {
  // MyMemory 对匿名调用较宽容，先试它；Google 免密钥接口常被限流，作为备选
  return (await translateWithMyMemory(texts, store)) ?? (await translateWithGoogle(texts, store))
}

/** 逐行翻译：按字符数分批，分批并发，并受总量上限约束 */
async function translateLines(
  texts: string[],
  store: EpisodeStore
): Promise<{ lines: string[]; truncated: boolean } | null> {
  const result: string[] = new Array(texts.length).fill('')
  const batches: number[][] = []
  let current: number[] = []
  let size = 0
  let used = 0
  let truncated = false

  for (let index = 0; index < texts.length; index += 1) {
    const text = texts[index].trim()
    if (!text) continue
    if (used + text.length > MAX_TRANSLATE_CHARS) {
      truncated = true
      break
    }
    if (size && size + text.length > TRANSLATE_BATCH_CHARS) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(index)
    size += text.length + 1
    used += text.length + 1
  }
  if (current.length) batches.push(current)
  if (!batches.length) return { lines: result, truncated }

  // 免费接口单次响应偏慢，串行会把长节目拖到十几分钟，这里分批并发
  let anySucceeded = false
  for (let start = 0; start < batches.length; start += TRANSLATE_CONCURRENCY) {
    const slice = batches.slice(start, start + TRANSLATE_CONCURRENCY)
    const settled = await Promise.all(
      slice.map((batch) => translateBatch(batch.map((index) => texts[index]), store))
    )
    settled.forEach((translated, offset) => {
      if (!translated) return
      anySucceeded = true
      slice[offset].forEach((index, k) => {
        result[index] = translated[k] ?? ''
      })
    })
  }
  if (!anySucceeded) return null
  return { lines: result, truncated }
}

/* ── 对外入口 ─────────────────────────────────────────── */

function transcriptFile(store: EpisodeStore, id: string): string {
  return path.join(store.transcriptsDir, `${id}.json`)
}

async function readCached(file: string): Promise<Transcript | null> {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8')) as Transcript
  } catch {
    return null
  }
}

/**
 * 取某一集的逐字稿。
 *
 * `translate = false` 时只给原文（几百毫秒就能出），翻译交给
 * `translateTranscript` 在后台补齐——长节目等待翻译会白等十几秒。
 */
export async function fetchTranscript(
  episode: Episode,
  store: EpisodeStore,
  force = false,
  translate = true
): Promise<Transcript> {
  const file = transcriptFile(store, episode.id)
  const settings = store.getSettings()
  let result: Transcript | null = null

  if (!force) {
    const cached = await readCached(file)
    if (cached) {
      const usable = cached.lines.length > 0
      const fresh = Date.now() - (cached.fetchedAt ?? 0) < EMPTY_CACHE_TTL
      if (usable) {
        if (!translate) return cached
        // 没有译文（首次生成，或上次翻译失败）时，复用已解析的字幕补翻译，不必重下
        const missingTranslation =
          settings.autoTranslate && !cached.translated && (cached.language ?? '') !== 'zh'
        if (!missingTranslation) return cached
        result = cached
      } else if (fresh) {
        return cached
      }
    }
  }

  if (!result) {
    let transientNote: string | undefined
    let transient = false
    try {
      const outcome = await fromYoutube(episode, store)
      if (outcome.transcript) result = outcome.transcript
      if (outcome.note) transientNote = outcome.note
      if (outcome.transient) transient = true
    } catch {
      /* 网络异常时给出空结果并保留重试机会 */
    }

    if (!result || !result.lines.length) {
      const empty: Transcript = {
        source: 'none',
        synced: false,
        language: null,
        lines: [],
        translated: false,
        note: transientNote ?? '这一集没有可用字幕，可能是纯音乐或未开启字幕',
        fetchedAt: Date.now()
      }
      // 限流 / 超时属于临时状态：不写缓存，下次播放会自动重试
      if (!transient) {
        await fsp.writeFile(file, JSON.stringify(empty, null, 2), 'utf8').catch(() => undefined)
      }
      return empty
    }
  }

  const language =
    result.language ?? detectLanguage(result.lines.map((line) => line.text).join('\n'))
  result.language = language
  const needsTranslation = settings.autoTranslate && !result.translated && language !== 'zh'

  // 只要原文时先把结果交出去，并在缓存里标出「译文待补」
  if (needsTranslation && !translate) {
    result.note = PENDING_NOTE
    result.fetchedAt = Date.now()
    await fsp.writeFile(file, JSON.stringify(result, null, 2), 'utf8').catch(() => undefined)
    return result
  }

  if (needsTranslation) {
    const outcome = await translateLines(
      result.lines.map((line) => line.text),
      store
    )
    if (outcome) {
      result.lines = result.lines.map((line, index) => ({
        ...line,
        translation: outcome.lines[index]?.trim() || null
      }))
      result.translated = result.lines.some((line) => Boolean(line.translation))
    }
    if (!result.translated) {
      result.note = '翻译服务暂时不可用，已显示原文（稍后可点「重新获取」重试）'
    } else if (outcome?.truncated) {
      result.note = `逐字稿较长，本次只翻译了前 ${Math.round(MAX_TRANSLATE_CHARS / 1000)} 千字符`
    } else {
      result.note = undefined
    }
  }

  result.fetchedAt = Date.now()
  await fsp.writeFile(file, JSON.stringify(result, null, 2), 'utf8').catch(() => undefined)
  return result
}

/** 后台补齐中文对照；供主进程先返回原文、随后推送补齐结果 */
export async function translateTranscript(
  episode: Episode,
  store: EpisodeStore
): Promise<Transcript | null> {
  const transcript = await fetchTranscript(episode, store, false, true)
  return transcript.lines.length ? transcript : null
}
