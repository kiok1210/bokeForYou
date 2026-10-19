import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import path from 'node:path'
import type { DownloadTask, Episode, EpisodeMeta } from '@shared/types'
import { modeSpec } from '@shared/modes'
import { getFfmpegPath, getYtDlpRunner } from './tools'
import { friendlyMessage, spawnYtDlp } from './ytdlp'
import { inferCategoryId } from './catalog'
import type { EpisodeStore } from './library'

const MAX_CONCURRENT = 2

interface Job {
  task: DownloadTask
  child: ChildProcess | null
  canceled: boolean
}

interface ProgressInfo {
  percent?: number
  speed?: string
  eta?: string
}

function parseProgress(line: string): ProgressInfo {
  if (!line.startsWith('[download]')) return {}
  const info: ProgressInfo = {}
  const percent = /\[download\]\s+([\d.]+)%/.exec(line)
  if (percent) info.percent = Number(percent[1]) / 100
  const speed = /\bat\s+(.+?\/s)/.exec(line)
  if (speed) info.speed = speed[1].trim()
  const eta = /ETA\s+([\d:]+)/.exec(line)
  if (eta) info.eta = eta[1]
  return info
}

function humanBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export class DownloadManager extends EventEmitter {
  private readonly jobs = new Map<string, Job>()
  private readonly queue: string[] = []
  private running = 0

  constructor(
    private readonly store: EpisodeStore,
    /** 按平台附加的 yt-dlp 参数（B站指纹、抖音 ttwid 等），由主进程注入 */
    private readonly sourceArgs?: (sourceId?: string) => Promise<string[]>
  ) {
    super()
  }

  list(): DownloadTask[] {
    return [...this.jobs.values()].map((j) => ({ ...j.task }))
  }

  isBusy(id: string): boolean {
    const job = this.jobs.get(id)
    return Boolean(job && (job.task.status === 'downloading' || job.task.status === 'queued'))
  }

  private update(job: Job, patch: Partial<DownloadTask>): void {
    job.task = { ...job.task, ...patch }
    this.emit('update', { ...job.task })
  }

  private fail(job: Job, stage: string, error: string): void {
    this.update(job, { status: 'error', stage, error, speed: '', eta: '' })
  }

  enqueue(meta: EpisodeMeta): DownloadTask {
    const existing = this.jobs.get(meta.id)
    if (existing && existing.task.status !== 'error' && existing.task.status !== 'canceled') {
      return { ...existing.task }
    }
    const task: DownloadTask = {
      id: meta.id,
      meta,
      status: 'queued',
      progress: 0,
      speed: '',
      eta: '',
      stage: '排队中'
    }
    this.jobs.set(meta.id, { task, child: null, canceled: false })
    this.queue.push(meta.id)
    this.emit('update', { ...task })
    this.pump()
    return { ...task }
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    job.canceled = true
    const queueIndex = this.queue.indexOf(id)
    if (queueIndex >= 0) this.queue.splice(queueIndex, 1)
    job.child?.kill()
    this.update(job, { status: 'canceled', stage: '已取消', speed: '', eta: '' })
  }

  clearFinished(): void {
    for (const [id, job] of [...this.jobs.entries()]) {
      if (['done', 'error', 'canceled'].includes(job.task.status)) this.jobs.delete(id)
    }
    this.emit('list', this.list())
  }

  private pump(): void {
    while (this.running < MAX_CONCURRENT && this.queue.length) {
      const id = this.queue.shift()
      if (!id) break
      const job = this.jobs.get(id)
      if (!job || job.canceled) continue
      this.running += 1
      void this.run(job).finally(() => {
        this.running -= 1
        this.pump()
      })
    }
  }

  private buildArgs(
    meta: EpisodeMeta,
    format: string,
    ffmpeg: string | null,
    extras: string[]
  ): string[] {
    const spec = modeSpec(meta.mode)
    const args = [
      meta.url,
      '--no-playlist',
      '--newline',
      '--no-warnings',
      '--no-mtime',
      '--write-thumbnail',
      // 下载阶段要宽容一些，避免网络抖动直接判失败
      '--socket-timeout',
      '20',
      '--retries',
      '5',
      '--fragment-retries',
      '5',
      // 分片并行拉取：长节目能明显提速，且不会明显抬高内存
      '--concurrent-fragments',
      '4',
      // 文件名直接用曲目 id：直链 URL 里推不出 id（抖音的 CDN 地址就没有）
      '-o',
      path.join(this.store.mediaDir, `${meta.id}.%(ext)s`),
      ...extras
    ]
    // 解析方指定了来源头就带上：抖音的 CDN 只认 douyin.com
    if (meta.referer) args.push('--referer', meta.referer)

    if (spec.kind === 'video') {
      // 视频模式：优先音视频合流；没有 ffmpeg 就退化成单文件 mp4，
      // 清晰度低一些，但不会因为缺少合并工具直接失败。
      const height = spec.maxHeight
      args.push(
        '-f',
        ffmpeg ? `bv*[height<=${height}]+ba/b[height<=${height}]/b` : 'b[ext=mp4]/b',
        '--merge-output-format',
        'mp4'
      )
      if (ffmpeg) args.push('--ffmpeg-location', ffmpeg)
      return args
    }

    args.push('-f', 'bestaudio[ext=m4a]/bestaudio/best')
    if (format === 'mp3') {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0')
      if (ffmpeg) args.push('--ffmpeg-location', ffmpeg)
    }
    return args
  }

  private async run(job: Job): Promise<void> {
    const { meta } = job.task
    const format = this.store.getSettings().audioFormat
    const runner = await getYtDlpRunner()
    if (!runner) {
      this.fail(job, '缺少下载核心', '未找到 yt-dlp，请先初始化组件')
      return
    }
    const ffmpeg = await getFfmpegPath()
    if (format === 'mp3' && !ffmpeg) {
      this.fail(job, '缺少 ffmpeg', '转码为 mp3 需要 ffmpeg，可改用 m4a 格式')
      return
    }

    // 曲目自带来源时用该平台的参数：回看 B站的批次下载，不因当前平台变了而失败
    const extras = [
      ...(await this.store.requestArgs()),
      ...((await this.sourceArgs?.(meta.sourceId)) ?? [])
    ]
    const isVideo = modeSpec(meta.mode).kind === 'video'
    this.update(job, {
      status: 'downloading',
      stage: isVideo ? '解析视频流…' : '解析音频流…',
      progress: 0,
      error: undefined
    })

    let stderrTail = ''
    const handleLine = (line: string): void => {
      const info = parseProgress(line)
      if (info.percent !== undefined) {
        this.update(job, {
          status: 'downloading',
          stage: '下载中',
          progress: Math.min(info.percent, 1),
          speed: info.speed ?? job.task.speed,
          eta: info.eta ?? job.task.eta,
          error: undefined
        })
        return
      }
      if (line.startsWith('[ExtractAudio]') || line.startsWith('[Merger]')) {
        this.update(job, { status: 'processing', stage: '转码中…', progress: 1, speed: '', eta: '' })
      } else if (line.startsWith('[Metadata]') || line.startsWith('[EmbedThumbnail]')) {
        this.update(job, { status: 'processing', stage: '写入元数据…' })
      } else if (line.startsWith('ERROR:')) {
        stderrTail = line
      }
    }

    let result: { stdout: string; stderr: string; code: number }
    try {
      result = await spawnYtDlp(this.buildArgs(meta, format, ffmpeg, extras), {
        onLine: handleLine,
        onSpawn: (child) => {
          job.child = child
        }
      })
    } catch (err) {
      this.fail(job, '启动失败', err instanceof Error ? err.message : String(err))
      return
    } finally {
      job.child = null
    }

    if (job.canceled) return

    if (result.code !== 0) {
      const fromStderr = result.stderr
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('ERROR:'))
        .pop()
      this.fail(job, '下载失败', friendlyMessage(fromStderr ?? stderrTail ?? 'yt-dlp 异常退出'))
      return
    }

    await this.finalize(job)
  }

  private async finalize(job: Job): Promise<void> {
    const { meta } = job.task
    this.update(job, { status: 'processing', stage: '整理缓存文件…', progress: 1 })
    const artifact = await this.store.inspectArtifacts(meta.id)
    if (!artifact) {
      this.fail(job, '文件缺失', '下载已完成但未找到音频文件')
      return
    }
    const settings = this.store.getSettings()
    const episode: Episode = {
      ...meta,
      fileName: artifact.fileName,
      coverName: artifact.coverName,
      size: artifact.size,
      format: path.extname(artifact.fileName).replace('.', ''),
      downloadedAt: Date.now(),
      favorite: false,
      playCount: 0,
      lastPlayedAt: null,
      // 下载即归类：用户不用手工整理就能按主题收听
      category: settings.autoCategorize
        ? inferCategoryId(`${meta.title} ${meta.channel}`, meta.mode)
        : 'other',
      progress: 0,
      completed: false
    }
    await this.store.addTrack(episode)
    this.update(job, { status: 'done', stage: `已缓存 · ${humanBytes(artifact.size)}`, progress: 1 })
    this.emit('done', episode)
  }
}
