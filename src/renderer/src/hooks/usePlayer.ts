import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { PlayTarget } from '@shared/types'
import { nearestRate, sleepRemainingSeconds, shouldSleep } from '@shared/portable/playback'

export type RepeatMode = 'off' | 'all' | 'one'

/** 媒体加载失败的常见原因（MediaError.code） */
function describeMediaError(media: HTMLMediaElement): string {
  const err = media.error
  if (!err) return '播放中断'
  switch (err.code) {
    case 1:
      return '加载被中止'
    case 2:
      return '网络中断'
    case 3:
      return '解码失败'
    case 4:
      return '流地址已失效'
    default:
      return `媒体错误（${err.code}）`
  }
}

/**
 * 边听边缓存这类网络流的重试次数。
 * 直链常被上游提前作废，重新加载一次通常就能恢复，
 * 因此失败时不直接躺平，而是重新走一遍协议请求（主进程会重新解析直链）。
 */
const STREAM_RETRY_LIMIT = 2
const STREAM_RETRY_DELAY = 700

/** 播放中每积累这么久就回写一次进度，避免频繁写盘 */
const PROGRESS_FLUSH_SECONDS = 10
/** 界面刷新节流：进度条每秒画 4 次足够顺滑，再密只是白烧 CPU */
const PAINT_INTERVAL = 0.25

export interface PlayerOptions {
  /** 开始播放一集时触发 */
  onPlayed?: (target: PlayTarget) => void
  /** 进度需要持久化时触发：定时、暂停、切集、结束 */
  onProgress?: (target: PlayTarget, seconds: number) => void
  /** 决定从第几秒开始（断点续听 / 跳过片头的落点由外部策略决定） */
  startAt?: (target: PlayTarget) => number
  /** 媒体加载失败时上报（含自动重试的最终结果），用于界面提示 */
  onError?: (target: PlayTarget | null, message: string) => void
}

