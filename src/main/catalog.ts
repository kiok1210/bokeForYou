import type { Category, ContentMode } from '@shared/types'
import { inferBucket } from '@shared/portable/collections'

/**
 * 分类目录，按内容模式各配一套。
 *
 * 每个分类同时承担三件事：
 * 1. shows    —— 精选节目清单，开箱即有内容可点，不必自己去找
 * 2. keywords —— 「发现更多」/ 热门榜拿去搜 YouTube 的关键词（用的是对应语言）
 * 3. markers  —— 下载后按标题 / 频道自动归类的特征词
 *
 * 模式之间允许出现同名分类（例如中文与英文都有自己的科技类），
 * 归属由「模式 + 分类 id」共同确定，因此不会串味。
 */

/* ── 英文播客 ─────────────────────────────────────────── */

const EN_CATEGORIES: Category[] = [
  {
    id: 'ai-tech',
    name: '科技与 AI',
    blurb: 'AI、软件、硬件与未来趋势',
    keywords: ['AI podcast english', 'technology podcast interview', 'software engineering podcast'],
    markers: ['ai', 'tech', 'software', 'code', 'coding', 'computer', 'silicon', 'robot', 'future'],
    accent: '#6ea8fe',
    shows: [
      {
        id: 'lex-fridman',
        name: 'Lex Fridman Podcast',
        channel: 'Lex Fridman',
        blurb: '与科学家、工程师的长对话'
      },
      {
        id: 'hard-fork',
        name: 'Hard Fork',
        channel: 'Hard Fork',
        blurb: 'AI 与科技产品的行业动态'
      },
      {
        id: 'dwarkesh',
        name: 'Dwarkesh Podcast',
        channel: 'Dwarkesh Patel',
        blurb: 'AI 与科技前沿深度访谈'
      },
      {
        id: 'a16z-podcast',
        name: 'a16z Podcast',
        channel: 'a16z',
        blurb: '硅谷视角的技术与创业'
      },
      {
        id: 'sed',
        name: 'Software Engineering Daily',
        channel: 'Software Engineering Daily',
        blurb: '工程师视角的技术实践'
      },
      {
        id: 'vergecast',
        name: 'The Vergecast',
        channel: 'The Verge',
        blurb: '科技产品与行业观察'
      }
    ]
  },
  {
    id: 'business',
    name: '商业与创业',
    blurb: '创业故事、公司经营与市场洞察',
    keywords: ['business podcast english', 'startup founder interview', 'how i built this'],
    markers: ['business', 'startup', 'founder', 'entrepreneur', 'market', 'economy', 'invest', 'money'],
    accent: '#e0b25c',
    shows: [
      {
        id: 'how-i-built-this',
        name: 'How I Built This',
        channel: 'How I Built This with Guy Raz',
        blurb: '创业者亲述从 0 到 1'
      },
      {
        id: 'tim-ferriss',
        name: 'The Tim Ferriss Show',
        channel: 'Tim Ferriss',
        blurb: '顶尖高手的工具与习惯'
      },
      {
        id: 'masters-of-scale',
        name: 'Masters of Scale',
        channel: 'Masters of Scale',
        blurb: '规模化背后的反直觉策略'
      },
      {
        id: 'acquired',
        name: 'Acquired',
        channel: 'Acquired',
        blurb: '公司并购与商业史长谈'
      },
      {
        id: 'my-first-million',
        name: 'My First Million',
        channel: 'My First Million',
        blurb: '商业点子的快速碰撞'
      }
    ]
  },
  {
    id: 'science',
    name: '科学与自然',
    blurb: '太空、生命、物理与气候',
    keywords: ['science podcast english', 'space astronomy podcast', 'nature documentary podcast'],
    markers: ['science', 'nature', 'space', 'physics', 'biology', 'climate', 'universe', 'earth'],
    accent: '#67c48d',
    shows: [
      {
        id: 'huberman',
        name: 'Huberman Lab',
        channel: 'Huberman Lab',
        blurb: '神经科学驱动的健康与表现'
      },
      {
        id: 'startalk',
        name: 'StarTalk Radio',
        channel: 'StarTalk',
        blurb: '天体物理与科学趣谈'
      },
      {
        id: 'science-vs',
        name: 'Science Vs',
        channel: 'Science Vs',
        blurb: '用证据检验流行说法'
      },
      {
        id: 'radiolab',
        name: 'Radiolab',
        channel: 'Radiolab',
        blurb: '科学与故事交叉的音频纪录片'
      },
      {
        id: 'nasa',
        name: 'NASA 官方播客',
        channel: 'NASA',
        blurb: '太空任务与探索实录'
      }
    ]
  },
  {
    id: 'english-learning',
    name: '英语学习',
    blurb: '慢速英语、听力练习与用法讲解',
    keywords: ['learn english podcast', 'english listening practice', '6 minute english'],
    markers: ['english', 'learn', 'learning', 'lesson', 'vocabulary', 'grammar', 'listening', 'esl', 'ielts'],
    accent: '#4fd1c5',
    shows: [
      {
        id: 'bbc-learning-english',
        name: 'BBC Learning English',
        channel: 'BBC Learning English',
        blurb: '6 Minute English 等经典栏目'
      },
      {
        id: 'all-ears-english',
        name: 'All Ears English',
        channel: 'All Ears English',
        blurb: '地道美式口语与表达'
      },
      {
        id: 'english-we-speak',
        name: 'The English We Speak',
        channel: 'The English We Speak',
        blurb: '英式俚语与常用短语'
      },
      {
        id: 'speak-english-vanessa',
        name: 'Speak English with Vanessa',
        channel: 'Speak English With Vanessa',
        blurb: '日常口语跟练'
      },
      {
        id: 'espresso-english',
        name: 'Espresso English',
        channel: 'Espresso English',
        blurb: '短小的语法与词汇课'
      }
    ]
  },
  {
    id: 'interview',
    name: '访谈与故事',
    blurb: '长对话、口述故事与人生经历',
    keywords: ['interview podcast english', 'storytelling podcast english', 'long form conversation'],
    markers: ['interview', 'story', 'stories', 'conversation', 'talk', 'talks', 'narrative'],
    accent: '#c58cf0',
    shows: [
      {
        id: 'diary-of-a-ceo',
        name: 'The Diary of a CEO',
        channel: 'The Diary Of A CEO',
        blurb: '创始人与名人的深度访谈'
      },
      {
        id: 'modern-wisdom',
        name: 'Modern Wisdom',
        channel: 'Modern Wisdom',
        blurb: '心理学、表现与生活方式'
      },
      {
        id: 'armchair-expert',
        name: 'Armchair Expert',
        channel: 'Armchair Expert',
        blurb: '长访谈与人生故事'
      },
      {
        id: 'the-moth',
        name: 'The Moth',
        channel: 'The Moth',
        blurb: '真实故事的口述现场'
      },
      {
        id: 'storycorps',
        name: 'StoryCorps',
        channel: 'StoryCorps',
        blurb: '普通人的真实对话'
      }
    ]
  },
  {
    id: 'mind-health',
    name: '心理与健康',
    blurb: '心理学、习惯与身心健康',
    keywords: ['psychology podcast english', 'health wellness podcast', 'mindfulness sleep podcast'],
    markers: ['psychology', 'mental', 'health', 'mind', 'wellness', 'sleep', 'habit', 'brain'],
    accent: '#f08fb3',
    shows: [
      {
        id: 'happiness-lab',
        name: 'The Happiness Lab',
        channel: 'The Happiness Lab',
        blurb: '耶鲁心理学教授讲幸福'
      },
      {
        id: 'ten-percent-happier',
        name: 'Ten Percent Happier',
        channel: 'Ten Percent Happier',
        blurb: '冥想与情绪管理'
      },
      {
        id: 'psychology-podcast',
        name: 'The Psychology Podcast',
        channel: 'The Psychology Podcast',
        blurb: '心理学研究访谈'
      },
      {
        id: 'feel-better-live-more',
        name: 'Feel Better, Live More',
        channel: 'Feel Better Live More',
        blurb: '健康与生活方式'
      },
      {
        id: 'on-being',
        name: 'On Being',
        channel: 'On Being with Krista Tippett',
        blurb: '关于意义与内心生活的长对话'
      }
    ]
  },
  {
    id: 'comedy',
    name: '喜剧与娱乐',
    blurb: '脱口秀、幽默聊天与轻松生活',
    keywords: ['comedy podcast english', 'stand up comedy audio english', 'funny talk podcast english'],
    markers: ['comedy', 'humor', 'humour', 'funny', 'standup', 'stand up', 'entertainment', 'laugh'],
    accent: '#f2a65a',
    shows: [
      {
        id: 'conan',
        name: "Conan O'Brien Needs a Friend",
        channel: "Conan O'Brien Needs a Friend",
        blurb: '柯南的喜剧访谈'
      },
      {
        id: 'smartless',
        name: 'SmartLess',
        channel: 'SmartLess',
        blurb: '三位演员的即兴闲聊'
      },
      {
        id: 'wtf',
        name: 'WTF with Marc Maron',
        channel: 'WTF with Marc Maron',
        blurb: '喜剧人的长访谈'
      },
      {
        id: 'comedy-bang-bang',
        name: 'Comedy Bang Bang',
        channel: 'Comedy Bang Bang',
        blurb: '即兴角色喜剧'
      },
      {
        id: 'bad-friends',
        name: 'Bad Friends',
        channel: 'Bad Friends',
        blurb: '轻松吐槽的聊天节目'
      }
    ]
  },
  {
    id: 'history-culture',
    name: '历史与人文',
    blurb: '历史、哲学、艺术与文化观察',
    keywords: ['history podcast english', 'philosophy podcast english', 'culture podcast'],
    markers: ['history', 'historic', 'culture', 'philosophy', 'art', 'ancient', 'museum', 'literature'],
    accent: '#d8a15a',
    shows: [
      {
        id: 'stuff-you-should-know',
        name: 'Stuff You Should Know',
        channel: 'Stuff You Should Know',
        blurb: '百科式的冷知识长谈'
      },
      {
        id: '99-invisible',
        name: '99% Invisible',
        channel: '99% Invisible',
        blurb: '设计与人造世界'
      },
      {
        id: 'philosophize-this',
        name: 'Philosophize This!',
        channel: 'Philosophize This!',
        blurb: '哲学入门讲解'
      },
      {
        id: 'freakonomics',
        name: 'Freakonomics Radio',
        channel: 'Freakonomics Radio',
        blurb: '用经济学解释日常'
      },
      {
        id: 'hidden-brain',
        name: 'Hidden Brain',
        channel: 'Hidden Brain',
        blurb: '人类行为与心理'
      }
    ]
  }
]

