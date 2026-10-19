import type { ThemeId } from '@shared/types'

export interface ThemeOption {
  id: ThemeId
  name: string
  blurb: string
  /** 预览色卡（左上 → 右下），只是示意，真实配色在 themes.css */
  swatch: [string, string]
}

export const THEMES: ThemeOption[] = [
  { id: 'vinyl', name: '黑金', blurb: '复古唱机质感', swatch: ['#e0b25c', '#8a6a2a'] },
  { id: 'midnight', name: '午夜蓝', blurb: '冷静、偏现代', swatch: ['#5aa9f0', '#2a4a8a'] },
  { id: 'forest', name: '森绿', blurb: '柔和、护眼', swatch: ['#6fc98a', '#2f6a45'] },
  { id: 'sunset', name: '日落', blurb: '暖橙配紫', swatch: ['#f08a5d', '#8a3a7a'] }
]
