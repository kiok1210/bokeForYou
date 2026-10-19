/**
 * 内容合规过滤
 *
 * 目标：自动抓取热门榜、按关键词检索时，主动剔除政治、战争与暴力、恐怖与极端、
 * 色情、赌博与毒品、仇恨等主题，避免把不合规内容带进本地缓存。
 *
 * 定位说明（请如实告知使用者）：
 * - 这是「第一道闸」：按标题与节目名的词表匹配，能拦住绝大多数明显违规的内容
 * - 词表过滤不是内容审核，无法覆盖标题不含关键词的隐蔽内容
 * - 请遵守 YouTube 服务条款与所在地法律法规，仅缓存自己有权收听的内容
 */

export interface ModerationRule {
  id: string
  /** 面向使用者的类别名，用于界面上的解释文案 */
  label: string
  patterns: RegExp[]
}

/**
 * 词表刻意只使用「通用类别词」，不包含任何具体人物、国家、地区或事件名称，
 * 以便在不同地区法规下都能安全使用；如需收紧或放宽，直接增删对应条目即可。
 */
export const MODERATION_RULES: ModerationRule[] = [
  {
    id: 'politics',
    label: '政治与时政',
    patterns: [
      /\bpolitic(s|al|ian|ians)\b/i,
      /\belections?\b/i,
      /\breferendum\b/i,
      /\bparliament(ary)?\b/i,
      /\bcongress(man|woman|ional)?\b/i,
      /\bsenate\b/i,
      /\bgeopolitic(s|al)\b/i,
      /\bdiplomac(y|tic)\b/i,
      /\bpropaganda\b/i,
      /\bregime change\b/i,
      /\bpolitical party\b/i,
      /政治|时政|选举|议会|政权|政府政策|地缘政治|国际关系|政治宣传/
    ]
  },
  {
    id: 'war',
    label: '战争与暴力',
    patterns: [
      /\bwars?\b/i,
      /\bwarfare\b/i,
      /\bwarzone\b/i,
      /\bbattlefield\b/i,
      /\bmilitary (conflict|operation|strike|invasion|action)\b/i,
      /\binvasion\b/i,
      /\bgenocide\b/i,
      /\bmassacre\b/i,
      /\bcivil war\b/i,
      /\barms? (deal|trade|race)\b/i,
      /战争|战乱|军事冲突|屠杀|军火|武装冲突/
    ]
  },
  {
    id: 'extremism',
    label: '恐怖与极端主义',
    patterns: [
      /\bterror(ism|ist|ists|istic)\b/i,
      /\bjihad(ist|ism|is)?\b/i,
      /\bextremis(m|t|ts)\b/i,
      /\bmilitant group\b/i,
      /\binsurgen(cy|t)\b/i,
      /恐怖主义|恐怖袭击|极端主义|暴恐|圣战/
    ]
  },
  {
    id: 'adult',
    label: '色情与成人内容',
    patterns: [
      /\bporn(o|ographic|ography)?\b/i,
      /\bxxx\b/i,
      /\bnsfw\b/i,
      /\berotic(a)?\b/i,
      /\bonlyfans\b/i,
      /\bexplicit sexual\b/i,
      /\badult (content|video|film|entertainment)\b/i,
      /色情|情色|成人内容|成人视频|低俗/
    ]
  },
  {
    id: 'vice',
    label: '赌博与毒品',
    patterns: [
      /\bgambl(e|ing|er|ers)\b/i,
      /\bcasino\b/i,
      /\bbetting (site|odds|tips)\b/i,
      /\bcocaine\b/i,
      /\bheroin\b/i,
      /\bmethamphetamine\b/i,
      /\bdrug (deal|dealing|traffick|trafficking)\b/i,
      /赌博|博彩|赌场|毒品|吸毒|贩毒/
    ]
  },
  {
    id: 'hate',
    label: '仇恨与歧视',
    patterns: [
      /\bnazis?\b/i,
      /\bneo-?nazis?\b/i,
      /\bwhite supremac(y|ist|ists)\b/i,
      /\bhate speech\b/i,
      /\bracial supremacy\b/i,
      /\bethnic cleansing\b/i,
      /纳粹|新纳粹|白人至上|仇恨言论|种族清洗/
    ]
  }
]

export interface ModerationVerdict {
  allowed: boolean
  /** 命中的类别（allowed 为 false 时才有值） */
  rule?: string
  /** 命中的具体词，便于排查误杀 */
  hit?: string
}

/** 检查一段文本（通常是「标题 + 节目名」）是否触碰红线 */
export function inspectText(text: string): ModerationVerdict {
  if (!text) return { allowed: true }
  for (const rule of MODERATION_RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(text)
      if (match) return { allowed: false, rule: rule.label, hit: match[0] }
    }
  }
  return { allowed: true }
}

export interface FilterOutcome<T> {
  safe: T[]
  blocked: number
  /** 被拦下的条目及原因，便于界面提示或调试 */
  rejected: { item: T; rule: string; hit: string }[]
}

/**
 * 批量过滤。textOf 负责把一个条目拼成用于匹配的文本，
 * 例如 `(meta) => `${meta.title} ${meta.channel}``。
 */
export function filterSafe<T>(items: T[], textOf: (item: T) => string): FilterOutcome<T> {
  const safe: T[] = []
  const rejected: { item: T; rule: string; hit: string }[] = []
  for (const item of items) {
    const verdict = inspectText(textOf(item))
    if (verdict.allowed) safe.push(item)
    else rejected.push({ item, rule: verdict.rule ?? '其他', hit: verdict.hit ?? '' })
  }
  return { safe, blocked: rejected.length, rejected }
}

/** 面向上层/界面的类别清单 */
export function moderationLabels(): string[] {
  return MODERATION_RULES.map((rule) => rule.label)
}