/* ── 中文播客 ─────────────────────────────────────────── */

const ZH_CATEGORIES: Category[] = [
  {
    id: 'zh-business',
    name: '商业与财经',
    blurb: '公司经营、投资理财与商业观察',
    keywords: ['商业财经播客', '创业访谈 播客', '投资理财播客'],
    markers: ['商业', '财经', '创业', '投资', '公司', '生意', '经济', '职场', '品牌', '零售'],
    accent: '#e0b25c',
    shows: [
      {
        id: 'wuxiaobo',
        name: '吴晓波频道',
        channel: '吴晓波频道',
        blurb: '商业史与企业观察'
      },
      {
        id: 'fengtouquan',
        name: '疯投圈',
        channel: '疯投圈',
        blurb: '一线投资人的行业拆解'
      },
      {
        id: 'zhixingxiajiuguan',
        name: '知行小酒馆',
        channel: '知行小酒馆',
        blurb: '普通人的理财与生活'
      },
      {
        id: 'sanwuhuan',
        name: '三五环',
        channel: '三五环',
        blurb: '互联网从业者的行业闲聊'
      }
    ]
  },
  {
    id: 'zh-tech',
    name: '科技与互联网',
    blurb: 'AI、产品、数码与互联网行业',
    keywords: ['科技播客 中文', '互联网产品 播客', '人工智能 播客'],
    markers: ['科技', '互联网', '数码', '产品', '编程', '算法', '芯片', '软件', '硬件', '手机'],
    accent: '#6ea8fe',
    shows: [
      {
        id: 'guiguzhidao',
        name: '硅谷早知道',
        channel: '硅谷早知道',
        blurb: '硅谷一线的科技动态'
      },
      {
        id: 'kejijizhidao',
        name: 'What\'s Next｜科技早知道',
        channel: 'What\u2019s Next 科技早知道',
        blurb: '科技行业深度对谈'
      },
      {
        id: 'chanpinchensimo',
        name: '产品沉思录',
        channel: '产品沉思录',
        blurb: '产品方法与思考'
      },
      {
        id: 'daimazhiwai',
        name: '代码之外',
        channel: '代码之外 Beyond Code',
        blurb: '程序员的职业与生活'
      }
    ]
  },
  {
    id: 'zh-interview',
    name: '人物访谈',
    blurb: '长对话、对谈与真实经历',
    keywords: ['人物访谈 播客', '对谈 播客 中文', '深度对话 播客'],
    markers: ['访谈', '对谈', '对话', '嘉宾', '讲述', '经历', '口述'],
    accent: '#c58cf0',
    shows: [
      {
        id: 'huzuoyouyou',
        name: '忽左忽右',
        channel: '忽左忽右',
        blurb: '文化与社会的长谈'
      },
      {
        id: 'suijibodong',
        name: '随机波动',
        channel: '随机波动',
        blurb: '女性视角的当代生活'
      },
      {
        id: 'buheshiyi',
        name: '不合时宜',
        channel: '不合时宜',
        blurb: '年轻人的困惑与选择'
      },
      {
        id: 'shengdongjixi',
        name: '声东击西',
        channel: '声东击西',
        blurb: '科技与公共生活的交叉'
      }
    ]
  },
  {
    id: 'zh-culture',
    name: '文化与读书',
    blurb: '文学、电影、艺术与阅读',
    keywords: ['读书播客 中文', '文学 电影 播客', '文化艺术 播客'],
    markers: ['文化', '读书', '文学', '电影', '艺术', '书单', '导演', '作家', '诗歌', '展览'],
    accent: '#d8a15a',
    shows: [
      {
        id: 'wenhuayouxian',
        name: '文化有限',
        channel: '文化有限',
        blurb: '三个人聊书与生活'
      },
      {
        id: 'tiaodao',
        name: '跳岛FM',
        channel: '跳岛FM',
        blurb: '文学与写作的对谈'
      },
      {
        id: 'ritangongyuan',
        name: '日谈公园',
        channel: '日谈公园',
        blurb: '轻松的文化杂谈'
      }
    ]
  },
  {
    id: 'zh-knowledge',
    name: '知识与科普',
    blurb: '历史、科学、心理学与冷知识',
    keywords: ['科普播客 中文', '历史故事 播客', '冷知识 播客'],
    markers: ['科普', '知识', '历史', '科学', '心理学', '冷知识', '考古', '地理', '生物', '天文'],
    accent: '#67c48d',
    shows: [
      {
        id: 'kexueshipinghua',
        name: '科学史评话',
        channel: '科学史评话',
        blurb: '科学史上的人和事'
      },
      {
        id: 'yuanlaishizheyang',
        name: '原来是这样',
        channel: '原来是这样',
        blurb: '日常现象背后的科学'
      },
      {
        id: 'fandeng',
        name: '樊登读书',
        channel: '樊登读书',
        blurb: '把一本书讲成一期节目'
      }
    ]
  },
  {
    id: 'zh-life',
    name: '生活与情感',
    blurb: '情绪、关系、家庭与日常',
    keywords: ['生活播客 中文', '情感 心理 播客', '女性成长 播客'],
    markers: ['生活', '情感', '心理', '关系', '成长', '家庭', '亲密关系', '女性', '独居', '治愈'],
    accent: '#f08fb3',
    shows: [
      {
        id: 'laiudoulailiao',
        name: '来都来了',
        channel: '来都来了',
        blurb: '两个女生的日常闲聊'
      },
      {
        id: 'wuliaoizhai',
        name: '无聊斋',
        channel: '无聊斋',
        blurb: '普通人的有趣故事'
      }
    ]
  },
  {
    id: 'zh-study',
    name: '学习与效率',
    blurb: '方法论、技能与个人成长',
    keywords: ['学习方法 播客 中文', '效率 职场 播客', '个人成长 播客'],
    markers: ['学习', '效率', '职场', '成长', '方法论', '技能', '时间管理', '笔记', '阅读方法'],
    accent: '#8fbf6e',
    shows: [
      {
        id: 'dedao',
        name: '得到',
        channel: '得到',
        blurb: '各领域的知识精讲'
      },
      {
        id: 'luojisweiwei',
        name: '罗辑思维',
        channel: '罗辑思维',
        blurb: '知识付费的老牌节目'
      }
    ]
  },
  {
    id: 'zh-comedy',
    name: '喜剧与闲聊',
    blurb: '脱口秀、段子与轻松陪聊',
    keywords: ['脱口秀 播客 中文', '闲聊播客 搞笑', '喜剧 播客 中文'],
    markers: ['脱口秀', '喜剧', '搞笑', '段子', '闲聊', '欢乐'],
    accent: '#f2a65a',
    shows: [
      {
        id: 'xiexingliaotianhui',
        name: '谐星聊天会',
        channel: '谐星聊天会',
        blurb: '脱口秀演员的即兴闲聊'
      },
      {
        id: 'danliren',
        name: '单立人喜剧',
        channel: '单立人',
        blurb: '脱口秀演员的对谈'
      }
    ]
  }
]

