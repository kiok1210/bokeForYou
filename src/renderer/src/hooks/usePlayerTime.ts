import { useEffect, useState } from 'react'
import type { PlayerApi } from './usePlayer'

/**
 * 订阅播放进度。
 *
 * 进度每秒会变 4 次，如果塞进全局状态，整个应用（含几百条列表项）
 * 会跟着一起重渲染；这里只让真正需要它的组件订阅。
 */
export function usePlayerTime(player: PlayerApi): number {
  const [time, setTime] = useState(0)
  const subscribe = player.subscribeTime

  useEffect(() => {
    const unsubscribe = subscribe(setTime)
    return unsubscribe
  }, [subscribe])

  return time
}
