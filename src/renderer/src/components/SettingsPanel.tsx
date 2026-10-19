import { useCallback, useEffect, useState } from 'react'
import type {
  AppSettings,
  CacheStats,
  MediaSource,
  ProbeResult,
  SourceAccount,
  ToolStatus
} from '@shared/types'
import { SUBTITLE_SIZES, SUBTITLE_SIZE_LABEL } from '@shared/types'
import { PLAYBACK_RATES, formatRate } from '@shared/portable/playback'
import { MODERATION_RULES } from '@shared/moderation'
import { THEMES } from '@/utils/themes'
import { formatBytes } from '@/utils/format'
import { CloseIcon, FolderIcon, RefreshIcon, TrashIcon } from './icons'

interface SettingsPanelProps {
  settings: AppSettings
  stats: CacheStats | null
  status: ToolStatus | null
  netState: ProbeResult | null
  probing: boolean
  onChange: (patch: Partial<AppSettings>) => void
  onReprobe: () => void
  onClose: () => void
  onOpenDir: () => void
  onClearCache: () => void
  /** 平台 id → 登录态；只有声明了登录方式的平台才有条目 */
  accounts: Record<string, SourceAccount>
  /** 打开某个平台的扫码登录弹窗 */
  onOpenLogin: (sourceId: string) => void
  /** 退出某个平台的登录：由调用方处理结果提示 */
  onLogout: (sourceId: string) => void
}

