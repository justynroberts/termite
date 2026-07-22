import type { TermiteAPI } from './index'

declare global {
  interface Window {
    termite: TermiteAPI
  }
}

export {}
