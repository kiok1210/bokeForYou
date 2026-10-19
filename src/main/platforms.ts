/**
 * 平台注册表：站内搜索能力、域名归属、以及每个平台的凭证需求。
 *
 * 与 sources.ts 的 SourceStore（用户自建的「我的源」）是两回事：
 * 这里是「站点」的注册表，回答三个问题——这个域名属于哪站、
 * 该站能不能站内搜索、取流时要不要额外带凭证。
 *
 * 新增一个站点只改这里：声明 fingerprint / extraArgs / auth 之后，
 * 搜索、取流、下载三条路径会自动带上对应凭证（见 index.ts 的 sourceExtraArgs），
 * 不需要在别处写任何站点名。
 */
import type { MediaSource } from '@shared/types'

export const BUILTIN_PLATFORMS: MediaSource[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    hosts: ['youtube.com', 'youtu.be', 'music.youtube.com', 'm.youtube.com', 'youtube-nocookie.com'],
    searchKey: 'ytsearch',
    home: 'https://www.youtube.com/',
    accent: '#e0665f',
    note: '默认平台。曲库最大，字幕最全',
    custom: false
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    hosts: ['bilibili.com', 'b23.tv', 'acg.tv'],
    searchKey: 'bilisearch',
    home: 'https://www.bilibili.com/',
    accent: '#6ea8fe',
    note: '国内直连最快；代理出口在境外时会被区域限制，搜索还可能撞上 412 风控',
    custom: false,
    // 搜索接口有设备风控：不带指纹就回 412；匿名指纹仍可能被概率拦下，登录后才稳
    fingerprint: true,
    auth: 'qrcode'
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    hosts: ['soundcloud.com', 'sndcdn.com'],
    searchKey: 'scsearch',
    home: 'https://soundcloud.com/',
    accent: '#f2a65a',
    note: '独立音乐人与 DJ 混音，国内需要代理',
    custom: false
  },
  {
    id: 'nicovideo',
    name: 'NicoNico',
    hosts: ['nicovideo.jp', 'nico.ms'],
    searchKey: 'nicosearch',
    home: 'https://www.nicovideo.jp/',
    accent: '#4fd1c5',
    note: '日系同人与 VOCALOID，需要代理',
    custom: false
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    hosts: ['bandcamp.com'],
    searchKey: '',
    home: 'https://bandcamp.com/',
    accent: '#67c48d',
    note: '独立音乐，仅支持粘贴专辑或单曲链接',
    custom: false
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    hosts: ['vimeo.com'],
    searchKey: '',
    home: 'https://vimeo.com/',
    accent: '#5ac8fa',
    note: '仅支持粘贴链接',
    custom: false
  },
  {
    id: 'dailymotion',
    name: 'Dailymotion',
    hosts: ['dailymotion.com', 'dai.ly'],
    searchKey: '',
    home: 'https://www.dailymotion.com/',
    accent: '#c58cf0',
    note: '仅支持粘贴链接',
    custom: false
  },
  {
    id: 'douyin',
    name: '抖音',
    hosts: ['douyin.com', 'iesdouyin.com'],
    searchKey: '',
    home: 'https://www.douyin.com/',
    accent: '#e07a5f',
    note: '粘贴分享链接或整段分享文案即可缓存；接口要反爬凭证，应用会自动领取',
    custom: false,
    // 抖音 web 详情接口认 ttwid，而它只由页面脚本写入，得让浏览器开一次首页
    fingerprint: true
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    hosts: ['xiaohongshu.com', 'xhslink.com', 'xhs.cn'],
    searchKey: '',
    home: 'https://www.xiaohongshu.com/',
    accent: '#f2607f',
    note: '视频笔记可缓存，分享短链会自动展开（query 里的 xsec_token 必须保留）；图文笔记没有音视频',
    custom: false,
    fingerprint: true
  },
  {
    id: 'weixin-channels',
    name: '微信视频号',
    hosts: ['channels.weixin.qq.com', 'finder.video.qq.com'],
    searchKey: '',
    home: 'https://channels.weixin.qq.com/',
    accent: '#67c48d',
    note: '仅支持粘贴链接；视频号没有公开网页接口，需要微信自己的登录态才取得流地址',
    custom: false
  }
]

/** 用户自建平台由设置面板增删（与「我的源」CustomSource 各自独立） */
let customPlatforms: MediaSource[] = []

export function syncCustomPlatforms(list: MediaSource[]): void {
  customPlatforms = [...list]
}

/** 内置在前、自建在后 */
export function allPlatforms(): MediaSource[] {
  return [...BUILTIN_PLATFORMS, ...customPlatforms]
}

export function platformById(id: string): MediaSource | null {
  return allPlatforms().find((platform) => platform.id === id) ?? null
}

/**
 * 按链接判断内容来自哪个平台。
 * 用「域名以某个 host 结尾」匹配，m.douyin.com、www.bilibili.com 这类
 * 子域都能命中，不必把每个子域都列全。
 */
export function platformForUrl(url: string): MediaSource | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  return (
    allPlatforms().find((platform) =>
      platform.hosts.some((h) => host === h || host.endsWith(`.${h}`))
    ) ?? null
  )
}

/** 只有带搜索键的平台才能进搜索框与发现页 */
export function searchablePlatforms(): MediaSource[] {
  return allPlatforms().filter((platform) => Boolean(platform.searchKey))
}
