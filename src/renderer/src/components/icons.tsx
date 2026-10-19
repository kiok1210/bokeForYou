import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PlayIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M8.2 5.1v13.8a1 1 0 0 0 1.53.85l10.5-6.9a1 1 0 0 0 0-1.7L9.73 4.25A1 1 0 0 0 8.2 5.1Z" />
  </Svg>
)

export const PauseIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <rect x="6.5" y="4.5" width="3.8" height="15" rx="1.4" />
    <rect x="13.7" y="4.5" width="3.8" height="15" rx="1.4" />
  </Svg>
)

export const PrevIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <rect x="4" y="5" width="2.4" height="14" rx="1.2" />
    <path d="M19.2 5.6v12.8a1 1 0 0 1-1.55.83l-9.1-6.4a1 1 0 0 1 0-1.66l9.1-6.4a1 1 0 0 1 1.55.83Z" />
  </Svg>
)

export const NextIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M4.8 5.6v12.8a1 1 0 0 0 1.55.83l9.1-6.4a1 1 0 0 0 0-1.66l-9.1-6.4A1 1 0 0 0 4.8 5.6Z" />
    <rect x="17.6" y="5" width="2.4" height="14" rx="1.2" />
  </Svg>
)

export const RepeatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 2.5 20.5 6 17 9.5" />
    <path d="M20.5 6H6.5A3.5 3.5 0 0 0 3 9.5V11" />
    <path d="M7 21.5 3.5 18 7 14.5" />
    <path d="M3.5 18h14A3.5 3.5 0 0 0 21 14.5V13" />
  </Svg>
)

export const RepeatOneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 2.5 20.5 6 17 9.5" />
    <path d="M20.5 6H6.5A3.5 3.5 0 0 0 3 9.5V11" />
    <path d="M7 21.5 3.5 18 7 14.5" />
    <path d="M3.5 18h14A3.5 3.5 0 0 0 21 14.5V13" />
    <path d="M11.6 11.4 12.8 10.6v3.6" strokeWidth={1.9} />
  </Svg>
)

export const VolumeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5 6.5 8.8H3.4a.6.6 0 0 0-.6.6v5.2a.6.6 0 0 0 .6.6h3.1L11 19Z" />
    <path d="M15.4 9.2a4 4 0 0 1 0 5.6" />
    <path d="M18 6.6a7.6 7.6 0 0 1 0 10.8" />
  </Svg>
)

export const MuteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5 6.5 8.8H3.4a.6.6 0 0 0-.6.6v5.2a.6.6 0 0 0 .6.6h3.1L11 19Z" />
    <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
  </Svg>
)

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
)

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5v11" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16" />
    <path d="M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7" />
    <path d="M6.5 6.5 7.4 20a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-13.5" />
    <path d="M10.5 10v7M13.5 10v7" />
  </Svg>
)

export const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6.8a1.3 1.3 0 0 1 1.3-1.3h3.6l2 2.4h8.8a1.3 1.3 0 0 1 1.3 1.3v9.5a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3Z" />
  </Svg>
)

export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 3c0 5-7.5 9.6-7.5 9.6Z" />
  </Svg>
)

export const MinimizeIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.5}>
    <path d="M6 12h12" />
  </Svg>
)

export const MaximizeIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.5}>
    <rect x="6" y="6" width="12" height="12" rx="1.6" />
  </Svg>
)

export const RestoreIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.5}>
    <rect x="5" y="8" width="11" height="11" rx="1.6" />
    <path d="M8.4 8V6.6A1.6 1.6 0 0 1 10 5h7.4A1.6 1.6 0 0 1 19 6.6V14a1.6 1.6 0 0 1-1.6 1.6H17" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.5}>
    <path d="m7 7 10 10M17 7 7 17" />
  </Svg>
)

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5a8 8 0 1 1-2.6-5.9" />
    <path d="M20.2 4.5v4.3h-4.3" />
  </Svg>
)

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.4 13.6a3.6 3.6 0 0 0 5.1 0l2.8-2.8a3.6 3.6 0 0 0-5.1-5.1l-1 1" />
    <path d="M13.6 10.4a3.6 3.6 0 0 0-5.1 0l-2.8 2.8a3.6 3.6 0 0 0 5.1 5.1l1-1" />
  </Svg>
)