export interface PlayerApi {
  /**
   * 播放内核共用的媒体元素：渲染层把它挂到界面上唯一的 `<video>` 上。
   * 音频播客只出声音（元素隐藏），视频模式则连画面一起渲染，
   * 因此不需要在切换内容形态时重建播放器。
   */
  mediaRef: MutableRefObject<HTMLVideoElement | null>
  current: PlayTarget | null
  playing: boolean
  duration: number
  volume: number
  muted: boolean
  repeat: RepeatMode
  rate: number
  queue: PlayTarget[]
  /** 睡眠定时剩余秒数，0 表示未开启 */
  sleepRemaining: number
  /**
   * 订阅播放进度。进度是高频数据，不走 React 状态，
   * 否则整个应用每秒会被重渲染好几次。
   */
  subscribeTime: (listener: (time: number) => void) => () => void
  play: (target: PlayTarget, queue?: PlayTarget[]) => void
  toggle: () => void
  next: () => void
  prev: () => void
  seek: (time: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  cycleRepeat: () => void
  setRate: (rate: number) => void
  bumpRate: (delta: number) => void
  startSleep: (minutes: number) => void
  cancelSleep: () => void
  stop: () => void
}

export function usePlayer(options: PlayerOptions = {}): PlayerApi {
  const mediaRef = useRef<HTMLVideoElement | null>(null)
  const volumeRef = useRef(0.85)
  const mutedRef = useRef(false)
  const rateRef = useRef(1)
  /** 本集是否需要自动起播：源就绪后据此补播一次 */
  const autoplayRef = useRef(false)
  const retryRef = useRef(0)
  const queueRef = useRef<PlayTarget[]>([])
  const indexRef = useRef(-1)
  const repeatRef = useRef<RepeatMode>('off')
  const currentRef = useRef<PlayTarget | null>(null)
  const lastFlushRef = useRef(0)
  const lastPaintRef = useRef(0)
  const pendingSeekRef = useRef<number | null>(null)
  const timeListeners = useRef(new Set<(time: number) => void>())
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [current, setCurrent] = useState<PlayTarget | null>(null)
  const [queue, setQueue] = useState<PlayTarget[]>([])
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(0.85)
  const [muted, setMuted] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [rate, setRateState] = useState(1)
  const [sleepDeadline, setSleepDeadline] = useState(0)
  const [sleepRemaining, setSleepRemaining] = useState(0)

  /** 把进度推给订阅者（只有播放器与逐字稿在听） */
  const emitTime = useCallback((time: number) => {
    for (const listener of timeListeners.current) listener(time)
  }, [])

  const subscribeTime = useCallback((listener: (time: number) => void) => {
    timeListeners.current.add(listener)
    const media = mediaRef.current
    if (media) listener(media.currentTime)
    return () => {
      timeListeners.current.delete(listener)
    }
  }, [])

  /** 把当前进度交给外部持久化 */
  const flushProgress = useCallback((target: PlayTarget | null, seconds: number) => {
    if (!target) return
    lastFlushRef.current = seconds
    optionsRef.current.onProgress?.(target, seconds)
  }, [])

  const startTrack = useCallback(
    (target: PlayTarget, autoplay = true) => {
      const media = mediaRef.current
      if (!media) return
      // src 可能是本地 media:// 文件，也可能是边听边缓存的 stream:// 流
      media.src = target.src
      media.playbackRate = rateRef.current
      media.volume = volumeRef.current
      media.muted = mutedRef.current
      const start = optionsRef.current.startAt?.(target) ?? 0
      pendingSeekRef.current = start > 1 ? start : null
      if (!pendingSeekRef.current) media.currentTime = 0
      currentRef.current = target
      retryRef.current = 0
      autoplayRef.current = autoplay
      lastFlushRef.current = 0
      lastPaintRef.current = 0
      emitTime(0)
      setCurrent(target)
      setDuration(target.duration || 0)
      if (autoplay) {
        // 网络流刚写进 src 时往往还没就绪，play() 会被拒；
        // 真正的起播由 canplay 兜底，这里只是尽早尝试。
        void media.play().catch(() => undefined)
      }
    },
    [emitTime]
  )

  const step = useCallback(
    (delta: number) => {
      const list = queueRef.current
      if (!list.length) return
      flushProgress(currentRef.current, mediaRef.current?.currentTime ?? 0)
      let next = indexRef.current + delta
      if (next < 0) next = list.length - 1
      if (next >= list.length) next = 0
      indexRef.current = next
      startTrack(list[next])
    },
    [flushProgress, startTrack]
  )

  const currentId = current?.id ?? null

  /**
   * 媒体元素由渲染层挂载（音频与视频共用同一个 <video>），这里负责接管事件。
   * 切集不会重建元素，但切换内容形态（音频 ↔ 视频）会，所以依赖里带上 currentId，
   * 保证换了元素之后事件与音量/倍速仍然接得上。
   */
  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    media.volume = volumeRef.current
    media.muted = mutedRef.current
    media.playbackRate = rateRef.current

    /** 源就绪后补一次起播：网络流首帧 play() 常因资源未就绪被拒 */
    const ensurePlaying = (): void => {
      if (!autoplayRef.current || !media.paused) return
      void media.play().then(
        () => {
          autoplayRef.current = false
        },
        () => undefined
      )
    }

    const handleTime = (): void => {
      const time = media.currentTime
      // 界面上按 250ms 节流；写盘按 10 秒
      if (Math.abs(time - lastPaintRef.current) >= PAINT_INTERVAL) {
        lastPaintRef.current = time
        emitTime(time)
      }
      const target = currentRef.current
      if (target && Math.abs(time - lastFlushRef.current) >= PROGRESS_FLUSH_SECONDS) {
        flushProgress(target, time)
      }
    }
    const handleMeta = (): void => {
      if (pendingSeekRef.current !== null) {
        media.currentTime = pendingSeekRef.current
        lastPaintRef.current = pendingSeekRef.current
        emitTime(pendingSeekRef.current)
        pendingSeekRef.current = null
      }
      if (Number.isFinite(media.duration) && media.duration > 0) setDuration(media.duration)
      ensurePlaying()
    }
    const handleReady = (): void => ensurePlaying()
    const handlePlay = (): void => {
      autoplayRef.current = false
      setPlaying(true)
    }
    /**
     * 加载失败：直链被上游提前作废是最常见的原因，
     * 重新 load() 会让主进程重新解析一次，因此先重试再报错。
     */
    const handleError = (): void => {
      const target = currentRef.current
      setPlaying(false)
      if (target && retryRef.current < STREAM_RETRY_LIMIT) {
        retryRef.current += 1
        window.setTimeout(() => {
          if (currentRef.current?.id !== target.id) return
          media.load()
          if (autoplayRef.current) void media.play().catch(() => undefined)
        }, STREAM_RETRY_DELAY)
        return
      }
      optionsRef.current.onError?.(target, describeMediaError(media))
    }
    const handlePause = (): void => {
      setPlaying(false)
      flushProgress(currentRef.current, media.currentTime)
    }
    const handleEnded = (): void => {
      const target = currentRef.current
      if (repeatRef.current === 'one') {
        media.currentTime = 0
        emitTime(0)
        void media.play()
        return
      }
      if (target) flushProgress(target, target.duration || media.duration || 0)
      const list = queueRef.current
      const isLast = indexRef.current >= list.length - 1
      if (isLast && repeatRef.current === 'off') {
        setPlaying(false)
        return
      }
      step(1)
    }

    media.addEventListener('timeupdate', handleTime)
    media.addEventListener('loadedmetadata', handleMeta)
    media.addEventListener('durationchange', handleMeta)
    media.addEventListener('canplay', handleReady)
    media.addEventListener('loadeddata', handleReady)
    media.addEventListener('play', handlePlay)
    media.addEventListener('pause', handlePause)
    media.addEventListener('ended', handleEnded)
    media.addEventListener('error', handleError)

    // 解绑时不能清 src / 暂停：切集时新的一集已经先写进元素并开始播放了
    return () => {
      media.removeEventListener('timeupdate', handleTime)
      media.removeEventListener('loadedmetadata', handleMeta)
      media.removeEventListener('durationchange', handleMeta)
      media.removeEventListener('canplay', handleReady)
      media.removeEventListener('loadeddata', handleReady)
      media.removeEventListener('play', handlePlay)
      media.removeEventListener('pause', handlePause)
      media.removeEventListener('ended', handleEnded)
      media.removeEventListener('error', handleError)
    }
  }, [emitTime, flushProgress, step, currentId])

  /* 睡眠定时：每秒刷新剩余时间，到点暂停 */
  useEffect(() => {
    if (!sleepDeadline) {
      setSleepRemaining(0)
      return
    }
    const tick = (): void => {
      if (shouldSleep(sleepDeadline)) {
        mediaRef.current?.pause()
        setSleepDeadline(0)
        setSleepRemaining(0)
        return
      }
      setSleepRemaining(sleepRemainingSeconds(sleepDeadline))
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [sleepDeadline])

  const play = useCallback(
    (target: PlayTarget, nextQueue?: PlayTarget[]) => {
      const list = nextQueue && nextQueue.length ? nextQueue : queueRef.current
      const resolved = list.some((item) => item.id === target.id) ? list : [target, ...list]
      queueRef.current = resolved
      setQueue(resolved)
      indexRef.current = resolved.findIndex((item) => item.id === target.id)
      startTrack(target)
      optionsRef.current.onPlayed?.(target)
    },
    [startTrack]
  )

  const toggle = useCallback(() => {
    const media = mediaRef.current
    if (!media || !currentRef.current) return
    if (media.paused) void media.play().catch(() => undefined)
    else media.pause()
  }, [])

  const seek = useCallback(
    (time: number) => {
      const media = mediaRef.current
      if (!media) return
      media.currentTime = Math.max(0, Math.min(time, media.duration || time))
      lastPaintRef.current = media.currentTime
      emitTime(media.currentTime)
    },
    [emitTime]
  )

  const setVolume = useCallback((value: number) => {
    const media = mediaRef.current
    const clamped = Math.max(0, Math.min(1, value))
    volumeRef.current = clamped
    mutedRef.current = clamped === 0
    if (media) {
      media.volume = clamped
      media.muted = clamped === 0
    }
    setVolumeState(clamped)
    setMuted(clamped === 0)
  }, [])

  const toggleMute = useCallback(() => {
    const media = mediaRef.current
    if (!media) return
    media.muted = !media.muted
    mutedRef.current = media.muted
    setMuted(media.muted)
  }, [])

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => {
      const order: RepeatMode[] = ['off', 'all', 'one']
      const next = order[(order.indexOf(prev) + 1) % order.length]
      repeatRef.current = next
      return next
    })
  }, [])

  const setRate = useCallback((value: number) => {
    const next = nearestRate(value)
    rateRef.current = next
    const media = mediaRef.current
    if (media) media.playbackRate = next
    setRateState(next)
  }, [])

  const bumpRate = useCallback((delta: number) => {
    setRateState((prev) => {
      const next = nearestRate(prev + delta)
      rateRef.current = next
      const media = mediaRef.current
      if (media) media.playbackRate = next
      return next
    })
  }, [])

  const startSleep = useCallback((minutes: number) => {
    setSleepDeadline(Date.now() + Math.max(1, minutes) * 60_000)
  }, [])

  const cancelSleep = useCallback(() => setSleepDeadline(0), [])

  const stop = useCallback(() => {
    const media = mediaRef.current
    flushProgress(currentRef.current, media?.currentTime ?? 0)
    if (!media) return
    media.pause()
    media.removeAttribute('src')
    media.load()
    currentRef.current = null
    setCurrent(null)
    setPlaying(false)
    setDuration(0)
    lastPaintRef.current = 0
    emitTime(0)
  }, [emitTime, flushProgress])

  return {
    mediaRef,
    current,
    playing,
    duration,
    volume,
    muted,
    repeat,
    rate,
    queue,
    sleepRemaining,
    subscribeTime,
    play,
    toggle,
    next: () => step(1),
    prev: () => step(-1),
    seek,
    setVolume,
    toggleMute,
    cycleRepeat,
    setRate,
    bumpRate,
    startSleep,
    cancelSleep,
    stop
  }
}
