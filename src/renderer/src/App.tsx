import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ANONYMOUS_ACCOUNT,
  DEFAULT_SETTINGS,
  type AppSettings,
  type CacheStats,
  type Category,
  type CategoryBucket,
  type ContentMode,
  type CustomSource,
  type DownloadTask,
  type Episode,
  type EpisodeMeta,
  type InstallProgress,
  type MediaSource,
  type PlayTarget,
  type ProbeResult,
  type ShowRef,
  type SourceAccount,
  type SourceInput,
  type ToolStatus,
  type Transcript,
  type TrendingBoard,
  type WindowState
} from '@shared/types'
import { resumePosition } from '@shared/portable/playback'
import { modeSpec } from '@shared/modes'
import { usePlayer } from '@/hooks/usePlayer'
import {
  cleanEpisodeTitle,
  formatBytes,
  formatDurationLong,
  formatRelative,
  toPlayTarget,
  toStreamTarget
} from '@/utils/format'
import { TitleBar } from '@/components/TitleBar'
import { CategoryRail, type RailItem } from '@/components/CategoryRail'
import { CategoryBoard } from '@/components/CategoryBoard'
import { CategorySpotlight } from '@/components/CategorySpotlight'
import { SourceForm } from '@/components/SourceForm'
import { PodcastPlayer } from '@/components/PodcastPlayer'
import { ResultList } from '@/components/ResultList'
import { EpisodeList } from '@/components/EpisodeList'
import { ModeSwitcher } from '@/components/ModeSwitcher'
import { DownloadQueue } from '@/components/DownloadQueue'
import { SettingsPanel } from '@/components/SettingsPanel'
import { QrLoginModal } from '@/components/QrLoginModal'
import { ToastStack, type ToastItem } from '@/components/Toast'
import {
  DownloadIcon,
  FolderIcon,
  GridIcon,
  HeartIcon,
  HeadphonesIcon,
  RefreshIcon,
  SearchIcon,
  SparkIcon
} from '@/components/icons'

type TabKey = 'trending' | 'discover' | 'categories' | 'library' | 'downloads'

const ACTIVE_STATUS: DownloadTask['status'][] = ['queued', 'downloading', 'processing']