/* ── 长视频 ───────────────────────────────────────────── */

const LONG_VIDEO_CATEGORIES: Category[] = [
  {
    id: 'vl-interview',
    name: '深度长访谈',
    blurb: '一小时以上的对谈与人物记录',
    keywords: ['long form interview video', 'in depth conversation full episode', 'extended interview'],
    markers: ['interview', 'conversation', 'talk', 'dialogue', 'episode'],
    accent: '#c58cf0',
    shows: [
      { id: 'lex-v', name: 'Lex Fridman', channel: 'Lex Fridman', blurb: '数小时的长对话' },
      { id: 'doac-v', name: 'The Diary Of A CEO', channel: 'The Diary Of A CEO', blurb: '创始人长访谈' },
      { id: 'ali-abdaal', name: 'Ali Abdaal', channel: 'Ali Abdaal', blurb: '学习方法与效率长片' }
    ]
  },
  {
    id: 'vl-lecture',
    name: '讲座与公开课',
    blurb: '大学课程、技术演讲与系统讲解',
    keywords: ['full lecture course', 'university lecture series', 'conference talk full session'],
    markers: ['lecture', 'course', 'class', 'session', 'seminar', 'lesson', 'tutorial'],
    accent: '#6ea8fe',
    shows: [
      { id: 'mit-ocw', name: 'MIT OpenCourseWare', channel: 'MIT OpenCourseWare', blurb: '完整大学课程' },
      { id: 'stanford-online', name: 'Stanford Online', channel: 'Stanford Online', blurb: '斯坦福公开课' },
      { id: 'crashcourse', name: 'CrashCourse', channel: 'CrashCourse', blurb: '成体系的学科串讲' }
    ]
  },
  {
    id: 'vl-doc',
    name: '纪录片',
    blurb: '自然、动物与探索类长片',
    keywords: ['nature documentary full', 'wildlife documentary 4k', 'ocean documentary'],
    markers: ['documentary', 'wildlife', 'nature', 'ocean', 'planet', 'forest', 'animal'],
    accent: '#67c48d',
    shows: [
      { id: 'bbc-earth', name: 'BBC Earth', channel: 'BBC Earth', blurb: '自然纪录片' },
      { id: 'natgeo', name: 'National Geographic', channel: 'National Geographic', blurb: '探索与科学纪录' },
      { id: 'pbs-nova', name: 'NOVA PBS Official', channel: 'NOVA PBS Official', blurb: '科学纪录片' }
    ]
  },
  {
    id: 'vl-tech',
    name: '科技与工程',
    blurb: '原理讲解、工程拆解与技术剖析',
    keywords: ['engineering explained long', 'how it works explained', 'deep dive technology explained'],
    markers: ['engineering', 'explained', 'technology', 'hardware', 'chip', 'physics', 'build'],
    accent: '#4fd1c5',
    shows: [
      { id: 'veritasium', name: 'Veritasium', channel: 'Veritasium', blurb: '用实验讲科学与工程' },
      { id: 'mark-rober', name: 'Mark Rober', channel: 'Mark Rober', blurb: '工程建造与设计' },
      { id: 'mkbhd', name: 'Marques Brownlee', channel: 'Marques Brownlee', blurb: '数码产品深度评测' }
    ]
  },
  {
    id: 'vl-history',
    name: '历史与人文长篇',
    blurb: '文明、艺术与观念的长篇梳理',
    keywords: ['history of civilization documentary', 'art history documentary', 'philosophy full course'],
    markers: ['history', 'civilization', 'art', 'philosophy', 'culture', 'empire', 'ancient'],
    accent: '#d8a15a',
    shows: [
      { id: 'ted-ed', name: 'TED-Ed', channel: 'TED-Ed', blurb: '动画讲历史与人文' },
      { id: 'pbs-epoch', name: 'PBS', channel: 'PBS', blurb: '人文与历史纪录' }
    ]
  },
  {
    id: 'vl-study',
    name: '学习与专注',
    blurb: '长时段学习陪伴与语言沉浸',
    keywords: ['study with me long', 'deep work session', 'language immersion long video'],
    markers: ['study', 'focus', 'immersion', 'learning', 'productivity', 'session'],
    accent: '#8fbf6e',
    shows: [
      { id: 'study-with-me', name: 'Study With Me', channel: 'Study With Me', blurb: '长时段陪伴式学习' },
      { id: 'thomas-frank', name: 'Thomas Frank', channel: 'Thomas Frank', blurb: '学习方法与效率' }
    ]
  }
]

