import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  CacheStats,
  Category,
  CategoryBucket,
  ContentMode,
  CustomSource,
  DownloadTask,
  Episode,
  EpisodeMeta,
  InstallProgress,
  IpcResult,
  MediaSource,
  ProbeResult,
  QrPollResult,
  QrTicket,
  SearchOutcome,
  SourceAccount,
  SourceInput,
  ToolStatus,
  Transcript,
  TrendingBoard,
  WindowState
} from '@shared/types'

type Unsubscribe = () => void

function subscribe<T>(channel: string, handler: (payload: T) => void): Unsubscribe {
  const listener = (_event: unknown, payload: T): void => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  tools: {
    status: (): Promise<IpcResult<ToolStatus>> => ipcRenderer.invoke('tools:status'),
    install: (): Promise<IpcResult<string>> => ipcRenderer.invoke('tools:install'),
    onInstallProgress: (cb: (progress: InstallProgress) => void): Unsubscribe =>
      subscribe<InstallProgress>('tools:install-progress', cb)
  },
  yt: {
    search: (query: string, limit: number, mode: ContentMode): Promise<IpcResult<SearchOutcome>> =>
      ipcRenderer.invoke('yt:search', query, limit, mode),
    discover: (
      categoryId: string,
      seed: number,
      limit: number,
      mode: ContentMode
    ): Promise<IpcResult<{ query: string } & SearchOutcome>> =>
      ipcRenderer.invoke('yt:discover', categoryId, seed, limit, mode),
    /** 热门榜：按内容模式抓取，force 为 true 时忽略本地缓存 */
    trending: (mode: ContentMode, force = false): Promise<IpcResult<TrendingBoard>> =>
      ipcRenderer.invoke('yt:trending', mode, force),
    resolve: (url: string, mode: ContentMode): Promise<IpcResult<EpisodeMeta>> =>
      ipcRenderer.invoke('yt:resolve', url, mode),
    /** 边听边缓存：解析直链并返回可直接播放的流地址（视频模式不支持） */
    streamUrl: (id: string, mode: ContentMode): Promise<IpcResult<{ src: string }>> =>
      ipcRenderer.invoke('yt:streamUrl', id, mode)
  },
  auth: {
    /** 支持扫码登录的平台列表；新增平台会自动出现 */
    sources: (): Promise<IpcResult<MediaSource[]>> => ipcRenderer.invoke('auth:sources'),
    /** 某个平台的登录态；没登记的恒为匿名 */
    status: (sourceId: string): Promise<IpcResult<SourceAccount>> =>
      ipcRenderer.invoke('auth:status', sourceId),
    refresh: (sourceId: string): Promise<IpcResult<SourceAccount>> =>
      ipcRenderer.invoke('auth:refresh', sourceId),
    qrcode: (sourceId: string): Promise<IpcResult<QrTicket>> =>
      ipcRenderer.invoke('auth:qrcode', sourceId),
    poll: (sourceId: string, key: string): Promise<IpcResult<QrPollResult>> =>
      ipcRenderer.invoke('auth:poll', sourceId, key),
    logout: (sourceId: string): Promise<IpcResult<SourceAccount>> =>
      ipcRenderer.invoke('auth:logout', sourceId),
    onLoginChanged: (cb: (payload: { sourceId: string; account: SourceAccount }) => void): Unsubscribe =>
      subscribe<{ sourceId: string; account: SourceAccount }>('auth:login-changed', cb)
  },
  sources: {
    list: (): Promise<IpcResult<CustomSource[]>> => ipcRenderer.invoke('sources:list'),
    save: (input: SourceInput): Promise<IpcResult<CustomSource[]>> =>
      ipcRenderer.invoke('sources:save', input),
    remove: (id: string): Promise<IpcResult<CustomSource[]>> =>
      ipcRenderer.invoke('sources:remove', id)
  },
  downloads: {
    list: (): Promise<IpcResult<DownloadTask[]>> => ipcRenderer.invoke('dl:list'),
    enqueue: (meta: EpisodeMeta): Promise<IpcResult<DownloadTask>> =>
      ipcRenderer.invoke('dl:enqueue', meta),
    cancel: (id: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke('dl:cancel', id),
    clear: (scope: 'finished' | 'all'): Promise<IpcResult<DownloadTask[]>> =>
      ipcRenderer.invoke('dl:clear', scope),
    onUpdate: (cb: (task: DownloadTask) => void): Unsubscribe =>
      subscribe<DownloadTask>('dl:update', cb),
    onList: (cb: (tasks: DownloadTask[]) => void): Unsubscribe =>
      subscribe<DownloadTask[]>('dl:list', cb),
    onDone: (cb: (episode: Episode) => void): Unsubscribe => subscribe<Episode>('dl:done', cb)
  },
  library: {
    list: (mode?: ContentMode): Promise<IpcResult<Episode[]>> =>
      ipcRenderer.invoke('library:list', mode),
    buckets: (mode?: ContentMode): Promise<IpcResult<CategoryBucket[]>> =>
      ipcRenderer.invoke('library:buckets', mode),
    remove: (id: string, deleteFile = true): Promise<IpcResult<Episode[]>> =>
      ipcRenderer.invoke('library:remove', id, deleteFile),
    toggleFavorite: (id: string): Promise<IpcResult<Episode[]>> =>
      ipcRenderer.invoke('library:toggleFavorite', id),
    setCategory: (id: string, category: string): Promise<IpcResult<Episode | null>> =>
      ipcRenderer.invoke('library:setCategory', id, category),
    markPlayed: (id: string, seconds?: number): Promise<IpcResult<Episode | null>> =>
      ipcRenderer.invoke('library:markPlayed', id, seconds),
    saveProgress: (id: string, seconds: number): Promise<IpcResult<Episode | null>> =>
      ipcRenderer.invoke('library:saveProgress', id, seconds),
    reveal: (id: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke('library:reveal', id),
    onChanged: (cb: (episodes: Episode[]) => void): Unsubscribe =>
      subscribe<Episode[]>('library:changed', cb)
  },
  catalog: {
    list: (mode?: ContentMode): Promise<IpcResult<Category[]>> =>
      ipcRenderer.invoke('catalog:list', mode)
  },
  settings: {
    get: (): Promise<IpcResult<AppSettings>> => ipcRenderer.invoke('settings:get'),
    save: (patch: Partial<AppSettings>): Promise<IpcResult<AppSettings>> =>
      ipcRenderer.invoke('settings:save', patch)
  },
  net: {
    probe: (): Promise<IpcResult<ProbeResult>> => ipcRenderer.invoke('net:probe')
  },
  transcripts: {
    get: (id: string, force = false): Promise<IpcResult<Transcript>> =>
      ipcRenderer.invoke('transcript:get', id, force),
    onReady: (cb: (payload: { id: string; transcript: Transcript }) => void): Unsubscribe =>
      subscribe<{ id: string; transcript: Transcript }>('transcript:ready', cb)
  },
  cache: {
    stats: (): Promise<IpcResult<CacheStats>> => ipcRenderer.invoke('cache:stats'),
    openDir: (): Promise<IpcResult<string>> => ipcRenderer.invoke('cache:openDir'),
    clear: (): Promise<IpcResult<Episode[]>> => ipcRenderer.invoke('cache:clear')
  },
  app: {
    openExternal: (url: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('app:openExternal', url),
    info: (): Promise<IpcResult<{ version: string; platform: string; userData: string }>> =>
      ipcRenderer.invoke('app:info')
  },
  window: {
    minimize: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke('window:toggleMaximize'),
    close: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (cb: (maximized: boolean) => void): Unsubscribe =>
      subscribe<boolean>('window:maximized', cb),
    /* 形态控制：全屏 / 正常 / 迷你 / 托盘 / 置顶 */
    state: (): Promise<IpcResult<WindowState>> => ipcRenderer.invoke('window:state'),
    setFullscreen: (value: boolean): Promise<IpcResult<WindowState>> =>
      ipcRenderer.invoke('window:setFullscreen', value),
    toggleFullscreen: (): Promise<IpcResult<WindowState>> =>
      ipcRenderer.invoke('window:toggleFullscreen'),
    setMini: (value: boolean): Promise<IpcResult<WindowState>> =>
      ipcRenderer.invoke('window:setMini', value),
    restoreNormal: (): Promise<IpcResult<WindowState>> =>
      ipcRenderer.invoke('window:restoreNormal'),
    setAlwaysOnTop: (value: boolean): Promise<IpcResult<WindowState>> =>
      ipcRenderer.invoke('window:setAlwaysOnTop', value),
    hideToTray: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke('window:hideToTray'),
    onState: (cb: (state: WindowState) => void): Unsubscribe =>
      subscribe<WindowState>('window:state', cb)
  }
}

export type EchoApi = typeof api

contextBridge.exposeInMainWorld('echo', api)
