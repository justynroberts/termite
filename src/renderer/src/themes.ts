import type { ITheme } from '@xterm/xterm'

export interface TerminalTheme {
  id: string
  name: string
  /** whether the app chrome should pair well with a light UI */
  light?: boolean
  theme: ITheme
}

export const TERMINAL_THEMES: TerminalTheme[] = [
  {
    id: 'termite-dark',
    name: 'Termite Dark',
    theme: {
      background: '#0d1117', foreground: '#e6edf3', cursor: '#34d399', cursorAccent: '#0d1117',
      selectionBackground: '#264f78',
      black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
      blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
      brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341',
      brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#f0f6fc'
    }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    theme: {
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36',
      selectionBackground: '#44475a',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
      brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff'
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    theme: {
      background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440',
      selectionBackground: '#434c5e',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
      blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4'
    }
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    theme: {
      background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', cursorAccent: '#1a1b26',
      selectionBackground: '#33467c',
      black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
      blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
      brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68',
      brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5'
    }
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    theme: {
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', cursorAccent: '#1e1e2e',
      selectionBackground: '#45475a',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
      brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8'
    }
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    theme: {
      background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', cursorAccent: '#282828',
      selectionBackground: '#504945',
      black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
      blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
      brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f',
      brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2'
    }
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    theme: {
      background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', cursorAccent: '#282c34',
      selectionBackground: '#3e4451',
      black: '#3f4451', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
      blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
      brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b',
      brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff'
    }
  },
  {
    id: 'monokai',
    name: 'Monokai',
    theme: {
      background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#272822',
      selectionBackground: '#49483e',
      black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
      blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
      brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75',
      brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5'
    }
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    theme: {
      background: '#002b36', foreground: '#839496', cursor: '#839496', cursorAccent: '#002b36',
      selectionBackground: '#073642',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
      brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3'
    }
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    light: true,
    theme: {
      background: '#fdf6e3', foreground: '#657b83', cursor: '#657b83', cursorAccent: '#fdf6e3',
      selectionBackground: '#eee8d5',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
      brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3'
    }
  }
]

export function getTerminalTheme(id: string): TerminalTheme {
  return TERMINAL_THEMES.find((t) => t.id === id) ?? TERMINAL_THEMES[0]
}

/**
 * Bundled terminal fonts (shipped via Fontsource, work offline) + safe system fallbacks.
 * Every stack falls back to locally installed Nerd Fonts so the full icon set
 * (git branch, folders, …) renders if the user has one; the core Powerline
 * triangles/half-circles are drawn by xterm's customGlyphs either way.
 */
const NERD_FALLBACK = `'Symbols Nerd Font Mono', 'Symbols Nerd Font', 'JetBrainsMono Nerd Font', 'JetBrainsMono NF'`

export const TERMINAL_FONTS: { name: string; stack: string; ligatures?: boolean }[] = [
  { name: 'JetBrains Mono', stack: `'JetBrains Mono', ${NERD_FALLBACK}, Consolas, monospace` },
  { name: 'Fira Code', stack: `'Fira Code', ${NERD_FALLBACK}, Consolas, monospace`, ligatures: true },
  { name: 'IBM Plex Mono', stack: `'IBM Plex Mono', ${NERD_FALLBACK}, Consolas, monospace` },
  { name: 'Source Code Pro', stack: `'Source Code Pro', ${NERD_FALLBACK}, Consolas, monospace` },
  { name: 'Cascadia Code (system)', stack: `'Cascadia Code', ${NERD_FALLBACK}, Consolas, monospace` },
  { name: 'Menlo / Consolas (system)', stack: `Menlo, ${NERD_FALLBACK}, Consolas, 'Courier New', monospace` }
]