/* ── 短视频 ───────────────────────────────────────────── */

const SHORT_VIDEO_CATEGORIES: Category[] = [
  {
    id: 'vs-facts',
    name: '知识碎片',
    blurb: '一分钟讲清一件小事',
    keywords: ['60 seconds facts', 'did you know shorts', 'science shorts english'],
    markers: ['facts', 'did you know', 'shorts', 'science', 'space', 'brain'],
    accent: '#6ea8fe',
    shows: [
      { id: 'zack-films', name: 'Zack D. Films', channel: 'Zack D. Films', blurb: '动画讲冷知识' },
      { id: 'bright-side', name: 'Bright Side', channel: 'BRIGHT SIDE', blurb: '轻科普短片' }
    ]
  },
  {
    id: 'vs-english',
    name: '英语口语跟练',
    blurb: '短句跟读与词汇碎片',
    keywords: ['english speaking practice shorts', 'english vocabulary shorts', 'daily english phrases'],
    markers: ['english', 'speaking', 'vocabulary', 'phrases', 'pronunciation', 'learn'],
    accent: '#4fd1c5',
    shows: [
      {
        id: 'vanessa-shorts',
        name: 'Speak English With Vanessa',
        channel: 'Speak English With Vanessa',
        blurb: '日常口语跟练'
      },
      {
        id: 'bbc-le-shorts',
        name: 'BBC Learning English',
        channel: 'BBC Learning English',
        blurb: '一分钟英语'
      }
    ]
  },
  {
    id: 'vs-tech',
    name: '数码与科技',
    blurb: '新品速览与实用技巧',
    keywords: ['gadget review shorts', 'tech tips shorts', 'phone camera tips'],
    markers: ['gadget', 'tech', 'phone', 'camera', 'tips', 'review', 'app'],
    accent: '#c58cf0',
    shows: [
      { id: 'mkbhd-shorts', name: 'Marques Brownlee', channel: 'Marques Brownlee', blurb: '数码快评' },
      { id: 'mrwhosetheboss', name: 'Mrwhosetheboss', channel: 'Mrwhosetheboss', blurb: '手机与数码短片' }
    ]
  },
  {
    id: 'vs-life',
    name: '生活小技巧',
    blurb: '收纳、清洁与快手菜',
    keywords: ['life hacks shorts', 'quick recipe shorts', 'cleaning tips shorts'],
    markers: ['hack', 'recipe', 'cooking', 'cleaning', 'organize', 'kitchen', 'diy'],
    accent: '#f2a65a',
    shows: [
      { id: '5min-crafts', name: '5-Minute Crafts', channel: '5-Minute Crafts', blurb: '手工与生活技巧' },
      { id: 'tasty', name: 'Tasty', channel: 'Tasty', blurb: '快手菜短片' }
    ]
  },
  {
    id: 'vs-fitness',
    name: '运动与拉伸',
    blurb: '跟练片段与拉伸动作',
    keywords: ['workout shorts', 'stretching routine shorts', 'home fitness shorts'],
    markers: ['workout', 'fitness', 'stretch', 'yoga', 'exercise', 'abs', 'training'],
    accent: '#67c48d',
    shows: [
      { id: 'chloe-ting', name: 'Chloe Ting', channel: 'Chloe Ting', blurb: '居家跟练' },
      { id: 'madfit', name: 'MadFit', channel: 'MadFit', blurb: '短时训练' }
    ]
  },
  {
    id: 'vs-fun',
    name: '趣味与萌宠',
    blurb: '轻松解压的小片段',
    keywords: ['funny animals shorts', 'cute pets shorts', 'oddly satisfying shorts'],
    markers: ['funny', 'cute', 'pets', 'animals', 'satisfying', 'dogs', 'cats'],
    accent: '#f08fb3',
    shows: [
      { id: 'the-dodo', name: 'The Dodo', channel: 'The Dodo', blurb: '动物救助与萌宠' },
      { id: 'nifty', name: 'Nifty', channel: 'Nifty', blurb: '轻松解压短片' }
    ]
  }
]