export const DiscIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.4" />
    <circle cx="12" cy="12" r="2.4" />
  </Svg>
)

export const PowerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.6v7.2" />
    <path d="M6.9 6.6a7.6 7.6 0 1 0 10.2 0" />
  </Svg>
)

export const LyricsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h10" />
    <path d="M4 11.5h8" />
    <path d="M4 16.5h5" />
    <path d="M18.5 4.2v9.4" />
    <circle cx="16.6" cy="15.4" r="1.9" />
  </Svg>
)

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.6 13.9 9l5.5 1.9-5.5 1.9L12 18.3 10.1 12.8 4.6 10.9 10.1 9Z" />
  </Svg>
)

export const HeadphonesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 14.5v-2.6a7.5 7.5 0 0 1 15 0v2.6" />
    <rect x="2.8" y="13.4" width="4.2" height="6.4" rx="1.9" />
    <rect x="17" y="13.4" width="4.2" height="6.4" rx="1.9" />
  </Svg>
)

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="6.6" height="6.6" rx="1.7" />
    <rect x="13.4" y="4" width="6.6" height="6.6" rx="1.7" />
    <rect x="4" y="13.4" width="6.6" height="6.6" rx="1.7" />
    <rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.7" />
  </Svg>
)

export const SpeedIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.8 18.2a8.5 8.5 0 1 1 16.4 0" />
    <path d="m12 17.6 4.4-6.2" />
    <circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
)

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.4V12l3.1 2" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.6 4.2 4.2L19 7.4" />
  </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </Svg>
)

/** 语义别名：播客里它表示「逐字稿」而不是歌词 */
export const TranscriptIcon = LyricsIcon

/* ── 窗口形态 ─────────────────────────────────────────── */

export const FullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V5.6A1.6 1.6 0 0 1 5.6 4H9" />
    <path d="M15 4h3.4A1.6 1.6 0 0 1 20 5.6V9" />
    <path d="M20 15v3.4a1.6 1.6 0 0 1-1.6 1.6H15" />
    <path d="M9 20H5.6A1.6 1.6 0 0 1 4 18.4V15" />
  </Svg>
)

/** 长视频：横屏画面 */
export const VideoIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.2" y="5.4" width="12.4" height="13.2" rx="2.4" />
    <path d="m15.6 10.6 5.2-3v8.8l-5.2-3z" />
  </Svg>
)

/** 短视频：竖屏手机 */
export const PortraitIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7.6" y="3.2" width="8.8" height="17.6" rx="2.6" />
    <path d="M10.8 6.4h2.4" />
    <path d="M11.2 18h1.6" />
  </Svg>
)

/** 放大播客主体：四角向外 + 中心内容 */
export const ExpandIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V4.8A.8.8 0 0 1 4.8 4H9" />
    <path d="M15 4h4.2a.8.8 0 0 1 .8.8V9" />
    <path d="M20 15v4.2a.8.8 0 0 1-.8.8H15" />
    <path d="M9 20H4.8a.8.8 0 0 1-.8-.8V15" />
    <circle cx="12" cy="12" r="2.2" />
  </Svg>
)

/** 收起播客主体：四角向内 */
export const CollapseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4v4.2a.8.8 0 0 1-.8.8H4" />
    <path d="M20 9h-4.2a.8.8 0 0 1-.8-.8V4" />
    <path d="M15 20v-4.2a.8.8 0 0 1 .8-.8H20" />
    <path d="M4 15h4.2a.8.8 0 0 1 .8.8V20" />
  </Svg>
)

export const MiniIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.4" />
    <rect x="12.4" y="12.6" width="6.2" height="5.2" rx="1.4" fill="currentColor" stroke="none" />
  </Svg>
)

export const TrayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 14.5h16" />
    <path d="M9.4 18.4h5.2" />
    <path d="M12 4v6.6" />
    <path d="m9.2 8.2 2.8 2.8 2.8-2.8" />
  </Svg>
)

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.4 4h5.2" />
    <path d="M10.4 4v5.4L8 13.2h8l-2.4-3.8V4" />
    <path d="M12 13.2V20" />
  </Svg>
)
