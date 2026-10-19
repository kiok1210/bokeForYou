import { BrowserWindow, Menu, Tray, app, nativeImage, screen } from 'electron'
import type { WindowState } from '@shared/types'

/**
 * 窗口形态：全屏 / 正常 / 迷你，外加托盘常驻与置顶。
 * 渲染层只负责显示对应的布局，尺寸与层级交给这里。
 */

/** 正常模式尺寸，与 createWindow 保持一致 */
const NORMAL_SIZE = { width: 1340, height: 860 }
/** 正常模式的最小尺寸，同样与 createWindow 一致 */
const NORMAL_MIN = { width: 1080, height: 680 }
/** 迷你模式：只留播放器 */
const MINI_SIZE = { width: 384, height: 636 }
const MINI_MIN = { width: 340, height: 460 }

/** 内嵌生成的 32x32 托盘图标（免外部素材） */
const TRAY_ICON =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAr0lEQVR4nO2U0Q2AIAxEGcAP43xO6URuogOIx91RQBJJ+tfyHlCa0mzrPPYLxRBoUxkXXi2BNt3WJRthIgpUkekGr5Jg4MrTSAKlDdnGsySi4LaECq/NoQXUhkT5rwJskdP91DNEnd6+hcjTK7fwC8wl0K0Jh3zD4YPoc6OYBaAo1T8EIiUsOCuBRJhcCM8JODMAiRYFoiRsOJIoyaAaCc6KMGGDIyRC4KpME2jLdQPWzRs3uksUyQAAAABJRU5ErkJggg=='

let tray: Tray | null = null
let mini = false

export function isMini(): boolean {
  return mini
}

export function windowState(win: BrowserWindow | null): WindowState {
  if (!win) {
    return { fullscreen: false, maximized: false, mini, alwaysOnTop: false }
  }
  return {
    fullscreen: win.isFullScreen(),
    maximized: win.isMaximized(),
    mini,
    alwaysOnTop: win.isAlwaysOnTop()
  }
}

/** 把窗口按指定尺寸居中到鼠标所在的那块屏幕 */
function centerOn(win: BrowserWindow, width: number, height: number): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width: sw, height: sh } = display.workArea
  const w = Math.min(width, sw)
  const h = Math.min(height, sh)
  if (win.isFullScreen()) win.setFullScreen(false)
  if (win.isMaximized()) win.unmaximize()
  win.setSize(w, h)
  win.setPosition(Math.round(x + (sw - w) / 2), Math.round(y + (sh - h) / 2))
}

export function setMini(win: BrowserWindow, value: boolean): void {
  mini = value
  if (value) {
    // 正常模式的最小宽度有 1080，不放宽的话窗口根本缩不小
    win.setMinimumSize(MINI_MIN.width, MINI_MIN.height)
    // 迷你窗浮在最上层，方便边干活边听
    win.setAlwaysOnTop(true)
    centerOn(win, MINI_SIZE.width, MINI_SIZE.height)
  } else {
    win.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height)
    centerOn(win, NORMAL_SIZE.width, NORMAL_SIZE.height)
  }
}

export function restoreNormal(win: BrowserWindow): void {
  mini = false
  win.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height)
  win.setAlwaysOnTop(false)
  centerOn(win, NORMAL_SIZE.width, NORMAL_SIZE.height)
}

export function setAlwaysOnTop(win: BrowserWindow, value: boolean): void {
  win.setAlwaysOnTop(value)
}

/** 托盘常驻：左键唤回窗口，右键菜单可退出 */
export function setupTray(win: BrowserWindow): void {
  if (tray) return
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON}`)
  tray = new Tray(icon)
  tray.setToolTip('EchoPod · 英语播客离线收听')

  const show = (): void => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  tray.on('click', show)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: show },
      { type: 'separator' },
      {
        label: '退出 EchoPod',
        click: () => {
          tray?.destroy()
          tray = null
          app.exit(0)
        }
      }
    ])
  )
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