/* ── 兜底 ─────────────────────────────────────────────── */

const FALLBACKS: Record<ContentMode, Category> = {
  'podcast-zh': {
    id: 'other',
    name: '未归类',
    blurb: '还没来得及分类的中文单集',
    keywords: ['中文播客', '播客 中文 推荐'],
    markers: [],
    accent: '#9c99a5',
    shows: []
  },
  'podcast-en': {
    id: 'other',
    name: '未归类',
    blurb: '还没来得及分类的单集',
    keywords: ['english podcast', 'best podcasts english'],
    markers: [],
    accent: '#9c99a5',
    shows: []
  },
  'video-long': {
    id: 'other',
    name: '未归类',
    blurb: '还没来得及分类的长视频',
    keywords: ['long video documentary', 'full length lecture'],
    markers: [],
    accent: '#9c99a5',
    shows: []
  },
  'video-short': {
    id: 'other',
    name: '未归类',
    blurb: '还没来得及分类的短视频',
    keywords: ['shorts compilation', 'short video clips'],
    markers: [],
    accent: '#9c99a5',
    shows: []
  }
}

/** 每个模式参与「热门榜」抓取的分类：热度稳定、内容风险低 */
const TRENDING_SOURCES: Record<ContentMode, string[]> = {
  'podcast-zh': ['zh-business', 'zh-tech', 'zh-knowledge', 'zh-culture', 'zh-comedy'],
  'podcast-en': ['ai-tech', 'science', 'english-learning', 'business', 'comedy'],
  'video-long': ['vl-doc', 'vl-tech', 'vl-lecture', 'vl-interview', 'vl-study'],
  'video-short': ['vs-facts', 'vs-english', 'vs-tech', 'vs-life', 'vs-fun']
}

