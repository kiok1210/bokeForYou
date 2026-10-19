import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { app, net, session } from 'electron'
import type { InstallProgress, ProbeResult, ProxyMode } from '@shared/types'

export type { InstallProgress, ProbeResult, ProxyMode }

export const IS_WIN = process.platform === 'win32'
export const YTDLP_NAME = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp'
export const FFMPEG_NAME = IS_WIN ? 'ffmpeg.exe' : 'ffmpeg'

/** 国内 pypi 镜像，GitHub 不可达时的可靠来源 */
const PYPI_INDEX = 'https://pypi.tuna.tsinghua.edu.cn/simple'
const PYPI_FALLBACK = 'https://pypi.org/simple'

export class ToolError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export interface ProcessResult {
  stdout: string
  stderr: string
  code: number
}

interface SpawnOptions {
  env?: Record<string, string>
  onLine?: (line: string) => void
  timeoutMs?: number
}

function spawnProcess(
  command: string,
  args: string[],
  options: SpawnOptions = {}
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(command, args, {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ...options.env }
      })
    } catch (err) {
      resolve({ stdout: '', stderr: err instanceof Error ? err.message : String(err), code: -1 })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    let buffer = ''
    const flush = (text: string): void => {
      buffer += text
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        if (line.trim()) options.onLine?.(line)
        index = buffer.indexOf('\n')
      }
    }

    const finish = (code: number): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr, code })
    }

    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill()
          finish(-1)
        }, options.timeoutMs)
      : null

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
      flush(chunk)
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      flush(chunk)
    })
    child.on('error', (err) => {
      stderr += err.message
      finish(-1)
    })
    child.on('close', (code) => finish(code ?? -1))
  })
}

/** 静默探测：命令成功执行时返回 stdout，否则返回 null */
async function probe(
  command: string,
  args: string[],
  env?: Record<string, string>
): Promise<string | null> {
  const result = await spawnProcess(command, args, { env, timeoutMs: 15000 })
  if (result.code !== 0) return null
  const out = result.stdout.trim()
  return out.length ? out : null
}

interface PythonCandidate {
  command: string
  prefix: string[]
  label: string
}

function pythonCandidates(): PythonCandidate[] {
  if (process.env.PYTHON_PATH) {
    return [{ command: process.env.PYTHON_PATH, prefix: [], label: 'PYTHON_PATH' }]
  }
  if (IS_WIN) {
    return [
      { command: 'python', prefix: [], label: 'python' },
      { command: 'py', prefix: ['-3'], label: 'py -3' },
      { command: 'python3', prefix: [], label: 'python3' }
    ]
  }
  return [
    { command: 'python3', prefix: [], label: 'python3' },
    { command: 'python', prefix: [], label: 'python' }
  ]
}

/** 应用私有的 Python 依赖目录，避免污染用户全局环境 */
export function pythonLibsDir(): string {
  return path.join(app.getPath('userData'), 'pylibs')
}

export function binDir(): string {
  return path.join(app.getPath('userData'), 'bin')
}

export interface YtDlpRunner {
  command: string
  prefix: string[]
  env: Record<string, string>
  label: string
}

let runnerPromise: Promise<YtDlpRunner | null> | null = null
let ffmpegPromise: Promise<string | null> | null = null

export function resetToolCache(): void {
  runnerPromise = null
  ffmpegPromise = null
}

let systemProxyCache: string | null | undefined

/**
 * 解析 PAC / 系统代理串。
 * 形如 "SOCKS5 127.0.0.1:1081;PROXY 127.0.0.1:1082"。
 * 优先取 HTTP 代理——yt-dlp 用它不需要额外依赖，SOCKS 需要 PySocks。
 */
function pickProxy(resolved: string): string | null {
  const entries = resolved
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
  for (const entry of entries) {
    const [scheme, address] = entry.split(/\s+/)
    if (address && /^(PROXY|HTTPS)$/i.test(scheme)) return `http://${address}`
  }
  for (const entry of entries) {
    const [scheme, address] = entry.split(/\s+/)
    if (address && /^SOCKS/i.test(scheme)) return `socks5://${address}`
  }
  return null
}