export default function App() {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [buckets, setBuckets] = useState<CategoryBucket[]>([])
  const [catalog, setCatalog] = useState<Category[]>([])
  const [results, setResults] = useState<EpisodeMeta[]>([])
  const [trending, setTrending] = useState<TrendingBoard | null>(null)
  const [trendingLoading, setTrendingLoading] = useState(false)
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<ToolStatus | null>(null)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [netState, setNetState] = useState<ProbeResult | null>(null)
  const [probing, setProbing] = useState(false)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [sources, setSources] = useState<CustomSource[]>([])
  const [activeSource, setActiveSource] = useState<string | null>(null)
  const [sourceForm, setSourceForm] = useState<{ open: boolean; editing: CustomSource | null }>({
    open: false,
    editing: null
  })
  /** 正在解析直链的单集 */
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set())
  /** 平台 id → 登录态；只有声明了登录方式的平台才有条目 */
  const [accounts, setAccounts] = useState<Record<string, SourceAccount>>({})
  /** 声明了登录方式的平台列表，账号区据此渲染 */
  const [authPlatforms, setAuthPlatforms] = useState<MediaSource[]>([])
  /** 扫码登录弹窗：从设置面板的账号区点进来时打开 */
  const [loginSource, setLoginSource] = useState<string | null>(null)

  // 平台登录态：主进程启动时已联网校准，这里取各平台的快照；
  // 扫码成功后主进程会广播，带上平台 id 才知道刷哪一行
  useEffect(() => {
    void (async () => {
      const list = await window.echo.auth.sources()
      if (!list.ok) return
      setAuthPlatforms(list.data)
      const snapshot: Record<string, SourceAccount> = {}
      await Promise.all(
        list.data.map(async (platform) => {
          const status = await window.echo.auth.status(platform.id)
          if (status.ok) snapshot[platform.id] = status.data
        })
      )
      setAccounts(snapshot)
    })()
    return window.echo.auth.onLoginChanged(({ sourceId, account }) => {
      setAccounts((prev) => ({ ...prev, [sourceId]: account }))
    })
  }, [])

  /** 窗口形态：迷你模式下只渲染播放器 */
  const [winState, setWinState] = useState<WindowState>({
    fullscreen: false,
    maximized: false,
    mini: false,
    alwaysOnTop: false
  })
  /** 播客主体放大：左右两栏让位，播放器占满内容区 */
  const [focusPlayer, setFocusPlayer] = useState(false)

  /** 当前内容模式（归一化后），一切检索与列表都挂在它上面 */
  const mode: ContentMode = modeSpec(settings.mode).id
  const spec = modeSpec(mode)
  const modeRef = useRef<ContentMode>(mode)
  modeRef.current = mode

  const currentIdRef = useRef<string | null>(null)
  // 默认落在「分类」：一进来就有节目可挑，而不是空列表
  const [tab, setTab] = useState<TabKey>('categories')
  const [keyword, setKeyword] = useState('')
  const [lastQuery, setLastQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toastSeq = useRef(0)

  const pushToast = useCallback((kind: ToastItem['kind'], text: string) => {
    toastSeq.current += 1
    const id = toastSeq.current
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 4500)
  }, [])

  /** 退出某个平台的登录：结果提示统一由这里给出 */
  const logoutSource = useCallback(
    (sourceId: string) => {
      void window.echo.auth.logout(sourceId).then((res) => {
        if (!res.ok) {
          pushToast('error', res.message)
          return
        }
        setAccounts((prev) => ({ ...prev, [sourceId]: res.data }))
        pushToast('info', '已退出登录')
      })
    },
    [pushToast]
  )

  /** 合规过滤有拦截时给个明确反馈，避免用户以为「搜不到」 */
  const notifyBlocked = useCallback(
    (blocked: number) => {
      if (blocked > 0) pushToast('info', `已按合规策略过滤 ${blocked} 条内容`)
    },
    [pushToast]
  )

  const refreshLibrary = useCallback(async () => {
    const [list, bucketList, cacheStats] = await Promise.all([
      window.echo.library.list(modeRef.current),
      window.echo.library.buckets(modeRef.current),
      window.echo.cache.stats()
    ])
    if (list.ok) setEpisodes(list.data)
    if (bucketList.ok) setBuckets(bucketList.data)
    if (cacheStats.ok) setStats(cacheStats.data)
  }, [])

  const refreshStatus = useCallback(async () => {
    const res = await window.echo.tools.status()
    if (res.ok) setStatus(res.data)
  }, [])

  /* 首次加载 + 事件订阅 */
  useEffect(() => {
    void (async () => {
      // 库内容与分类目录交给下面的「模式」effect 拉，这里只取与模式无关的状态
      const [config, queue, toolStatus, sourceList] = await Promise.all([
        window.echo.settings.get(),
        window.echo.downloads.list(),
        window.echo.tools.status(),
        window.echo.sources.list()
      ])
      if (sourceList.ok) setSources(sourceList.data)
      if (config.ok) setSettings(config.data)
      if (queue.ok) setTasks(queue.data)
      if (toolStatus.ok) setStatus(toolStatus.data)
      const cacheStats = await window.echo.cache.stats()
      if (cacheStats.ok) setStats(cacheStats.data)
      const probe = await window.echo.net.probe()
      if (probe.ok) setNetState(probe.data)
    })()

    const offUpdate = window.echo.downloads.onUpdate((task) => {
      setTasks((prev) => {
        const index = prev.findIndex((item) => item.id === task.id)
        if (index < 0) return [...prev, task]
        const next = [...prev]
        next[index] = task
        return next
      })
    })
    const offList = window.echo.downloads.onList(setTasks)
    const offLibrary = window.echo.library.onChanged(() => {
      void refreshLibrary()
    })
    const offDone = window.echo.downloads.onDone((episode) => {
      pushToast('success', `已缓存《${cleanEpisodeTitle(episode.title)}》`)
    })
    const offProgress = window.echo.tools.onInstallProgress(setProgress)

    return () => {
      offUpdate()
      offList()
      offLibrary()
      offDone()
      offProgress()
    }
  }, [pushToast, refreshLibrary])

  /**
   * 模式变化（含首次从设置里读到模式）时，重新拉一次该模式的
   * 分类目录、缓存列表与分类聚合——三者都随模式整体切换。
   */
  useEffect(() => {
    void (async () => {
      const [list, bucketList, categories] = await Promise.all([
        window.echo.library.list(mode),
        window.echo.library.buckets(mode),
        window.echo.catalog.list(mode)
      ])
      if (list.ok) setEpisodes(list.data)
      if (bucketList.ok) setBuckets(bucketList.data)
      if (categories.ok) setCatalog(categories.data)
    })()
  }, [mode])

  /** 播放起点策略：本地缓存优先断点续听，其次跳过片头；流播放只跳片头 */
  const startAt = useCallback(
    (target: PlayTarget) => {
      if (target.cached && settings.resumePlayback) {
        const episode = episodes.find((item) => item.id === target.id)
        const resume = resumePosition(target.duration, episode?.progress ?? 0)
        if (resume > 0) return resume
      }
      return settings.skipIntro > 0 ? settings.skipIntro : 0
    },
    [episodes, settings.resumePlayback, settings.skipIntro]
  )

  const player = usePlayer(
    useMemo(
      () => ({
        startAt,
        onPlayed: (target: PlayTarget) => {
          // 还没缓存的单集不计播放次数
          if (!target.cached) return
          void window.echo.library.markPlayed(target.id).then((res) => {
            if (res.ok && res.data) {
              const updated = res.data
              setEpisodes((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
              void refreshLibrary()
            }
          })
        },
        onProgress: (target: PlayTarget, seconds: number) => {
          setEpisodes((prev) =>
            prev.map((item) => (item.id === target.id ? { ...item, progress: seconds } : item))
          )
          // 未缓存的进度会先暂存，缓存完成后自动补上
          void window.echo.library.saveProgress(target.id, seconds)
        },
        // 自动重试仍失败才走到这里：明确告诉用户原因，而不是停在「已暂停」
        onError: (target: PlayTarget | null, message: string) => {
          const name = target ? `《${cleanEpisodeTitle(target.title)}》` : '当前单集'
          pushToast('error', `${name}播放失败：${message}`)
        }
      }),
      [pushToast, startAt, refreshLibrary]
    )
  )

  const loadTranscript = useCallback(async (id: string, force = false) => {
    setTranscriptLoading(true)
    const res = await window.echo.transcripts.get(id, force)
    setTranscriptLoading(false)
    if (currentIdRef.current !== id) return
    setTranscript(res.ok ? res.data : null)
  }, [])

  const currentId = player.current?.id ?? null

  // 换单集就重新取逐字稿；匹配与翻译都放在主进程完成
  useEffect(() => {
    currentIdRef.current = currentId
    // 字幕关着就不预取，省流量也省内存；重新打开时立刻拉
    if (!currentId || !settings.subtitlesEnabled) {
      setTranscript(null)
      return
    }
    setTranscript(null)
    void loadTranscript(currentId)
  }, [currentId, loadTranscript, settings.subtitlesEnabled])

  // 下载完成后的预取结果，命中当前单集就直接换上
  useEffect(
    () =>
      window.echo.transcripts.onReady((payload) => {
        if (currentIdRef.current === payload.id) setTranscript(payload.transcript)
      }),
    []
  )

  // 窗口形态（全屏 / 迷你 / 置顶）由主进程决定，这里跟随
  useEffect(() => {
    void window.echo.window.state().then((res) => {
      if (res.ok) setWinState(res.data)
    })
    return window.echo.window.onState(setWinState)
  }, [])

  // 窗口 / 任务栏标题跟着模式走，一眼能看出当前在看哪一类内容
  useEffect(() => {
    document.title = `EchoPod · ${spec.label}`
  }, [spec.label])

  // 主题写到 <html data-theme> 上，具体配色由 themes.css 接管
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme || 'vinyl'
  }, [settings.theme])

  // 字幕字号同样写在根元素上，由 CSS 变量 --sub-scale 接管
  useEffect(() => {
    document.documentElement.dataset.subtitle = settings.subtitleSize || 'md'
  }, [settings.subtitleSize])

  // 设置里的默认倍速只在加载后同步一次，之后由播放器自己控制
  useEffect(() => {
    player.setRate(settings.playbackRate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.playbackRate])

  const cachedIds = useMemo(() => new Set(episodes.map((episode) => episode.id)), [episodes])
  const busyIds = useMemo(
    () => new Set(tasks.filter((task) => ACTIVE_STATUS.includes(task.status)).map((task) => task.id)),
    [tasks]
  )
  const activeCount = tasks.filter((task) => ACTIVE_STATUS.includes(task.status)).length

  const railItems = useMemo<RailItem[]>(() => {
    return catalog.map((category) => ({
      key: category.id,
      name: category.name,
      count: buckets.find((bucket) => bucket.category.id === category.id)?.episodes.length ?? 0,
      accent: category.accent
    }))
  }, [catalog, buckets])

  const activeCategory = useMemo(
    () => catalog.find((category) => category.id === categoryFilter) ?? null,
    [catalog, categoryFilter]
  )
  const activeBucket = useMemo(
    () => buckets.find((bucket) => bucket.category.id === categoryFilter) ?? null,
    [buckets, categoryFilter]
  )

  const visibleEpisodes = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase()
    return episodes.filter((episode) => {
      if (categoryFilter !== 'all' && episode.category !== categoryFilter) return false
      if (favoriteOnly && !episode.favorite) return false
      if (!query) return true
      return (
        episode.title.toLowerCase().includes(query) ||
        episode.channel.toLowerCase().includes(query) ||
        cleanEpisodeTitle(episode.title).toLowerCase().includes(query)
      )
    })
  }, [episodes, libraryQuery, favoriteOnly, categoryFilter])

  const runSearch = useCallback(
    async (raw?: string) => {
      const query = (raw ?? keyword).trim()
      if (!query) return
      if (!status?.ytDlpReady) {
        pushToast('error', '下载核心尚未初始化，请先点击右上角「初始化组件」')
        return
      }
      setTab('discover')
      setSearching(true)
      setLastQuery(query)
      const res = await window.echo.yt.search(query, settings.searchLimit, mode)
      setSearching(false)
      if (res.ok) {
        setResults(res.data.items)
        notifyBlocked(res.data.blocked)
        if (!res.data.items.length) pushToast('info', '没有找到匹配的单集')
      } else {
        setResults([])
        pushToast('error', res.message)
      }
    },
    [keyword, mode, notifyBlocked, pushToast, settings.searchLimit, status?.ytDlpReady]
  )

  /** 分类发现：用内置英文关键词一键搜一批回来 */
  const discover = useCallback(
    async (categoryId: string) => {
      if (!status?.ytDlpReady) {
        pushToast('error', '下载核心尚未初始化，请先点击右上角「初始化组件」')
        return
      }
      setTab('discover')
      setSearching(true)
      const res = await window.echo.yt.discover(
        categoryId,
        Date.now() % 997,
        settings.searchLimit,
        mode
      )
      setSearching(false)
      if (res.ok) {
        setResults(res.data.items)
        setLastQuery(res.data.query)
        notifyBlocked(res.data.blocked)
        pushToast('info', `已按「${res.data.query}」检索`)
      } else {
        setResults([])
        pushToast('error', res.message)
      }
    },
    [mode, notifyBlocked, pushToast, settings.searchLimit, status?.ytDlpReady]
  )

  /** 点精选节目 → 直接拉取该节目的最新单集 */
  const searchShow = useCallback(
    async (show: ShowRef) => {
      if (!status?.ytDlpReady) {
        pushToast('error', '下载核心尚未初始化，请先点击右上角「初始化组件」')
        return
      }
      setTab('discover')
      setSearching(true)
      setLastQuery(show.name)
      const res = await window.echo.yt.search(show.channel, settings.searchLimit, mode)
      setSearching(false)
      if (res.ok) {
        setResults(res.data.items)
        notifyBlocked(res.data.blocked)
        if (!res.data.items.length) pushToast('info', `没有找到「${show.name}」的单集`)
      } else {
        setResults([])
        pushToast('error', res.message)
      }
    },
    [mode, notifyBlocked, pushToast, settings.searchLimit, status?.ytDlpReady]
  )

  /** 热门榜：默认命中本地缓存（6 小时），force 才重新联网抓取 */
  const loadTrending = useCallback(
    async (force = false) => {
      if (!status?.ytDlpReady) {
        pushToast('error', '下载核心尚未初始化，请先点击右上角「初始化组件」')
        return
      }
      setTrendingLoading(true)
      const res = await window.echo.yt.trending(mode, force)
      setTrendingLoading(false)
      if (res.ok) {
        setTrending(res.data)
        if (force) notifyBlocked(res.data.blocked)
      } else {
        pushToast('error', res.message)
      }
    },
    [mode, notifyBlocked, pushToast, status?.ytDlpReady]
  )

  // 首次切到「热门」时自动抓取一次
  useEffect(() => {
    if (tab !== 'trending' || trending || trendingLoading || !status) return
    void loadTrending(false)
  }, [tab, trending, trendingLoading, status, loadTrending])

  /** jump 为 false 时不跳转到下载页（边听边缓存时别打断浏览） */
  const enqueue = useCallback(
    async (meta: EpisodeMeta, jump = true): Promise<boolean> => {
      const res = await window.echo.downloads.enqueue(meta)
      if (!res.ok) {
        pushToast('error', res.message)
        return false
      }
      setTasks((prev) => (prev.some((item) => item.id === meta.id) ? prev : [...prev, res.data]))
      if (jump) setTab('downloads')
      return true
    },
    [pushToast]
  )

  const playEpisode = useCallback(
    (episode: Episode, queue?: Episode[]) => {
      player.play(toPlayTarget(episode), (queue ?? episodes).map(toPlayTarget))
    },
    [episodes, player]
  )

  /** 播放已经缓存的单集（按 id 找） */
  const playById = useCallback(
    (id: string) => {
      const episode = episodes.find((item) => item.id === id)
      if (episode) playEpisode(episode, episodes)
    },
    [episodes, playEpisode]
  )

  /** 边听边缓存：先解析直链开播，同时把这一集排进下载队列 */
  const streamEpisode = useCallback(
    async (meta: EpisodeMeta) => {
      if (!status?.ytDlpReady) {
        pushToast('error', '下载核心尚未初始化，请先点击右上角「初始化组件」')
        return
      }
      // 视频体积大、码率波动也大，边看边缓存体验很差，直接走先缓存后播
      if (modeSpec(meta.mode).kind === 'video') {
        if (await enqueue(meta, false)) {
          pushToast('info', '已加入缓存队列，下载完成后即可观看')
        }
        return
      }
      setStreamingIds((prev) => new Set(prev).add(meta.id))
      const res = await window.echo.yt.streamUrl(meta.id, mode)
      setStreamingIds((prev) => {
        const next = new Set(prev)
        next.delete(meta.id)
        return next
      })
      if (!res.ok) {
        pushToast('error', res.message)
        return
      }
      player.play(toStreamTarget(meta), results.map(toStreamTarget))
      void enqueue(meta, false)
      pushToast('info', '正在边听边缓存，缓存完成后会转为本地播放')
    },
    [enqueue, mode, player, pushToast, results, status?.ytDlpReady]
  )

  const removeEpisode = useCallback(
    async (episode: Episode) => {
      const confirmed = window.confirm(`确定要从本地缓存中删除《${cleanEpisodeTitle(episode.title)}》吗？`)
      if (!confirmed) return
      const res = await window.echo.library.remove(episode.id, true)
      if (!res.ok) {
        pushToast('error', res.message)
        return
      }
      setEpisodes(res.data)
      if (player.current?.id === episode.id) player.stop()
      await refreshLibrary()
      pushToast('info', '已从缓存中删除')
    },
    [player, pushToast, refreshLibrary]
  )

  const changeCategory = useCallback(
    async (id: string, category: string) => {
      const res = await window.echo.library.setCategory(id, category)
      if (!res.ok) {
        pushToast('error', res.message)
        return
      }
      await refreshLibrary()
    },
    [pushToast, refreshLibrary]
  )

  /* ── 我的源 ─────────────────────────────────────────── */

  const saveSource = useCallback(
    async (input: SourceInput) => {
      const res = await window.echo.sources.save(input)
      if (!res.ok) {
        pushToast('error', res.message)
        return
      }
      setSources(res.data)
      setSourceForm({ open: false, editing: null })
      pushToast('success', `已保存源「${input.name}」`)
    },
    [pushToast]
  )

  const removeSource = useCallback(
    async (id: string) => {
      const res = await window.echo.sources.remove(id)
      if (!res.ok) {
        pushToast('error', res.message)
        return
      }
      setSources(res.data)
      if (activeSource === id) setActiveSource(null)
      pushToast('info', '已删除该源')
    },
    [activeSource, pushToast]
  )

  /** 点源即检索：链接走频道展开，关键词走搜索 */
  const selectSource = useCallback(
    (source: CustomSource) => {
      setActiveSource(source.id)
      setKeyword(source.query)
      // 源上记的分类可能属于别的模式，这里只认当前目录里存在的分类
      const known = catalog.some((category) => category.id === source.category)
      setCategoryFilter(known ? source.category : 'all')
      void runSearch(source.query)
    },
    [catalog, runSearch]
  )

  const installToolchain = useCallback(async () => {
    if (status?.installing) return
    setProgress({ step: '准备安装…', ratio: 0 })
    setStatus((prev) => (prev ? { ...prev, installing: true } : prev))
    const res = await window.echo.tools.install()
    setProgress(null)
    await refreshStatus()
    if (res.ok) pushToast('success', `组件已就绪：${res.data}`)
    else pushToast('error', res.message)
  }, [pushToast, refreshStatus, status?.installing])

  const reprobe = useCallback(async (): Promise<boolean> => {
    setProbing(true)
    const res = await window.echo.net.probe()
    setProbing(false)
    if (res.ok) {
      setNetState(res.data)
      return res.data.reachable
    }
    return false
  }, [])

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }))
      // 合规开关变化后旧榜单已失效，重新抓取
      if ('safeMode' in patch) setTrending(null)
      const needsProbe = 'proxy' in patch || 'proxyMode' in patch
      void window.echo.settings.save(patch).then(() => {
        if (needsProbe) void reprobe()
      })
    },
    [reprobe]
  )

  /**
   * 切模式：语言、时长区间、媒介形态与整份分类目录一起换。
   * 旧模式下的搜索结果与榜单都不再适用，一并作废，避免张冠李戴。
   */
  const switchMode = useCallback(
    (next: ContentMode) => {
      if (next === mode) return
      updateSettings({ mode: next })
      setTrending(null)
      setResults([])
      setLastQuery('')
      setLibraryQuery('')
      setCategoryFilter('all')
      setActiveSource(null)
      setTab('categories')
      setFocusPlayer(false)
      pushToast('info', `已切换到「${modeSpec(next).label}」`)
    },
    [mode, pushToast, updateSettings]
  )

  const clearCache = useCallback(async () => {
    if (!window.confirm('确定要清空全部本地缓存吗？该操作会删除已下载的音频文件。')) return
    const res = await window.echo.cache.clear()
    if (!res.ok) {
      pushToast('error', res.message)
      return
    }
    setEpisodes(res.data)
    player.stop()
    await refreshLibrary()
    pushToast('info', '缓存已清空')
  }, [player, pushToast, refreshLibrary])

  const handleRailSelect = useCallback((key: string) => {
    setCategoryFilter(key)
    setTab('library')
  }, [])

  const ready = Boolean(status?.ytDlpReady)

  return (
    <div
      className={`app${winState.mini ? ' app-mini' : ''}${
        focusPlayer && !winState.mini ? ' app-focus' : ''
      }`}
    >
      <TitleBar
        status={status}
        progress={progress}
        onInstall={installToolchain}
        compact={winState.mini}
        focus={focusPlayer}
        onSetFocus={setFocusPlayer}
        slogan={`${spec.label} · 缓存即听`}
      />

      <div className="app-body">
        <CategoryRail
          items={railItems}
          total={episodes.length}
          active={categoryFilter}
          onSelect={handleRailSelect}
          sources={sources}
          activeSource={activeSource}
          onSelectSource={selectSource}
          onAddSource={() => setSourceForm({ open: true, editing: null })}
          onRemoveSource={(id) => void removeSource(id)}
        />

        <main className="workspace">
          <div className="workspace-head">
            <ModeSwitcher mode={mode} onChange={switchMode} />

            <div className="search-row">
              <input
                className="field"
                placeholder={spec.searchPlaceholder}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void runSearch()
                }}
              />
              <button className="btn btn-primary" onClick={() => void runSearch()} disabled={searching}>
                {searching ? (
                  <RefreshIcon size={15} className="spin" />
                ) : (
                  <SearchIcon size={15} />
                )}
                搜索
              </button>
            </div>

            <div className="toolbar-row">
              <div className="tabs">
                <button
                  className="tab"
                  data-active={tab === 'trending'}
                  onClick={() => setTab('trending')}
                >
                  <SparkIcon size={14} />
                  热门
                </button>
                <button
                  className="tab"
                  data-active={tab === 'discover'}
                  onClick={() => setTab('discover')}
                >
                  <SearchIcon size={14} />
                  发现
                </button>
                <button
                  className="tab"
                  data-active={tab === 'categories'}
                  onClick={() => setTab('categories')}
                >
                  <GridIcon size={14} />
                  分类
                </button>
                <button
                  className="tab"
                  data-active={tab === 'library'}
                  onClick={() => setTab('library')}
                >
                  <HeadphonesIcon size={14} />
                  我的单集
                  {episodes.length > 0 ? <span className="tab-count">{episodes.length}</span> : null}
                </button>
                <button
                  className="tab"
                  data-active={tab === 'downloads'}
                  onClick={() => setTab('downloads')}
                >
                  <DownloadIcon size={14} />
                  下载
                  {activeCount > 0 ? <span className="tab-count">{activeCount}</span> : null}
                </button>
              </div>

              <div className="toolbar-spacer" />

              <span className="meta-text">
                {stats
                  ? `${stats.count} 集 · ${formatBytes(stats.bytes)} · ${stats.categories} 个分类`
                  : '缓存统计读取中'}
              </span>
              <button
                className="icon-btn"
                onClick={() => void window.echo.cache.openDir()}
                title="打开缓存目录"
              >
                <FolderIcon size={16} />
              </button>
              <button className="btn btn-sm" onClick={() => setSettingsOpen(true)}>
                设置
              </button>
            </div>
          </div>

          <div className="workspace-scroll">
            {netState && !netState.reachable ? (
              <div className="net-warning">
                <span className="net-warning-dot" />
                <div className="net-warning-body">
                  <strong>无法连接 YouTube</strong>
                  <span>
                    {netState.proxy
                      ? `已探测到系统代理 ${netState.proxy}，但请求仍不通，可在设置里手动指定。`
                      : '未探测到系统代理。若已开启代理软件，请在设置中填写代理地址。'}
                  </span>
                </div>
                <button className="btn btn-sm" onClick={() => void reprobe()} disabled={probing}>
                  {probing ? '检测中…' : '重新检测'}
                </button>
                <button className="btn btn-sm" onClick={() => setSettingsOpen(true)}>
                  去设置
                </button>
              </div>
            ) : null}

            {!ready ? (
              <div className="setup-card">
                <div className="setup-card-icon">
                  <SparkIcon size={19} />
                </div>
                <div className="setup-card-body">
                  <div className="setup-card-title">
                    {status?.installing ? '正在初始化下载核心…' : '首次使用需要初始化下载核心'}
                  </div>
                  <div className="setup-card-text">
                    {status?.installing
                      ? (progress?.step ?? '正在准备组件…')
                      : '需要安装 yt-dlp 与 ffmpeg，约 30MB，仅需一次。组件会放进应用自己的目录，不影响系统环境。'}
                  </div>
                  {status?.installing ? (
                    <div className="setup-progress">
                      <span style={{ width: `${Math.round((progress?.ratio ?? 0) * 100)}%` }} />
                    </div>
                  ) : null}
                </div>
                {status?.installing ? null : (
                  <button className="btn btn-primary" onClick={installToolchain}>
                    立即初始化
                  </button>
                )}
              </div>
            ) : null}

            {tab === 'trending' ? (
              <>
                <div className="list-toolbar">
                  <span className="list-toolbar-text">
                    {trending
                      ? `${trending.source === 'cache' ? '本地缓存榜单' : '刚刚更新'} · ${formatRelative(
                          trending.fetchedAt
                        )}${
                          trending.blocked > 0
                            ? ` · 已按合规策略过滤 ${trending.blocked} 条内容`
                            : ' · 未发现不合规内容'
                        }`
                      : '首次进入会联网抓取，大约需要十几秒'}
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() => void loadTrending(true)}
                    disabled={trendingLoading}
                  >
                    <RefreshIcon size={13} className={trendingLoading ? 'spin' : undefined} />
                    {trendingLoading ? '抓取中…' : '换一批'}
                  </button>
                </div>
                <ResultList
                  results={trending?.items ?? []}
                  loading={trendingLoading && !trending}
                  cachedIds={cachedIds}
                  busyIds={busyIds}
                  streamingIds={streamingIds}
                  keyword=""
                  emptyTitle="还没抓到热门榜"
                  onDownload={enqueue}
                  onStream={(meta) => void streamEpisode(meta)}
                  onPlay={playById}
                  onOpen={(meta) => void window.echo.app.openExternal(meta.url)}
                />
              </>
            ) : null}

            {tab === 'discover' ? (
              <ResultList
                results={results}
                loading={searching}
                cachedIds={cachedIds}
                busyIds={busyIds}
                streamingIds={streamingIds}
                keyword={lastQuery}
                onDownload={enqueue}
                onStream={(meta) => void streamEpisode(meta)}
                onPlay={playById}
                onOpen={(meta) => void window.echo.app.openExternal(meta.url)}
              />
            ) : null}

            {tab === 'categories' ? (
              <CategoryBoard
                catalog={catalog}
                buckets={buckets}
                currentId={player.current?.id ?? null}
                playing={player.playing}
                onPlay={playEpisode}
                onDiscover={(id) => void discover(id)}
                onOpenCategory={handleRailSelect}
                onSearchShow={(show) => void searchShow(show)}
              />
            ) : null}

            {tab === 'library' ? (
              <>
                {activeCategory && activeCategory.id !== 'other' ? (
                  <CategorySpotlight
                    category={activeCategory}
                    cachedCount={activeBucket?.episodes.length ?? 0}
                    cachedDuration={formatDurationLong(activeBucket?.totalDuration ?? 0)}
                    onDiscover={() => void discover(activeCategory.id)}
                    onSearchShow={(show) => void searchShow(show)}
                    onPlayCached={() => {
                      const list = activeBucket?.episodes ?? []
                      if (list.length) playEpisode(list[0], list)
                    }}
                  />
                ) : null}
                <div className="list-toolbar">
                  <input
                    className="field"
                    style={{ height: 32, maxWidth: 260 }}
                    placeholder="在缓存中筛选…"
                    value={libraryQuery}
                    onChange={(event) => setLibraryQuery(event.target.value)}
                  />
                  <select
                    className="select"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    title="按分类筛选"
                  >
                    <option value="all">全部分类</option>
                    {catalog.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-btn"
                    data-active={favoriteOnly}
                    onClick={() => setFavoriteOnly((prev) => !prev)}
                    title="只看收藏"
                  >
                    <HeartIcon size={16} filled={favoriteOnly && episodes.some((e) => e.favorite)} />
                  </button>
                  <div className="toolbar-spacer" />
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const first = visibleEpisodes[0]
                      if (first) playEpisode(first, visibleEpisodes)
                    }}
                    disabled={!visibleEpisodes.length}
                  >
                    播放全部
                  </button>
                </div>
                <EpisodeList
                  episodes={visibleEpisodes}
                  categories={catalog}
                  currentId={player.current?.id ?? null}
                  playing={player.playing}
                  hasQuery={Boolean(libraryQuery.trim()) || favoriteOnly || categoryFilter !== 'all'}
                  onPlay={playEpisode}
                  onToggleFavorite={(id) => {
                    void window.echo.library.toggleFavorite(id).then(() => {
                      void refreshLibrary()
                    })
                  }}
                  onRemove={removeEpisode}
                  onReveal={(id) => void window.echo.library.reveal(id)}
                  onSetCategory={(id, category) => void changeCategory(id, category)}
                  onOpenSource={(episode) => void window.echo.app.openExternal(episode.url)}
                />
              </>
            ) : null}

            {tab === 'downloads' ? (
              <DownloadQueue
                tasks={tasks}
                playableIds={cachedIds}
                onPlay={(id) => {
                  const episode = episodes.find((item) => item.id === id)
                  if (episode) playEpisode(episode, episodes)
                  else pushToast('info', '正在整理缓存文件，稍后再点播放')
                }}
                onCancel={(id) => void window.echo.downloads.cancel(id)}
                onClear={async () => {
                  const res = await window.echo.downloads.clear('finished')
                  if (res.ok) setTasks(res.data)
                }}
              />
            ) : null}
          </div>
        </main>

        <PodcastPlayer
          player={player}
          transcript={transcript}
          transcriptLoading={transcriptLoading}
          showTranscript={showTranscript}
          subtitlesEnabled={settings.subtitlesEnabled}
          subtitleSize={settings.subtitleSize}
          onToggleTranscript={() => setShowTranscript((prev) => !prev)}
          focus={focusPlayer}
          onToggleFocus={() => setFocusPlayer((prev) => !prev)}
          onToggleSubtitles={() =>
            updateSettings({ subtitlesEnabled: !settings.subtitlesEnabled })
          }
          onSubtitleSize={(size) => updateSettings({ subtitleSize: size })}
          onReloadTranscript={() => {
            if (currentId) void loadTranscript(currentId, true)
          }}
        />
      </div>

      {sourceForm.open ? (
        <SourceForm
          categories={catalog}
          editing={sourceForm.editing}
          onSave={(input) => void saveSource(input)}
          onClose={() => setSourceForm({ open: false, editing: null })}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          settings={settings}
          stats={stats}
          status={status}
          netState={netState}
          probing={probing}
          onChange={updateSettings}
          onReprobe={() => void reprobe()}
          onClose={() => setSettingsOpen(false)}
          onOpenDir={() => void window.echo.cache.openDir()}
          onClearCache={() => void clearCache()}
          accounts={accounts}
          onOpenLogin={setLoginSource}
          onLogout={logoutSource}
        />
      ) : null}

      {loginSource ? (
        <QrLoginModal
          sourceId={loginSource}
          sourceName={
            authPlatforms.find((platform) => platform.id === loginSource)?.name ?? loginSource
          }
          account={accounts[loginSource] ?? ANONYMOUS_ACCOUNT}
          onToast={pushToast}
          onAccountChange={(sourceId, account) =>
            setAccounts((prev) => ({ ...prev, [sourceId]: account }))
          }
          onClose={() => setLoginSource(null)}
        />
      ) : null}

      <ToastStack items={toasts} />
    </div>
  )
}