export function SettingsPanel({
  settings,
  stats,
  status,
  netState,
  probing,
  onChange,
  onReprobe,
  onClose,
  onOpenDir,
  onClearCache,
  accounts,
  onOpenLogin,
  onLogout
}: SettingsPanelProps) {
  const [appInfo, setAppInfo] = useState<{ version: string; userData: string } | null>(null)
  const [proxyDraft, setProxyDraft] = useState(settings.proxy)
  /** 声明了登录方式的平台：账号区据此渲染，新增平台自动出现 */
  const [authPlatforms, setAuthPlatforms] = useState<MediaSource[]>([])

  useEffect(() => {
    void window.echo.auth.sources().then((res) => {
      if (res.ok) setAuthPlatforms(res.data)
    })
  }, [])

  useEffect(() => {
    void window.echo.app.info().then((res) => {
      if (res.ok) setAppInfo({ version: res.data.version, userData: res.data.userData })
    })
  }, [])

  useEffect(() => {
    setProxyDraft(settings.proxy)
  }, [settings.proxy])

  // 地址输入在失焦或回车时才提交，避免每次按键都触发探测
  const commitProxy = useCallback(() => {
    if (proxyDraft !== settings.proxy) onChange({ proxy: proxyDraft })
  }, [onChange, proxyDraft, settings.proxy])

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <section className="settings-panel">
        <header className="settings-head">
          <h3>设置</h3>
          <button className="icon-btn" onClick={onClose} title="关闭">
            <CloseIcon size={15} />
          </button>
        </header>

        <div className="settings-group">
          <label className="settings-label">界面风格</label>
          <div className="theme-grid">
            {THEMES.map((theme) => (
              <button
                className="theme-card"
                key={theme.id}
                data-active={settings.theme === theme.id}
                onClick={() => onChange({ theme: theme.id })}
              >
                <span
                  className="theme-swatch"
                  style={{
                    background: `linear-gradient(135deg, ${theme.swatch[0]}, ${theme.swatch[1]})`
                  }}
                />
                <span className="theme-text">
                  <span className="theme-name">{theme.name}</span>
                  <span className="theme-blurb">{theme.blurb}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="settings-note">更换配色与圆角，不影响布局与你的缓存数据。</div>
        </div>

        <div className="settings-group">
          <label className="settings-label">播放与听力</label>
          <div className="settings-row">
            <span className="settings-row-label">默认倍速</span>
            <select
              className="select"
              value={String(settings.playbackRate)}
              onChange={(event) => onChange({ playbackRate: Number(event.target.value) })}
            >
              {PLAYBACK_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {formatRate(rate)}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">跳过片头</span>
            <select
              className="select"
              value={String(settings.skipIntro)}
              onChange={(event) => onChange({ skipIntro: Number(event.target.value) })}
            >
              {[0, 5, 10, 15, 30, 60].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds === 0 ? '不跳过' : `${seconds} 秒`}
                </option>
              ))}
            </select>
          </div>
          <label className="switch-row" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              className="switch"
              checked={settings.resumePlayback}
              onChange={(event) => onChange({ resumePlayback: event.target.checked })}
            />
            <span>
              <strong>记住每集的播放进度</strong>
              <em>切走再回来时自动接着上次的位置继续听</em>
            </span>
          </label>
          <label className="switch-row" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              className="switch"
              checked={settings.autoTranslate}
              onChange={(event) => onChange({ autoTranslate: event.target.checked })}
            />
            <span>
              <strong>字幕自动翻译成中文</strong>
              <em>获取英文逐字稿后，逐行附上中文对照，方便跟读</em>
            </span>
          </label>
        </div>

        <div className="settings-group">
          <label className="settings-label">字幕</label>
          <label className="switch-row">
            <input
              type="checkbox"
              className="switch"
              checked={settings.subtitlesEnabled}
              onChange={(event) => onChange({ subtitlesEnabled: event.target.checked })}
            />
            <span>
              <strong>显示字幕</strong>
              <em>关掉只剩声音，适合纯听力练习；播放器上也有一键开关</em>
            </span>
          </label>
          <div className="settings-row" style={{ marginTop: 10 }}>
            <span className="settings-row-label">字幕大小</span>
            <div className="segmented" style={{ width: 196 }}>
              {SUBTITLE_SIZES.map((size) => (
                <button
                  key={size}
                  className="segment"
                  data-active={settings.subtitleSize === size}
                  onClick={() => onChange({ subtitleSize: size })}
                >
                  {SUBTITLE_SIZE_LABEL[size]}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-note">
            逐字稿面板底部也有四个逐级变大的 A，可以边听边就地调整。
          </div>
        </div>

        <div className="settings-group">
          <label className="settings-label">内容合规</label>
          <label className="switch-row">
            <input
              type="checkbox"
              className="switch"
              checked={settings.safeMode}
              onChange={(event) => onChange({ safeMode: event.target.checked })}
            />
            <span>
              <strong>过滤不合规主题</strong>
              <em>热门榜、关键词检索与分类发现的结果都会先过一遍词表，命中即剔除。</em>
            </span>
          </label>
          <div className="rule-chips">
            {MODERATION_RULES.map((rule) => (
              <span className="rule-chip" key={rule.id}>
                {rule.label}
              </span>
            ))}
          </div>
          <div className="settings-note">
            默认开启，建议保持开启。词表按标题与节目名做关键词拦截，无法覆盖标题不含关键词的隐蔽内容；
            请同时遵守 YouTube 服务条款与所在地法律法规，仅缓存自己有权收听的内容。
          </div>
        </div>

        <div className="settings-group">
          <label className="settings-label">缓存</label>
          <select
            className="select"
            style={{ width: '100%' }}
            value={settings.audioFormat}
            onChange={(event) =>
              onChange({ audioFormat: event.target.value as AppSettings['audioFormat'] })
            }
          >
            <option value="m4a">M4A · 原始音轨，速度最快</option>
            <option value="mp3">MP3 · 兼容性最好，需转码</option>
          </select>
          <div className="settings-note">
            {settings.audioFormat === 'mp3' && !status?.ffmpegReady
              ? '当前未检测到 ffmpeg，切换到 MP3 前请先初始化组件。'
              : 'M4A 直接封装原始音轨，不损失质量也不消耗转码时间。'}
          </div>
          <label className="switch-row" style={{ marginTop: 10 }}>
            <input
              type="checkbox"
              className="switch"
              checked={settings.autoCategorize}
              onChange={(event) => onChange({ autoCategorize: event.target.checked })}
            />
            <span>
              <strong>下载时自动归类</strong>
              <em>按标题与节目名判断主题，落到「科技与 AI」「英语学习」等分类里</em>
            </span>
          </label>
        </div>

        <div className="settings-group">
          <label className="settings-label">搜索</label>
          <select
            className="select"
            style={{ width: '100%' }}
            value={String(settings.searchLimit)}
            onChange={(event) => onChange({ searchLimit: Number(event.target.value) })}
          >
            {[12, 18, 24, 30].map((n) => (
              <option key={n} value={n}>
                每次返回 {n} 条
              </option>
            ))}
          </select>
        </div>

        <div className="settings-group">
          <label className="settings-label">网络代理</label>
          <div className="segmented">
            {(
              [
                { value: 'auto', label: '跟随系统' },
                { value: 'manual', label: '手动指定' },
                { value: 'off', label: '不使用' }
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                className="segment"
                data-active={settings.proxyMode === option.value}
                onClick={() => onChange({ proxyMode: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>

          {settings.proxyMode === 'manual' ? (
            <input
              className="field"
              style={{ width: '100%', height: 34, marginTop: 9 }}
              placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
              value={proxyDraft}
              onChange={(event) => setProxyDraft(event.target.value)}
              onBlur={commitProxy}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitProxy()
              }}
            />
          ) : null}

          <div className="settings-note">
            {settings.proxyMode === 'auto'
              ? `读取 Windows 的 PAC 脚本与系统代理设置。当前解析结果：${
                  netState?.proxy ?? '直连（未检测到代理）'
                }`
              : settings.proxyMode === 'manual'
                ? '使用上方填写的地址，HTTP 与 SOCKS5 均可。'
                : '完全直连，适合本机可直接访问 YouTube 的情况。'}
          </div>

          <div className="settings-actions" style={{ marginTop: 10, paddingTop: 10 }}>
            <button className="btn btn-sm" onClick={onReprobe} disabled={probing}>
              <RefreshIcon size={14} className={probing ? 'spin' : undefined} />
              {probing ? '检测中…' : '重新检测连通性'}
            </button>
            {netState ? (
              <span className="settings-note" style={{ margin: 0, alignSelf: 'center' }}>
                {netState.reachable ? 'YouTube 可达' : 'YouTube 不可达'}
              </span>
            ) : null}
          </div>
        </div>

        <div className="settings-group">
          <label className="settings-label">Cookies 文件（可选）</label>
          <input
            className="field"
            style={{ width: '100%', height: 34 }}
            placeholder="导出为 Netscape 格式的 cookies.txt 路径"
            value={settings.cookieFile}
            onChange={(event) => onChange({ cookieFile: event.target.value })}
          />
          <div className="settings-note">遇到「需要登录」或年龄限制的单集时使用。</div>
        </div>

        <div className="settings-actions">
          <button className="btn btn-sm" onClick={onOpenDir}>
            <FolderIcon size={14} />
            打开缓存目录
          </button>
          <button className="btn btn-sm" onClick={onClearCache} disabled={!stats?.count}>
            <TrashIcon size={14} />
            清空全部缓存
          </button>
        </div>

        {authPlatforms.length ? (
          <div className="settings-group">
            <label className="settings-label">平台账号</label>
            {authPlatforms.map((platform) => {
              const account = accounts[platform.id]
              const loggedIn = Boolean(account?.loggedIn)
              return (
                <div key={platform.id} className="bili-row">
                  {loggedIn && account?.avatar ? (
                    <img
                      className="bili-face"
                      src={account.avatar}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <span className="bili-row-body">
                    <strong>{loggedIn ? account?.uname : platform.name}</strong>
                    <em>
                      {loggedIn
                        ? `已登录 · uid ${account?.uid}${
                            account?.expires
                              ? ` · 至 ${new Date(account.expires).toLocaleDateString()}`
                              : ''
                          }`
                        : '未登录 · 会员内容需要登录'}
                    </em>
                  </span>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onOpenLogin(platform.id)}
                  >
                    {loggedIn ? '账号管理' : '扫码登录'}
                  </button>
                  {loggedIn ? (
                    <button className="btn btn-sm" onClick={() => onLogout(platform.id)}>
                      退出
                    </button>
                  ) : null}
                </div>
              )
            })}
            <div className="settings-note">
              声明了登录方式的平台会在这里出现入口；扫码得到的凭证只写进本机配置文件，
              不上传任何地方。其余平台若遇到「需要登录」的提示，可改用 cookies 文件。
            </div>
          </div>
        ) : null}

        <div className="settings-meta">
          已缓存 {stats?.count ?? 0} 集 · 占用 {formatBytes(stats?.bytes ?? 0)} · {stats?.categories ?? 0}{' '}
          个分类
          <br />
          下载核心：{status?.ytDlpLabel ?? '未安装'}
          <br />
          ffmpeg：{status?.ffmpegReady ? '已就绪' : '未安装'}
          <br />
          EchoPod v{appInfo?.version ?? '0.1.0'}
          <br />
          {appInfo?.userData}
        </div>
      </section>
    </>
  )
}
