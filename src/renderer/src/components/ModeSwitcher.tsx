import type { ComponentType } from 'react'
import type { ContentMode } from '@shared/types'
import { MODES, durationRangeLabel, modeSpec } from '@shared/modes'
import { HeadphonesIcon, PortraitIcon, VideoIcon } from './icons'

interface ModeSwitcherProps {
  mode: ContentMode
  onChange: (mode: ContentMode) => void
}

const ICONS: Record<ContentMode, ComponentType<{ size?: number }>> = {
  'podcast-zh': HeadphonesIcon,
  'podcast-en': HeadphonesIcon,
  'video-long': VideoIcon,
  'video-short': PortraitIcon
}

/**
 * 内容模式切换：一次决定语言、时长区间、媒介形态与整份分类目录。
 * 放在工作区顶部而不是侧栏，切完之后用户马上能看到下面的内容跟着变。
 */
export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  const active = modeSpec(mode)

  return (
    <div className="mode-bar">
      <div className="mode-chips">
        {MODES.map((item) => {
          const Icon = ICONS[item.id]
          return (
            <button
              key={item.id}
              className="mode-chip"
              data-active={item.id === mode}
              style={{ ['--mode-accent' as string]: item.accent }}
              onClick={() => onChange(item.id)}
              title={item.blurb}
            >
              <Icon size={14} />
              <span className="mode-chip-label">{item.label}</span>
            </button>
          )
        })}
      </div>
      <span className="mode-meta">
        {active.blurb} · {durationRangeLabel(active)} · {active.kind === 'video' ? '含画面' : '纯音频'}
      </span>
    </div>
  )
}
