import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import type { InstallProgress, ToolStatus, WindowState } from '@shared/types'
import {
  CloseIcon,
  ExpandIcon,
  FullscreenIcon,
  HeadphonesIcon,
  MaximizeIcon,
  MiniIcon,
  MinimizeIcon,
  PinIcon,
  PowerIcon,
  RefreshIcon,
  RestoreIcon,
  TrayIcon
} from './icons'

interface TitleBarProps {
  status: ToolStatus | null
  progress: InstallProgress | null
  onInstall: () => void
  /** 迷你模式下精简掉口号与组件状态，只留必要按钮 */
  compact?: boolean
  /** 播客主体是否已放大占满内容区 */
  focus: boolean
  onSetFocus: (value: boolean) => void
  /** 标题栏右侧的口号，随内容模式变化 */
  slogan: string
}

const INITIAL_STATE: WindowState = {
  fullscreen: false,
  maximized: false,
  mini: false,
  alwaysOnTop: false
}

export function TitleBar({
  status,
  progress,
  onInstall,
  compact = false,
  focus,
  onSetFocus,
  slogan
}: TitleBarProps) {
  const [state, setState] = useState<WindowState>(INITIAL_STATE)

  const apply = useCallback((next: WindowState) => setState(next), [])

  useEffect(() => {
    void window.echo.window.state().then((res) => {
      if (res.ok) apply(res.data)
    })
    return window.echo.window.onState(apply)
  }, [apply])

  // 双击标题栏空白处 = 最大化 / 还原（无边框窗口要自己做）
  const handleDoubleClick = useCallback((event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('button')) return
    void window.echo.window.toggleMaximize().then((res) => {
      if (res.ok) setState((prev) => ({ ...prev, maximized: res.data }))
    })
  }, [])

  /** 全屏时顺带把播客主体一起放大，这样才真的是「放大展示内容」 */
  const setFullscreen = useCallback(() => {
    const next = !state.fullscreen
    void window.echo.window.setFullscreen(next).then((res) => {
      if (res.ok) apply(res.data)
    })
    onSetFocus(next)
  }, [apply, onSetFocus, state.fullscreen])

  /** 正常：窗口复位 + 收起放大 */
  const setNormal = useCallback(() => {
    void window.echo.window.restoreNormal().then((res) => {
      if (res.ok) apply(res.data)
    })
    onSetFocus(false)
  }, [apply, onSetFocus])

  const toggleMini = useCallback(() => {
    void window.echo.window.setMini(!state.mini).then((res) => {
      if (res.ok) apply(res.data)
    })
    // 迷你本身就已经只留播放器了，两者不同时开
    if (!state.mini) onSetFocus(false)
  }, [apply, onSetFocus, state.mini])

  const hideToTray = useCallback(() => {
    void window.echo.window.hideToTray()
  }, [])

  const togglePin = useCallback(() => {
    void window.echo.window.setAlwaysOnTop(!state.alwaysOnTop).then((res) => {
      if (res.ok) apply(res.data)
    })
  }, [apply, state.alwaysOnTop])

  const ready = Boolean(status?.ytDlpReady)
  const installing = Boolean(status?.installing)
  const chipState = ready ? 'ok' : 'warn'
  const label = installing
    ? (progress?.step ?? '正在初始化组件…')
    : ready
      ? (status?.ytDlpLabel ?? '组件就绪')
      : '组件未安装'
  const percent = Math.round((progress?.ratio ?? 0) * 100)

  return (
    <header className="titlebar" onDoubleClick={handleDoubleClick}>
      <div className="titlebar-brand">
        <HeadphonesIcon size={15} />
        Echo<span>Pod</span>
      </div>

      {compact ? null : <span className="titlebar-slogan">{slogan}</span>}

      <div className="titlebar-spacer" />

      <div className="titlebar-tools">
        {compact ? null : (
          <span className="chip" data-state={chipState} title={status?.ytDlpLabel ?? ''}>
            <span className="chip-dot" />
            {label}
          </span>
        )}
        {!compact && (!ready || installing) ? (
          <button className="btn btn-sm" onClick={onInstall} disabled={installing}>
            {installing ? (
              <RefreshIcon size={13} className="spin" />
            ) : (
              <PowerIcon size={13} />
            )}
            {installing ? `初始化 ${percent}%` : '初始化组件'}
          </button>
        ) : null}
      </div>

      {/* 形态按钮：放大主体 / 全屏 / 正常 / 迷你 / 托盘 / 置顶 */}
      <div className="view-controls">
        <button
          className="view-btn view-btn-labeled"
          data-active={focus}
          onClick={() => onSetFocus(!focus)}
          title={focus ? '收起播客主体，回到列表' : '放大播客主体（窗口内铺满）'}
        >
          <ExpandIcon size={14} />
          <span className="view-btn-label">{focus ? '收起' : '放大'}</span>
        </button>
        <button
          className="view-btn"
          data-active={state.fullscreen}
          onClick={setFullscreen}
          title={state.fullscreen ? '退出全屏' : '全屏放大（同时放大播客主体）'}
        >
          <FullscreenIcon size={14} />
        </button>
        <button className="view-btn" onClick={setNormal} title="恢复正常窗口">
          <RestoreIcon size={14} />
        </button>
        <button
          className="view-btn"
          data-active={state.mini}
          onClick={toggleMini}
          title={state.mini ? '退出迷你模式' : '迷你播放器'}
        >
          <MiniIcon size={14} />
        </button>
        <button className="view-btn" onClick={hideToTray} title="收进系统托盘（点托盘图标可唤回）">
          <TrayIcon size={14} />
        </button>
        <button
          className="view-btn"
          data-active={state.alwaysOnTop}
          onClick={togglePin}
          title={state.alwaysOnTop ? '取消置顶' : '窗口置顶'}
        >
          <PinIcon size={14} />
        </button>
      </div>

      <div className="window-controls">
        <button
          className="window-btn"
          onClick={() => void window.echo.window.minimize()}
          title="最小化"
        >
          <MinimizeIcon size={15} />
        </button>
        <button
          className="window-btn"
          onClick={() => void window.echo.window.toggleMaximize()}
          title={state.maximized ? '还原' : '最大化'}
        >
          {state.maximized ? <RestoreIcon size={14} /> : <MaximizeIcon size={13} />}
        </button>
        <button
          className="window-btn"
          data-close="true"
          onClick={() => void window.echo.window.close()}
          title="关闭"
        >
          <CloseIcon size={15} />
        </button>
      </div>
    </header>
  )
}
