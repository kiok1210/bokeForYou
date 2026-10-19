import type { EchoApi } from './index'

declare global {
  interface Window {
    echo: EchoApi
  }
}

export {}