/** 读取系统级代理（Clash / v2ray 等开启系统代理或 PAC 时可直接复用） */
export async function detectSystemProxy(): Promise<string | null> {
  if (systemProxyCache !== undefined) return systemProxyCache
  try {
    const resolved = await session.defaultSession.resolveProxy('https://www.youtube.com')
    systemProxyCache = pickProxy(resolved)
  } catch {
    systemProxyCache = null
  }
  return systemProxyCache
}

export function resetSystemProxyCache(): void {
  systemProxyCache = undefined
}

/**
 * 按模式解析出 yt-dlp 的代理参数。
 * 覆盖：直连 / 系统代理 / PAC / 手动 HTTP / 手动 SOCKS。
 */
export async function resolveProxyArgs(
  mode: ProxyMode,
  manualAddress: string
): Promise<{ args: string[]; proxy: string | null }> {
  if (mode === 'off') return { args: [], proxy: null }
  if (mode === 'manual') {
    const address = (manualAddress ?? '').trim()
    return address ? { args: ['--proxy', address], proxy: address } : { args: [], proxy: null }
  }
  const auto = await detectSystemProxy()
  return auto ? { args: ['--proxy', auto], proxy: auto } : { args: [], proxy: null }
}

/** 启动时快速探测 YouTube 是否可达（5 秒内必须给出结论） */
export async function probeYouTube(
  mode: ProxyMode = 'auto',
  manualAddress = ''
): Promise<ProbeResult> {
  const { proxy } = await resolveProxyArgs(mode, manualAddress)
  const reachable = await new Promise<boolean>((resolve) => {
    let settled = false
    const done = (value: boolean): void => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const request = net.request({ url: 'https://www.youtube.com/generate_204', method: 'HEAD' })
    const timer = setTimeout(() => {
      done(false)
      try {
        request.abort()
      } catch {
        /* ignore */
      }
    }, 5000)
    request.on('response', () => {
      clearTimeout(timer)
      done(true)
    })
    request.on('error', () => {
      clearTimeout(timer)
      done(false)
    })
    request.end()
  })
  return { reachable, proxy }
}

async function detectYtDlp(): Promise<YtDlpRunner | null> {
  // 顺序即优先级：显式指定的 > 应用私有目录 > 随包内置 > Python 模块 > 系统 PATH
  const staticCandidates: { file: string; label: string }[] = []
  if (process.env.YTDLP_PATH) staticCandidates.push({ file: process.env.YTDLP_PATH, label: 'YTDLP_PATH' })
  staticCandidates.push({ file: path.join(binDir(), YTDLP_NAME), label: '应用组件目录' })
  staticCandidates.push({
    file: path.join(process.resourcesPath ?? '', 'bin', YTDLP_NAME),
    label: '内置 yt-dlp'
  })
  staticCandidates.push({
    file: path.join(app.getAppPath(), 'resources', 'bin', YTDLP_NAME),
    label: '内置 yt-dlp'
  })

  for (const candidate of staticCandidates) {
    if (existsSync(candidate.file)) {
      return { command: candidate.file, prefix: [], env: {}, label: `${candidate.label}` }
    }
  }

  const env = { PYTHONPATH: pythonLibsDir() }
  for (const py of pythonCandidates()) {
    const version = await probe(py.command, [...py.prefix, '-m', 'yt_dlp', '--version'], env)
    if (version) {
      return {
        command: py.command,
        prefix: [...py.prefix, '-m', 'yt_dlp'],
        env,
        label: `yt-dlp ${version}`
      }
    }
  }

  const pathVersion = await probe(YTDLP_NAME, ['--version'])
  if (pathVersion) {
    return { command: YTDLP_NAME, prefix: [], env: {}, label: `yt-dlp ${pathVersion}` }
  }
  return null
}

export function getYtDlpRunner(force = false): Promise<YtDlpRunner | null> {
  if (force || !runnerPromise) runnerPromise = detectYtDlp()
  return runnerPromise
}