/* ── 目录 ─────────────────────────────────────────────── */

export const CATALOG: Record<ContentMode, Category[]> = {
  'podcast-zh': ZH_CATEGORIES,
  'podcast-en': EN_CATEGORIES,
  'video-long': LONG_VIDEO_CATEGORIES,
  'video-short': SHORT_VIDEO_CATEGORIES
}

/** 当前模式的分类（不含兜底） */
export function categoriesOf(mode: ContentMode): Category[] {
  return CATALOG[mode] ?? EN_CATEGORIES
}

/** 当前模式的分类 + 兜底分类 */
export function allCategoriesOf(mode: ContentMode): Category[] {
  return [...categoriesOf(mode), FALLBACKS[mode] ?? FALLBACKS['podcast-en']]
}

export function fallbackCategory(mode: ContentMode): Category {
  return FALLBACKS[mode] ?? FALLBACKS['podcast-en']
}

export function categoryById(mode: ContentMode, id: string): Category {
  return categoriesOf(mode).find((category) => category.id === id) ?? fallbackCategory(mode)
}

/** 按标题 + 频道名自动归类；没有明显归属就落到「未归类」 */
export function inferCategoryId(text: string, mode: ContentMode): string {
  return inferBucket(
    text,
    categoriesOf(mode).map((category) => ({ id: category.id, markers: category.markers })),
    { threshold: 3, fallback: fallbackCategory(mode).id }
  )
}

/** 从分类的关键词里挑一个用于搜索，seed 变化时轮换，避免永远搜同一句 */
export function discoverQuery(mode: ContentMode, categoryId: string, seed = 0): string {
  const category = categoryById(mode, categoryId)
  const keywords = category.keywords
  if (!keywords.length) return modeSpecFallbackQuery(mode)
  const index = Math.abs(Math.floor(seed)) % keywords.length
  return keywords[index]
}

function modeSpecFallbackQuery(mode: ContentMode): string {
  if (mode === 'podcast-zh') return '中文播客'
  if (mode === 'video-long') return 'documentary full length'
  if (mode === 'video-short') return 'shorts compilation'
  return 'english podcast'
}

/** 热门榜的抓取词：每个来源分类取第一个关键词 */
export function trendingQueries(mode: ContentMode): string[] {
  const ids = TRENDING_SOURCES[mode] ?? TRENDING_SOURCES['podcast-en']
  return ids
    .map((id) => categoriesOf(mode).find((category) => category.id === id)?.keywords[0])
    .filter((query): query is string => Boolean(query))
}