async function detectFfmpeg(): Promise<string | null> {
  const staticCandidates = [
    process.env.FFMPEG_PATH,
    path.join(binDir(), FFMPEG_NAME),
    // 随包内置的 ffmpeg：安装后无需任何初始化即可转码 / 处理字幕
    path.join(process.resourcesPath ?? '', 'bin', FFMPEG_NAME),
    path.join(app.getAppPath(), 'resources', 'bin', FFMPEG_NAME)
  ].filter((v): v is string => Boolean(v))
  for (const candidate of staticCandidates) {
    if (existsSync(candidate)) return candidate
  }

  const env = { PYTHONPATH: pythonLibsDir() }
  for (const py of pythonCandidates()) {
    const resolved = await probe(
      py.command,
      [
        ...py.prefix,
        '-c',
        'import imageio_ffmpeg,sys;sys.stdout.write(imageio_ffmpeg.get_ffmpeg_exe())'
      ],
      env
    )
    if (resolved && existsSync(resolved)) return resolved
  }

  const pathVersion = await probe(FFMPEG_NAME, ['-version'])
  if (pathVersion) return FFMPEG_NAME
  return null
}

export function getFfmpegPath(force = false): Promise<string | null> {
  if (force || !ffmpegPromise) ffmpegPromise = detectFfmpeg()
  return ffmpegPromise
}

async function pickPython(): Promise<PythonCandidate | null> {
  for (const py of pythonCandidates()) {
    const version = await probe(py.command, [...py.prefix, '--version'])
    if (version && /^Python\s+3\./i.test(version)) return py
  }
  return null
}

async function pipInstall(
  python: PythonCandidate,
  index: string,
  onLine: (line: string) => void
): Promise<ProcessResult> {
  return spawnProcess(
    python.command,
    [
      ...python.prefix,
      '-m',
      'pip',
      'install',
      '--upgrade',
      '--target',
      pythonLibsDir(),
      '--no-warn-script-location',
      '--disable-pip-version-check',
      'yt-dlp',
      'imageio-ffmpeg',
      // SOCKS 代理支持
      'pysocks',
      '-i',
      index
    ],
    { onLine, timeoutMs: 10 * 60 * 1000 }
  )
}

/**
 * 安装下载核心（yt-dlp + ffmpeg）。
 * 全部落在应用私有目录，装完即可离线复用。
 */
export async function installToolchain(
  onProgress?: (progress: InstallProgress) => void
): Promise<void> {
  const python = await pickPython()
  if (!python) {
    throw new ToolError(
      'PYTHON_MISSING',
      '未检测到 Python 3，无法自动安装下载核心。请安装 Python 3.9+ 后重试。'
    )
  }
  await fsp.mkdir(pythonLibsDir(), { recursive: true })

  const report = (step: string, ratio: number): void => onProgress?.({ step, ratio })

  report('正在连接组件源…', 0.05)
  const lineHandler = (line: string): void => {
    if (/^(Collecting|Downloading|Installing)/i.test(line.trim())) {
      report(line.trim().replace(/\s+/g, ' ').slice(0, 70), 0.5)
    }
  }

  let result = await pipInstall(python, PYPI_INDEX, lineHandler)
  if (result.code !== 0) {
    report('镜像失败，正在切换官方源…', 0.3)
    result = await pipInstall(python, PYPI_FALLBACK, lineHandler)
  }
  if (result.code !== 0) {
    const tail = result.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300)
    throw new ToolError('PIP_FAILED', `组件安装失败：${tail || '未知错误'}`)
  }

  report('正在校验组件…', 0.95)
  resetToolCache()
  const runner = await getYtDlpRunner(true)
  if (!runner) throw new ToolError('YTDLP_MISSING', '安装完成，但 yt-dlp 未能加载')
  const ffmpeg = await getFfmpegPath(true)
  if (!ffmpeg) throw new ToolError('FFMPEG_MISSING', '安装完成，但 ffmpeg 未能加载')
  report('组件已就绪', 1)
}
